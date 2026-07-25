# Phase 3: Flow Orchestration & UI Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-25
**Phase:** 3-Flow Orchestration & UI Integration
**Areas discussed:** Simulation × approve sequencing, Stepper placement & who owns flow state

**Areas offered but not selected:** Refresh recovery mechanics, Failure/idle/degraded states

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Simulation × approve sequencing | When the bridge simulation runs given approve-every-run; whether approve is simulated; what a failing simulation blocks | ✓ |
| Stepper placement & who owns flow state | STEP-01 puts the stepper in the hero column while the inputs live in bridge-card.tsx | ✓ |
| Refresh recovery mechanics | What is persisted for FLOW-04, in which storage, keyed how, cleared when | |
| Failure, idle & degraded states | FLOW-05 presentation, gate states vs BTN-01, whether transportMode renders | |

---

## Simulation × approve sequencing

### Q1 — When does the bridge transaction get simulated, relative to the approve that always precedes it?

| Option | Description | Selected |
|--------|-------------|----------|
| After approve confirms | Gate the bridge simulation on `allowance >= amount`; simulation fires once the approve receipt lands and allowance refetches. Simple, honest, no storage-slot tricks. Cost: one approve already spent before a bridge-level failure is discovered. | ✓ |
| Before approve, via stateOverride | Fake the ERC20 allowance storage slot so the bridge call can be simulated as if approval had happened. Catches the real revert before any transaction. Cost: needs the correct slot for real Base Sepolia USDC and wUSDC; brittle for proxies, and a wrong slot fails silently. | |
| Both — optimistic pre-flight + real simulate | stateOverride pre-flight as advisory during form fill, plus the gated simulation as the blocking gate. Best coverage and strongest demo. Cost: two simulation paths to build and keep consistent. | |

**User's choice:** After approve confirms (recommended option)
**Notes:** Framed against FLOW-02 — because approve runs every time, allowance is below the amount at click time, so an ungated simulation would permanently report "allowance too low" rather than the failures SIM-01 targets.

### Q2 — Does one button click drive the whole approve→bridge sequence, or does the user click once per transaction?

| Option | Description | Selected |
|--------|-------------|----------|
| One click drives both | Wallet prompts for approve, then the bridge prompt opens automatically once the receipt confirms and simulation passes. Matches the "all three steps always execute" narrative. Risk: some wallets suppress a prompt not triggered by a user gesture. | ✓ |
| Click per transaction (current pattern) | Keeps today's `handleAction()` shape — "Approve token", then "Bridge". No surprise popups. Cost: user must stay present; flow is two deliberate acts. | |
| One click, but re-confirm before the bridge prompt | Button becomes an armed "Confirm bridge" after approve confirms. No unsolicited popup, flow visibly continues. Cost: an extra UI state and a mostly ceremonial click. | |

**User's choice:** One click drives both
**Notes:** The wallet-gesture risk was flagged during the question. Recorded in CONTEXT.md D-02 with the armed-second-click variant named as the fallback if it materialises — explicitly *not* a return to click-per-transaction.

### Q3 — How is the simulation invoked inside that awaited sequence?

| Option | Description | Selected |
|--------|-------------|----------|
| Imperative simulateContract | Awaited inline between the approve receipt and the bridge write. Straight-line code, explicit ordering, thrown error goes straight into the Phase 1 decode chain. Overrides TX_FLOW.md's literal "use useSimulate from Wagmi". | ✓ |
| useSimulateContract hook + await refetch() | Keeps the wagmi hook with `query.enabled` gated on allowance, awaiting `refetch()` at the gate. Literally faithful to TX_FLOW.md. Cost: stale-result and enabled-flipping edge cases are easy to get subtly wrong. | |
| You decide | Let the planner pick based on what reads cleanest against the decode chain. | |

**User's choice:** Imperative simulateContract (recommended option)
**Notes:** Third deliberate override of TX_FLOW.md, joining shadcn/ui (PROJECT.md Key Decisions) and committed ABI JSON (Phase 1 D-02). The spec's intent — pre-flight before the wallet opens — is preserved in full.

### Q4 — When a bridge tx passes simulation but comes back `status: 'reverted'`, how does the flow get a real reason?

| Option | Description | Selected |
|--------|-------------|----------|
| Replay the call at the mined block | Re-run via `eth_call` pinned to the receipt's `blockNumber`; revert data goes through the Phase 1 decode chain. Makes SIM-03 real rather than nominal. Cost: one extra RPC call; public nodes occasionally refuse historical `eth_call`. | ✓ |
| Report reverted without a decoded reason | "Your transaction reverted on-chain" plus explorer link. Cheapest. Cost: exactly the "left guessing" moment the core value targets. | |
| Replay, with a graceful fallback | Attempt the replay, fall back to the plain message if the node refuses. Same best case, no hard dependency. Cost: two outcomes to design copy for. | |

**User's choice:** Replay the call at the mined block (recommended option)
**Notes:** CONTEXT.md D-04 folds the third option's fallback in as degradation behaviour rather than treating it as a competing design — if a public node refuses the historical call, degrade to the plain message plus explorer link rather than failing the flow.

**Continue check:** "Next area" — declined further questions on approve-simulation, second-prompt rejection, and simulation staleness. All three recorded as open in CONTEXT.md `<deferred>`.

---

## Stepper placement & who owns flow state

### Q1 — Where does `use-bridge-flow.ts` live, and how does the stepper in the hero column read from it?

| Option | Description | Selected |
|--------|-------------|----------|
| Hook in page.tsx, form state moves into it | Hook owns direction/amount/recipient plus flow state; page renders `<Stepper>` in the hero and passes the result down; BridgeCard becomes a controlled form. One owner, no context layer, extends the existing lift-state-up precedent. Cost: biggest refactor of bridge-card.tsx — every input becomes a prop. | ✓ |
| Context provider around the top section | BridgeFlowProvider wraps `styles.top`; both components consume via a context hook. No prop threading. Cost: adds a React context layer used nowhere else in the codebase. | |
| Stepper moves inside the bridge card | Keep hook and state in bridge-card.tsx, render the stepper within the card. Smallest change, zero plumbing. Cost: overrides STEP-01's explicit placement, which came from TX_FLOW.md. | |

**User's choice:** Hook in page.tsx, form state moves into it (recommended option)
**Notes:** The existing `activeMessageId` / `onActiveMessageChange` lift in `page.tsx` was cited as precedent — this is an extension of an established pattern, not a new one. Rated **costly** for reversibility in CONTEXT.md because it rewrites BridgeCard's whole props contract.

### Q2 — Do the pre-transaction gate states live inside BridgeFlowState, or in a layer above it?

| Option | Description | Selected |
|--------|-------------|----------|
| Inside BridgeFlowState — one union | `deriveFlowState()` takes wallet and validity inputs and returns one union covering gates and transaction states. Button reads everything off it; stepper shows all three steps as upcoming for gate variants. BTN-01 satisfied literally; function stays pure. Cost: a larger union to enumerate and unit-test in Phase 1. | ✓ |
| Two layers — gates above the flow | `deriveFlowState()` stays transaction-only; a thin `deriveActionState()` checks gates first. Keeps the pure function tightly scoped. Cost: arguably the second derivation BTN-01 exists to prevent. | |
| Gates as separate booleans on the hook result | Hook returns flowState plus gate flags; button renders gate-first. Minimal signature change. Cost: puts branching logic back in the button — most of what FLOW-03 is deleting. | |

**User's choice:** Inside BridgeFlowState — one union (recommended option)
**Notes:** This retroactively settles one of the two gray areas Phase 1's CONTEXT.md left open (`deriveFlowState()`'s discriminated-union shape). Phase 1's unit tests must now cover the gate variants — flagged in CONTEXT.md D-06.

### Q3 — Is the stepper always present in the hero column, or does it appear only once a flow is running?

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible, steps start as upcoming | Three steps render from page load in a neutral style. No layout shift, stable hero, tells a first-time visitor what will happen. Upcoming is honest, not faked. Cost: more visual weight in the hero on an untouched form. | ✓ |
| Appears when the flow starts | Cleanest first impression; the stepper's appearance is itself a signal. Cost: layout shift at the exact moment the user is watching for their wallet prompt. | |
| Always visible, but muted until active | Reduced opacity or compact height until a flow begins. No shift, low idle weight. Cost: two visual treatments to design and keep coherent. | |

**User's choice:** Always visible, steps start as upcoming (recommended option)
**Notes:** Introduces a third per-step visual state beyond STEP-02's spinner and checkmark. The `upcoming` treatment's visual design was not settled — carried into the deferred "Failure, idle & degraded states" area.

### Q4 — When does a completed or failed flow reset back to upcoming?

| Option | Description | Selected |
|--------|-------------|----------|
| On direction flip or a new submission | Finished run stays visible through amount/recipient edits; clears on flip or next bridge. User gets to read their result. Cost: brief window where the stepper shows the previous run while the form holds new values. | ✓ |
| On any input change after completion | Stepper never shows state belonging to a run that no longer matches the form. Cost: an accidental keystroke erases the result and its explorer link, and makes a failure's error banner vanish as the user starts fixing it. | |
| Only on explicit new submission | Maximum persistence, simplest rule. Cost: after a direction flip the stepper still shows a completed run for the opposite direction. | |

**User's choice:** On direction flip or a new submission (recommended option)
**Notes:** This reset logic moves out of `flipDirection()` (which today manually clears `approveHash`/`bridgeHash`) and into the hook.

**Continue check:** "Wrap up" — declined further questions on the hook's return shape, whether the stepper reads `use-relay-status` directly, and how STEP-03's three status texts map onto steps without a processing phase. All recorded as open in CONTEXT.md `<deferred>`.

---

## Claude's Discretion

- Exact variant names and TypeScript shape of the `BridgeFlowState` union.
- Which `simulateContract` entry point to use (`@wagmi/core` action vs module-level viem client).
- Whether the `approve` transaction gets its own pre-flight simulation (leaning no — SIM-01 mandates it only for the bridge tx, and insufficient-gas is already covered by ERR-02).
- Component and file naming for the stepper and action button, and how much of the hook result `BridgeCard` receives as props.

## Deferred Ideas

No ideas were deferred to other phases — the discussion stayed inside Phase 3's boundary and no scope creep was raised.

Two of the four surfaced gray areas were not selected and remain open **within** Phase 3, for the researcher and planner to resolve: refresh recovery mechanics (FLOW-04) and failure/idle/degraded presentation (including whether Phase 2's `transportMode` renders visibly, which Phase 2's D-07 explicitly deferred to this phase). Four smaller questions raised inside the discussed areas were also left open — all listed in CONTEXT.md `<deferred>`.
