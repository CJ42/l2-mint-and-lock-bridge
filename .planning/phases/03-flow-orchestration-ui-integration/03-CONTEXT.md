# Phase 3: Flow Orchestration & UI Integration - Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire simulate → approve → write → receipt → relay-watch into one orchestration hook
(`use-bridge-flow.ts`), ship the hand-built stepper and action button as presentational CSS
Modules components driven entirely by `BridgeFlowState`, and refactor `bridge-card.tsx` to consume
that single derived state — deleting `getActionState()` (`ui/src/components/bridge-card.tsx`
lines 476–520) and the duplicated `approveHash` / `bridgeHash` local state (lines 51–52), and
replacing the three scattered error paragraphs (lines 345–351) with one error banner.

This phase consumes Phase 1's outputs (the generated ABI, the error-decode chain,
`deriveFlowState()`) and Phase 2's outputs (`use-relay-status.ts`, `transportMode`). It does not
generate ABIs, does not write decode logic, and does not build transport machinery — it wires
what those phases produced into the UI.

</domain>

<decisions>
## Implementation Decisions

### Simulation & Transaction Sequencing

- **D-01:** The bridge transaction is simulated **after the approve receipt confirms**, gated on
  `allowance >= amount`. Nothing simulates while the approve is in flight — this is deliberate:
  because FLOW-02 forces an approve on every bridge, allowance is below the amount at click time,
  so an ungated simulation would revert on *allowance* and permanently display "allowance too low"
  instead of the real failures SIM-01 exists to catch. A failing simulation blocks the bridge
  wallet prompt entirely (SIM-01) and its decoded reason renders in the error banner (SIM-02).
  - Accepted cost: the user has already spent one approve transaction before a bridge-level
    failure (e.g. `BridgeMessageAlreadyProcessed`) is discovered.
  - Rejected: `stateOverride`-based pre-flight before approve. It would catch the real bridge
    revert one transaction earlier, but requires the correct ERC20 allowance storage slot for the
    real Base Sepolia USDC contract and for wUSDC, and a wrong slot fails silently by producing a
    meaningless simulation.
  — **Reversibility:** reversible — a `stateOverride` pre-flight can be added later as an
  additional advisory path without changing the gated simulation that blocks the prompt.

- **D-02:** **One click drives both transactions.** The user clicks the action button once; the
  wallet prompts for approve, and when that receipt confirms and the simulation passes, the bridge
  prompt opens automatically. This matches FLOW-02's "all three steps always execute" narrative and
  makes the stepper read as one continuous flow rather than two disconnected acts.
  - Known risk the planner must handle: a wallet prompt not triggered by a direct user gesture can
    be suppressed or deprioritised by some wallets. If that surfaces during implementation, the
    fallback is the "armed second click" variant (button becomes `Confirm bridge` after approve
    confirms) — not a return to the current click-per-transaction pattern.
  — **Reversibility:** reversible — falling back to an armed second click adds one state to the
  union and changes no other decision here.

- **D-03:** The simulation is invoked **imperatively** — a `simulateContract` action awaited inline
  in the flow sequence (wagmi/core action or the module-level viem client), not wagmi's
  `useSimulateContract` hook. D-02's awaited sequence is straight-line async code; coordinating a
  React Query's lifecycle inside it (`enabled` flipping, stale results, awaiting `refetch()`) is
  where subtle ordering bugs live. The thrown error goes directly into Phase 1's decode chain.
  - **This overrides `TX_FLOW.md`'s literal instruction** *"I want to use useSimulate from Wagmi"*.
    The intent — pre-flight before the wallet opens — is preserved in full; only the specific hook
    is not. Record this override in the plan alongside the existing shadcn and committed-ABI
    overrides.

- **D-04:** A transaction that passes simulation but comes back `status: 'reverted'` is decoded by
  **replaying the call via `eth_call` pinned to the receipt's `blockNumber`**, and the returned
  revert data goes through the same Phase 1 decode chain as any other failure. This is what makes
  SIM-03 real rather than nominal — a receipt alone carries no revert data, so without the replay
  the user gets "it reverted" and nothing else, which is precisely the "left guessing" moment the
  milestone's core value targets. It is also the strongest expression of the portfolio motivation
  (debugging a failed transaction down to calldata).
  - Accepted cost: one extra RPC call on a path that should be rare. If a public node refuses the
    historical `eth_call`, degrade to the plain reverted message plus explorer link rather than
    failing the flow.

### Flow-State Ownership & Stepper Placement

- **D-05:** `use-bridge-flow.ts` is called in **`ui/src/app/page.tsx`**, and the hook owns
  `direction` / `amount` / `recipient` alongside the transaction flow state. It returns both the
  derived `BridgeFlowState` and the input setters. `page.tsx` renders `<Stepper>` in the hero
  column (satisfying STEP-01's "on the left, below the L2 Bridge title and explanations") and
  passes the hook result down to `<BridgeCard>`, which becomes a **controlled form**.
  - Rationale: STEP-01 places the stepper in the hero column while the inputs that feed the flow
    currently live as `useState` inside `bridge-card.tsx`; FLOW-01 forbids each deriving its own
    state. One owner in `page.tsx` resolves both. This extends the lift-state-up precedent already
    present (`activeMessageId` / `onActiveMessageChange`) rather than introducing a new pattern.
  - Rejected: a React context provider (adds a layer the codebase uses nowhere today) and moving
    the stepper inside the bridge card (overrides STEP-01's explicit placement).
  — **Reversibility:** costly — every input in `bridge-card.tsx` becomes a prop, so reverting to
  card-local state means touching every field and the component's whole props contract.

- **D-06:** The pre-transaction **gate states live inside `BridgeFlowState`** as part of one union
  — `disconnected` / `wrong-network` / `undeployed` / `incomplete-input` / `idle` / `approving` /
  `submitting` / `relaying` / `done` / `failed` (exact variant names are Claude's discretion).
  `deriveFlowState()` takes wallet and input-validity inputs alongside transaction inputs; it stays
  pure, because gates are simply more inputs. The action button reads label, variant, icon and
  disabled state straight off the union with zero branching of its own (BTN-01); the stepper
  renders all three steps as `upcoming` for any gate variant.
  - Rejected: a thin `deriveActionState()` above a transaction-only `deriveFlowState()` — that is
    arguably the second derivation BTN-01 exists to prevent, and is the exact drift `getActionState()`
    already demonstrated.
  - **Note for Phase 1:** this settles one of the two gray areas Phase 1's CONTEXT.md left open
    ("`deriveFlowState()`'s exact discriminated-union shape"). The union is larger than a
    transaction-only design would be, and Phase 1's unit tests must cover the gate variants.

- **D-07:** The stepper is **always visible** in the hero column. All three steps render from page
  load in a neutral `upcoming` style and light up as the flow advances. No layout shift at the
  moment the user is watching for their wallet prompt, stable hero shape, and it tells a
  first-time visitor what the bridge is about to do. `upcoming` is an honest state, not a faked
  one — nothing claims progress that has not happened, so this does not conflict with the
  no-faked-states constraint.
  - Consequence: each step has at least three visual states (`upcoming` / pending / confirmed),
    where STEP-02 only specifies two (blue spinner, green checkmark). The `upcoming` treatment is
    an addition STEP-02 does not contradict; its visual design is not yet decided (see
    `<deferred>`).

- **D-08:** A completed or failed flow resets **on direction flip or on a new submission** — not on
  incidental input edits. A finished run stays fully visible (three checkmarks plus the explorer
  link) while the user edits amount or recipient. Rationale: an accidental keystroke should not
  erase a completed result and its explorer link, nor make a failed run's error banner vanish the
  moment the user starts fixing the thing that caused it.
  - This reset rule moves out of `flipDirection()` (which today clears `approveHash`/`bridgeHash`
    by hand) and into the hook.
  - Accepted cost: a brief window where the stepper shows the previous run while the form already
    holds new values.

### Claude's Discretion

- Exact variant names and TypeScript shape of the `BridgeFlowState` union (D-06) — follow
  `.planning/codebase/CONVENTIONS.md`: string-literal union types, explicit return types, object
  parameters for 2+ args.
- Which `simulateContract` entry point D-03 uses (`@wagmi/core` action vs the module-level viem
  public client) — pick whichever composes more cleanly with Phase 1's decode chain.
- Whether the `approve` transaction also gets its own pre-flight simulation. SIM-01 mandates it
  only for the bridge transaction; a well-formed ERC20 `approve` essentially cannot revert, and its
  real failure mode (insufficient native gas) is already covered by Phase 1's `InsufficientFundsError`
  path (ERR-02). Not simulating it is the expected default.
- File and component naming for the stepper and action button (`stepper.tsx` / `action-button.tsx`
  per ROADMAP.md, with matching `*.module.css`) and how much of the hook result `BridgeCard`
  receives as props versus one grouped object.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Original specification (source of the stepper, copy, and button behaviour)
- `TX_FLOW.md` (repo root, untracked) — the original written spec. Target copy for each
  transaction state (§ "Transaction state": pending → *"Your transaction is being submitted to the
  network…"*, processing → *"Your transaction has been picked up and is being processed…"*,
  confirmed → *"Your transaction has completed successfully!"*), the three step names, the
  `ButtonTransaction` reference pattern, and the stepper placement STEP-01 restates.
  **Three of its instructions are deliberately overridden:** shadcn/ui (PROJECT.md Key Decisions),
  committed ABI JSON (Phase 1 D-02), and `useSimulate` (D-03 above).

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — FLOW-02, FLOW-03, FLOW-04, SIM-01, SIM-02, SIM-03, STEP-01,
  STEP-02, STEP-03, STEP-04, BTN-01, BTN-02 (this phase's full requirement set). Also FLOW-01 and
  FLOW-05, which are Phase 1 requirements this phase must not violate.
- `.planning/ROADMAP.md` § "Phase 3" — the five success criteria and the three named plans
  (03-01 orchestration hook, 03-02 stepper/action-button, 03-03 `bridge-card.tsx` refactor).
  Note **UI hint: yes** — `/gsd-ui-phase 3` is available to produce a UI-SPEC.md design contract.
- `.planning/PROJECT.md` § "Key Decisions" — hand-build in CSS Modules (no shadcn), approve every
  run, one shared error banner rather than a per-step failed state, no faked states, page-refresh
  recovery in scope.

### Upstream phase dependencies
- `.planning/phases/01-pure-foundation-abi-error-mapping-flow-state-derivation/01-CONTEXT.md` —
  the error-decode chain this phase feeds every failure into (D-05 tiering, D-06 copy template,
  D-07 computed gas amount, D-08 faucet links). Its `<deferred>` section names the two gray areas
  that land here; **D-06 above settles the union-shape half of that**.
- `.planning/phases/02-rpc-transport-live-event-subscription/02-CONTEXT.md` — D-07 there returns
  `transportMode: 'connected' | 'stale' | 'reconnecting' | 'polling-fallback'` from both hooks and
  explicitly leaves *whether Phase 3 renders it* to this phase (still open — see `<deferred>`).
  D-08 there fixes relay confirmation as first-sight + rollback-on-`removed`, which is what the
  stepper's third step reflects.

### Research
- `.planning/research/PITFALLS.md` Pitfall 7 ("Cold start — a fresh page load or refresh shows an
  empty flow mid-bridge") — the load-bearing reference for FLOW-04, including its recommendation to
  persist the `activeMessageId` pointer with the bounded `getLogs` scan as backstop. Also its
  "Looks Done But Isn't" checklist entry on refresh-mid-bridge, and the "Unrecoverable stuck state
  with no escape hatch" row in the anti-pattern table.
- `.planning/research/FEATURES.md` — table-stakes vs anti-feature framing for the flow UX.

### Existing code being changed
- `ui/src/components/bridge-card.tsx` — `getActionState()` (lines 476–520) and `ActionStateInput`
  (522–536) to be deleted (FLOW-03); `approveHash`/`bridgeHash` state (51–52) to be deleted;
  `handleAction()` / `approve()` / `bridge()` (155–215) become the hook's sequence; the three error
  paragraphs (345–351) collapse into one banner; `flipDirection()` (140–148) loses its manual reset
  per D-08. `parseAmount()`, `parseRecipient()` and `validateBridge()` are pure and reusable.
- `ui/src/app/page.tsx` — gains the `use-bridge-flow()` call and the `<Stepper>` render in the
  hero column (`styles.hero`, after `heroFacts`); already lifts `activeMessageId`, the precedent
  D-05 extends.
- `ui/src/components/bridge-card.module.css` — the existing `.action` button styles the new
  `action-button.tsx` should match; `.error` is the current error styling.
- `ui/src/app/page.module.css` — hero column layout the stepper lands in.
- `ui/src/lib/bridge.ts` — `formatTokenAmount()`, `getExplorerUrl()`, `BridgeMessage`, and the
  `status: 'pending' | 'finalized'` union that is the precedent for the flow-state union.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getActionState()` in `bridge-card.tsx` is being deleted, but its ten branches are a complete
  inventory of the states the new union must cover — read it as the requirements list for D-06's
  variants (connect wallet, undeployed, wrong chain / switching, no amount, no recipient,
  approving, approval confirming, needs approval, bridge prompt open, bridge confirming, finalized,
  relaying, idle).
- `parseAmount()` / `parseRecipient()` / `validateBridge()` (lines 435–467) are already pure and
  6-decimal-correct; move them with the input state into the hook rather than rewriting.
- The `parseEventLogs` → `BridgeInitiated` → `messageId` extraction in the `useEffect` at lines
  128–138 is exactly how the flow learns its `messageId` for the relay-watch step; it moves into
  the hook and its ABI import moves to Phase 1's generated file.
- `ui/src/components/bridge-card.module.css` `.action` — existing button styling to extend rather
  than replace, so the new variants stay visually consistent.

### Established Patterns
- Result objects shaped like `UseBridgeMessagesResult { messages, isLoading, error, refresh }`
  (`.planning/codebase/CONVENTIONS.md`) — `use-bridge-flow.ts`'s return type should follow it.
- String-literal union types for status (`status: 'pending' | 'finalized'` in `ui/src/lib/bridge.ts`)
  — the precedent for `BridgeFlowState` and for the per-step visual state.
- `'use client'` at the top of every hook and component file; CSS Modules co-located as
  `component-name.module.css`; kebab-case filenames, camelCase functions.
- No barrel files — import from specific module paths.
- Lift-state-up via prop + callback (`activeMessageId` / `onActiveMessageChange` in `page.tsx`) —
  the pattern D-05 extends.

### Integration Points
- `ui/src/app/page.tsx` `<div className={styles.top}>` — the hero column (`styles.hero`) is where
  `<Stepper>` mounts, directly after `heroFacts`; `<BridgeCard>` sits beside it.
- `use-relay-status.ts` (Phase 2) — supplies the third stepper step's confirmation and its
  `transportMode`; consumed through `use-bridge-flow.ts`, not directly by the stepper.
- `ui/src/lib/abis.ts` is deleted in Phase 1, so every ABI import in `bridge-card.tsx`
  (`bridgeAbi`, `erc20Abi` at line 23) must move to Phase 1's generated exports as part of this
  phase's refactor — a hard, unavoidable coupling, not just an import rename.
- `onActiveMessageChange` currently flows page → card; with D-05 the flow hook owns it, so
  `MessageExplorer`'s `activeMessageId` prop wiring must be re-checked.

</code_context>

<specifics>
## Specific Ideas

- The completed stepper — three green checkmarks plus the explorer link — is treated as the demo's
  payoff screenshot, which is why D-08 protects it from being wiped by an incidental keystroke.
- `upcoming` is explicitly framed as an honest state, not a faked one: it claims nothing that has
  not happened, so an always-visible stepper does not conflict with the milestone's no-faked-states
  constraint.
- SIM-03 should be satisfied in its strong reading, not its weak one — a mined-but-reverted
  transaction must produce a genuine decoded reason (D-04), because "it reverted, go look yourself"
  is the exact failure the core value targets.
- The overrides of `TX_FLOW.md` are deliberate and should be recorded as such in the plan, matching
  how the shadcn and committed-ABI overrides were handled — the spec's intent is honoured, its
  letter is not.

</specifics>

<deferred>
## Deferred Ideas

None deferred to other phases — discussion stayed inside Phase 3's boundary.

**However, two of the four surfaced gray areas were not selected for discussion this session.**
They are fully in scope for Phase 3 and must be resolved by the researcher and planner:

1. **Refresh recovery mechanics (FLOW-04).** What exactly is persisted — just `activeMessageId`, or
   a whole flow record with hashes, amount, direction and step position? `sessionStorage` vs
   `localStorage`? Keyed per connected address? Cleared when — on done, on failure, on direction
   flip (and how does that interact with D-08's reset rule)? And on rehydration, is the persisted
   record trusted, or re-derived against chain state before the stepper is restored?
   `.planning/research/PITFALLS.md` Pitfall 7 recommends a persisted pointer with the bounded
   `getLogs` scan as backstop, and flags this as a scenario a portfolio reviewer is likely to hit
   deliberately ("refreshes the page to check it's real").

2. **Failure, idle and degraded presentation.** FLOW-05 requires the flow to leave the pending
   state on failure so no step is left spinning — what do the three steps actually show at that
   moment, given PROJECT.md rules out a per-step failed state and mandates one shared error banner?
   Related: the `upcoming` visual treatment D-07 introduces (STEP-02 specifies only spinner and
   checkmark); how STEP-03's three status texts map onto steps that have no distinct processing
   phase; and **whether Phase 2's `transportMode` renders visibly** — Phase 2's D-07 explicitly
   deferred that call to this phase, and it remains open. Note the tension Phase 2 recorded: the
   milestone's core value is "the user is never left guessing," and Pitfall 1's failure mode is a
   UI that looks live but has silently stopped.

**Also left open within the discussed areas** (raised, not resolved):
- Whether the `approve` transaction gets its own pre-flight simulation (leaning no — see Claude's
  Discretion).
- What happens if the user rejects the *second* wallet prompt after the approve already succeeded —
  allowance is now set, so a retry would skip straight to the bridge and step 1 would not re-execute,
  which is in tension with FLOW-02's "all three steps always execute".
- Whether the simulation result is re-checked if time passes between the approve confirming and the
  bridge write.
- Exactly what `use-bridge-flow.ts` returns and how much of it `BridgeCard` receives as props.

`/gsd-ui-phase 3` is available (ROADMAP.md marks this phase **UI hint: yes**) and would be the
natural place to settle item 2's visual questions before planning.

</deferred>

---

*Phase: 3-Flow Orchestration & UI Integration*
*Context gathered: 2026-07-25*
</content>
