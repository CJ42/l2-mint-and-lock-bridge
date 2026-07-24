# Architecture

**Analysis Date:** 2026-07-24

## System Overview

The L2 Mint and Lock Bridge is a cross-chain token bridge connecting Base Sepolia and Arbitrum Sepolia. It implements a two-way token bridge with canonical tokens locked on the origin chain and synthetic tokens minted on the destination chain.

```text
┌────────────────────────────────────────────────────────────────────┐
│                        User Interface Layer                         │
│  Next.js App Router · React Components · Wallet Integration        │
│  `ui/src/app` · `ui/src/components` · `ui/src/hooks`              │
└────────────────────┬───────────────────────────────────────────────┘
                     │
                     │ viem (write-contract calls)
                     │ + RainbowKit wallet connection
                     ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Smart Contracts Layer                            │
│  Solidity 0.8.27 · OpenZeppelin · Reentrancy Guards               │
│  `contracts/src/` (CollateralTokenBridge, SyntheticTokenBridge)    │
└────────────────┬────────────────────────────┬───────────────────────┘
                 │ BridgeInitiated events      │ User calls
                 │ (logs indexed by watcher)   │
                 ▼                            ▼
         ┌──────────────────┐        ┌──────────────────┐
         │  Base Sepolia    │        │ Arbitrum Sepolia │
         │ CollateralBridge │        │ SyntheticBridge  │
         └──────────────────┘        └──────────────────┘
                 ▲                            ▲
                 │                            │
                 │ unlock() / mint()           │ burn() / lock()
                 │ (relayer-submitted txs)     │
                 │                            │
         ┌──────────────────────────────────────────┐
         │      Relayer Process Layer               │
         │  Bun + Viem · Event Polling              │
         │  `relayer/src/`                          │
         └──────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File(s) |
|-----------|----------------|---------|
| **Smart Contracts** | Lock/burn tokens, track message IDs, prevent replays | `contracts/src/BridgeBase.sol`, `CollateralTokenBridge.sol`, `SyntheticTokenBridge.sol` |
| **Relayer** | Watch for events, reconstruct messages, submit cross-chain transactions | `relayer/src/index.ts`, `watcher.ts`, `submitter.ts` |
| **UI** | Display bridge interface, show message status, submit user transactions | `ui/src/app/page.tsx`, `components/bridge-card.tsx` |
| **Shared Utilities** | ABI definitions, configuration, logging | `relayer/src/config.ts`, `ui/src/lib/bridge.ts` |

## Pattern Overview

**Overall:** Event-driven cross-chain bridge with off-chain relayer

**Key Characteristics:**
- **Two-way bridge:** Base→Arbitrum (lock+mint) and Arbitrum→Base (burn+unlock)
- **Relayer-submitted:** User calls lock/burn; relayer submits corresponding mint/unlock
- **No message signing:** Relayer is trusted via onlyRelayer modifier (TODO: EIP-712 signatures in production)
- **Nonce-based replay protection:** Per-sender nonce incremented on lock/burn
- **Event polling:** Relayer polls for BridgeInitiated logs with confirmation buffer

## Layers

**Smart Contract Layer:**
- Purpose: Manage token escrow, enforce bridge invariants, emit events
- Location: `contracts/src/`
- Contains: Bridge implementations, token wrappers, type definitions
- Depends on: OpenZeppelin contracts (ERC20, SafeERC20, Ownable2Step, Pausable, ReentrancyGuardTransient)
- Used by: Relayer (reads state, submits txs); UI (submits user transactions)

**Relayer Layer:**
- Purpose: Listen for lock/burn events, reconstruct messages, submit mint/unlock transactions
- Location: `relayer/src/`
- Contains: Event watcher, message reconstructor, transaction submitter, state store, configuration
- Depends on: viem, Bun runtime
- Used by: Smart contracts (via onlyRelayer modifier), state store for checkpointing

**UI Layer:**
- Purpose: Provide user interface for locking/burning tokens, viewing bridge messages
- Location: `ui/src/`
- Contains: Next.js app, React components, bridge utilities, wallet integration
- Depends on: viem, RainbowKit, Next.js
- Used by: End users via browser

## Data Flow

### Primary Request Path: Base → Arbitrum (Lock & Mint)

1. **User calls lock() on Base** (`ui/src/components/bridge-card.tsx` → `contracts/src/CollateralTokenBridge.sol:lock()`)
   - User submits transaction via UI ConnectButton + bridge-card component
   - Contract increments sender's nonce, creates BridgeMessage, validates inputs
   - Event `BridgeInitiated` is emitted with messageId, sender, recipient, amount, nonce, chain IDs
   - USDC is transferred from user to contract via `safeTransferFrom()`

2. **Relayer polls for BridgeInitiated events** (`relayer/src/watcher.ts:runWatcher()`)
   - Polls every 4 seconds (configurable `POLL_INTERVAL_MS`)
   - Queries logs from `(lastCheckpoint + 1)` to `(currentBlock - 5)` confirmations
   - Processes logs in batches of 2,000 blocks max to avoid RPC timeouts
   - Updates checkpoint in state.json after each batch

3. **Relayer reconstructs message** (`relayer/src/message.ts:reconstructMessage()`)
   - Extracts message from BridgeInitiated log
   - Computes messageId to verify against log-provided messageId
   - Validates originChainId == baseSepolia.id and destinationChainId == arbitrumSepolia.id
   - Enqueues Submission to baseToArbitrum submitter

4. **Relayer submits mint() to Arbitrum** (`relayer/src/submitter.ts:submitMessage()`)
   - Checks if message already processed on Arbitrum (via `processed` mapping)
   - If not processed:
     - Simulates mint() transaction on Arbitrum
     - Writes transaction via wallet client
     - Waits for receipt (confirmations checked via `waitForTransactionReceipt`)
     - On success, message marked as processed; on revert, retries up to 8 times
   - Logs each state transition (enqueued, checking, simulating, submitted, finalized, failed)

5. **User views finalized message in UI** (`ui/src/hooks/use-bridge-messages.ts` and `components/message-explorer.tsx`)
   - Hook fetches messages with status 'finalized'
   - Displays origin and destination transaction hashes, amount, status

### Secondary Path: Arbitrum → Base (Burn & Unlock)

Identical flow in reverse:
1. User calls burn() on Arbitrum Sepolia
2. Relayer polls for BridgeInitiated events on Arbitrum
3. Relayer submits unlock() to Base Sepolia

**State Management:**
- **On-chain:** Contract tracks `processed[messageId]` mapping; prevents double-execution
- **Off-chain:** Relayer stores checkpoint in `state.json` per chain; tracks `{ chain, blockNumber }`
- **In-memory:** Submitter manages queue as Promise chain; onIdle() waits for current queue to drain

## Key Abstractions

**BridgeMessage:**
- Purpose: Represents a cross-chain token transfer request
- Examples: `contracts/src/Types.sol`, `relayer/src/message.ts`, `ui/src/lib/bridge.ts`
- Pattern: Immutable data structure passed between contract and relayer; same format on all layers

**Submitter Queue:**
- Purpose: Serialize message submissions to avoid race conditions and state inconsistency
- Examples: `relayer/src/submitter.ts` (createSubmitter)
- Pattern: Sequential Promise chain (`queueTail = queueTail.then(...)`); no concurrent writes

**Watcher Polling:**
- Purpose: Track confirmed events on each chain with confirmation buffer
- Examples: `relayer/src/watcher.ts` (runWatcher, pollWatcher)
- Pattern: Poll at fixed interval; process logs in batches; update checkpoint after each batch

## Entry Points

**Relayer Entry Point:**
- Location: `relayer/src/index.ts`
- Triggers: `bun run dev` (dev mode) or `bun dist/index.js` (production)
- Responsibilities:
  - Load configuration (environment variables + addresses.json)
  - Create viem public/wallet clients for both chains
  - Initialize state store (loads/creates state.json)
  - Instantiate two submitters (baseToArbitrum, arbitrumToBase)
  - Start two watchers (one per chain) in parallel
  - Register graceful shutdown handlers

**UI Entry Point:**
- Location: `ui/src/app/page.tsx`
- Triggers: Browser navigation to `/`
- Responsibilities:
  - Render ConnectButton for wallet connection
  - Display BridgeCard for lock/burn interface
  - Display MessageExplorer for viewing bridge messages
  - Fetch and display messages via useBridgeMessages hook

**Contract Entry Points:**
- `CollateralTokenBridge.lock()` - User locks canonical tokens
- `CollateralTokenBridge.unlock()` - Relayer mints wrapped tokens on destination
- `SyntheticTokenBridge.burn()` - User burns wrapped tokens
- `SyntheticTokenBridge.mint()` - Relayer unlocks canonical tokens on destination

## Architectural Constraints

- **Threading:** Single-threaded event loop (Bun). Relayer uses Promise chains to serialize message submissions; no race conditions.
- **Global state:** None in relayer code. State persisted to `state.json` (checkpoint per chain). Contracts use mappings for `nonces[sender]` and `processed[messageId]`.
- **Circular imports:** None detected. Imports flow: UI → lib → contracts (ABI); relayer → config → addresses.json.
- **ABI versioning:** ABIs in `relayer/src/abi.ts` and `ui/src/lib/abis.ts` must match contract event/function signatures. Mismatch causes runtime errors.
- **RPC endpoint failover:** Configured via `fallback()` in config.ts; if primary endpoint fails, falls back to DRPC.
- **Message format immutability:** BridgeMessage struct is part of contract ABI. Changes require careful migration and replay risk assessment.

## Anti-Patterns

### Silent Log Rejection

**What happens:** When relayer encounters invalid log (e.g., wrong source bridge address), it throws error, catches in try-catch, and continues polling (`relayer/src/watcher.ts:41-57`).

**Why it's wrong:** Invalid logs may indicate bugs in config or contract upgrades. Silent rejection delays debugging.

**Do this instead:** Log rejections with full context (messageId, log address, expected address) and consider circuit-breaker or alert mechanism for repeated rejections.

### Unbounded Retry Loop

**What happens:** Submitter retries failed transactions up to 8 times with exponential backoff (`relayer/src/submitter.ts:69-106`), but does not distinguish between transient errors (gas price spikes) and permanent errors (invalid message).

**Why it's wrong:** Permanent errors (e.g., message already processed) are retried unnecessarily, wasting relayer resources and delaying other messages.

**Do this instead:** Categorize errors (transient vs. permanent) and return early for permanent failures; limit retries to transient errors only.

## Error Handling

**Strategy:** Try-catch with retry logic; structured JSON logging of state transitions

**Patterns:**
- **Watcher errors:** Catch, log, continue to next poll
- **Submission errors:** Retry up to 8 times with exponential backoff (1s→60s); log each retry
- **Config errors:** Throw early on startup (missing env vars, invalid addresses)
- **Contract errors:** Simulated transactions reveal errors before write; if write fails, logged and retried

## Cross-Cutting Concerns

**Logging:** Structured JSON logging via `logJson()` (`relayer/src/logger.ts`). Every state transition logged with status, messageId, direction, attempt count, and errors. Enables audit trail and debugging.

**Validation:** Input validation at multiple layers:
- **UI:** Form validation in bridge-card component (amount > 0, recipient != zero address)
- **Contract:** `_validateInputs()` checks recipient and amount; `_consumeMessage()` checks chain ID, message ID not processed
- **Relayer:** `reconstructMessage()` verifies messageId matches log; validates chain IDs match config

**Authentication:** Relayer authentication via `onlyRelayer` modifier (msg.sender == relayer address). Production should add EIP-712 signature verification (TODO in code).

---

*Architecture analysis: 2026-07-24*
