# Roadmap: L2 Mint & Lock Bridge — Transaction Flow UX

## Overview

This milestone replaces an ad-hoc, ten-branch button-state function and a 6-second `getLogs`
poll with one genuinely correct transaction-flow layer. The build order is dependency-forced:
pure, hook-free modules (the generated ABI, the error decoder, the flow-state derivation
function) come first because they are unit-testable in isolation and because the stepper/button
must never be built against anything but the real derived state. The live-transport work is
isolated in its own phase because it is the one low-confidence area in the research — a WSS
smoke-test failure there must not block the rest of the flow. Everything converges in the final
phase, where the orchestration hook wires simulate/write/receipt/relay-watch together and the
stepper, action button, and error banner go live in `bridge-card.tsx`.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Pure Foundation — ABI, Error Mapping & Flow-State Derivation** - Generate the merged bridge ABI, decode the full error surface, and derive the three-step flow state as pure, unit-tested functions with zero React or network coupling
- [ ] **Phase 2: RPC Transport & Live Event Subscription** - Verify and wire live WebSocket event subscriptions (with HTTP-polling fallback, staleness watchdog, and reorg safety) for relay status and the message explorer
- [ ] **Phase 3: Flow Orchestration & UI Integration** - Wire simulate/write/receipt/relay-watch into one orchestration hook and ship the hand-built stepper, action button, and error banner in `bridge-card.tsx`

## Phase Details

### Phase 1: Pure Foundation — ABI, Error Mapping & Flow-State Derivation

**Goal**: The bridge's complete error surface can be decoded into readable, evidence-bearing
messages, and the three-step transaction state can be derived as one pure, fully tested
function — all before any hook, component, or network wiring exists.
**Depends on**: Nothing (first phase)
**Requirements**: ABI-01, ABI-02, ABI-03, ERR-01, ERR-02, ERR-03, ERR-04, ERR-05, ERR-06, ERR-07, ERR-08, ERR-09, FLOW-01, FLOW-05
**Success Criteria** (what must be TRUE):

  1. Running the generation script produces a single ABI file containing every `Errors.sol` custom error plus the ERC20/OpenZeppelin error fragments, and no hand-written `parseAbi` subset or root ABI JSON dumps remain anywhere in the repo
  2. `bun test` against the error-mapping module resolves each of: a known bridge custom error (with its evidence values, e.g. `messageId`), an ERC20-originated revert (`SafeERC20FailedOperation`), a wallet rejection, an empty-data/out-of-gas failure, and a `Panic(uint256)` code — each to a distinct message — with any unrecognised revert falling through to a generic message that still surfaces the raw revert data
  3. `bun test` against `deriveFlowState()` proves it is the single source of truth for both stepper and button state from fixture inputs alone, and that a failure fixture never leaves the derived state stuck in "pending"
  4. The error-mapping module is a single file carrying an in-code comment documenting it as intentionally narrow and extensible

**Plans**: 3 plans

Plans:
**Wave 1**

- [ ] 01-01-PLAN.md — Tracer: `@wagmi/cli` foundry codegen + one real bridge revert decoded end-to-end into a human sentence, then retire the hand-written ABI sources (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Full ordered decode chain: Tier-1/Tier-2 custom errors, ERC20 reverts, wallet rejection, empty-data out-of-gas, Panic table, computed gas shortfall, bounded generic fallback (wave 2)
- [ ] 01-03-PLAN.md — Pure `deriveFlowState()`: discriminated-union flow state + 64-combination FLOW-05 invariant sweep (wave 2)

### Phase 2: RPC Transport & Live Event Subscription

**Goal**: Relay status and the message explorer update live from chain events over a verified,
resilient WebSocket transport that degrades safely to HTTP polling — isolated from the rest of
the flow so a transport failure never blocks the demo.
**Depends on**: Phase 1 (event watching reads event fragments from the generated ABI)
**Requirements**: LIVE-01, LIVE-02, LIVE-03, LIVE-04, LIVE-05, LIVE-06, LIVE-07, LIVE-08, LIVE-09
**Success Criteria** (what must be TRUE):

  1. A manual `wscat`/`websocket` smoke test against the real Base Sepolia and Arbitrum Sepolia WSS endpoints is recorded as passing before any application code depends on them
  2. The destination-chain `BridgeFinalized` event is watched with an explicit `chainId`, seeded by a bounded `getLogs` scan before the live subscription opens, so an event that fired before subscription is never missed and duplicate events on resubscribe are applied once (state keyed by `messageId`)
  3. Dropping or killing the WebSocket connection causes both the relay watch and the message explorer to fall back to HTTP polling within the staleness-watchdog threshold, with the transaction flow continuing to work throughout
  4. A log re-emitted with `removed: true` after a chain reorganisation does not leave a step or a message falsely marked confirmed
  5. The message explorer list runs on the same live-watch mechanism (with its own bounded seed scan) instead of the previous 6-second poll

**Plans**: 4 plans

Plans:
**Wave 1**

- [ ] 02-01-PLAN.md — Tracer: WSS smoke test (LIVE-02 evidence) + committed `ws` constants + WebSocket-at-index-0 `fallback()` clients + `wagmi.ts` wiring + one live `BridgeFinalized` subscription proven to use `eth_subscribe`; plus the pure `TransportMode` / staleness-formula / messageId-merge module (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-02-PLAN.md — `createLiveWatch()`: seed-then-subscribe engine with `watchBlocks` heartbeat, staleness watchdog, once-only `onError` degrade to HTTP polling, and always-on slow reconciliation (wave 2)

**Wave 3** *(blocked on Wave 2 completion; the two plans run in parallel)*

- [ ] 02-03-PLAN.md — `use-relay-status.ts`: bounded newest-first seed then subscribe for a single `messageId` on the explicit destination `chainId`, with reorg rollback and dedupe (wave 3)
- [ ] 02-04-PLAN.md — Message explorer (`use-bridge-messages.ts`) upgraded to the same live-watch mechanism, retaining `scanChain()` as seed and reconciliation, replacing the 6-second poll (wave 3)

*Plan count differs from the three originally proposed: the shared staleness-watchdog and degrade
engine (LIVE-05/LIVE-06) is consumed by both hooks and does not fit inside either without exceeding
the per-plan context budget or duplicating the phase's subtlest logic, so it was extracted into
02-02. Splitting wave 3 into two plans then lets the relay watch and the explorer upgrade run in
parallel.*

### Phase 3: Flow Orchestration & UI Integration

**Goal**: A user attempting a bridge transfer sees a single three-step stepper and action button
that always reflect real transaction state — pre-flight simulated, approved every run, decoded
on failure into one error banner, and recoverable after a page refresh.
**Depends on**: Phase 1, Phase 2
**Requirements**: FLOW-02, FLOW-03, FLOW-04, SIM-01, SIM-02, SIM-03, STEP-01, STEP-02, STEP-03, STEP-04, BTN-01, BTN-02
**Success Criteria** (what must be TRUE):

  1. Before the wallet prompt opens, the bridge transaction is simulated; a failing simulation blocks the prompt entirely and shows the decoded reason in the error banner, and a transaction that passes simulation but reverts on submission still reports a real, independently-decoded reason
  2. Approve runs for the exact amount on every bridge attempt, so the three-step stepper (Bridge Approved → Bridge tx submitted → Bridge tx relayed) always executes all three steps end to end
  3. Each step shows a blue spinner while pending and a green checkmark once confirmed, with status text matching pending/processing/confirmed, and the action button's label, variant, icon and disabled state track that same derived state with no second derivation
  4. Reloading the browser mid-bridge restores the in-flight transaction's stepper and button state from persisted storage instead of resetting to idle
  5. `getActionState()` and the duplicated `approveHash`/`bridgeHash` local state no longer exist in `bridge-card.tsx`

**Plans**: TBD
**UI hint**: yes

Plans:

- [ ] 03-01: `use-bridge-flow.ts` orchestration hook — simulate/write/receipt chains + relay-status watch + approve-every-run + page-refresh rehydration
- [ ] 03-02: `stepper.tsx` / `action-button.tsx` (CSS Modules) — presentational, driven entirely by `BridgeFlowState`
- [ ] 03-03: `bridge-card.tsx` refactor — wire the orchestration hook, remove `getActionState()` and duplicated hash state, add the single error banner

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pure Foundation — ABI, Error Mapping & Flow-State Derivation | 0/3 | Not started | - |
| 2. RPC Transport & Live Event Subscription | 0/4 | Not started | - |
| 3. Flow Orchestration & UI Integration | 0/3 | Not started | - |
