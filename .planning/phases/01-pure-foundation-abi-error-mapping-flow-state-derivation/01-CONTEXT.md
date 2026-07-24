# Phase 1: Pure Foundation — ABI, Error Mapping & Flow-State Derivation - Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate the merged bridge ABI from Foundry build output, build the ordered error-decode chain
covering the bridge's full error surface, and define `deriveFlowState()` as a pure, fully
unit-tested function — zero React, zero network coupling, zero hook wiring. This phase produces
the three building blocks (`generated.ts`, the error-mapping module, `deriveFlowState()`) that
Phase 2 (live transport) and Phase 3 (orchestration + UI) will wire together. No component,
no hook that touches `wagmi`/`viem` network calls, and no UI work happens in this phase.

</domain>

<decisions>
## Implementation Decisions

### ABI Generation

- **D-01:** The Bun ABI-generation script is a minimal wrapper — it only invokes `wagmi generate`
  (via `@wagmi/cli`, already a devDependency). It does not delete legacy files or validate output
  on every run.
- **D-02:** Removing the legacy ABI sources (`collateral-abi.json`, `synthetic-abi.json` at the
  repo root, and the hand-written `parseAbi` subset in `ui/src/lib/abis.ts`) is a one-time manual
  cleanup performed as part of this phase's plan (satisfies ABI-03), not an ongoing script
  responsibility.
- **D-03:** `ui/wagmi.config.ts`'s `foundry` plugin includes four contract artifacts:
  `CollateralTokenBridge.sol/**`, `SyntheticTokenBridge.sol/**`, `WrappedToken.sol/**`, and
  `IERC20.sol/**`. `IERC20` is included only for `balanceOf`/`allowance`/`approve` against the
  real Base Sepolia USDC contract (`script/DeployBase.s.sol`'s `BASE_SEPOLIA_USDC` constant) —
  this repo does not own that contract and it has no custom errors of its own to decode.
  — **Reversibility:** reversible — changing the `include` list only touches `wagmi.config.ts` and
  regenerates `generated.ts`; no downstream contract is affected.
- **D-04:** `@wagmi/cli`'s `react()` plugin still emits normal per-contract named exports
  (`collateralTokenBridgeAbi`, `syntheticTokenBridgeAbi`, `wrappedTokenAbi`, `ierc20Abi` or
  equivalent). The error-mapping module (Plan 01-02) is what concatenates all four `abi` arrays
  into one combined `bridgeErrorAbi` at import time, so `decodeErrorResult`/
  `ContractFunctionRevertedError` only ever needs to try one combined ABI — no per-contract
  decode loop.

### Error Decoding — Tiering and Copy

- **D-05:** Errors split into two tiers:
  - **Tier 1 (full, bespoke copy):** `BridgeMessageAlreadyProcessed`, `InvalidDestinationChainId`,
    `InvalidBridgeTxInputs`, `SafeERC20FailedOperation`, `Panic(uint256)`, insufficient native gas
    (`InsufficientFundsError`), insufficient allowance. Each gets a genuine human sentence
    following the template below.
  - **Tier 2 (one shared generic message):** `RelayerCannotBeZeroAddress`,
    `TokenCannotBeZeroAddress`, `BridgeCannotBeZeroAddress`, `OwnableUnauthorizedAccount`,
    `OwnableInvalidOwner`, `ReentrancyGuardReentrantCall`, `EnforcedPause`, `ExpectedPause`, and
    `NotRelayer`. These are admin-only/invariant errors that cannot be triggered by this UI's own
    transactions (the UI only ever calls `lock()`/`burn()`/`approve()`, never the
    relayer-restricted `unlock()`/`mint()`). They render as one shared message —
    `"Something unexpected happened on-chain (${errorName})."` — that still names the real
    decoded error for debuggability, without writing bespoke copy nobody will see in normal use.
  - `NotRelayer` specifically gets **no** special-case handling anywhere in the decode chain — it
    is not checked for explicitly; it simply falls through into the same Tier-2 generic path as
    any other named-but-unmapped custom error. This is a deliberate simplification per user
    instruction ("Don't take into account `NotRelayer` case since it will never happen on the UI
    side").
- **D-06:** Copy template for every Tier-1 error is **plain sentence + parenthetical raw
  evidence**, matching the two examples already in `PROJECT.md`/`TX_FLOW.md`:
  - `BridgeMessageAlreadyProcessed` → `"This transfer was already relayed (messageId 0x…)."`
  - Insufficient gas → `"You need ~{amount} ETH on {chainName} for gas — here's the faucet: {faucetUrl}."`
  Apply the same shape to `InvalidDestinationChainId`, `InvalidBridgeTxInputs`,
  `SafeERC20FailedOperation`, and `Panic(uint256)` (documented Solidity panic-code meanings, e.g.
  `0x11` → arithmetic overflow/underflow, `0x12` → division by zero) — one plain sentence, real
  values from the decoded `args` in parentheses.
- **D-07:** Insufficient-gas amount is **computed, not a fixed constant** — read the actual `gas`
  and `gasPrice`/`maxFeePerGas` from the failed simulate/write result (via viem's
  `InsufficientFundsError`, walked off `BaseError`) and compute a real "~X ETH" figure per
  failure. Fall back to a fixed default (the previously-specified `~0.0004 ETH`) only if the
  estimate genuinely isn't available (e.g. failure happened before gas estimation could run).
  — **Reversibility:** reversible — the computed path can be swapped for the fixed constant later
  with no change to the error-mapping module's public shape (still one string out).
- **D-08:** Faucet links, per chain, no login required:
  - Base Sepolia: `https://www.alchemy.com/faucets/base-sepolia`
  - Arbitrum Sepolia: `https://www.alchemy.com/faucets/arbitrum-sepolia`
  (Alchemy's testnet faucet: 0.1 ETH/day, no signup to claim, though it does check for minor
  existing mainnet history to deter abuse — worth a one-line note in the error-mapping module's
  in-code comment in case this changes and the link needs swapping later.)
- **D-09:** ERR-09's "single module, documented as intentionally narrow and extensible" still
  applies to the full decode chain including the computed-gas logic from D-07 — the gas-amount
  computation should be a small, isolated helper inside the same module, not a reason to split
  the error-mapping layer into multiple files.

### Claude's Discretion
- Exact Solidity `Panic(uint256)` code-to-meaning mapping table (standard Solidity panic codes:
  `0x01` assert, `0x11` overflow/underflow, `0x12` division by zero, `0x21` invalid enum value,
  `0x22` bad storage byte array, `0x31` pop on empty array, `0x32` out-of-bounds array access,
  `0x41` out-of-memory, `0x51` uninitialized internal function). Claude picks reasonable plain-
  language phrasing for each.
- Exact wording of the Tier-2 generic message beyond the agreed template
  (`"Something unexpected happened on-chain (${errorName})."`) — minor copy polish is Claude's
  call.
- File/function naming inside the error-mapping module and `deriveFlowState()` — not discussed,
  follow existing codebase conventions (`.planning/codebase/CONVENTIONS.md`: kebab-case files,
  camelCase functions, object parameters for 2+ args, explicit return types).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack / ABI generation approach
- `.planning/research/STACK.md` — full rationale for `@wagmi/cli` foundry plugin over committed
  ABI JSON, confirmed hook/error-class API surface (`decodeErrorResult`, `BaseError.walk`,
  `ContractFunctionRevertedError`, `InsufficientFundsError`), and the critical
  `fallback()`/`webSocket()` subscription-detection behavior that Phase 2 depends on

### Contracts (source of truth for the error surface and ABI include set)
- `contracts/src/Errors.sol` — every custom bridge error, with NatSpec documenting evidence
  parameters
- `contracts/src/CollateralTokenBridge.sol` — `lock()`/`unlock()`, `SafeERC20` usage (source of
  `SafeERC20FailedOperation`)
- `contracts/src/SyntheticTokenBridge.sol` — `burn()`/`mint()`
- `contracts/src/WrappedToken.sol` — `ERC20`+`ERC20Burnable`, source of standard OZ ERC20 error
  fragments and `BurningTokensDisallowedForUsers`
- `script/DeployBase.s.sol`, `script/DeployArb.s.sol` — confirms the Base Sepolia collateral
  token is the real, externally-owned USDC contract (`BASE_SEPOLIA_USDC` constant), not a
  contract this repo builds — this is why `IERC20.sol` is in the generated-ABI include set

### Project / requirements
- `.planning/PROJECT.md` — Key Decisions table, original TX_FLOW.md-sourced copy examples
- `.planning/REQUIREMENTS.md` — ABI-01/02/03, ERR-01 through ERR-09, FLOW-01, FLOW-05 (this
  phase's full requirement set)
- `.planning/ROADMAP.md` — Phase 1 success criteria and the three named plans (01-01 ABI
  generation, 01-02 error-mapping module, 01-03 `deriveFlowState()`)

### Existing code being replaced
- `ui/src/lib/abis.ts` — the hand-written `parseAbi` subset to be deleted (D-02)
- `collateral-abi.json`, `synthetic-abi.json` (repo root, untracked) — the manual ABI dumps to be
  deleted (D-02); confirmed by inspection during Phase 0 research to contain the full, correct
  error fragments (12 error names across both contracts) — useful as a manual cross-check for
  "did codegen produce the same error set" while `wagmi generate` is first wired up, then deleted

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None directly reusable for this phase's pure functions — this phase has no React/hook
  component to reuse patterns from. The *shape* of `ui/src/components/bridge-card.tsx`'s existing
  `getActionState()` (a discriminated returns-object function) is a useful reference for the kind
  of pure, testable function `deriveFlowState()` should be, even though it will fully replace it
  in Phase 3.

### Established Patterns
- Object parameters for any function with 2+ args (`.planning/codebase/CONVENTIONS.md`) —
  apply to the error-mapping module's decode function and to `deriveFlowState()`'s input.
- Explicit return types on all exported functions (`UseBridgeMessagesResult`-style) — apply to
  both new pure functions.
- `bun test` with Bun's built-in `expect`, fixture/builder functions inline in the test file
  (`createMessage()`, `createLog()` precedent in `relayer/test/message.test.ts`) — the same
  pattern should drive the fixture-based tests for the error-mapping module and
  `deriveFlowState()` called out in ROADMAP.md's Phase 1 success criteria #2 and #3.
- No barrel files in this codebase — the error-mapping module and `deriveFlowState()` should be
  imported from their specific module paths, not re-exported through an index.

### Integration Points
- `ui/src/lib/abis.ts` — deletion target; all current imports of `bridgeAbi`/`erc20Abi` across
  `ui/src/components/bridge-card.tsx` and `ui/src/hooks/use-bridge-messages.ts` will need to move
  to the generated file's exports (that rewiring belongs to Phase 3's `bridge-card.tsx` refactor
  and Phase 2's `use-bridge-messages.ts` upgrade — Phase 1 only needs the generated file and the
  pure decode/derive functions to exist, not full call-site rewiring).
- `ui/package.json` — needs a new script entry (e.g. `"generate": "wagmi generate"`) to run the
  ABI generation wrapper.

</code_context>

<specifics>
## Specific Ideas

- Error copy tone: plain sentence + parenthetical raw evidence value, exactly matching the two
  examples already written in `PROJECT.md`/`TX_FLOW.md` — this is now the confirmed universal
  template for every Tier-1 error, not just the two originally-specified ones.
- The gas-shortfall message should feel accurate and specific ("computed, not guessed") — this
  reflects the milestone's portfolio-demo motivation (demonstrating real calldata/gas debugging,
  not canned copy).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 1 scope. (Gray areas 3 and 4 from the original four-item
list — `deriveFlowState()`'s exact discriminated-union shape, and how failure is represented
relative to the 3 named steps — were not selected for discussion this session; they remain open
and should be resolved either in a follow-up discussion or directly by the planner/researcher
using the locked decisions above plus FLOW-01/FLOW-05 from REQUIREMENTS.md.)

</deferred>

---

*Phase: 1-Pure Foundation — ABI, Error Mapping & Flow-State Derivation*
*Context gathered: 2026-07-25*
