---
phase: 01-pure-foundation-abi-error-mapping-flow-state-derivation
plan: 03
subsystem: ui
tags: [typescript, state-derivation, discriminated-union, bun-test, wagmi]

requires:
  - phase: 01-01
    provides: "Generated ABI foundation and the DecodedBridgeError contract"
provides:
  - "Pure deriveFlowState function returning one semantic value for both the action button and three-step stepper"
  - "Seven-variant BridgeFlowState discriminated union and six BridgeBlockedReason guards"
  - "FLOW-05 failure collapse that preserves confirmed progress while stopping every in-flight spinner"
  - "Fixture-driven suite with a 64-combination failure invariant sweep"
affects: [phase-2, phase-3, flow-orchestration, stepper, action-button]

tech-stack:
  added: []
  patterns:
    - "Pure guard-clause derivation with a complete discriminated-union return"
    - "Type-only dependency on DecodedBridgeError"
    - "Fixed readonly approve/submit/relay tuple"
    - "Cross-product invariant testing for failure behavior"

key-files:
  created:
    - ui/src/lib/derive-flow-state.ts
    - ui/src/lib/derive-flow-state.test.ts
  modified: []

key-decisions:
  - "Failure has highest precedence and remains sticky until its caller explicitly clears it"
  - "A failed flow carries the DecodedBridgeError and failedStep while collapsing pending/processing statuses to idle"
  - "Confirmed status comes only from each step's own confirmation signal; relay has no pending state"
  - "Button copy and step status copy remain presentation concerns for Phase 3"

patterns-established:
  - "deriveFlowState is the sole semantic derivation: phase drives the button and steps drives the stepper"
  - "Transaction progress maps directly from wagmi write/receipt flags without network or React coupling"
  - "Failure collapse returns new step objects and never mutates caller input"

requirements-completed: [FLOW-01, FLOW-05]

coverage:
  - id: D1
    description: "Every flow result carries a phase discriminant and an ordered three-step approve/submit/relay tuple"
    requirement: "FLOW-01"
    verification:
      - kind: unit
        ref: "ui/src/lib/derive-flow-state.test.ts#every phase carries exactly three ordered steps and a phase string"
        status: pass
    human_judgment: false
  - id: D2
    description: "All seven phases and all six blocked reasons are reachable with the specified precedence"
    requirement: "FLOW-01"
    verification:
      - kind: unit
        ref: "ui/src/lib/derive-flow-state.test.ts#deriveFlowState blocking guards and precedence"
        status: pass
      - kind: unit
        ref: "ui/src/lib/derive-flow-state.test.ts#deriveFlowState happy-path progression"
        status: pass
    human_judgment: false
  - id: D3
    description: "A failure outranks all guards, carries its decoded error and failed step, preserves confirmed progress, and stops every in-flight step"
    requirement: "FLOW-05"
    verification:
      - kind: unit
        ref: "ui/src/lib/derive-flow-state.test.ts#deriveFlowState failure behavior"
        status: pass
      - kind: unit
        ref: "ui/src/lib/derive-flow-state.test.ts#no failed result spins across all 64 transaction-progress combinations"
        status: pass
    human_judgment: false
  - id: D4
    description: "The derivation is deterministic, non-mutating, hook-free, and never confirms a step without its own real confirmation signal"
    requirement: "FLOW-01"
    verification:
      - kind: unit
        ref: "ui/src/lib/derive-flow-state.test.ts#is deterministic and does not mutate its input"
        status: pass
      - kind: unit
        ref: "ui/src/lib/derive-flow-state.test.ts#never confirms a transaction step from prompting or confirming alone"
        status: pass
      - kind: unit
        ref: "ui/src/lib/derive-flow-state.test.ts#relay is never pending for any relay input"
        status: pass
      - kind: other
        ref: "cd ui && bun run typecheck"
        status: pass
    human_judgment: false

duration: ~5min
completed: 2026-07-25
status: complete
---

# Phase 1 Plan 3: Pure Flow-State Derivation Summary

**A pure, hook-free `deriveFlowState()` now produces the single semantic value consumed by both the action button and three-step stepper, with failure behavior proven not to leave any step spinning across all 64 transaction-progress combinations.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-07-25T17:35:00+01:00
- **Tasks:** 2 completed
- **Files created:** 2

## Accomplishments

- Added the complete seven-phase `BridgeFlowState` union and six blocking reasons.
- Added exact progress derivation for approve, submit, and relay without React, wagmi, clocks, storage, or value imports.
- Added failure-first handling that carries the original `DecodedBridgeError`, identifies the failed step, preserves confirmed steps, and collapses pending/processing steps to idle.
- Added 24 tests with 545 assertions, including all phases, all blocked reasons, purity, no-faked-progress checks, and the 64-combination FLOW-05 sweep.
- Verified the full UI suite: 70 tests, 717 assertions, 0 failures; TypeScript typecheck and IDE lint diagnostics are clean.

## Final `BridgeFlowState` Contract

The implemented union is:

```ts
export type BridgeFlowState =
  | { phase: 'blocked'; reason: BridgeBlockedReason; steps: BridgeSteps }
  | { phase: 'ready'; steps: BridgeSteps }
  | { phase: 'approving'; steps: BridgeSteps }
  | { phase: 'submitting'; steps: BridgeSteps }
  | { phase: 'relaying'; steps: BridgeSteps }
  | { phase: 'done'; steps: BridgeSteps }
  | {
      phase: 'failed'
      failure: DecodedBridgeError
      failedStep: BridgeStepId
      steps: BridgeSteps
    }
```

`BridgeSteps` is always the readonly tuple `[approve, submit, relay]`. Transaction steps use
`idle | pending | processing | confirmed`; relay uses only `idle | processing | confirmed`.

## Input Fields and Hook Mappings

The exact input contract is `DeriveFlowStateInput`:

- `isConnected`, `isDeployed`, `isCorrectChain`, `isSwitchingChain`,
  `hasValidAmount`, `hasValidRecipient`
- `approve` and `bridge`: `{ isPrompting, isConfirming, isConfirmed }`
- `relay`: `{ isInitiated, isFinalized }`
- optional `failure: DecodedBridgeError`

Phase 3 must map these fields as follows:

- `isPrompting` ← `useWriteContract().isPending`; this spans the open wallet prompt through node acceptance.
- `isConfirming` ← `useWaitForTransactionReceipt().isFetching`; this covers receipt polling.
- `isConfirmed` ← `useWaitForTransactionReceipt().isSuccess`; this means mined on the origin chain, not relayed.
- `relay.isInitiated` ← observed origin-chain `BridgeTxInitiated`.
- `relay.isFinalized` ← observed destination-chain `BridgeFinalized`.

## Existing `getActionState()` Coverage

No existing condition failed to map:

- disconnected, undeployed, wrong-chain, switching-chain, invalid amount, and invalid recipient map to `blocked`.
- approval prompting/confirming map to `approving`.
- `needsApproval` maps to `ready` with approve `idle`; after approval, `ready` with approve `confirmed` tells Phase 3 the next action is submit.
- bridge prompting/confirming map to `submitting`.
- an initiated message maps to `relaying`; a finalized message maps to `done`.

Phase 3 can therefore delete `getActionState()` rather than retaining a parallel derivation.

## Decisions and Carried Constraints

- Failure is deliberately first and sticky. Phase 3 must clear `failure` when a fresh attempt begins.
- Phase 3 owns all labels, variants, icons, and status sentences; this module carries semantics only.
- The button must consume `phase`, and the stepper must consume `steps`. Neither may re-derive state from raw flags.
- Failure messages remain attacker-influenceable text bounded by the decoder. Phase 3 must render them as React text children, never with `dangerouslySetInnerHTML`.

## Deviations from Plan

The implementation follows the planned API and behavior. One literal acceptance command is defective:

```text
grep -Ec "^import (\{|[A-Za-z])" ui/src/lib/derive-flow-state.ts
```

It returns `1` because the required declaration `import type { DecodedBridgeError } ...` starts
with `import t`, and `t` matches `[A-Za-z]`. The source has exactly one import and it is type-only;
TypeScript confirms no runtime dependency. The source was not distorted with leading whitespace
to make the faulty regex return zero.

## Task Commits

No commits were created because the user requested implementation but did not request a commit.

## User Setup Required

None.

## Next Phase Readiness

Phase 1's pure foundations are complete. Phase 2 and all three Phase 3 plans can consume the
implemented union directly. No blockers remain for deleting `getActionState()` in Phase 3.

## Self-Check: PASSED

- `cd ui && bun test src/lib/derive-flow-state.test.ts` → 24 pass, 0 fail
- `cd ui && bun test` → 70 pass, 0 fail
- `cd ui && bun run typecheck` → exit 0
- Both new files have no lint diagnostics
- No React/wagmi imports, clocks, browser globals, storage, or timers
- Exactly one import, and it is `import type { DecodedBridgeError }`
- Every phase, blocked reason, and fixed step id is asserted
- The 64-combination FLOW-05 sweep passes
