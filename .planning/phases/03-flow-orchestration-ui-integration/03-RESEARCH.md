# Phase 3: Flow Orchestration & UI Integration - Research

**Researched:** 2026-07-25
**Domain:** wagmi v2 imperative transaction orchestration (simulate → approve → write → receipt →
relay-watch), CSS-Modules presentational components driven by a single derived union, and
browser-persisted mid-flow rehydration in a Next.js App Router client component.
**Confidence:** HIGH — every claim about wagmi/viem hook and action signatures below was confirmed
by reading the actual installed source (`node_modules`/bun cache), not from training data or docs
alone. The one genuinely unresolved area (exact `localStorage` persistence shape) is synthesized
from `PITFALLS.md` Pitfall 7 and the UI-SPEC's rehydration-rendering contract and is flagged
`[ASSUMED]`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Simulation & Transaction Sequencing**
- **D-01:** The bridge transaction is simulated **after the approve receipt confirms**, gated on
  `allowance >= amount`. Nothing simulates while the approve is in flight. A failing simulation
  blocks the bridge wallet prompt entirely (SIM-01); its decoded reason renders in the error banner
  (SIM-02). Accepted cost: the user has already spent one approve transaction before a bridge-level
  failure is discovered. Rejected: `stateOverride`-based pre-flight before approve (wrong storage
  slot risk for real Base Sepolia USDC / wUSDC). Reversibility: reversible.
- **D-02:** **One click drives both transactions.** The user clicks once; the wallet prompts for
  approve, and when that receipt confirms and simulation passes, the bridge prompt opens
  automatically. Known risk: a wallet prompt not triggered by a direct user gesture can be
  suppressed by some wallets — if that surfaces, the fallback is an "armed second click" variant
  (button becomes `Confirm bridge` after approve confirms), not a return to click-per-transaction.
  Reversibility: reversible.
- **D-03:** The simulation is invoked **imperatively** — a `simulateContract` action awaited inline
  in the flow sequence (wagmi/core action or the module-level viem client), **not** wagmi's
  `useSimulateContract` hook. This **overrides `TX_FLOW.md`'s literal instruction** ("I want to use
  useSimulate from Wagmi"); the intent (pre-flight before wallet opens) is preserved, only the
  specific hook is not. Record this override in the plan alongside the shadcn and committed-ABI
  overrides.
- **D-04:** A transaction that passes simulation but comes back `status: 'reverted'` is decoded by
  **replaying the call via `eth_call` pinned to the receipt's `blockNumber`**, and the returned
  revert data goes through the same Phase 1 decode chain as any other failure. Accepted cost: one
  extra RPC call on a path that should be rare. Degrade to plain reverted message + explorer link if
  a public node refuses the historical `eth_call`.

**Flow-State Ownership & Stepper Placement**
- **D-05:** `use-bridge-flow.ts` is called in **`ui/src/app/page.tsx`**, and the hook owns
  `direction`/`amount`/`recipient` alongside transaction flow state. It returns both derived
  `BridgeFlowState` and input setters. `page.tsx` renders `<Stepper>` in the hero column and passes
  the hook result to `<BridgeCard>`, which becomes a **controlled form**. Rejected: React context
  provider, stepper inside the bridge card. Reversibility: costly (every `bridge-card.tsx` input
  becomes a prop).
- **D-06:** Pre-transaction **gate states live inside `BridgeFlowState`** as part of one union —
  `disconnected`/`wrong-network`/`undeployed`/`incomplete-input`/`idle`/`approving`/`submitting`/
  `relaying`/`done`/`failed` (exact variant names are Claude's discretion — **already resolved by
  Phase 1's `01-03-PLAN.md`**, see Architecture Patterns below). `deriveFlowState()` takes wallet and
  input-validity inputs alongside transaction inputs; it stays pure. The action button reads
  label/variant/icon/disabled straight off the union with zero branching of its own (BTN-01); the
  stepper renders all three steps as `upcoming` for any gate variant. Rejected: a thin
  `deriveActionState()` above a transaction-only `deriveFlowState()` (the exact drift
  `getActionState()` demonstrated).
- **D-07:** The stepper is **always visible** in the hero column. All three steps render from page
  load in a neutral `upcoming` style and light up as the flow advances. `upcoming` is an honest
  state, not a faked one.
- **D-08:** A completed or failed flow resets **on direction flip or on a new submission** — not on
  incidental input edits. This reset rule moves out of `flipDirection()` and into the hook. Accepted
  cost: a brief window where the stepper shows the previous run while the form already holds new
  values.

### Claude's Discretion
- Exact variant names and TypeScript shape of the `BridgeFlowState` union (D-06) — **already fixed
  by Phase 1's `01-03-PLAN.md` `<resolved_open_questions>` block**; Phase 3 consumes it verbatim, see
  below.
- Which `simulateContract` entry point D-03 uses (`@wagmi/core` action vs the module-level viem
  public client) — this research recommends the `wagmi/actions` re-export (see Architecture
  Patterns); it composes directly with Phase 1's decode chain and with the rest of the imperative
  sequence.
- Whether the `approve` transaction also gets its own pre-flight simulation — leaning no (a
  well-formed ERC20 `approve` essentially cannot revert; its real failure mode, insufficient native
  gas, is already covered by Phase 1's `InsufficientFundsError` path).
- File and component naming for the stepper and action button (`stepper.tsx`/`action-button.tsx`
  per ROADMAP.md, matching `*.module.css`) and how much of the hook result `BridgeCard` receives as
  props versus one grouped object.

### Deferred Ideas (OUT OF SCOPE)
None deferred to other phases — discussion stayed inside Phase 3's boundary. Two gray areas were
surfaced but not discussed and are fully in scope for this research/plan to resolve:

1. **Refresh recovery mechanics (FLOW-04).** What exactly is persisted, `sessionStorage` vs
   `localStorage`, keyed how, cleared when, trusted or re-derived on rehydration. **Resolved below**
   in Architecture Patterns / Pattern 4.
2. **Failure, idle and degraded presentation.** **Already resolved by `03-UI-SPEC.md`** (approved
   2026-07-25) — see its "Failure presentation" and "Refresh-recovery rendering" sections; this
   research does not re-litigate it, only grounds the hook-side mechanics that feed it.

Also left open within discussed areas (raised, not resolved by CONTEXT.md; addressed below):
- Whether `approve` gets its own pre-flight simulation — leaning no, confirmed above.
- What happens if the user rejects the *second* wallet prompt after approve already succeeded —
  addressed in Pitfalls below.
- Whether the simulation result is re-checked if time passes between approve confirming and the
  bridge write — addressed in Pitfalls below (this is Pitfall 8 from `PITFALLS.md`).
- Exactly what `use-bridge-flow.ts` returns and how much `BridgeCard` receives as props — addressed
  in Architecture Patterns.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FLOW-02 | Approve runs on every bridge for the exact amount, so all three steps always execute | Architecture Patterns Pattern 2 — imperative sequence never reads/short-circuits on existing allowance |
| FLOW-03 | `getActionState()` and duplicated `approveHash`/`bridgeHash` state removed from `bridge-card.tsx` | Code Context below — exact lines identified; Architecture Patterns Pattern 3 shows the replacement |
| FLOW-04 | Reload mid-bridge restores in-flight transaction from persisted storage | Architecture Patterns Pattern 4 — full persistence/rehydration design |
| SIM-01 | Bridge tx simulated before wallet prompt opens; failing simulation blocks prompt entirely | Architecture Patterns Pattern 1 — imperative `simulateContract` gate |
| SIM-02 | Failed simulation surfaces decoded reason through the same error layer | Architecture Patterns Pattern 1 — thrown error routes into Phase 1's `decodeBridgeError` |
| SIM-03 | Write-side failures decoded independently of simulation | Architecture Patterns Pattern 1, D-04 replay via pinned-block `simulateContract` |
| STEP-01 | Three-step stepper renders on the left, below title/explanations | UI-SPEC.md locked (stepper.tsx mount point in `page.tsx` hero column) |
| STEP-02 | Blue spinner while pending, green checkmark once confirmed | UI-SPEC.md locked (Stepper Visual States table) |
| STEP-03 | Status text matches submitting/processing/completed | UI-SPEC.md locked (STEP-03 copy mapping table) |
| STEP-04 | Hand-built CSS Modules stepper | UI-SPEC.md locked; Don't Hand-Roll confirms no component library needed |
| BTN-01 | Button label/variant/icon driven by same derived state as stepper, no second derivation | Architecture Patterns — `BridgeFlowState.phase` is the only read; UI-SPEC.md's copy table is the presentational mapping |
| BTN-02 | Spinner replaces icon while pending/processing, disabled throughout | UI-SPEC.md locked (Action button state table) |

</phase_requirements>

## Summary

Phase 1 and Phase 2 have **not yet been executed** — the working tree at research time is still the
pre-milestone `bridge-card.tsx` (verified directly: no `ui/src/lib/generated.ts`, no
`decode-bridge-error.ts`, no `derive-flow-state.ts`, no `use-relay-status.ts` exist on disk). This
research therefore grounds Phase 3 against the **committed contracts those two phases' PLAN.md files
already lock** (`BridgeFlowState`'s exact union from `01-03-PLAN.md`, `useRelayStatus`'s exact return
shape from `02-03-PLAN.md`), not against code read from the filesystem. Every symbol name and field
below is quoted from those plan files' `<interface_context>`/`<resolved_open_questions>` blocks,
which are binding contracts those phases' `acceptance_criteria` enforce byte-for-byte.

The phase's core technical risk is sequencing five async steps — approve write, approve receipt,
gated simulate, bridge write, bridge receipt — as **one straight-line imperative function**, because
D-02 requires one click to drive both transactions and D-03 forbids the reactive `useSimulateContract`
hook in the middle of that sequence. This research's single most load-bearing finding, confirmed by
reading `@wagmi/core@2.22.1`'s actual type declarations, is that **`wagmi/actions` re-exports
`@wagmi/core/actions` in full** — `simulateContract`, `writeContract`, and `waitForTransactionReceipt`
all exist as plain `(config, parameters) => Promise<T>` functions, not just as React hooks. This means
the *entire* five-step sequence can be one `async function`, using `useConfig()` to obtain the wagmi
`Config` once, with zero new package installs (`@wagmi/core` is already a transitive dependency of the
installed `wagmi@2.19.5`, resolved at `2.22.1` in `bun.lock`).

The second load-bearing finding is that D-04's "replay via `eth_call` pinned to the receipt's
`blockNumber`" is best implemented not as a raw `call()` but as a **second `simulateContract` call
carrying the same ABI/args as the original write, with `blockNumber: receipt.blockNumber` added** —
`SimulateContractParameters` extends viem's `CallParameters`, which declares `blockNumber` as a
first-class optional field. This reuses the exact same action D-03 already introduces, decodes
through the exact same `ContractFunctionRevertedError` shape Phase 1's `decodeBridgeError` already
consumes, and needs no new decode branch.

**Primary recommendation:** Build `use-bridge-flow.ts` around one `async function runFlow()` using
`writeContract`/`waitForTransactionReceipt`/`simulateContract` from `wagmi/actions` (obtained via
`useConfig()`), with local `useState` tracking the discrete progress flags `deriveFlowState()`
expects (`approve.isPrompting/isConfirming/isConfirmed`, `bridge.isPrompting/isConfirming/isConfirmed`),
feed `useRelayStatus()`'s `status`/`transportMode` in as the `relay` progress input, and persist a
minimal rehydration record to `localStorage` that is read only inside a post-mount `useEffect` (never
during render) so the stepper's honest `upcoming` initial paint (already locked by D-07 and
`03-UI-SPEC.md`) doubles as the hydration-safe default.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Transaction sequencing (approve→simulate→bridge→receipt) | Frontend Server / Client (React hook) | — | `use-bridge-flow.ts` runs entirely in the browser via wagmi/viem; there is no backend for this milestone (relayer changes explicitly out of scope) |
| Pre-flight & post-revert simulation | Client (browser, via public RPC) | — | `simulateContract` issues `eth_call` directly against the chain's RPC endpoint from the browser |
| Error decoding | Client (pure function, Phase 1) | — | `decodeBridgeError` is a pure module consumed by the hook; no network or server involvement |
| Relay-completion detection | Client (browser, via public RPC / WS) | — | `useRelayStatus` (Phase 2) watches the destination chain directly from the browser; no relayer-side channel per `PROJECT.md` |
| Stepper / action button rendering | Client (React components) | — | Presentational CSS Modules components, driven entirely by `BridgeFlowState` |
| Mid-flow persistence | Client (`localStorage`) | — | Browser-only storage; no server session, no database — this milestone has no backend of its own for the UI |
| Flow-state derivation | Client (pure function, Phase 1) | — | `deriveFlowState()` is hook-free and network-free; called from `use-bridge-flow.ts` |

## Standard Stack

### Core

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `wagmi` | `2.19.5` [VERIFIED: ui/package.json + bun.lock] | React hook layer already used by the project | Project-wide rule; `useConfig`, `useAccount`, `useSwitchChain` remain the reactive surface this hook reads |
| `@wagmi/core` | `2.22.1` (transitive, resolved in `bun.lock`) [VERIFIED: read `~/.bun/install/cache/@wagmi/core@2.22.1@@@1/dist/types/actions/*.d.ts` directly] | Framework-agnostic imperative actions, re-exported wholesale by `wagmi/actions` | Supplies `simulateContract`, `writeContract`, `waitForTransactionReceipt`, `getTransaction`, `getPublicClient` as plain awaitable functions — exactly what D-02/D-03's straight-line sequence needs. **No new install**: `ui/node_modules/wagmi/dist/esm/exports/actions.js` is literally `export * from '@wagmi/core/actions'` [VERIFIED: read the file directly] |
| `viem` | `2.55.5` [VERIFIED: ui/package.json + bun.lock] | Underlying EVM client, error classes, ABI codec | Already the project's only allowed EVM library; `BaseError.walk`, `ContractFunctionRevertedError`, `UserRejectedRequestError` are consumed unchanged from Phase 1's decode chain |

**No new packages are required for this phase.** Everything above is already installed; `@wagmi/core`
is pulled in transitively via `wagmi`'s own `package.json` dependency and does not need a new
`ui/package.json` entry — it is imported through the `wagmi/actions` subpath export, which is how
`@wagmi/core`'s own documentation recommends consuming it from inside a `wagmi`-based app (avoids a
second, possibly-mismatched `@wagmi/core` version from ever entering the tree).

### Supporting (Phase 1 / Phase 2 contracts consumed, not re-derived)

| Symbol | Source | Shape (as locked by the producing phase's PLAN.md) |
|--------|--------|------|
| `deriveFlowState()` | `ui/src/lib/derive-flow-state.ts` (Phase 1, `01-03-PLAN.md`) | `(input: DeriveFlowStateInput) => BridgeFlowState`, pure, object-parameter, see Architecture Patterns |
| `BridgeFlowState` | same | Discriminated union over `phase`: `'blocked' \| 'ready' \| 'approving' \| 'submitting' \| 'relaying' \| 'done' \| 'failed'`, every variant carries a `steps: readonly [BridgeStep, BridgeStep, BridgeStep]` triple |
| `decodeBridgeError()` | `ui/src/lib/decode-bridge-error.ts` (Phase 1, `01-01`/`01-02-PLAN.md`) | `(input: DecodeBridgeErrorInput) => DecodedBridgeError`, ten-member `kind` union, total (never throws) |
| `DecodeBridgeErrorInput.gasEstimate` | same | `{ gas: bigint; feePerGas: bigint } \| undefined` — optional; this hook may pass it when available from a prior `simulateContract`/`estimateGas` call, or omit it and let Phase 1's fallback chain degrade gracefully |
| `useRelayStatus()` | `ui/src/hooks/use-relay-status.ts` (Phase 2, `02-03-PLAN.md`) | `({ messageId?: Hex; destinationChainId?: number }) => UseRelayStatusResult { status: 'pending' \| 'finalized'; destinationTransactionHash?: Hex; transportMode: TransportMode; error: string \| null; refresh: () => Promise<void> }` |
| generated ABIs | `ui/src/lib/generated.ts` (Phase 1, `01-01-PLAN.md`) | `collateralTokenBridgeAbi`, `syntheticTokenBridgeAbi`, `wrappedTokenAbi`, `ierc20Abi` — resolve events/functions **by name**, never by array index |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Imperative `wagmi/actions` sequence for the whole chain | Keep `useWriteContract()`/`useWaitForTransactionReceipt()` reactive hooks for approve/bridge, only make simulate imperative | Rejected: a reactive hook's state cannot be `await`ed inline — there is no promise to chain from `isSuccess` flipping on a later render. D-02's single continuous click-to-completion flow requires every step in the same awaited call stack, which forces the receipt-wait step to be the imperative `waitForTransactionReceipt` action too, not the hook |
| `simulateContract` pinned to `blockNumber` for D-04's replay | Raw `call()` + manual `decodeErrorResult` | Rejected: `call()` returns a `CallExecutionError` wrapping raw hex, not a `ContractFunctionRevertedError` with pre-decoded `data.errorName`/`data.args` — using it would require re-implementing the exact decode step Phase 1's `ContractFunctionRevertedError`-shaped `decodeBridgeError` branch already does, and risks a second, subtly different decode path |
| `localStorage` for rehydration | `sessionStorage` | Rejected: Pitfall 7 explicitly names "reviewer refreshes the page to check it's real" as a likely portfolio-demo scenario, which can include closing and reopening the tab — `sessionStorage` is cleared on tab close, `localStorage` is not |

**Installation:** none — no `bun install` needed for this phase.

## Package Legitimacy Audit

**Not applicable — this phase installs no new external packages.** Every symbol used
(`wagmi/actions`, `@wagmi/core` transitively, `viem`) is already present in `bun.lock` and was
confirmed installed by direct filesystem inspection during this research session, not by name lookup
alone. No `[SLOP]`/`[SUS]` verdicts apply; no `checkpoint:human-verify` is required for any install
step in this phase.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────┐
                     │              ui/src/app/page.tsx             │
                     │  useBridgeFlow() ── owns direction/amount/   │
                     │  recipient + calls deriveFlowState() input   │
                     └───────────────┬───────────────┬─────────────┘
                                     │               │
                     BridgeFlowState │               │ setters + flow state
                                     ▼               ▼
                     ┌────────────────────┐   ┌──────────────────────┐
                     │   <Stepper />       │   │   <BridgeCard />      │
                     │  reads .steps only  │   │  controlled inputs +  │
                     │  (STEP-01..04)      │   │  <ActionButton/>      │
                     └────────────────────┘   │  reads .phase only    │
                                               │  (BTN-01/02) + one    │
                                               │  error banner          │
                                               └──────────────────────┘

  ui/src/hooks/use-bridge-flow.ts  (this phase's core deliverable)
  ┌──────────────────────────────────────────────────────────────────┐
  │ 1. click → runFlow() (one async function, imperative wagmi/actions)│
  │    writeContract(approve) → waitForTransactionReceipt              │
  │       → [gate: allowance>=amount] → simulateContract(bridge)       │
  │       → writeContract(bridge) → waitForTransactionReceipt          │
  │       → on reverted receipt: simulateContract(bridge, {blockNumber})│
  │    any thrown error at any step → decodeBridgeError() → `failure`  │
  │ 2. useRelayStatus({ messageId, destinationChainId }) — reactive,   │
  │    runs in parallel once `messageId` is known from bridge receipt  │
  │ 3. deriveFlowState({ ...progress flags, relay, failure, gates })   │
  │    → single BridgeFlowState returned upward                        │
  │ 4. localStorage persistence: write after each step transition,     │
  │    read once in a post-mount useEffect, re-verify against chain    │
  └──────────────────────────────────────────────────────────────────┘
                │                              ▲
                ▼                              │
     wagmi/actions (imperative)        useRelayStatus() (Phase 2)
     simulateContract / writeContract  seed getLogs → subscribe
     / waitForTransactionReceipt       BridgeFinalized(messageId)
                │                              ▲
                ▼                              │
          origin-chain RPC              destination-chain RPC (WS/HTTP)
```

A user's primary path traces top-to-bottom-left-to-right: click in `<BridgeCard>` →
`use-bridge-flow.ts`'s `runFlow()` → wagmi actions hit the origin chain → on success `messageId` is
extracted from the bridge receipt's `BridgeTxInitiated` log → `useRelayStatus` picks it up and watches
the destination chain → `deriveFlowState()` combines both into one `BridgeFlowState` → `<Stepper>`
and `<ActionButton>` both re-render off that single value.

### Recommended Project Structure

```
ui/src/
├── hooks/
│   └── use-bridge-flow.ts        # this phase's orchestration hook (03-01)
├── components/
│   ├── stepper.tsx                # presentational, reads BridgeFlowState.steps (03-02)
│   ├── stepper.module.css
│   ├── action-button.tsx          # presentational, reads BridgeFlowState.phase (03-02)
│   ├── action-button.module.css
│   ├── spinner.tsx                # shared glyph, blue-on-white / white-on-blue (per UI-SPEC.md)
│   ├── spinner.module.css
│   └── bridge-card.tsx            # refactored: controlled inputs, single error banner (03-03)
├── lib/
│   ├── generated.ts                # Phase 1 — ABI source of truth
│   ├── decode-bridge-error.ts     # Phase 1 — error decode chain
│   ├── derive-flow-state.ts       # Phase 1 — pure BridgeFlowState derivation
│   └── flow-storage.ts            # NEW — this phase's localStorage read/write helpers (recommended, see Pattern 4)
└── hooks/
    └── use-relay-status.ts        # Phase 2 — destination-chain relay watch
```

`flow-storage.ts` is a new small module recommended by this research (not explicitly named by
CONTEXT.md) so `use-bridge-flow.ts` does not embed raw `localStorage.getItem`/`setItem` calls inline
— this keeps the persistence shape testable in isolation and matches the codebase's existing
one-small-pure-helper-per-concern pattern (`decode-bridge-error.ts`, `derive-flow-state.ts`,
`relay-status.ts` are all precedent for extracting a pure concern into its own file).

### Pattern 1: Imperative simulate-gated write sequence (SIM-01/02/03, D-01, D-02, D-03)

**What:** One `async function runFlow()` inside `use-bridge-flow.ts`, using `wagmi/actions` obtained
via `useConfig()`, never wagmi's reactive `useSimulateContract`/`useWriteContract` hooks for the
sequencing itself (local `useState` tracks the progress flags those hooks would otherwise have
provided).

**When to use:** Every bridge attempt, per D-02 ("one click drives both transactions").

**Example:**
```typescript
// Source: wagmi/actions re-exports @wagmi/core/actions in full — confirmed by reading
// ui/node_modules/wagmi/dist/esm/exports/actions.js directly (VERIFIED, not assumed):
//   export * from '@wagmi/core/actions'
// Signatures confirmed by reading @wagmi/core@2.22.1's shipped .d.ts files directly.
import { useConfig } from 'wagmi'
import { simulateContract, writeContract, waitForTransactionReceipt } from 'wagmi/actions'
import { decodeBridgeError } from '@/lib/decode-bridge-error'

const config = useConfig()

async function runFlow() {
  setApprove({ isPrompting: true, isConfirming: false, isConfirmed: false })
  let approveHash: Hex
  try {
    approveHash = await writeContract(config, {
      abi: ierc20Abi,
      address: tokenAddress,
      functionName: 'approve',
      args: [bridgeAddress, amount],
      chainId: direction.originChainId,
    })
  } catch (cause) {
    setFailure({ failure: decodeBridgeError({ error: cause }), failedStep: 'approve' })
    return
  }
  setApprove((s) => ({ ...s, isPrompting: false, isConfirming: true }))
  const approveReceipt = await waitForTransactionReceipt(config, {
    hash: approveHash,
    chainId: direction.originChainId,
  })
  setApprove((s) => ({ ...s, isConfirming: false, isConfirmed: true }))

  // D-01: simulate only now — allowance is guaranteed >= amount because approve just confirmed
  let simulation: Awaited<ReturnType<typeof simulateContract>>
  try {
    simulation = await simulateContract(config, {
      abi: bridgeAbi,
      address: bridgeAddress,
      functionName: direction.action,
      args: [recipient, amount],
      chainId: direction.originChainId,
    })
  } catch (cause) {
    // SIM-01/SIM-02: the wallet prompt for the bridge tx is never opened
    setFailure({ failure: decodeBridgeError({ error: cause, chainId: direction.originChainId }), failedStep: 'submit' })
    return
  }

  setBridge({ isPrompting: true, isConfirming: false, isConfirmed: false })
  let bridgeHash: Hex
  try {
    // simulation.request is the exact validated calldata — pass it through unchanged
    bridgeHash = await writeContract(config, simulation.request)
  } catch (cause) {
    setFailure({ failure: decodeBridgeError({ error: cause, chainId: direction.originChainId }), failedStep: 'submit' })
    return
  }
  setBridge((s) => ({ ...s, isPrompting: false, isConfirming: true }))
  const bridgeReceipt = await waitForTransactionReceipt(config, {
    hash: bridgeHash,
    chainId: direction.originChainId,
  })

  if (bridgeReceipt.status === 'reverted') {
    // D-04: replay pinned to the block the write actually mined in
    await decodeMinedRevert({ config, simulation, blockNumber: bridgeReceipt.blockNumber, setFailure })
    return
  }

  setBridge((s) => ({ ...s, isConfirming: false, isConfirmed: true }))
  // messageId extraction (parseEventLogs against bridgeReceipt.logs) feeds useRelayStatus
}
```

### Pattern 2: D-04's mined-revert replay reuses `simulateContract`, not raw `call()`

**What:** SIM-03's "independently decoded" write-side revert is produced by a **second
`simulateContract` call**, same ABI/function/args as the original write, with `blockNumber` pinned to
the receipt that actually reverted.

**When to use:** Only when `waitForTransactionReceipt` resolves with `status: 'reverted'` — this path
should be rare (simulation already gated the common failure modes).

**Example:**
```typescript
// Source: viem@2.55.5's SimulateContractParameters extends CallParameters, which declares
// `blockNumber?: bigint` — confirmed by reading
// ~/.bun/install/cache/viem@2.55.5@@@1/_types/actions/public/call.d.ts directly (VERIFIED).
async function decodeMinedRevert({
  config,
  simulation,
  blockNumber,
  setFailure,
}: {
  config: Config
  simulation: Awaited<ReturnType<typeof simulateContract>>
  blockNumber: bigint
  setFailure: (input: { failure: DecodedBridgeError; failedStep: BridgeStepId }) => void
}) {
  try {
    // Re-run the exact same call pinned to the block where it actually reverted.
    // This produces a fresh ContractFunctionRevertedError with real decoded evidence —
    // the receipt alone carries no revert data.
    await simulateContract(config, { ...simulation.request, blockNumber })
    // Should not reach here if the write really reverted; fall through to a generic message.
    setFailure({
      failure: { kind: 'unknown', message: 'Transaction reverted; no revert data could be recovered.' },
      failedStep: 'submit',
    })
  } catch (cause) {
    setFailure({
      failure: decodeBridgeError({ error: cause, chainId: simulation.request.chainId }),
      failedStep: 'submit',
    })
  }
}
```
D-04's documented degrade ("if a public node refuses the historical `eth_call`, degrade to the plain
reverted message plus explorer link") is exactly the `catch` producing `kind: 'unknown'` above — no
special-casing needed, Phase 1's generic branch already handles it.

### Pattern 3: `deriveFlowState()` input mapping — the exact contract, not a guess

**What:** `use-bridge-flow.ts` must produce a `DeriveFlowStateInput` matching `01-03-PLAN.md`'s
locked shape exactly. Do not invent field names.

```typescript
// Source: .planning/phases/01-.../01-03-PLAN.md <resolved_open_questions>, quoted verbatim —
// this is the binding contract Phase 1's acceptance_criteria enforces.
export type BridgeStepId     = 'approve' | 'submit' | 'relay'
export type BridgeStepStatus = 'idle' | 'pending' | 'processing' | 'confirmed'
export interface BridgeStep { id: BridgeStepId; status: BridgeStepStatus }
export type BridgeSteps = readonly [BridgeStep, BridgeStep, BridgeStep]
export type BridgeBlockedReason =
  | 'disconnected' | 'undeployed' | 'wrong-chain' | 'switching-chain'
  | 'invalid-amount' | 'invalid-recipient'
export type BridgeFlowState =
  | { phase: 'blocked';    reason: BridgeBlockedReason; steps: BridgeSteps }
  | { phase: 'ready';      steps: BridgeSteps }
  | { phase: 'approving';  steps: BridgeSteps }
  | { phase: 'submitting'; steps: BridgeSteps }
  | { phase: 'relaying';   steps: BridgeSteps }
  | { phase: 'done';       steps: BridgeSteps }
  | { phase: 'failed';     failure: DecodedBridgeError; failedStep: BridgeStepId; steps: BridgeSteps }
```
Field-name mapping `use-bridge-flow.ts` must produce for the input:
`isConnected`, `isDeployed`, `isCorrectChain`, `isSwitchingChain` (from `useAccount`/`isBridgeDeployed`/
`useSwitchChain().isPending`), `hasValidAmount`, `hasValidRecipient` (from the existing
`parseAmount`/`parseRecipient` helpers, now living in the hook per D-05), `approve`/`bridge` each a
`{ isPrompting, isConfirming, isConfirmed }` set by the imperative sequence's `setApprove`/`setBridge`
calls in Pattern 1, `relay: { isInitiated, isFinalized }` derived from `useRelayStatus()`'s
`status === 'finalized'` (⇒ `isFinalized: true`) — `isInitiated` is `true` once a `messageId` exists
locally (the bridge receipt confirmed), independent of `useRelayStatus`'s own network state — and
`failure?: DecodedBridgeError` cleared explicitly on a fresh `runFlow()` call or a direction flip
(D-08's carried constraint from `01-03-PLAN.md`: "Phase 3 must clear `failure` when a fresh attempt
begins").

This is what makes `FLOW-03` a real deletion: `getActionState()`'s ten branches
(`ui/src/components/bridge-card.tsx` lines 476–520, current pre-Phase-1 code — verified by reading
the file directly) map one-for-one onto `BridgeBlockedReason`'s six members plus `approving`/
`submitting`/`relaying`/`done`, so nothing from the old function survives as a parallel check.

### Pattern 4: `localStorage` rehydration (FLOW-04) — resolving the CONTEXT.md deferred gray area

**What:** A minimal persisted record, written after each meaningful step transition, read exactly
once in a post-mount `useEffect`, and used to **re-derive** state from the chain rather than trusted
blindly.

**Recommended shape** `[ASSUMED — synthesized from PITFALLS.md Pitfall 7 + 03-UI-SPEC.md's
rehydration-rendering contract, not stated verbatim in CONTEXT.md]`:
```typescript
interface PersistedFlow {
  address: Address           // scopes the record to the connected wallet
  direction: 'baseToArbitrum' | 'arbitrumToBase'
  amount: string              // decimal string input, not the parsed bigint — re-parse on read
  recipient: string
  approveHash?: Hex
  bridgeHash?: Hex
  messageId?: Hex
  updatedAt: number           // Date.now() at last write — not used for expiry logic itself,
                               // only as an optional staleness signal a future phase could use
}
```
Storage key: `bridge-flow:${address}` (localStorage, not sessionStorage — see Alternatives
Considered). Written after each state-changing step of `runFlow()` (approve hash obtained, bridge
hash obtained, messageId extracted) and on `done`/`failed`/direction-flip the record is deleted, not
merely marked complete — `03-UI-SPEC.md`'s D-08 already keeps the *rendered* completed/failed state
visible from in-memory React state; persistence only needs to survive an actual page reload, and a
stale completed record left in storage past its own session serves no purpose and is one more thing
that could be misread on a later visit.

**Rehydration procedure** (inside `use-bridge-flow.ts`, first-mount `useEffect`, guarded on
`isConnected` and `address`):
1. Read `localStorage.getItem('bridge-flow:' + address)`. If absent, do nothing — the SSR-safe
   default (`useState`'s initial value, matching the server-rendered `upcoming` stepper) stands.
2. If a `messageId` is present, hand it straight to `useRelayStatus({ messageId, destinationChainId })`
   — that hook's own bounded `getLogs` seed (LIVE-04, Phase 2) independently reconstructs whether the
   relay already finalized while the tab was closed. Do not trust a locally-cached "relayed" flag;
   there is none in this record for exactly that reason.
3. If a `bridgeHash` is present but no `messageId`, call `getTransactionReceipt(config, { hash:
   bridgeHash, chainId })` (a `wagmi/actions` import) to check whether it mined; if it did, extract
   `messageId` the same way `runFlow()` does (`parseEventLogs` against the generated bridge ABI) and
   proceed as step 2. If the receipt lookup throws (dropped/replaced transaction, or the hash
   predates a chain reset on a testnet), clear the record and fall back to `idle` — do not leave the
   UI stuck reconstructing a transaction that no longer exists.
4. If only `approveHash` is present, similarly check its receipt; if confirmed, resume at
   `submitting`-eligible state (the user would need to click again to actually resubmit the bridge
   leg per D-02's "one click" model — a stale approve receipt does not auto-resume a wallet prompt on
   its own, since re-opening a wallet prompt without a fresh user gesture is exactly the risk D-02's
   own fallback note warns about).
5. Restore `direction`/`amount`/`recipient` from the record regardless, so the form doesn't blank out.

**Hydration-mismatch safety:** all of the above runs inside a `useEffect`, never during the render
that produces the first paint — this is the standard Next.js App Router pattern for browser-only
storage (confirmed via current framework guidance: initialize state to the SSR-safe default,
move `localStorage` reads into a post-mount effect, update state only after that read resolves)
`[CITED: Next.js hydration-mismatch guidance, web search 2026-07]`. Because `03-UI-SPEC.md` already
mandates the stepper render `upcoming` for all three steps before rehydration resolves, this
hydration-safe default and the UI-SPEC's honest-empty-state requirement are the *same* value — no
extra "loading" branch needs inventing.

### Anti-Patterns to Avoid

- **Reactive hooks mid-sequence:** Do not reach for `useWriteContract()`'s `isPending` or
  `useWaitForTransactionReceipt()`'s `isSuccess` as a substitute for awaiting inside `runFlow()`.
  Those are render-driven booleans, not promises; you cannot `await` a value that only updates on a
  subsequent render. This is *why* D-03 forbids `useSimulateContract` specifically, and the same
  reasoning extends to the write/receipt legs once D-02 requires one continuous awaited chain.
- **Trusting a passed simulation as a hard guarantee (Pitfall 8, `PITFALLS.md`):** the gap between
  `simulateContract` resolving and the user actually confirming in their wallet is real — another
  transaction can land first (`processed[messageId]` flip, allowance consumed by a second tab). SIM-03
  exists precisely because write-side decoding must not assume simulation already proved success.
- **Second derivation of button/stepper state:** Any `if (...)` branch inside `stepper.tsx` or
  `action-button.tsx` that reads a raw progress flag instead of `BridgeFlowState.steps`/`.phase`
  directly violates BTN-01/FLOW-01 even if it "happens to" agree with the derived value today.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Awaiting a wallet write + its receipt in sequence | A custom promise wrapper around `useWriteContract`'s callback props | `writeContract`/`waitForTransactionReceipt` from `wagmi/actions` | Already promise-returning, already handles chain-mismatch/connector edge cases wagmi's hooks handle internally |
| Decoding a mined-but-reverted transaction's real reason | Hand-rolled `eth_call` + manual `decodeErrorResult` against a raw hex string | `simulateContract` pinned to `blockNumber` (Pattern 2) | Produces the identical `ContractFunctionRevertedError` shape Phase 1's decode chain already consumes — one decode path instead of two |
| SSR-safe browser storage reads | A hand-rolled `typeof window !== 'undefined'` guard scattered through the hook | The standard `useState(default) + useEffect(read)` pattern (Pattern 4) | Well-established Next.js App Router idiom; scattering `typeof window` checks throughout a hook is exactly the kind of ad-hoc pattern this codebase's conventions avoid |
| Relay-completion polling/dedup/reorg-rollback | A second `getLogs`/`watchContractEvent` loop inside `use-bridge-flow.ts` | `useRelayStatus()` (Phase 2, already builds LIVE-01/04/07/08 correctly) | Phase 2 is a dependency precisely so this phase never re-implements transport concerns |

**Key insight:** every "don't hand-roll" row above exists because the correct primitive is already
either shipped inside `wagmi`/`viem` or already being built by an upstream phase in this same
milestone. The only genuinely new logic this phase writes is the sequencing glue (Pattern 1) and the
persistence helper (Pattern 4) — everything else is composition.

## Runtime State Inventory

> Included because this phase deletes existing component state and functions (`getActionState()`,
> `approveHash`/`bridgeHash`) — a partial refactor trigger. All five categories checked explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `approveHash`/`bridgeHash` are transient in-memory `useState`, never written to any datastore. Verified by reading `bridge-card.tsx` directly: no `localStorage`/`sessionStorage`/database call exists anywhere in the current file. | None |
| Live service config | None — no external service (n8n-style workflow config, Datadog, etc.) references these state variables by name. | None |
| OS-registered state | None — this is a browser SPA; nothing registers with Task Scheduler/launchd/pm2. | None |
| Secrets/env vars | None — `approveHash`/`bridgeHash`/`getActionState` are not referenced by any `.env` key or SOPS secret name. | None |
| Build artifacts | None — no compiled binary or `.egg-info`-style artifact embeds these symbol names. | None |

**New state this phase introduces (not a rename — net-new):** the `localStorage` record proposed in
Pattern 4 above is new persisted state with no prior form to migrate from. It does not fall under
"runtime state inventory" in the rename/migration sense; noted here only for completeness since the
trigger condition (function/state deletion) technically applies to this phase.

## Common Pitfalls

### Pitfall 1: Simulation staleness between simulate and wallet confirmation (`PITFALLS.md` Pitfall 8)
**What goes wrong:** `simulateContract` resolves successfully, but by the time the user actually
confirms the bridge transaction in their wallet, on-chain state has moved (another transaction
consumed the allowance, `processed[messageId]` flipped on the destination side of a race).
**Why it happens:** Simulation is a point-in-time snapshot (`eth_call` against a specific block), not
a lock on future state.
**How to avoid:** Never skip or weaken the write-side `try/catch` around `writeContract` on the
theory that "simulation already proved this succeeds" — SIM-03 exists exactly for this case. The
imperative sequence in Pattern 1 already treats the two `catch` blocks (simulate-catch,
write-catch) as fully independent decode paths, which is the correct shape.
**Warning signs:** A code review that treats the post-simulation `writeContract` call as unable to
fail, or omits its own `catch`.

### Pitfall 2: A second wallet prompt not triggered by a direct user gesture gets suppressed
**What goes wrong:** D-02's "one click drives both" opens the bridge wallet prompt programmatically
after the approve receipt confirms — some wallet extensions (or mobile wallet-connect flows) treat a
prompt not opened synchronously inside a click handler as suspicious and silently drop or delay it.
**Why it happens:** Browsers/wallets apply "user activation" heuristics to prevent unsolicited
popups; an `await` chain that resolves after the approve receipt (which can take several seconds) may
fall outside the window some wallets consider still-attached to the original click.
**How to avoid:** This is exactly the risk D-02 already names and pre-approves a fallback for: if it
surfaces during implementation/manual testing, switch to the "armed second click" variant (button
reads `Confirm bridge` after approve confirms, requiring one more real click) rather than reverting to
click-per-transaction. Do not silently work around it with a different mechanism (e.g., a `setTimeout`
retry loop) — that reintroduces exactly the kind of un-discussed architecture CLAUDE.md forbids.
**Warning signs:** Manual testing (required per this milestone's human-check convention) shows the
second wallet prompt sometimes not appearing on real wallets (MetaMask, Rainbow, Coinbase Wallet)
even though `writeContract` was actually called — check the browser console/network tab for the
`eth_sendTransaction` request actually firing versus the extension UI never popping.

### Pitfall 3: Cold start — refresh mid-bridge loses the in-flight transaction (`PITFALLS.md` Pitfall 7)
**What goes wrong:** A user (or portfolio reviewer) refreshes mid-flow; without persistence, all
`useState` is lost and the stepper resets to step 1 with no memory of the submitted transaction.
**Why it happens:** React component state does not survive a full page reload; only Phase 2's live
subscription (which only sees *new* events) is not enough on its own.
**How to avoid:** Pattern 4's persistence + re-verification design, backstopped by
`useRelayStatus()`'s own bounded `getLogs` seed (LIVE-04) which independently reconstructs relay
status regardless of what the local record says.
**Warning signs:** Manual test: submit a bridge, refresh before relay completes, confirm the stepper
resumes at the correct step rather than resetting.

### Pitfall 4: Persisting parsed `bigint` amounts across a JSON round-trip
**What goes wrong:** `JSON.stringify`/`JSON.parse` (the primitive `localStorage` API requires) cannot
represent `bigint` — `JSON.stringify(1_000_000n)` throws `TypeError: Do not know how to serialize a
BigInt`.
**Why it happens:** `bigint` is not a JSON-representable type in the ECMAScript spec.
**How to avoid:** Pattern 4's recommended shape already stores `amount` as the raw decimal-string
form the input field held (`amountInput`, not the `parseUnits`-derived `bigint`), and re-parses it
with the existing `parseAmount()` helper on rehydration — this sidesteps the serialization problem
entirely rather than hand-rolling a bigint-safe `JSON.stringify` replacer.
**Warning signs:** A `TypeError` thrown from inside the persistence-write call the first time a real
amount is bridged.

### Pitfall 5: Rendering the persisted record before rehydration resolves causes a hydration mismatch
**What goes wrong:** Reading `localStorage` synchronously during the initial render (even inside a
component that is `'use client'`) produces different output between the server-rendered HTML (which
has no access to the browser's storage) and the first client render, triggering React's hydration
error.
**Why it happens:** Next.js App Router still renders client components once on the server for the
initial HTML; `'use client'` does not mean "server never touches this file," it means "this
component can use browser APIs and hooks," but only inside effects/event handlers, never
synchronously during the render function itself.
**How to avoid:** Pattern 4's `useEffect`-gated read is mandatory, not a style preference — this is
confirmed current framework guidance, not folklore `[CITED: Next.js hydration-mismatch guidance]`.
**Warning signs:** A "Text content does not match server-rendered HTML" console error the first time
the app is loaded with a stale persisted record present.

## Code Examples

Verified patterns, composed from directly-inspected source (not training-data recall):

### Confirming `wagmi/actions` is a full `@wagmi/core` re-export
```bash
# Run against the actual installed package — this is what this research verified, not assumed:
cat ui/node_modules/wagmi/dist/esm/exports/actions.js
# → export * from '@wagmi/core/actions';
```

### `simulateContract`'s parameter type includes `blockNumber` (enables Pattern 2)
```typescript
// Source: ~/.bun/install/cache/viem@2.55.5@@@1/_types/actions/public/simulateContract.d.ts
// SimulateContractParameters<...> is built on `callParameters extends CallParameters<derivedChain>`
// and CallParameters declares (from call.d.ts):
//   blockNumber?: bigint | undefined
//   blockTag?: BlockTag | undefined
```

### `getTransactionReceipt` for rehydration's step-3 receipt check
```typescript
// Source: @wagmi/core@2.22.1's dist/types/actions/getTransactionReceipt.d.ts
import { getTransactionReceipt } from 'wagmi/actions'
const receipt = await getTransactionReceipt(config, { hash: persisted.bridgeHash, chainId })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `TX_FLOW.md`'s literal instruction: `useSimulate` from wagmi as a reactive gate | Imperative `simulateContract` from `wagmi/actions`, awaited inline (D-03) | Decided during Phase 3's `/gsd-discuss-phase` session, 2026-07-25 | Simulation becomes ordinary sequential code instead of a second React-Query lifecycle to coordinate against the write step; eliminates Pitfall 9 (`PITFALLS.md`, re-simulation-on-every-keystroke) entirely, since there is no reactive query key to accidentally over-trigger |
| `bridge-card.tsx`'s ten-branch `getActionState()` computing button state from raw flags directly in the component | `deriveFlowState()` (Phase 1) as the sole source, consumed identically by both the stepper and the button | Phase 1, `01-03-PLAN.md` | FLOW-01/BTN-01 satisfied structurally — a second derivation becomes a type-level impossibility once both consumers only ever destructure the same value |
| Ungated approve — only runs when `allowance < amount` | Approve runs on **every** bridge attempt regardless of existing allowance (FLOW-02) | `PROJECT.md` Key Decisions, restated in `03-CONTEXT.md` | All three stepper steps always execute, satisfying the "always shows all three" success criterion — the allowance short-circuit in the pre-Phase-1 `bridge-card.tsx` (`needsApproval` check, current line 116) must not survive into the new hook |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact `localStorage` persisted-record shape (`PersistedFlow` interface, storage key format `bridge-flow:${address}`, deletion-on-terminal-state policy) | Architecture Patterns Pattern 4 | Low-medium: this is new code with no existing consumer, so getting the shape wrong just means the planner picks a different (but still internally-consistent) shape — no external contract is broken. The *behavior* requirements (re-derive via chain state, don't trust blindly, useEffect-gated read) are the load-bearing part and are grounded in Pitfall 7 + standard Next.js guidance, not this specific interface |
| A2 | `relay.isInitiated` should be derived from "a `messageId` is known locally" rather than any field `useRelayStatus()` itself exposes | Architecture Patterns Pattern 3 | Low: `useRelayStatus()`'s `UseRelayStatusResult` (per `02-03-PLAN.md`) exposes only `status`/`destinationTransactionHash`/`transportMode`/`error`/`refresh` — it has no `isInitiated`-equivalent field, so deriving it from "do we have a messageId" is the only information available; if Phase 2 ships a different shape than currently planned, this must be re-checked against the actual `02-03-SUMMARY.md` at plan time |
| A3 | The "armed second click" fallback variant for D-02's wallet-prompt-suppression risk is deferred (not built proactively) unless the primary one-click flow demonstrably fails in manual testing | Common Pitfalls Pitfall 2 | Low: this mirrors D-02's own stated risk-acceptance; building the fallback proactively would be scope the user did not ask for |

**If this table is empty:** N/A — see above.

## Open Questions

1. **What happens if the user rejects the *second* wallet prompt after approve already succeeded?**
   - What we know: allowance is now set (approve succeeded); a naive retry via `handleAction()`'s old
     `needsApproval` check would skip straight to bridge, meaning step 1 would not "re-execute" a
     wallet prompt (though it would still show `confirmed`, which is accurate — it did confirm).
     FLOW-02 requires approve to run "on every bridge attempt," which is about the *write being sent*
     each time, not about the stepper needing to re-animate a step that's already true.
   - What's unclear: whether a rejected bridge-leg wallet prompt should surface as `kind:
     'wallet-rejected'` through `decodeBridgeError` (yes — this is already a `writeContract` catch
     block per Pattern 1, ERR-05 is Phase 1's job) and whether retrying from `failed` re-runs
     `runFlow()` from the top (re-sending an already-redundant approve) or resumes from the bridge leg
     only.
   - Recommendation: retry from `failed` should call `runFlow()` from the top every time — this keeps
     the sequence a single, simple, always-correct code path (no partial-resume branch to get wrong)
     and costs only one harmless redundant `approve` write for the exact same amount, which is a no-op
     on-chain beyond gas. This matches FLOW-02's "approve runs on every bridge attempt" literally.

2. **Should the hook call `estimateGas` explicitly to populate `DecodeBridgeErrorInput.gasEstimate`,
   or rely entirely on Phase 1's `metaMessages`-parse/default fallback?**
   - What we know: `simulateContract`'s return type does not include a `gas` field by default (it
     performs `eth_call`, not `eth_estimateGas`); Phase 1's gas-shortfall helper already has two
     fallback sources beyond the explicit `gasEstimate` (see `01-02-PLAN.md`'s
     `<planner_flagged_decisions>`).
   - What's unclear: whether the marginal accuracy of an explicit `estimateGas` call is worth an
     extra RPC round-trip on a path (insufficient native gas) that is already handled reasonably by
     Phase 1's fallback chain.
   - Recommendation: skip it for this phase — pass `gasEstimate` as `undefined` unless it falls out
     naturally from another already-made call, and let Phase 1's existing three-source chain do its
     job. This is Claude's Discretion territory per Phase 1's own CONTEXT.md, not a new decision this
     phase needs to force.

## Environment Availability

Skipped — this phase adds no new external dependencies. It consumes RPC/WebSocket infrastructure
that Phase 2 already verifies and wires (`LIVE-02`'s smoke test), and no new package, service, or CLI
tool is required to implement or run it.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Wallet connection/auth is handled entirely by RainbowKit/wagmi, unchanged by this phase |
| V3 Session Management | Partial | The new `localStorage` persistence record is client-only "session" state — see below |
| V4 Access Control | No | No new access-control surface; all writes still go through the user's own connected wallet |
| V5 Input Validation | Yes | `parseAmount`/`parseRecipient` (existing, moved into the hook per D-05) remain the validation gate; 6-decimal parsing must not regress to 18-decimal assumptions anywhere in the new hook |
| V6 Cryptography | No | No new cryptographic operation introduced by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Rendering a decoded revert message (attacker-influenceable bytes, per Phase 1's own threat model) directly into the error banner | Tampering / Information disclosure | Already mitigated upstream by Phase 1 (`decode-bridge-error.ts` returns plain strings, bounded length); this phase's obligation (carried forward from Phase 1's `T-01-02`/`T-02-02` threat entries) is to render that string as a React text child and **never** via `dangerouslySetInnerHTML` — the error banner in `bridge-card.tsx`'s refactor must not deviate from this |
| `localStorage` record leaking a user's in-progress bridge amount/recipient to any script with same-origin access | Information disclosure | Low severity for this project (testnet-only, publicly-visible on-chain data anyway once submitted, no PII, no mainnet funds) — no additional encryption/scoping needed beyond the existing `bridge-flow:${address}` key-per-wallet scoping already recommended in Pattern 4 |
| A malformed or attacker-crafted `localStorage` record (e.g. browser extension tampering, or a stale record from a different app version) driving `use-bridge-flow.ts` into an inconsistent state on rehydration | Tampering | Pattern 4's re-verification design (step 2–4: always re-check against actual chain state via `getTransactionReceipt`/`useRelayStatus`, never trust the record's own implied status) already defends against this — a corrupted or hostile record can at worst cause the hook to look up a receipt that doesn't exist, which the recommended `catch`-and-clear behavior (step 3) already handles safely |

## Sources

### Primary (HIGH confidence)
- `ui/node_modules/wagmi/dist/esm/exports/actions.js` — direct read, confirms `wagmi/actions` re-exports `@wagmi/core/actions` wholesale
- `~/.bun/install/cache/@wagmi/core@2.22.1@@@1/dist/types/actions/{simulateContract,writeContract,waitForTransactionReceipt,call,getPublicClient,getTransactionReceipt}.d.ts` — direct read of installed type declarations, confirms every action's exact `(config, parameters) => Promise<T>` signature
- `~/.bun/install/cache/viem@2.55.5@@@1/_types/actions/public/{simulateContract,call}.d.ts` — direct read, confirms `SimulateContractParameters` extends `CallParameters` which declares `blockNumber?: bigint`
- `ui/src/components/bridge-card.tsx`, `ui/src/lib/bridge.ts`, `ui/src/lib/config.ts`, `ui/src/wagmi.ts`, `ui/src/app/page.tsx`, `ui/src/hooks/use-bridge-messages.ts` — direct read of the actual current (pre-Phase-1) codebase, ground truth for what Phase 3's refactor is starting from
- `.planning/phases/01-.../01-01-PLAN.md`, `01-02-PLAN.md`, `01-03-PLAN.md` — Phase 1's binding, acceptance-criteria-enforced contracts (`DecodedBridgeError`, `BridgeFlowState`, generated ABI export names) that this phase must consume verbatim
- `.planning/phases/02-.../02-01-PLAN.md`, `02-02-PLAN.md`, `02-03-PLAN.md` — Phase 2's binding contracts (`useRelayStatus`, `TransportMode`, `getLiveClient`)
- `.planning/phases/03-.../03-CONTEXT.md`, `03-UI-SPEC.md` — this phase's locked user decisions and the approved visual/interaction contract

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` — largely superseded by D-03's override on the simulate hook, but its confirmed hook semantics (`isPending` spans wallet-prompt-through-node-acceptance, `isFetching` is the receipt-fetch window) remain accurate and are the basis for the `deriveFlowState()` field-mapping comments Phase 1 already committed
- `.planning/research/PITFALLS.md` Pitfalls 7, 8, 9 — WebSearch-and-official-docs-sourced, cross-checked against this phase's actual locked decisions
- WebSearch, "Next.js App Router localStorage useEffect avoid hydration mismatch" — confirms the `useState(default) + useEffect(read)` pattern as current framework guidance

### Tertiary (LOW confidence)
- None used for a load-bearing claim in this document.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every wagmi/viem signature claim verified against the actual installed source, not training-data recall
- Architecture: HIGH for the imperative-sequence pattern (directly grounded in verified action signatures and the locked D-01..D-08 decisions); MEDIUM for the exact `localStorage` shape (Pattern 4), which is a reasoned synthesis, not a locked decision
- Pitfalls: HIGH — sourced from the project's own committed `PITFALLS.md` (already MEDIUM-HIGH confidence at time of writing) plus direct codebase inspection

**Research date:** 2026-07-25
**Valid until:** 30 days (stable stack; no fast-moving dependency in this phase) — but re-verify
`useRelayStatus()`'s exact return shape against `02-03-SUMMARY.md` once Phase 2 actually executes,
since this research quotes the *planned* shape from `02-03-PLAN.md`, not an executed-and-confirmed
one.
