# Architecture Research

**Domain:** Transaction-flow state management for a bridge dApp (React/Next.js + wagmi + viem)
**Researched:** 2026-07-24
**Confidence:** MEDIUM — official viem/wagmi docs read directly and cross-checked against a closed upstream GitHub issue; two specific runtime behaviors (fallback-transport subscription mode, transport introspection) have no authoritative doc answer and are flagged as verify-empirically below.

This is a **brownfield, scoped research pass**. It does not re-derive the existing bridge/relayer architecture (see `.planning/codebase/ARCHITECTURE.md`) — it answers one question: how should the new transaction-flow layer be structured inside `bridge-card.tsx` / `use-bridge-messages.ts`'s existing shape.

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Chain state (Base Sepolia / Arbitrum Sepolia contracts)             │
│  BridgeTxInitiated / BridgeFinalized events · custom error selectors   │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ fallback([webSocket, http]) per chain
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  wagmi hooks (data sources — each is its own source of truth for    │
│  its own async lifecycle; the flow layer does NOT duplicate them)   │
│  useSimulateContract · useWriteContract · useWaitForTransactionReceipt │
│  useWatchContractEvent (destination chain, explicit chainId)         │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ read-only, one direction
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ui/src/hooks/use-bridge-flow.ts  (orchestrating hook)               │
│  calls the wagmi hooks above + use-relay-status.ts, then calls the  │
│  PURE selector below to fold everything into ONE state object       │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ deriveFlowState(inputs) — pure fn
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ui/src/lib/bridge-flow-state.ts                                     │
│  BridgeFlowState (discriminated union) → { steps, action }           │
└──────────────────┬──────────────────────────────┬────────────────────┘
                    ▼                              ▼
┌───────────────────────────┐        ┌───────────────────────────────┐
│  components/stepper.tsx    │        │  components/action-button.tsx  │
│  (presentational, no wagmi)│        │  (presentational, no wagmi)    │
└───────────────────────────┘        └───────────────────────────────┘
```

The key structural decision: **the flow "state machine" is a pure derivation (selector), not a reducer with dispatched actions, and not a state-chart library.** wagmi's query hooks are *already* the source of truth for every async lifecycle transition (pending/confirming/success/error). Introducing a second, manually-updated state store to shadow them is exactly the bug class the current `getActionState()` sits in — ten ad-hoc `if` branches computed fresh each render from loose booleans, with no single object either consumer can trust. The fix is not a bigger state machine; it's turning that same idea into one well-typed, testable, pure function whose *output* — not scattered inputs — is what `bridge-card.tsx` passes down.

### Component Responsibilities

| Component | Responsibility | File(s) |
|-----------|----------------|---------|
| **Flow derivation** | Pure function(s): fold wagmi hook states + relay status + decoded error into one `BridgeFlowState`, then project it into `StepperStep[]` and `ActionButtonProps` | `ui/src/lib/bridge-flow-state.ts` (new) |
| **Error mapping** | Decode reverts (ABI-aware), map known causes (insufficient gas, stale allowance) to display copy; small, explicitly extensible list | `ui/src/lib/bridge-errors.ts` (new) |
| **Flow orchestration** | Owns the two write/simulate/receipt hook chains (approve, bridge), calls relay-status + error-mapper, returns one memoized state + action callbacks | `ui/src/hooks/use-bridge-flow.ts` (new) |
| **Relay watch (single tx)** | Seed-check (`getLogs`) + live watch (`useWatchContractEvent`, explicit destination `chainId`) for one `messageId`'s `BridgeFinalized`; exposes `queued/relaying/done` | `ui/src/hooks/use-relay-status.ts` (new) |
| **Transport mode** | Tracks whether the active watch is currently receiving pushed events or has fallen back to interval polling; shared by both watch hooks | `ui/src/hooks/use-transport-mode.ts` (new) |
| **Message list (unchanged consumer contract)** | Seed `getLogs` scan (kept, it solves cold-start) + new live-watch layer added on top for both events, both chains | `ui/src/hooks/use-bridge-messages.ts` (refactor, not rewrite) |
| **Card shell** | Form fields, direction flip, chain panels; delegates everything flow-related to `useBridgeFlow()` | `ui/src/components/bridge-card.tsx` (refactor) |
| **Stepper (presentational)** | Renders 3 steps + sub-state copy/spinner/checkmark from `StepperStep[]` only — no wagmi imports | `ui/src/components/stepper.tsx` + `.module.css` (new) |
| **Action button (presentational)** | Renders label/variant/icon/disabled from `ActionButtonProps` only | `ui/src/components/action-button.tsx` + `.module.css` (new) |
| **ABI source of truth** | Full generated ABIs (all custom errors, not the hand-picked subset in the current `parseAbi`) | `ui/src/lib/abis.ts` (extend using `collateral-abi.json` / `synthetic-abi.json`) |

## Recommended Project Structure

```
ui/src/
├── components/
│   ├── bridge-card.tsx          # refactor: form + wiring only, no derivation logic
│   ├── bridge-card.module.css
│   ├── stepper.tsx              # new: presentational, StepperStep[] in
│   ├── stepper.module.css       # new
│   ├── action-button.tsx        # new: presentational, ActionButtonProps in
│   ├── action-button.module.css # new
│   └── message-explorer.tsx     # unchanged consumer of use-bridge-messages.ts
├── hooks/
│   ├── use-bridge-flow.ts       # new: orchestrates approve+bridge+relay, returns 1 state
│   ├── use-relay-status.ts      # new: single-message destination watch, seed+subscribe
│   ├── use-transport-mode.ts    # new: 'live' | 'polling' | 'connecting' for a watch
│   └── use-bridge-messages.ts   # refactor: keep seed getLogs, add live-watch tail
└── lib/
    ├── bridge-flow-state.ts     # new: pure selector + StepperStep/ActionButtonProps types
    ├── bridge-errors.ts         # new: decode + map, small ordered matcher list
    ├── abis.ts                  # extend: full ABIs incl. all custom errors
    ├── bridge.ts                # unchanged (BridgeMessage, formatting helpers)
    └── config.ts                # extend: add WebSocket RPC URLs alongside http pair
```

### Structure Rationale

- **`lib/bridge-flow-state.ts` and `lib/bridge-errors.ts` are pure, hook-free modules.** Neither imports React or wagmi hooks — only viem types and plain data in/out. This is deliberate: they can be built and unit-tested (`bun test`) against fixture inputs before any hook or component exists, and it keeps the "small, extensible" error-mapping layer honest — extensible means "append one entry to an array," not "trace through a hook's closures."
- **`hooks/use-bridge-flow.ts` is the only place that touches both wagmi and the pure selector.** It is the single source of truth `bridge-card.tsx` reads from. This directly satisfies "one source of truth feeding two consumers": the source of truth is this hook's *return value*, memoized once per render, not two independent derivations reading the same raw booleans in two places.
- **`hooks/use-relay-status.ts` is scoped to one `messageId`, not the whole message list.** The existing `use-bridge-messages.ts` scans a 50,000-block window across all senders every 6s — correct for a list view, wasteful and slow for "is *my* transaction's `BridgeFinalized` in yet," which is what the stepper's third step needs. A targeted watch (`useWatchContractEvent` filtered by the exact `messageId` topic, on the destination chain) is the right granularity.
- **Presentational components (`stepper.tsx`, `action-button.tsx`) take shaped view-model props only.** No `UseSimulateContractReturnType`, no `Address`, no ABI types leak into them. This keeps them trivially reusable/testable and keeps every wagmi import confined to the `hooks/` layer, matching the existing convention (`bridge-card.tsx` today already centralizes wagmi imports at the top; this splits that single file's *concerns*, not its *layering*).

## Architectural Patterns

### Pattern 1: Derived State via Pure Selector, Not Reducer, Not XState

**What:** Compute one discriminated-union `BridgeFlowState` object each render via a pure function that reads the *existing* wagmi query states (`isPending`, `isFetching`, `isSuccess`, `error`, `data`) plus the relay-status hook's output. Memoize with `useMemo`. Do not introduce `useReducer` with dispatched actions, and do not introduce XState.

**When to use:** Any flow where every async transition is already tracked by a library-managed query (which is the case for all of `useSimulateContract`/`useWriteContract`/`useWaitForTransactionReceipt`). If you find yourself wanting to `dispatch({type: 'APPROVE_PENDING'})`, stop — that event already exists as `approveWrite.isPending` becoming `true`; dispatching it manually creates a second, driftable copy of state wagmi already owns.

**Trade-offs:** A reducer or XState machine would be justified if steps had *cross-cutting, non-linear* transitions (retries with branching, cancellation mid-flight competing with concurrent user actions, parallel independent sub-flows). This flow is linear and always executes all three steps (per the "approve every time" constraint) — there is no branching to model beyond "which step is active" and "did this step's async call error," both of which a pure derivation handles in a handful of lines. Cross-checked against current community guidance: plain `useReducer`/discriminated unions are considered sufficient for small linear flows; state-chart libraries earn their cost only once there are many interdependent or parallel states — not the case here. XState would add a real dependency, a learning-curve tax for future contributors, and a serialization/visualization capability this project has no use for. **Verdict: overkill, do not add.**

**Example:**
```typescript
// ui/src/lib/bridge-flow-state.ts
export type StepStatus = 'upcoming' | 'pending' | 'confirming' | 'confirmed' | 'error'

export interface StepperStep {
  id: 'approve' | 'submit' | 'relay'
  title: string
  status: StepStatus
  description: string
}

export type BridgeFlowState =
  | { phase: 'form'; reason: 'connect' | 'network' | 'amount' | 'recipient' }
  | { phase: 'approve'; status: StepStatus; error?: DisplayError }
  | { phase: 'bridge'; status: StepStatus; error?: DisplayError }
  | { phase: 'relay'; status: 'queued' | 'relaying' | 'done' }

export function deriveFlowState(inputs: FlowInputs): BridgeFlowState {
  // pure if/else over already-existing booleans — no dispatch, no stored transitions
  if (!inputs.isConnected) return { phase: 'form', reason: 'connect' }
  if (!inputs.isCorrectChain) return { phase: 'form', reason: 'network' }
  if (inputs.needsApproval || inputs.approvePhaseActive) {
    return { phase: 'approve', status: deriveStepStatus(inputs.approve), error: inputs.approveError }
  }
  if (inputs.bridgePhaseActive) {
    return { phase: 'bridge', status: deriveStepStatus(inputs.bridge), error: inputs.bridgeError }
  }
  return { phase: 'relay', status: inputs.relayStatus }
}
```

### Pattern 2: Seed-Then-Subscribe (the cold-start fix)

**What:** A bare `watchContractEvent`/`useWatchContractEvent` call only delivers events emitted **after** the watch opens — there is no built-in backfill. Every place this milestone introduces a live subscription needs a one-time bounded `getLogs` "seed" read *before or alongside* opening the watch, so history isn't silently missing.

**When to use:** Both places subscriptions are introduced this milestone:
1. **List level** (`use-bridge-messages.ts`): a fresh page load must not show an empty list until the next event fires. Keep the existing `getLogs` scan exactly as-is as the seed; add a live watch purely for the tail going forward, deduped by `messageId`.
2. **Single-tx level** (`use-relay-status.ts`, stepper step 3): the relayer runs independently and can finalize a message in the gap between the origin tx confirming and the browser's destination-chain watch actually opening (WS handshake, tab backgrounding, etc). A naked watch opened at that moment silently misses it and the stepper hangs on "relaying" forever even though the bridge is actually done. Fix: on mount, run one bounded `getLogs` for `BridgeFinalized` filtered by the exact `messageId` topic from the origin block number onward; if found, jump straight to `done`. Only then does the live watch matter for the *remaining* wait — and keep it open concurrently with the seed check rather than sequentially, to close the race window to zero.

**Trade-offs:** Costs one extra RPC round trip per mount. Given amounts/volumes here are testnet-scale and the check is a single narrow-topic query (not a wide block-range scan), this is cheap and non-negotiable — the alternative is a state machine that can get permanently stuck for reasons invisible to the user, which directly contradicts the milestone's "user is never left guessing" core value.

### Pattern 3: Simulate-Gate-Then-Write

**What:** `useSimulateContract` runs (reactively, gated by `query.enabled` on form validity) *before* any wallet prompt. Its `data.request` — not raw args — is what gets passed to `writeContract`/`writeContractAsync`. The action button stays disabled until `Boolean(simulateData?.request)` is true (or until the write is already in flight), so a doomed transaction never reaches the wallet.

**When to use:** Both the approve step and the bridge step. Each needs its own `useSimulateContract` call (different ABI/function/args), each feeding its own step's gating.

**Trade-offs:** Adds a background RPC call (`eth_call`) on every keystroke-settled input, debounced by TanStack Query's own caching — acceptable for a two-field form. This is also where simulation errors become displayed errors: when `useSimulateContract`'s `error` is non-null, run it through the **same** `mapTransactionError` function used for actual write/receipt failures (see Pattern 5) — one implementation, two call sites (pre-flight and post-flight), so the copy a user sees for "this will fail" and "this failed" is generated by identical logic and never drifts apart.

**Example:**
```typescript
const approveSimulation = useSimulateContract({
  abi: erc20Abi,
  address: tokenAddress,
  functionName: 'approve',
  args: bridgeAddress && amount ? [bridgeAddress, amount] : undefined,
  chainId: direction.originChainId,
  query: { enabled: Boolean(tokenAddress && bridgeAddress && amount) },
})

const approveError = approveSimulation.error
  ? mapTransactionError(approveSimulation.error)
  : undefined

// button disabled until approveSimulation.data?.request exists (or a later step is active)
async function approve() {
  if (!approveSimulation.data?.request) return
  const hash = await approveWrite.writeContractAsync(approveSimulation.data.request)
  setApproveHash(hash)
}
```

### Pattern 4: Destination-Chain Watch Independent of Connected Wallet

**What:** `useWatchContractEvent` (and the underlying `watchContractEvent` action) accepts an explicit `chainId`. Passing the destination chain's ID opens the subscription against that chain's configured transport regardless of which chain the connected wallet is currently on — the user can be sitting on Base Sepolia in their wallet while the UI watches Arbitrum Sepolia for `BridgeFinalized`, with no `switchChain` involved.

**When to use:** `use-relay-status.ts`, always — the whole point of step 3 is watching the *other* chain from wherever the user's wallet/tx just happened.

**Trade-offs:** None significant; this is exactly what the option is for. The only care point: `wagmi.ts`'s `transports` map must have a working transport configured for *both* chains regardless of which one is "connected," which is already true in this codebase (`getConfig()` configures both `baseSepolia.id` and `arbitrumSepolia.id`).

### Pattern 5: Small, Ordered Error-Mapping Layer

**What:** `ui/src/lib/bridge-errors.ts` exports one function, `mapTransactionError(cause: unknown): DisplayError`, that:
1. Walks the thrown error (viem's `BaseError.walk()`) to find a `ContractFunctionRevertedError`. When the ABI passed to `simulateContract`/`writeContract` already covers the reverting error, viem auto-populates `error.data.errorName`/`error.data.args` — no manual `decodeErrorResult` needed for that case.
2. Falls back to manual `decodeErrorResult` against a **merged** ABI (bridge ABI + ERC20 ABI + OZ error selectors) for the case viem can't auto-decode: a nested call reverting inside the bridge call (e.g. the token's `SafeERC20FailedOperation` bubbling up through `lock()`/`burn()`'s internal `transferFrom`) is exactly the kind of nested-ABI mismatch that defeats auto-decoding, and is also exactly the "debugs a failed transaction by inspecting calldata" scenario this milestone is meant to demonstrate. This is the concrete reason `lib/abis.ts` needs the *full* generated ABIs, not the hand-picked `parseAbi` subset currently in the file.
3. If a known `errorName` is found, maps it through a small ordered array of matchers to the target copy (`BridgeMessageAlreadyProcessed` → "already relayed (messageId 0x…)"; etc).
4. If no ABI match is found at all (e.g. plain `InsufficientFundsError` for gas, which is a viem client-side error, not a contract revert), match on error *type*/message instead: insufficient native balance → the ~0.0004 ETH faucet copy; user-rejected → "Transaction rejected in wallet" (already handled ad hoc in current `getTransactionError`); anything else → the existing shortMessage fallback.

**When to use:** Every catch block on a write (`approve()`, `bridge()`) and every simulation error branch — call the same function from both.

**Trade-offs:** Deliberately narrow (per the milestone's own scope decision). Document the matcher array with a comment explaining "add one more object here" so it stays legible as it grows — this is the literal implementation of "documented as extensible" from `PROJECT.md`.

### Pattern 6: Transport-Level + Hook-Level Fallback (redundant on purpose)

**What:** Configure `fallback([webSocket(wsUrl), http(httpUrl)])` per chain as the transport passed to watch-capable clients. Separately — do not rely on that alone — give every `useWatchContractEvent` call an `onError` handler that, on failure, flips `use-transport-mode.ts`'s reported mode to `'polling'` and drives an app-level `setInterval` + bounded `getLogs` fallback (the same shape already proven in `use-bridge-messages.ts`), independent of what the transport is doing underneath.

**When to use:** Both watch hooks (`use-relay-status.ts`, and the new live-watch layer in `use-bridge-messages.ts`).

**Trade-offs:** This is deliberately two overlapping safety nets rather than trusting the transport layer alone. Rationale, from research: viem's `fallback()` transport does retry-and-fall-through on failed *requests* (default 3 retries, ~150ms backoff), and a `rank: true` mode continuously re-scores sub-transports by a weighted stability/latency sample every 10s — but there is **no public runtime API to ask "which sub-transport served my last request."** There is also a documented history here worth flagging explicitly: a now-closed viem issue (#776) reported that a `fallback` wrapping a WebSocket transport did *not* use `eth_subscribe` and silently degraded to polling; it was fixed and closed well before the version pinned in this project (viem `2.55.5`, wagmi `2.19.5`), but there is no first-party doc page confirming the fixed behavior in this exact version — **treat this as needing a quick empirical check during implementation** (open the watch, kill the WS endpoint, confirm the app visibly falls back rather than silently going stale). Given the project's own explicit constraint that "WebSocket RPC endpoints for testnets are unreliable... or the demo breaks in exactly the moment it matters," building the hook-level fallback regardless of what the transport does is cheap insurance, not speculative engineering.

**"How does the UI know which mode it's in?"** It doesn't ask viem — it *observes its own watch's behavior*. `use-transport-mode.ts` starts in `'connecting'`, moves to `'live'` on the watch's first successfully delivered log (or, since a healthy WS session can legitimately go quiet for a while with no events, on a short successful-connection heuristic if the underlying transport exposes one — otherwise default-optimistic to `'live'` and only demote to `'polling'` when `onError` actually fires), and moves to `'polling'` on `onError`, at which point the hook-level `setInterval` fallback takes over. This is intentionally simple (an enum plus two `useState` setters), not a new subsystem.

## Data Flow

### Request Flow (one user action, end to end)

```
User clicks action button
    ↓
flowState.action.onClick()  →  one of: openConnectModal / switchChainAsync /
                                approve() / bridge()  (in use-bridge-flow.ts)
    ↓
approve()/bridge() call writeContractAsync(simulateData.request)
    ↓
wagmi's useWriteContract picks up isPending → re-render
    ↓
hash returned → useWaitForTransactionReceipt(hash) starts → isFetching → re-render
    ↓
receipt isSuccess → for the bridge tx, parseEventLogs extracts messageId (existing pattern,
                     kept) → passed into use-relay-status.ts
    ↓
use-relay-status.ts: seed getLogs check, then useWatchContractEvent(destinationChainId)
    ↓
BridgeFinalized observed (or seed check already found it) → relayStatus 'done'
    ↓
deriveFlowState() recomputes on every one of the above re-renders (pure, memoized)
    ↓
bridge-card.tsx renders <Stepper steps={flowState.steps}> and
                          <ActionButton {...flowState.action}> from the SAME object
```

Every arrow above except the first is a re-render triggered by a wagmi/TanStack Query state change already managed by the library — the flow layer never manually pushes state forward; it only re-derives from what already changed. This is what "one source of truth, no prop drilling, no duplicated derivation" means concretely: the source of truth is `use-bridge-flow.ts`'s single return value, and both consumers receive an already-shaped slice of it (`steps`, `action`), never the raw wagmi objects.

### Key Data Flows

1. **Approve → Submit → Relay (happy path):** strictly linear, all three steps always execute (per the "approve every time" constraint) — no skip logic needed anywhere in the derivation.
2. **Simulation error → displayed error:** `useSimulateContract.error` → `mapTransactionError()` → `DisplayError` attached to the current phase's `error` field in `BridgeFlowState` → rendered by the stepper/button exactly like a post-flight write/receipt error, same code path.
3. **Origin event → destination event (cross-chain gap):** `messageId` extracted from the origin receipt's logs is the join key threaded into `use-relay-status.ts`, which watches the *destination* chain by explicit `chainId`, independent of wallet connection.
4. **List view (separate, coarser flow):** `use-bridge-messages.ts` seed `getLogs` (unchanged) + new live-watch tail, feeding `message-explorer.tsx` exactly as today — this consumer contract does not change, only the hook's internals do.

## Scaling Considerations

This is a two-chain testnet demo, not a system sized for user growth — "scale" here means "what breaks first as message/attempt volume grows," not literal user counts.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single active tx (this milestone's actual load) | Pure derivation + one targeted per-messageId watch is trivially sufficient; no caching/dedup layer needed. |
| Message-explorer list grows past a few hundred entries | The existing 50,000-block/6s scan already chunks in 2,000-block windows — fine as a seed; the added live-watch tail keeps steady-state RPC load flat regardless of list size since it's push-driven, not re-scanned. |
| Hypothetical: many concurrent active bridges in one browser tab | Each would need its own `use-relay-status.ts` instance (keyed by `messageId`); the pure-selector design scales linearly since there's no shared mutable state to contend over — not a concern at this milestone's scope, noted only so a future multi-tx dashboard doesn't require re-architecting this layer. |

### Scaling Priorities

1. **First real bottleneck:** RPC rate limits on public testnet endpoints under WS reconnect storms (not data volume) — mitigated by Pattern 6's redundant fallback, not by any data-structure change.
2. **Second, hypothetical:** if this pattern is later reused for a multi-tx history view, the per-tx `use-relay-status.ts` watches would need to be deduped/shared rather than one-per-row; out of scope now, worth a one-line note for whoever builds that.

## Anti-Patterns

### Anti-Pattern 1: Shadow State That Mirrors a Query Hook

**What people do:** Introduce a `useReducer` (or worse, more `useState` booleans) that gets manually set to `'pending'`/`'confirmed'` in response to `useEffect`s watching `isPending`/`isSuccess`. This is exactly what the current `getActionState()` + `approveHash`/`bridgeHash` `useState` pair does today.
**Why it's wrong:** Now there are two sources of truth for the same fact, updated at different times (one synchronously by the query, one asynchronously by an effect a render later), which is precisely the class of bug that produces a stepper stuck one state behind the button, or vice versa.
**Do this instead:** Derive, don't duplicate — compute the view model fresh from the query hooks' own state every render (Pattern 1).

### Anti-Pattern 2: Whole-List Polling for a Single Known Transaction

**What people do:** Reuse `use-bridge-messages.ts`'s window-scanning `scanChain()` to find out whether *one specific* `messageId` has been finalized.
**Why it's wrong:** Scans a 50,000-block window on a 6-second timer for information that a single narrow-topic `getLogs`/`watchContractEvent` call answers directly and instantly — slow, wasteful, and it couples step 3's correctness to the list hook's polling cadence.
**Do this instead:** `use-relay-status.ts`, scoped to one `messageId`, on the destination chain by explicit `chainId` (Pattern 2 + 4).

### Anti-Pattern 3: Trusting `fallback([webSocket(), http()])` to Silently Handle Everything

**What people do:** Configure the fallback transport and assume `watchContractEvent` will transparently use `eth_subscribe` when healthy and drop to polling when not, with zero further app-level handling.
**Why it's wrong:** There is no runtime API to confirm which sub-transport is active, and there is upstream history (now-closed viem #776) of exactly this combination silently degrading without visibly failing — which is the worst failure mode for a live demo (looks fine, isn't).
**Do this instead:** Build the redundant hook-level `onError` → polling fallback regardless (Pattern 6); verify the transport's actual behavior empirically against this project's specific viem/wagmi pin during implementation rather than trusting the docs alone.

### Anti-Pattern 4: Decoding Reverts Against Only the "Obvious" ABI

**What people do:** Call `decodeErrorResult`/rely on auto-decode using only the bridge contract's ABI.
**Why it's wrong:** The bridge's `lock()`/`burn()` internally call the ERC20 token via `SafeERC20`; a token-side revert (e.g. `SafeERC20FailedOperation`) carries a selector that isn't in the bridge ABI and will decode as an opaque, unhelpful selector — undermining the exact "debug via calldata" story this milestone exists to tell.
**Do this instead:** Decode against a merged ABI (bridge + ERC20 + OZ errors) — see Pattern 5 and the `lib/abis.ts` extension.

### Anti-Pattern 5: Presentational Components That Accept Raw wagmi Hook Results

**What people do:** Pass `useSimulateContract()`'s or `useWriteContract()`'s return value straight into `<Stepper>`/`<ActionButton>` props.
**Why it's wrong:** Couples presentation to wagmi's types, makes the components untestable without a wagmi provider tree, and re-introduces prop-drilling of raw booleans that the two consumers would each have to re-derive their own meaning from — recreating the "two derivations of the same fact" problem the whole redesign exists to remove.
**Do this instead:** `StepperStep[]` and `ActionButtonProps` are the only inputs those components accept (Component Responsibilities table above).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Base Sepolia RPC (HTTP + WS) | `fallback([webSocket(wsUrl), http(httpUrl)])` per-chain transport in `wagmi.ts` | `ui/src/lib/config.ts`'s `rpcUrls` currently only holds `default`/`fallback` HTTP strings — needs WS endpoint(s) added before any watch hook can use them. Public testnet WS endpoints are the documented unreliable piece; this is why Pattern 6 exists. |
| Arbitrum Sepolia RPC (HTTP + WS) | Same shape as above, second chain | Same caveat. |
| Bridge/ERC20 ABIs | Full generated ABIs (`collateral-abi.json`, `synthetic-abi.json` at repo root) merged into `ui/src/lib/abis.ts` | Currently `abis.ts` hand-picks a small `parseAbi` subset (2 events, 2 functions, no errors) — insufficient for Pattern 5's decode coverage. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `bridge-card.tsx` ↔ `use-bridge-flow.ts` | Hook return value only (`flowState`, `steps`, `action`, form setters) | `bridge-card.tsx` should have zero direct wagmi imports left for the flow-related hooks after refactor; form-field wagmi reads (balance, allowance) can stay local since they're not part of the flow state machine itself. |
| `use-bridge-flow.ts` ↔ `bridge-flow-state.ts` / `bridge-errors.ts` | Plain function calls, no React context | Keeps the derivation and error-mapping unit-testable in isolation with `bun test`. |
| `use-relay-status.ts` ↔ `use-transport-mode.ts` | Hook composition (`use-relay-status` calls `use-transport-mode` internally) | Also reusable, unmodified, by the list-level live-watch addition in `use-bridge-messages.ts`. |
| `page.tsx` ↔ `use-bridge-messages.ts` | Unchanged return shape (`messages`, `isLoading`, `error`, `refresh`) | The refactor is internal to the hook; `message-explorer.tsx` needs no changes. |

## Suggested Build Order

Dependency-ordered; pure/testable pieces first, integration wiring last:

0. **`ui/src/lib/config.ts`** — add WebSocket RPC URLs alongside the existing HTTP default/fallback pair. Nothing below can be built against real transports without this.
1. **`ui/src/lib/abis.ts`** — extend to the full generated ABIs (all custom errors, both contracts). Everything that decodes errors depends on having the complete error set.
2. **`ui/src/lib/bridge-errors.ts`** — pure error-mapping layer; depends on (1) for ABI coverage, nothing else. Unit-testable in isolation.
3. **`ui/src/lib/bridge-flow-state.ts`** — pure derivation + `BridgeFlowState`/`StepperStep`/`ActionButtonProps` types; depends on nothing but its own type shapes. Buildable and testable against fixture inputs before any hook exists.
4. **`ui/src/hooks/use-transport-mode.ts`** — small, standalone; no bridge-specific logic, testable independently.
5. **`ui/src/hooks/use-relay-status.ts`** — depends on (4) for mode detection and the existing `bridgeAbi`/`config`; implements the seed-then-subscribe pattern for one message.
6. **`ui/src/hooks/use-bridge-flow.ts`** — the orchestrating hook; depends on (2), (3), (5) plus the existing wagmi hooks and form/allowance logic lifted out of `bridge-card.tsx`.
7. **`ui/src/components/stepper.tsx`** and **`ui/src/components/action-button.tsx`** — pure presentational; buildable in parallel with 1–6 against fixture props, wired in step 8.
8. **`ui/src/components/bridge-card.tsx` refactor** — wire `useBridgeFlow()`'s output into `<Stepper>`/`<ActionButton>`; delete `getActionState()` and the local `approveHash`/`bridgeHash`-driven branching now superseded by (6).
9. **`ui/src/hooks/use-bridge-messages.ts` upgrade** — add the live-watch tail on top of the existing seed scan (list-level "replace polling" requirement). Independent of 6–8; shares only (4) conceptually and can proceed in parallel once (0)/(1) land.

Steps 1–4 have no React/wagmi coupling and are the natural place to add `forge`-adjacent unit tests before wiring anything to the network; steps 5–6 are where the actual cross-chain/transport risk lives and deserve the most manual verification (empirically confirm the fallback+WS behavior per Pattern 6's caveat) before step 8 makes it user-visible.

## Sources

- [viem — fallback transport](https://viem.sh/docs/clients/transports/fallback) — ranking algorithm, retry/backoff defaults, no runtime introspection API. Confidence: MEDIUM (official docs, fetched directly).
- [viem issue #776 — "Fallback public client with WS transport doesn't use eth_subscribe"](https://github.com/wevm/viem/issues/776) — closed/fixed; establishes the historical gotcha this architecture explicitly designs redundancy around. Confidence: MEDIUM (primary source, but fix predates current pin — recommend empirical verification).
- [viem — watchContractEvent](https://viem.sh/docs/contract/watchContractEvent) — WS clients default to `eth_subscribe`, HTTP clients default to poll/filter; no built-in backfill of pre-subscription events (the cold-start problem). Confidence: MEDIUM (official docs, fetched directly).
- [wagmi — useSimulateContract](https://wagmi.sh/react/api/hooks/useSimulateContract) — recommended `data.request` → `writeContract` gating pattern. Confidence: MEDIUM (official docs, fetched directly).
- [wagmi — useWatchContractEvent](https://wagmi.sh/react/api/hooks/useWatchContractEvent) — explicit `chainId` option decouples the watched chain from the connected wallet's chain. Confidence: MEDIUM (official docs, cross-checked via web search).
- [viem — decodeErrorResult](https://viem.sh/docs/contract/decodeErrorResult.html) — manual decode API and its role as fallback when auto-decode (via ABI passed to `simulateContract`) doesn't cover a nested-call error. Confidence: MEDIUM (official docs, fetched directly).
- General web research on `useReducer`/discriminated-union vs XState for small linear React flows — used to justify the "no state library" recommendation in Pattern 1. Confidence: MEDIUM (multiple independent sources converging on the same threshold).

---
*Architecture research for: bridge dApp transaction-flow state management*
*Researched: 2026-07-24*
