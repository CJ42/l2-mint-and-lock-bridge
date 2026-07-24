# Project Research Summary

**Project:** L2 Mint & Lock Bridge — Transaction Flow UX
**Domain:** Live, simulation-gated, error-decoding transaction flow UX for a cross-chain (Base Sepolia ↔ Arbitrum Sepolia) bridge dApp — brownfield, UI-only milestone
**Researched:** 2026-07-24
**Confidence:** MEDIUM (hook/API surface HIGH; RPC WSS endpoint availability explicitly LOW)

## Executive Summary

This milestone replaces an ad-hoc ~10-branch button state function (`getActionState`) and a 6-second `getLogs` poll with a unified transaction-flow layer built entirely from packages already installed (`wagmi@2.19.5`, `viem@2.55.5`, `@wagmi/cli@2.10.0`). All four researchers converge on the same shape: a **pure derivation function**, not a reducer or state-chart library, that folds the outputs of existing wagmi query hooks (`useSimulateContract`, `useWriteContract`, `useWaitForTransactionReceipt`, `useWatchContractEvent`) into one `BridgeFlowState` object consumed identically by the stepper and the action button. Every async transition already has a library-managed source of truth; the fix is deriving from it once, not tracking it a second time.

The single largest risk is **not** the state-machine design — it's the live-event transport. Neither Base Sepolia's nor Arbitrum Sepolia's official public RPC exposes `wss://` at all, and even the candidate PublicNode/dRPC WS URLs are LOW confidence, unverified at runtime, and inherently shared/rate-limited testnet infrastructure. `viem`'s `fallback()` transport does **not** protect a live subscription the way it protects one-off HTTP reads — the WebSocket transport must sit at index 0 of the fallback array (or subscriptions silently degrade to polling with no error), `rank: true` must stay off, and the request-level retry logic never triggers a subscription failover. A dead socket produces no `onError` event at all — it just goes quiet — so an app-level staleness watchdog (time-since-last-message) is mandatory, and the HTTP-polling fallback must be hand-wired via `onError`, not assumed. Before any React code is written against these endpoints, a manual smoke test (`wscat`/`websocat` against the real URL, confirming an `eth_subscribe` notification actually arrives) is required.

The second major thread is **error decoding as the differentiator**: no production bridge surveyed (Across, Hop, Stargate, Superbridge, Socket/Bungee, Arbitrum native) exposes decoded custom-contract errors to end users — this is the project's one genuinely novel piece of UX. It depends entirely on having the *complete* merged ABI (bridge + ERC20 + OZ errors) available, which the current hand-written `parseAbi` subset in `ui/src/lib/abis.ts` does not provide (zero error fragments). The already-installed-but-unused `@wagmi/cli` foundry plugin should generate this ABI directly from `forge build` output, replacing both the incomplete hand-written ABI and the untracked, unsynced `collateral-abi.json`/`synthetic-abi.json` root files. The decode layer must also handle the long tail beyond the four `Errors.sol` custom errors: ERC20-originated reverts (`SafeERC20FailedOperation`), wallet rejection (no calldata), out-of-gas (empty revert data), and `Panic(uint256)` codes — each needs distinct copy, and each is exactly the kind of failure likely to surface live in front of a reviewer.

## Key Findings

### Recommended Stack

No new packages are needed — everything lives inside the already-installed `wagmi`, `viem`, and `@wagmi/cli`. The one currently-dormant piece to activate is `@wagmi/cli`'s foundry plugin, generating a single typed ABI file (`src/lib/generated.ts`) from `contracts/out/` via `bun run generate` (`wagmi generate`), eliminating both the incomplete `parseAbi` block and the manually-copied, untracked ABI JSON files at the repo root.

**Core technologies:**
- `wagmi@2.19.5` (`^2`, hard-pinned by RainbowKit 2.2.11's `wagmi: ^2.9.0` peer dep — do not bump to v3) — React hook layer; `useSimulateContract`/`useWriteContract`/`useWaitForTransactionReceipt`/`useWatchContractEvent` cover the entire flow
- `viem@2.55.5` — low-level EVM client; `decodeErrorResult`, `BaseError.walk()`, `ContractFunctionRevertedError`, `InsufficientFundsError`, `webSocket()`, `fallback()` are all used directly; project-wide "viem only, no ethers" rule
- `@wagmi/cli@2.10.0` (foundry plugin) — generates the merged, always-in-sync ABI (all custom errors included) that the error-decode layer depends on

### Expected Features

**Must have (table stakes, already in `PROJECT.md` Active scope):**
- Fixed 3-step stepper (Bridge Approved → Bridge tx submitted → Bridge tx relayed), approve running every time so no step is ever skipped
- Per-step visual state (blue spinner / green checkmark) **plus a third, error/red state** — required by the decode-revert requirement but not explicit in the original `TX_FLOW.md` two-state spec; flagged as a necessary addition, not a scope decision the roadmapper should silently skip
- Action button driven by the same state machine as the stepper (no second derivation)
- Pre-flight simulation (`useSimulateContract`) gating the wallet prompt
- Decoded custom-error messages with evidence values inline — the headline differentiator
- Small, explicitly-extensible gas/allowance error-mapping layer
- Live WebSocket event subscription replacing the 6s poll, with mandatory HTTP-polling fallback
- Explorer links (already present, extend to per-step)

**Should have (real gaps vs. production bridges, currently NOT in `PROJECT.md` Active scope — flag for requirements review, do not silently decide):**
- Page-refresh recovery: persist last active tx hash/messageId to `localStorage`/`sessionStorage` and rehydrate the stepper on mount. Socket/Bungee ships this as a basic pattern; low-to-medium cost given the event-subscription work is already planned. **Unresolved — PROJECT.md silent on this.**
- A visually distinct per-step "failed" state (not just a generic error banner) — TX_FLOW.md's spec covers only spinner-vs-checkmark. **Unresolved — PROJECT.md silent on this.**
- Per-step explorer links (not just a final "Done" link)

**Defer (explicitly out of scope per PROJECT.md and researched anti-patterns):**
- Fake/animated progress bars or invented ETA countdowns — directly conflicts with the project's own "no state may be faked" constraint
- Expandable raw relayer internals — ruled out by the coarse-states-only constraint
- Any relayer-side status/WebSocket backend — ruled out by the no-backend constraint
- Auto-retry/auto-resubmit on failure — hides state changes from the user
- Full standalone activity/history drawer — duplicates the existing message explorer

### Architecture Approach

The flow layer is a **pure selector, not a reducer, not XState** — `deriveFlowState(inputs)` in `ui/src/lib/bridge-flow-state.ts` reads the existing wagmi hooks' own `isPending`/`isSuccess`/`error` state each render and folds it into one discriminated-union `BridgeFlowState`, memoized once in an orchestrating hook (`use-bridge-flow.ts`) that both the stepper and action button read from. This directly targets the current bug class: `getActionState()` and local `approveHash`/`bridgeHash` state are a second, driftable copy of facts wagmi already owns.

**Major components:**
1. `lib/bridge-flow-state.ts` + `lib/bridge-errors.ts` — pure, hook-free, unit-testable modules (derivation + error mapping); build and test these first, before any hook or component exists
2. `hooks/use-relay-status.ts` — seed-then-subscribe watch scoped to one `messageId` on the destination chain (explicit `chainId`, independent of wallet-connected chain), not a reuse of the whole-list scanner
3. `hooks/use-bridge-flow.ts` — the only place touching both wagmi and the pure selector; single source of truth `bridge-card.tsx` reads from
4. `components/stepper.tsx` / `components/action-button.tsx` — presentational only, `StepperStep[]`/`ActionButtonProps` in, zero wagmi imports
5. `lib/abis.ts` (generated) — full merged ABI including all custom errors, replacing the hand-picked `parseAbi` subset

Suggested build order (dependency-ordered, pure pieces first): config WS URLs → full ABI generation → error-mapping layer → pure flow-state derivation → transport-mode tracking → relay-status hook → orchestrating hook → presentational components → bridge-card refactor → message-list live-watch upgrade.

### Critical Pitfalls

1. **Silent WebSocket death** — a dropped `eth_subscribe` socket fires no `onError`; the stepper freezes on "processing" looking perfectly healthy. Requires an app-level staleness watchdog (time-since-last-message threshold), not reliance on `onError` as the only liveness signal.
2. **Public testnet WSS endpoints are unreliable or don't exist where assumed** — Base's and Arbitrum's own official public RPCs are HTTP-only; candidate WS URLs (PublicNode/dRPC) are unverified free-tier infrastructure. Manually smoke-test the exact URL outside the app before wiring it into React.
3. **Missed/duplicate events on reconnect** — `eth_subscribe` never replays what happened while disconnected; every (re)subscribe needs a bounded `getLogs` backfill first, and state updates must be keyed by `messageId` (map/set), never append-only.
4. **Chain reorg re-emits a log with `removed: true`** — an `onLogs` handler with no `removed` branch can show a false "confirmed" step permanently; tie "confirmed" to confirmation depth via the receipt, not first-log-sight.
5. **Custom error decoding's long tail** — the four `Errors.sol` errors are the easy 80%; ERC20-originated reverts (need the merged ABI), wallet rejection (no calldata), out-of-gas (empty revert data), and `Panic(uint256)` codes each need a distinct, deliberately-ordered branch, or they silently fall through to an unhelpful generic message — undermining the entire differentiator.
6. **`useSimulateContract` staleness** — a passed simulation is a snapshot, not a guarantee (on-chain state, including this project's `processed[messageId]`, can change between simulate and submit); write-side error decoding must exist independently, never gated on "simulation should have caught it."

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: ABI Generation & Error-Mapping Foundation
**Rationale:** Everything that decodes errors depends on having the complete, always-in-sync ABI. This is pure, hook-free, unit-testable code with zero React/wagmi coupling — the natural first phase and the one place `bun test` can run before any network wiring exists.
**Delivers:** `wagmi.config.ts` + `@wagmi/cli` foundry plugin wired to generate the merged ABI from `contracts/out/`; `lib/bridge-errors.ts` with the ordered matcher (custom errors → ERC20 reverts → wallet rejection → empty-data/out-of-gas → Panic codes → generic fallback).
**Addresses:** Decoded custom-error messages (differentiator), gas/allowance error-mapping layer.
**Avoids:** Pitfall 10 (custom-error decode long tail) and its "looks done but isn't" trap of only testing the four happy-path errors.

### Phase 2: Pure Flow-State Derivation
**Rationale:** The state machine must exist before the stepper or button are built against it, or two competing sources of truth get built in parallel (the exact bug class being fixed). Also pure and hook-free — buildable/testable against fixture inputs.
**Delivers:** `lib/bridge-flow-state.ts` — `BridgeFlowState` discriminated union, `deriveFlowState()`, `StepperStep`/`ActionButtonProps` types.
**Uses:** Pattern 1 from ARCHITECTURE.md (derived state via pure selector, explicitly not a reducer or XState).
**Implements:** The single-source-of-truth architecture component underlying both later UI consumers.

### Phase 3: RPC Transport & Live Event Subscription
**Rationale:** The highest-risk, least-certain phase — WSS endpoint availability is LOW confidence and must be resolved empirically before it's load-bearing for anything else. Isolate it so a transport failure doesn't block the (more certain) state-machine and UI work.
**Delivers:** WS RPC URLs added to `config.ts` (manually smoke-tested first via `wscat`/`websocat`); `fallback([webSocket(...), http(...), http(...)])` per chain with WS pinned at index 0 and `rank` left off; `use-transport-mode.ts` tracking connected/stale/polling; hand-wired `onError` → `poll: true` degrade; app-level staleness watchdog.
**Delivers (2):** `use-relay-status.ts` — seed-then-subscribe for a single `messageId` on the explicit destination `chainId`, independent of wallet-connected chain.
**Avoids:** Pitfalls 1, 2, 3, 4, 5, 6 (silent WS death, unreliable public WSS, missed/duplicate events, reorg re-emission, StrictMode double-subscribe, wrong-chain watching).

### Phase 4: Orchestration Hook & Wallet-Side Integration
**Rationale:** Depends on Phases 1–3 all existing. This is where `useSimulateContract`/`useWriteContract`/`useWaitForTransactionReceipt` are wired together with the pure derivation and the relay-status watch into one hook.
**Delivers:** `use-bridge-flow.ts` — owns approve+bridge write/simulate/receipt chains, calls the error mapper and relay-status hook, returns one memoized `BridgeFlowState`.
**Addresses:** Pre-flight simulation gate, approve-every-time (all 3 steps always execute).
**Avoids:** Pitfalls 8, 9 (simulation staleness, un-debounced re-simulation burning RPC budget).

### Phase 5: Presentational UI & Card Refactor
**Rationale:** Last, because it's the integration point — pure components can be built in parallel with Phases 1–4 against fixture props, but wiring them into `bridge-card.tsx` and deleting `getActionState()` should happen only once the state machine underneath is proven.
**Delivers:** `stepper.tsx`/`stepper.module.css`, `action-button.tsx`/`action-button.module.css` (hand-built CSS Modules, no shadcn), 4-state stepper visuals (idle/pending/success/error — the error state is an addition beyond the original two-state spec), per-step status copy per `TX_FLOW.md`, `bridge-card.tsx` refactored to zero direct flow-related wagmi imports.
**Addresses:** Multi-step progress indicator, per-step status copy, action button state mirroring.

### Phase Ordering Rationale

- Pure/testable code (ABI generation, error mapping, flow-state derivation) is sequenced before anything touching React or live network transports, per ARCHITECTURE.md's explicit build order and PITFALLS.md's emphasis on unit-testing the decode long tail in isolation.
- The transport/WebSocket phase is isolated on its own because it is the only LOW-confidence area in the entire research set — isolating it limits blast radius if the WSS endpoints prove unusable and the fallback path needs more work than expected.
- UI/presentational work is last because two researchers (ARCHITECTURE, PITFALLS) independently warn against wiring components to raw wagmi hook results or building the stepper before the state machine exists — both create a second source of truth.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (RPC Transport & Live Subscription):** LOW confidence on exact WSS URLs/providers for both chains; requires an empirical smoke test (`wscat`/`websocat`) before implementation, not just documentation review. Also the one place with an unresolved historical viem bug (#776, closed but not re-verified against the exact pinned version) worth a runtime check.

Phases with standard patterns (skip research-phase):
- **Phase 1 (ABI Generation & Error-Mapping):** `@wagmi/cli` foundry plugin usage is documented, official-docs-confirmed, and cross-checked against the actual installed ABIs.
- **Phase 2 (Pure Flow-State Derivation):** Standard React pattern (pure function + `useMemo`), converged on by all four researchers as clearly preferable to a reducer or XState.
- **Phase 4 (Orchestration Hook):** Hook signatures (`useSimulateContract`, `useWriteContract`, `useWaitForTransactionReceipt`) confirmed directly against official wagmi docs and source.
- **Phase 5 (Presentational UI):** No new patterns — CSS Modules, hand-built components matching the existing codebase convention.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Hook/API surface confirmed against both official docs and installed viem source; only the RPC endpoint availability sub-finding is LOW |
| Features | MEDIUM | Patterns cross-checked across 7-8 production bridges (Across, Hop, Stargate, Superbridge, Socket/Bungee, Orbiter, Arbitrum native); exact UI copy strings for competitor products are LOW-MEDIUM (not pulled from live app source), but pattern-level findings are solid |
| Architecture | MEDIUM | Official viem/wagmi docs read directly; two specific runtime behaviors (fallback-transport subscription mode, transport introspection) have no authoritative doc answer and are explicitly flagged for empirical verification |
| Pitfalls | MEDIUM | WebSocket transport mechanics and wagmi/viem API behavior are HIGH confidence (official docs, maintainer discussions); public testnet WSS endpoint specifics (rate limits, uptime) are LOW confidence — not independently load-tested |

**Overall confidence:** MEDIUM. The state-machine/architecture/error-decoding design is well-converged and HIGH-MEDIUM confidence throughout. The one genuinely uncertain area — whether a usable, sufficiently-reliable `wss://` endpoint exists for Base Sepolia and Arbitrum Sepolia — is explicitly LOW confidence across all four research files and must be resolved with a manual smoke test early, not assumed away in planning.

### Gaps to Address

- **WSS endpoint availability (LOW confidence, all 4 researchers flag this):** No official public RPC for either chain confirmed to serve `wss://`. Candidate PublicNode/dRPC URLs are unverified. Resolve via manual `wscat`/`websocat` smoke test before any React code is written against them; if unusable, a free-tier keyed provider (Alchemy/Ankr/QuickNode) is the fallback, and the design is fully HTTP-polling-safe regardless (the WS path is a latency optimization only, never the sole path — this is a project constraint, not just a recommendation).
- **Page-refresh recovery (scope gap, not in current `PROJECT.md` Active):** FEATURES.md and PITFALLS.md both independently identify this as effectively table-stakes (Socket/Bungee ships it) and low-to-medium cost given the event-subscription work is already planned, but PROJECT.md does not currently commit to it. Do not silently add it to the roadmap — flag explicitly for requirements/roadmap-owner decision.
- **Per-step "failed" visual state (scope gap, not in current `PROJECT.md`/`TX_FLOW.md`):** TX_FLOW.md specifies only spinner-vs-checkmark (2 states); the decode-revert requirement necessitates a third (error/red) state that isn't in the original spec. Multiple researchers flag this as necessary, not optional, but it is technically new scope beyond the written spec — flag explicitly rather than assume.
- **viem `fallback()` + `webSocket()` subscription-detection behavior at the exact pinned version (`viem@2.55.5`):** Verified via source inspection of a sibling project's `viem@2.22.17`, not the exact installed version; treat as reliable but confirm empirically (DevTools Network→WS tab showing `eth_subscribe`, not repeated polling) once wired up.

## Sources

### Primary (HIGH confidence)
- https://viem.sh/docs/contract/watchContractEvent — corroborated by direct source inspection
- https://viem.sh/docs/clients/transports/fallback — corroborated by direct source inspection
- https://viem.sh/docs/contract/decodeErrorResult
- https://viem.sh/docs/clients/transports/websocket
- `viem@2.22.17` source (`actions/public/watchContractEvent.ts`, `clients/transports/fallback.ts`, `errors/contract.ts`, `errors/node.ts`) — direct local inspection
- Local codebase inspection: `collateral-abi.json`, `synthetic-abi.json`, `contracts/src/Errors.sol`, `ui/src/lib/abis.ts`, `ui/src/wagmi.ts`, `ui/src/lib/config.ts`, `ui/src/hooks/use-bridge-messages.ts`, `ui/src/components/bridge-card.tsx`, `ui/package.json`

### Secondary (MEDIUM confidence)
- https://wagmi.sh/react/api/hooks/useSimulateContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent
- https://wagmi.sh/cli/api/plugins/foundry
- https://github.com/wevm/viem/issues/776 (fallback/webSocket subscription-detection history — fixed before this project's pin, not re-verified against the exact version)
- https://github.com/wevm/viem/discussions/534 (silent WS death, no heartbeat, maintainer-acknowledged)
- https://github.com/wevm/wagmi/issues/3883
- https://docs.across.to/reference/tracking-events, https://docs.superbridge.app/optimism/withdrawals, https://docs.bungee.exchange (production bridge step/status models)
- https://docs.arbitrum.io/arbitrum-bridge/troubleshooting (confirms official docs are light on in-UI error copy)

### Tertiary (LOW confidence)
- WebSearch for Base Sepolia / Arbitrum Sepolia public WSS endpoints — unverified at runtime, flagged for mandatory manual smoke test
- dRPC/PublicNode provider docs — capability confirmed, free-tier testnet SLA not verified
- General UX blog sources (Cloud Four "Truth, Lies and Progress Bars", Userpilot) — used only to corroborate the fake-progress/ETA anti-pattern, cross-checked against the project's own explicit "no faked state" constraint

---
*Research completed: 2026-07-24*
*Ready for roadmap: yes*
