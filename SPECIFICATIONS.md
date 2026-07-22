# Cross-Chain Token Bridge — Build Specification

**Assignment:** Lock-and-mint token bridge between two public L2 testnets, with a minimal UI driving the full flow end to end.
**Author of all architectural decisions:** Jean. AI executes this spec; it does not make design decisions. Any ambiguity encountered during implementation must be surfaced, not resolved silently.
**Time budget:** ~1 day + 1 night. Build order in §10 is strict priority order — everything below the cut line ships only if time allows.

---

## 1. Summary of decisions

| Decision | Choice | Rationale (feeds README "tradeoffs") |
|---|---|---|
| Chains | **Base Sepolia (origin / collateral)** ↔ **Arbitrum Sepolia (destination / synthetic)** | Reliable RPCs and faucets; USDC canonically deployed on Base Sepolia |
| Token | Circle testnet **USDC** on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (**6 decimals**) | Real token, not a mock — exercises approve/transferFrom against deployed code |
| Message passing | **Custom**: contracts emit events → own relayer observes → relayer finalises on the other chain | Full ownership of the design for the presentation Q&A; no third-party stack to explain away |
| Trust model | **Single trusted relayer** (EOA with `RELAYER` role). Signature verification over the message is a documented TODO | Honest, explicit trust assumption; the interesting security work (replay protection, message identity) is still done properly |
| Directionality | **Bidirectional**: lock-and-mint (Base→Arb) and burn-and-unlock (Arb→Base) | The return path is what makes it a bridge rather than a one-way wrapper |
| Replay protection | Chain IDs baked into the message ID + `processed` mapping on the finalising side + per-sender nonce | See §4 |
| Nonce | **Per-sender**, assigned by the origin contract | Parallel-friendly; no global ordering bottleneck |
| Admin safety | OpenZeppelin `Pausable` + `Ownable2Step` on both bridge contracts | Minimal, legible circuit breaker |
| Fees / interchain gas | **TODO** — relayer runs subsidised; fee design documented in README, not implemented | Deliberate cut for time; design sketched in §9 |
| Contracts tooling | **Foundry**. Unit tests against a mock ERC-20; fork testing deferred (see §9) | Unit coverage of message identity, replay, and access control is the security story |
| Relayer | **TypeScript + viem**, polling-based, retry with exponential backoff, JSON-file checkpoint, idempotent via on-chain `processed` check | See §5 |
| UI | **Next.js (App Router) + wagmi + viem + RainbowKit**. Single page, direction switch, tx-state-aware button, mini message explorer indexing events client-side | See §6 |
| Monorepo | **Turborepo** (`turbo.json` + workspaces): `contracts/`, `relayer/`, `ui/` | Matches prepared structure; cached `build`/`test`/`lint` pipelines across packages |

Decisions made on Jean's behalf (flag in review): OpenZeppelin over solady (legibility over gas), `Ownable2Step` over `Ownable`, JSON-file checkpoint for the relayer (survives restarts at near-zero cost), 5-block confirmation depth on both chains, wrapped token symbol `wUSDC` with 6 decimals.

---

## 2. Repository layout

```
bridge/
├── CLAUDE.md                  # derived from this spec
├── README.md                  # skeleton in §11
├── turbo.json                 # Turborepo pipeline: build, test, lint, dev
├── package.json               # root workspace manifest (workspaces: contracts, relayer, ui)
├── contracts/                 # Foundry project
│   ├── src/
│   │   ├── BridgeBase.sol              # shared: roles, pause, nonces, processed, message hashing
│   │   ├── CollateralTokenBridge.sol   # Base Sepolia: lock USDC / unlock USDC
│   │   ├── SyntheticTokenBridge.sol    # Arbitrum Sepolia: mint wUSDC / burn wUSDC
│   │   └── WrappedUSDC.sol             # ERC-20, 6 decimals, mint/burn restricted to SyntheticTokenBridge
│   ├── test/
│   │   ├── BridgeUnit.t.sol
│   │   └── Replay.t.sol
│   └── script/
│       ├── DeployBase.s.sol
│       └── DeployArb.s.sol
├── relayer/
│   ├── src/
│   │   ├── index.ts           # entrypoint, main loop
│   │   ├── config.ts          # chains, addresses, ABIs, env
│   │   ├── watcher.ts         # getLogs polling per chain with confirmation depth
│   │   ├── submitter.ts       # finalise txs with retry/backoff
│   │   └── state.ts           # JSON checkpoint: lastProcessedBlock per chain
│   └── state.json             # gitignored
└── ui/                        # Next.js
    └── src/
        ├── app/page.tsx       # bridge form + explorer on one page
        ├── components/BridgeCard.tsx
        ├── components/MessageExplorer.tsx
        ├── hooks/useBridgeMessages.ts   # event indexing via viem getLogs
        └── lib/{config,abis,contracts}.ts
```

---

## 3. Contract specification

### 3.1 Shared types and message identity

```solidity
struct BridgeMessage {
    uint256 originChainId;      // block.chainid at origin
    uint256 destinationChainId;
    address token;              // canonical token address (USDC on Base Sepolia) — kept for extensibility
    address sender;
    address recipient;
    uint256 amount;             // 6-decimal units
    uint256 nonce;              // per-sender nonce assigned at origin
}

function messageId(BridgeMessage memory m) public pure returns (bytes32) {
    return keccak256(abi.encode(
        m.originChainId, m.destinationChainId, m.token,
        m.sender, m.recipient, m.amount, m.nonce
    ));
}
```

Properties this must satisfy (assert in tests):
- Same payload on a different chain pair ⇒ different ID (chain IDs are inside the hash → **no cross-chain replay**).
- Same sender bridging the same amount twice ⇒ different IDs (nonce increments → **no same-chain replay**).
- `abi.encode` (not `encodePacked`) ⇒ no ambiguous packing collisions.

### 3.2 `BridgeBase.sol` (abstract)

- Inherits `Ownable2Step`, `Pausable`.
- `address public relayer;` + `onlyRelayer` modifier; `setRelayer(address)` onlyOwner.
- `mapping(address => uint256) public nonces;` — origin-side, incremented on initiation.
- `mapping(bytes32 => bool) public processed;` — destination-side replay guard.
- `pause()/unpause()` onlyOwner. **All state-changing user/relayer entrypoints are `whenNotPaused`.**
- Events (identical signatures on both contracts so the relayer and UI share one ABI):

```solidity
event BridgeInitiated(bytes32 indexed messageId, address indexed sender,
    address indexed recipient, uint256 amount, uint256 nonce,
    uint256 originChainId, uint256 destinationChainId);

event BridgeFinalized(bytes32 indexed messageId, address indexed recipient, uint256 amount);
```

- `// TODO(signature-verification):` comment block on the finalise path: in production the relayer would sign `messageId` and the contract would verify via ECDSA/EIP-712 against a registered relayer key set, enabling key rotation and n-of-m attestation. Currently trust is `onlyRelayer` + msg.sender.

### 3.3 `CollateralTokenBridge.sol` — deployed on Base Sepolia

```solidity
constructor(IERC20 usdc, uint256 destinationChainId_)

/// user entrypoint — origin direction Base → Arb
function lock(address recipient, uint256 amount) external whenNotPaused {
    // checks: amount > 0, recipient != address(0)
    // effects: build BridgeMessage with nonces[msg.sender]++, compute id
    // interactions: usdc.safeTransferFrom(msg.sender, address(this), amount)
    // emit BridgeInitiated
}

/// relayer entrypoint — finalises Arb → Base (burn happened on Arb)
function unlock(BridgeMessage calldata m) external onlyRelayer whenNotPaused {
    // require m.destinationChainId == block.chainid
    // require !processed[id]; processed[id] = true;
    // usdc.safeTransfer(m.recipient, m.amount)
    // emit BridgeFinalized
}
```

### 3.4 `SyntheticTokenBridge.sol` — deployed on Arbitrum Sepolia

```solidity
constructor(WrappedUSDC wusdc, uint256 originChainId_)

/// relayer entrypoint — finalises Base → Arb
function mint(BridgeMessage calldata m) external onlyRelayer whenNotPaused {
    // same guards as unlock; wusdc.mint(m.recipient, m.amount); emit BridgeFinalized
}

/// user entrypoint — initiates Arb → Base return path
function burn(address recipient, uint256 amount) external whenNotPaused {
    // build message with nonces[msg.sender]++ (origin = Arbitrum Sepolia)
    // wusdc.burnFrom(msg.sender, amount)   // requires approval, or burn via allowance pattern
    // emit BridgeInitiated
}
```

### 3.5 `WrappedUSDC.sol`

- ERC-20, name `Wrapped USDC`, symbol `wUSDC`, **`decimals() = 6`** (must mirror USDC).
- `mint`/`burnFrom` restricted to the `SyntheticTokenBridge` address (immutable, set at deploy).

### 3.6 Invariant (state in README, assert in tests where feasible)

> USDC locked in `CollateralTokenBridge` ≥ total supply of `wUSDC`, at all times outside in-flight messages.

Equality holds when no messages are in flight. This is the one-sentence security story for the presentation.

---

## 4. Message lifecycle

```
Base → Arb:  user approve → lock() → BridgeInitiated(Base)
             → relayer waits 5 confirmations → mint() on Arb
             → BridgeFinalized(Arb) → user holds wUSDC

Arb → Base:  user approve wUSDC → burn() → BridgeInitiated(Arb)
             → relayer waits 5 confirmations → unlock() on Base
             → BridgeFinalized(Base) → user holds USDC
```

UI status model (derived purely from events, keyed by `messageId`):
`Initiated` (BridgeInitiated seen) → `Finalized` (BridgeFinalized seen on the other chain). A message that stays `Initiated` beyond ~2 min renders as `Pending — relaying`.

**Documented cut — finalise-revert handling:** if `mint`/`unlock` reverts permanently (e.g. paused destination), funds are stuck on the origin side. Production design: relayer marks the message failed after N retries and the origin contract exposes a `refund(BridgeMessage)` path gated on a relayer-attested failure proof, or a timeout-based user reclaim. Not implemented — README explains why (attested-failure design is where most bridge complexity and most bridge exploits live; out of scope for one day).

---

## 5. Relayer specification (TypeScript + viem)

Single process, two watcher loops (one per chain), one submitter per direction.

**Config (env):** RPC URLs ×2, relayer private key, contract addresses ×2, `CONFIRMATIONS=5`, `POLL_INTERVAL_MS=4000`.

**Watcher (per chain):**
1. On start, load `lastProcessedBlock` from `state.json` (default: deploy block).
2. Every poll: `latest = getBlockNumber()`; `safeHead = latest - CONFIRMATIONS`.
3. `getLogs({ event: BridgeInitiated, fromBlock: lastProcessedBlock + 1, toBlock: safeHead })` — cap ranges at 2,000 blocks per call to respect RPC limits.
4. Enqueue each log for the opposite chain's submitter; update and persist `lastProcessedBlock = safeHead`.

Confirmation depth is the reorg story: the relayer only ever reads `CONFIRMATIONS` behind head, so a shallow reorg on the origin chain cannot cause a mint for a lock that disappeared. Document that 5 is a testnet-friendly constant; production would use finalized tags / L1 batch confirmation.

**Submitter:**
1. Reconstruct `BridgeMessage` from log args; recompute `messageId` locally and assert it matches the emitted one (cheap integrity check).
2. **Idempotency:** `processed(messageId)` staticcall on the destination — skip if true. This makes restarts and crash-recovery safe with no local delivery ledger.
3. Simulate (`simulateContract`) then send. On failure: exponential backoff `1s → 2s → 4s → … max 60s`, max 8 attempts, then log the message as failed and continue (do not block the queue).
4. Log every transition as structured JSON lines: `{messageId, direction, status, txHash}` — this doubles as the demo narration.

**`// TODO(fees)`** at the submitter: production design — `lock()` becomes payable, requiring `msg.value ≥ quoteDestinationGas()`; relayer withdraws accumulated fees; quote served off-chain by the relayer and enforced on-chain against a stored per-message fee floor.

**Explicitly out of scope:** websockets (polling is more robust on public RPCs), database (JSON checkpoint suffices for one relayer), gas-price management beyond viem defaults, multi-relayer coordination.

---

## 6. UI specification (Next.js + wagmi + viem + RainbowKit)

One page, two zones.

**Zone 1 — BridgeCard**
- Chain direction display `Base Sepolia → Arbitrum Sepolia` with a swap button (⇅) flipping direction; on submit, prompt wallet chain switch if needed (`useSwitchChain`).
- Amount input with balance display (USDC balance on Base / wUSDC on Arb, 6-decimal formatting) and a Max button.
- Recipient defaults to the connected address, editable behind an "advanced" toggle.
- **Single action button as a state machine** (the "wagmi tx states" note from prep):
  `Connect wallet` → `Switch network` → `Approve USDC` → `Approving…` → `Bridge` → `Confirm in wallet` → `Locking…` (waiting receipt) → `Relaying…` (Initiated seen, Finalized not yet) → `Done ✓ — view on explorer`.
  Implemented with `useWriteContract` + `useWaitForTransactionReceipt` + the message-status hook. Skip the approve step when allowance is sufficient.

**Zone 2 — MessageExplorer (mini Hyperlane explorer)**
- `useBridgeMessages` hook: on mount and every 6s, `getLogs` for `BridgeInitiated` and `BridgeFinalized` on **both** chains over the last ~50k blocks (chunked), join by `messageId`.
- Table: short `messageId`, direction (Base→Arb / Arb→Base), amount, recipient (truncated), status badge (`Pending` amber / `Finalized` green), age, and two links: origin tx and destination tx (Basescan / Arbiscan Sepolia).
- Newest first; the user's own in-flight message highlighted.
- No backend, no indexer service — the UI is its own indexer. Document this as a deliberate choice (zero infra) with the honest limitation (block-range scans don't scale; production uses the relayer's API or an indexer).

Styling: minimal, dark, no component-library sprawl — Tailwind, one accent colour, monospace for hashes. Polish budget: low. Function over form; the explorer working end to end **is** the polish.

---

## 7. Testing plan (Foundry)

Priority order — stop when time runs out, never skip tier 1:

**Tier 1 — unit (`BridgeUnit.t.sol`, `Replay.t.sol`)**
- messageId: chain-pair separation, nonce separation, encode-collision sanity.
- lock: nonce increments, event fields exact, USDC pulled (mock ERC20 here).
- mint/unlock: replay rejected (`processed`), wrong `destinationChainId` rejected, non-relayer rejected, paused rejected.
- burn: supply decreases, event correct.
- Access control: relayer rotation, `Ownable2Step` handover, pause/unpause gating every entrypoint.

**Tier 2 — nice-to-have**
- Invariant test: handler doing random lock/mint/burn/unlock sequences; assert `usdc.balanceOf(collateralTokenBridge) ≥ wusdc.totalSupply()` after each settled batch.

*Deferred (see §9):* Base Sepolia fork test exercising the real deployed USDC via `vm.createSelectFork`. The testnet smoke test (§8 step 6) covers the real-USDC path in the meantime.

---

## 8. Deployment & ops runbook

1. Deploy `WrappedUSDC` + `SyntheticTokenBridge` on Arbitrum Sepolia (script), wire `SyntheticTokenBridge` as the wUSDC minter.
2. Deploy `CollateralTokenBridge` on Base Sepolia with USDC + Arb Sepolia chain ID (421614).
3. `setRelayer(relayerEOA)` on both. Fund relayer EOA with test ETH on both chains (assignment offers test ETH on request — ask early if faucets are dry).
4. Get Base Sepolia USDC from Circle's faucet (https://faucet.circle.com).
5. Record deploy blocks → relayer `state.json` initial checkpoints; addresses → `ui/lib/config.ts` and `relayer/config.ts` (single shared `addresses.json` at repo root, imported by both).
6. Smoke test: bridge 1 USDC each direction; screenshot the explorer for the README.

---

## 9. Cut list (README "what I cut and why" — pre-written)

| Cut | Why | Production direction |
|---|---|---|
| Relayer signature verification on-chain | Time; trust model is explicitly single-relayer for this exercise | EIP-712 signed messages, n-of-m attestations, key rotation |
| Fee / interchain gas payment | Meaningful surface across all three components | Payable `lock` with enforced fee floor; relayer quotes + withdraws |
| Finalise-revert / stuck-funds recovery | The hardest part of bridge design; where real bridges get exploited | Attested-failure refund path or timeout reclaim |
| Rate limits / per-tx caps | Low value on testnet | Per-block and per-message caps, as in production token bridges |
| Rebalancing / third chain | Requires liquidity model, not just message passing | Router/gateway registry per asset & chain (Arbitrum-style) |
| Indexer service for the explorer | Zero-infra UI wins for a take-home | Relayer exposes its ledger over HTTP, or a proper indexer |
| Fork tests against real USDC | Unit tests + live testnet smoke test cover the path; fork setup deferred | `vm.createSelectFork(BASE_SEPOLIA_RPC)` test of approve → lock against deployed USDC bytecode |

---

## 10. Build order (strict) with time budget

| # | Block | Est. |
|---|---|---|
| 1 | Turborepo scaffold (`turbo.json`, root `package.json`, workspaces), Foundry init, OZ install, `addresses.json` plumbing | 45 min |
| 2 | Contracts: BridgeBase → WrappedUSDC → CollateralTokenBridge → SyntheticTokenBridge | 2 h |
| 3 | Tier-1 unit tests green | 1.5 h |
| 4 | Deploy scripts + deploy to both testnets + wire roles + faucet USDC | 1 h |
| 5 | Relayer: config → watcher → submitter → checkpoint → **first end-to-end bridge via CLI** | 2.5 h |
| 6 | UI BridgeCard: connect, approve, lock, button state machine, both directions | 2.5 h |
| 7 | MessageExplorer + status hook | 1.5 h |
| 8 | README (skeleton §11), screenshots, repo tidy, CLAUDE.md commit | 1 h |
| — | *Cut line — below only if ahead of schedule* | |
| 9 | Invariant test, retry-path hardening, UI polish, fork test | — |

Milestone that matters: **end of block 5 = the bridge works end to end without a UI.** Everything after is presentation surface. If the night goes sideways, a working CLI bridge + honest README beats a pretty UI on broken contracts.

---

## 11. README skeleton

1. **What this is** — one paragraph + architecture diagram (ASCII is fine: user → CollateralTokenBridge → event → relayer → SyntheticTokenBridge → wUSDC).
2. **Chains & token** — Base Sepolia (USDC, canonical Circle deployment) ↔ Arbitrum Sepolia (wUSDC). Why: reliable infra, real token.
3. **How it works** — message lifecycle (§4), message identity & replay protection (§3.1), invariant (§3.6).
4. **Trust model & tradeoffs** — single trusted relayer, stated plainly; confirmation depth & reorgs; per-sender nonces; pausability.
5. **What I cut and why** — table from §9.
6. **What I'd improve with more time** — signature verification, fees, failure recovery, third-chain rebalancing (mirrors §9 right column).
7. **Running it** — install deps, env vars, `forge test`, `turbo dev` (relayer + UI), deployed addresses table with explorer links.
8. **How I used AI** — architectural decisions made upfront in a written spec (this document); Claude Code executed against `CLAUDE.md`; PRs reviewed with Copilot context.

