---
phase: 01-pure-foundation-abi-error-mapping-flow-state-derivation
plan: 01
subsystem: ui
tags: [wagmi-cli, viem, codegen, abi, error-decoding, foundry, bun-test]

requires: []
provides:
  - "ui/src/lib/generated.ts — generated ABI module (collateralTokenBridgeAbi, syntheticTokenBridgeAbi, wrappedTokenAbi, ierc20Abi), regenerated via `bun run generate`"
  - "ui/src/lib/decode-bridge-error.ts — bridgeErrorAbi (21 deduped error fragments) and decodeBridgeError with the ten-member DecodedBridgeErrorKind contract (bridge-custom-error and unknown branches implemented)"
  - "Removal of every hand-written ABI source (ui/src/lib/abis.ts, collateral-abi.json, synthetic-abi.json) and both former call sites repointed to the generated module"
affects: [01-02, 01-03, phase-2, phase-3]

tech-stack:
  added: ["@wagmi/cli foundry+react plugins (activated, already a devDependency)", "@types/bun in ui"]
  patterns:
    - "Generated-ABI-as-source-of-truth: ui/wagmi.config.ts -> forge build -> ui/src/lib/generated.ts, committed to git, never hand-edited"
    - "Ordered decode chain: decodeBridgeError walks an array of decoder functions, most-specific first, total generic fallback last"
    - "Event/error resolution by name (viem getAbiItem / dedup-by-selector), never by array position"

key-files:
  created:
    - ui/wagmi.config.ts
    - ui/src/lib/generated.ts
    - ui/src/lib/decode-bridge-error.ts
    - ui/src/lib/decode-bridge-error.test.ts
  modified:
    - ui/package.json
    - ui/src/hooks/use-bridge-messages.ts
    - ui/src/components/bridge-card.tsx
    - contracts/src/WrappedToken.sol (out-of-scope fix applied by the orchestrator, not by this plan — see Deviations)

key-decisions:
  - "wagmi.config.ts sets exclude: [] instead of omitting exclude, because @wagmi/cli's foundryDefaultExcludes (active whenever exclude is unset) literally contains 'IERC20.sol/**' and silently cancelled the plan's own include entry for it — see Deviations"
  - "bridgeErrorAbi is error fragments only, deduped by 4-byte selector (toFunctionSelector + formatAbiItem), first occurrence wins, source order [collateral, synthetic, wrappedToken, ierc20]"
  - "use-bridge-messages.ts resolves BridgeInitiated/BridgeFinalized from collateralTokenBridgeAbi via getAbiItem (both bridge contracts declare byte-identical event fragments)"
  - "bridge-card.tsx bridge-call ABI selection expressed as a bridgeAbiByAction lookup keyed on the existing direction.action field, not a duplicated ternary"

patterns-established:
  - "Pure decode-chain module: decodeBridgeError({ error }) always returns a DecodedBridgeError, never throws, terminal branch is total"
  - "No positional ABI indexing anywhere in ui/src — every event/function/error is resolved by name"

requirements-completed: [ABI-01, ABI-02, ABI-03, ERR-01, ERR-09]

coverage:
  - id: D1
    description: "bun run generate produces ui/src/lib/generated.ts with the four named exports collateralTokenBridgeAbi, syntheticTokenBridgeAbi, wrappedTokenAbi, ierc20Abi, and is idempotent"
    requirement: "ABI-01"
    verification:
      - kind: unit
        ref: "cd ui && bun run generate && git diff --quiet ui/src/lib/generated.ts (manual verification, exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "bridgeErrorAbi contains exactly 21 distinct error fragments deduped by 4-byte selector across all four generated ABIs"
    requirement: "ABI-02"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#contains all 21 distinct bridge error names"
        status: pass
    human_judgment: false
  - id: D3
    description: "A BridgeMessageAlreadyProcessed revert encoded against the generated bridgeErrorAbi decodes through decodeBridgeError to kind 'bridge-custom-error' with the real messageId in the message"
    requirement: "ERR-01"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#decodes a BridgeMessageAlreadyProcessed revert into a human sentence naming the messageId"
        status: pass
    human_judgment: false
  - id: D4
    description: "An unrecognised 4-byte selector decodes to kind 'unknown' with the raw hex present in the message and rawData, without throwing; undefined/plain Error/non-Error inputs also resolve to 'unknown' without throwing"
    requirement: "ERR-01"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#falls back to unknown for a 4-byte selector absent from bridgeErrorAbi, without throwing"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#returns unknown and never throws for undefined"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#returns unknown and never throws for a plain Error"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#returns unknown and never throws for a non-Error value"
        status: pass
    human_judgment: false
  - id: D5
    description: "No hand-written ABI fragment or root-level ABI JSON dump remains anywhere in the repo; both former call sites (use-bridge-messages.ts, bridge-card.tsx) resolve events/ABIs by name, not array position, and the whole ui workspace typechecks and tests clean"
    requirement: "ABI-03"
    verification:
      - kind: unit
        ref: "cd ui && bun run typecheck (manual verification, exit 0)"
        status: pass
      - kind: unit
        ref: "cd ui && bun test (manual verification, 6 pass / 0 fail)"
        status: pass
    human_judgment: false

duration: ~75min
completed: 2026-07-25
status: complete
---

# Phase 1 Plan 1: Generated ABI Source of Truth & Bridge Error Decode Tracer Summary

**`@wagmi/cli` foundry-plugin codegen replaces every hand-written ABI in the repo; a real `BridgeMessageAlreadyProcessed` revert, encoded against the generated ABI, decodes end-to-end into a human sentence carrying the actual messageId via a new ten-branch `decodeBridgeError` decode chain.**

## Performance

- **Duration:** ~75 min (including an unplanned contracts-side compile blocker requiring orchestrator intervention — see Deviations)
- **Completed:** 2026-07-25T16:03:45+01:00
- **Tasks:** 2 completed
- **Files modified:** 9 (4 created, 5 modified; 3 deleted — 2 untracked)

## Accomplishments

- `ui/wagmi.config.ts` wired up (`@wagmi/cli` foundry + react plugins, `forge: { build: true }`), generating `ui/src/lib/generated.ts` with `collateralTokenBridgeAbi`, `syntheticTokenBridgeAbi`, `wrappedTokenAbi`, `ierc20Abi` — regeneration is idempotent (`git diff --quiet` after a second run)
- `bridgeErrorAbi` built at module scope in `ui/src/lib/decode-bridge-error.ts`: all 21 distinct error fragments across the four generated ABIs, deduped by 4-byte selector, source order `[collateral, synthetic, wrappedToken, ierc20]` as the deterministic tie-break
- `decodeBridgeError` implements the full ten-member `DecodedBridgeErrorKind` contract with two working branches (`bridge-custom-error`, `unknown`); proven end-to-end by `bun test` — a `BridgeMessageAlreadyProcessed` revert encoded via `encodeErrorResult` against the generated ABI decodes back to a sentence containing the real messageId, and an unrecognised selector / `undefined` / plain `Error` / non-Error value all resolve to `kind: 'unknown'` without ever throwing
- Every hand-written ABI source retired: `ui/src/lib/abis.ts` deleted (after confirming its error set — zero fragments — was already known-incomplete), and the two untracked root-level ABI JSON dumps (`collateral-abi.json`, `synthetic-abi.json`) deleted after a direct comparison confirmed their error sets exactly match the equivalent generated ABIs' error fragments
- Both former call sites repointed to `@/lib/generated`: `use-bridge-messages.ts` resolves `BridgeInitiated`/`BridgeFinalized` by name via `getAbiItem` instead of `bridgeAbi[0]`/`bridgeAbi[1]`; `bridge-card.tsx` swaps `erc20Abi` for the generated `ierc20Abi` at all four ERC20 sites and uses a `bridgeAbiByAction` lookup keyed on `direction.action` at both bridge-call sites — import-and-name-swap only, no JSX/state changes
- `ui` gained a working `bun test` entry point where it previously had none

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a real bridge revert becomes a human sentence"** - `047b244` (feat)
2. **Task 2: Retire the hand-written ABI sources and repoint both call sites** - `197cac6` (feat)

_Note: an additional out-of-scope commit, `a5874e5` (`fix(contracts): match OZ override visibility so forge build compiles`), was made by the orchestrator/coordinator (not by this executor) to unblock `forge build` before Task 1 could proceed — see Deviations._

## Files Created/Modified

- `ui/wagmi.config.ts` - `@wagmi/cli` config: foundry plugin (`project: '../contracts'`, `artifacts: 'out'`, `forge.build: true`, narrow four-entry `include`, `exclude: []`) + react plugin
- `ui/src/lib/generated.ts` - generated output (committed, never hand-edited); exports `collateralTokenBridgeAbi`, `syntheticTokenBridgeAbi`, `wrappedTokenAbi`, `ierc20Abi` plus the full `react()`-generated hook family (`useRead*`/`useWrite*`/`useSimulate*`/`useWatch*`)
- `ui/src/lib/decode-bridge-error.ts` - `bridgeErrorAbi` (21 deduped error fragments) and `decodeBridgeError`; ten-member `DecodedBridgeErrorKind` union, `DecodedBridgeError`/`DecodeBridgeErrorInput` interfaces; ordered decoder chain with `bridge-custom-error` and terminal `unknown` branches implemented
- `ui/src/lib/decode-bridge-error.test.ts` - 6 tests / 31 assertions proving the 21-error-name enumeration and all five Task 1 behaviours
- `ui/package.json` - added `"generate": "wagmi generate"`, `"test": "bun test"` scripts; added `@types/bun` devDependency
- `ui/src/hooks/use-bridge-messages.ts` - `bridgeInitiatedEvent`/`bridgeFinalizedEvent` resolved by name via `getAbiItem` from `collateralTokenBridgeAbi`, replacing `bridgeAbi[0]`/`bridgeAbi[1]`
- `ui/src/components/bridge-card.tsx` - `erc20Abi` → `ierc20Abi` (4 sites); `bridgeAbi` → `bridgeAbiByAction[direction.action]` (2 sites)
- `ui/src/lib/abis.ts` - deleted
- `collateral-abi.json`, `synthetic-abi.json` (repo root, untracked) - deleted
- `bun.lock` - updated by `bun install` after adding `@types/bun`

## Decisions Made

- **`bridgeErrorAbi` dedup mechanism:** filter to `type === 'error'`, dedupe by 4-byte selector computed via `toFunctionSelector(formatAbiItem(item))`, first occurrence wins in source order `[collateral, synthetic, wrappedToken, ierc20]`. Matches the plan's `planner_flagged_decisions` item 3 exactly.
- **Event resolution by name:** `use-bridge-messages.ts` now resolves `BridgeInitiated`/`BridgeFinalized` from `collateralTokenBridgeAbi` specifically (both bridge contracts declare byte-identical event fragments, so either resolves the same item) rather than re-deriving per direction.
- **`bridgeAbiByAction` lookup:** a small object keyed on `direction.action` (`'lock' | 'burn'`) rather than repeating the ternary at both `bridge-card.tsx` call sites, per the plan's explicit instruction.

## Deviations from Plan

### Auto-fixed / self-corrected during execution

**1. [Rule 1 - Bug] `wagmi.config.ts` sets `exclude: []` instead of omitting `exclude` entirely**
- **Found during:** Task 1, first `bun run generate` run — `ierc20Abi` was missing from `ui/src/lib/generated.ts` even though `IERC20.sol/**` was in `include`
- **Issue:** `@wagmi/cli`'s `foundryDefaultExcludes` (the default `exclude` list, active whenever `exclude` is not explicitly passed) literally contains the entry `'IERC20.sol/**'`. The `ignore` glob computed from `exclude` is applied independently of `include` in the crawler (`fdir().globWithOptions(include, { ignore: exclude })`), so the default exclude silently cancelled the plan's own include entry for `IERC20.sol/**` — the plan's stated rationale ("the narrow `include` already restricts the artifact set" as justification for omitting `exclude`) did not account for this specific collision.
- **Fix:** Added `exclude: []` to the foundry plugin config, neutralising the default exclude list. The four-entry `include` array already restricts the artifact set on its own, so this is safe and does not reintroduce any of the other default-excluded paths (test helpers, `Vm.sol`, etc.).
- **Files modified:** `ui/wagmi.config.ts`
- **Verification:** `ierc20Abi` now present in `ui/src/lib/generated.ts` with 8 fragments (0 errors, matching the plan's expectation that `IERC20.sol` declares no error fragments); `bridgeErrorAbi` test confirms exactly 21 distinct error names across all four ABIs
- **Committed in:** `047b244` (Task 1 commit)
- **Note — literal acceptance criterion intentionally not met:** the plan's acceptance criteria include `grep -c "exclude" ui/wagmi.config.ts` returns 0. This now returns 1. This is a deliberate, documented override: the criterion encoded an assumption (omitting `exclude` is sufficient to keep `include` authoritative) that turned out to be false for this specific default-exclude entry, and the underlying `must_haves.truths` requirement — `ierc20Abi` must exist and be the only ERC20 ABI in the UI — takes precedence over the literal grep check.

**2. [Rule 3 - Blocking, resolved by orchestrator] `forge build` failed on a pre-existing contracts-side visibility mismatch**
- **Found during:** Task 1, first `bun run generate` run — `forge build` (shelled out to by the foundry plugin) failed with two `Error (9098): Overriding function visibility differs` errors in `contracts/src/WrappedToken.sol` against the pinned OpenZeppelin `v5.6.1` (`burnFrom`/`decimals` declared `external override` vs. OZ's `public virtual`)
- **Issue:** This was a genuine pre-existing bug in out-of-scope contract code (`contracts/src` is explicitly off-limits per CLAUDE.md for this UI-only milestone), unrelated to anything in this plan. I diagnosed it (confirmed via `git ls-tree`/`contracts/foundry.lock`/reflog inspection that OZ `v5.6.1` was the intended pin, not a checkout error), self-corrected an initial misdiagnosis where I had mistakenly force-checked-out the `openzeppelin-contracts` submodule to an older commit before realizing `contracts/foundry.lock` pinned `v5.6.1`, restored the submodule to its original pre-existing state, and returned a `checkpoint:decision` (`gate="blocking-human"`) rather than touching `contracts/src` myself.
- **Fix:** The orchestrator/coordinator applied Option A (fix the two visibility declarations in `WrappedToken.sol` from `external` to `public`) and committed it as `a5874e5`, independent of and prior to this plan's own task commits. I did not write or commit this fix.
- **Files modified (by the orchestrator, not this executor):** `contracts/src/WrappedToken.sol`, `contracts/test/BridgeUnit.t.sol`
- **Verification:** `forge build` clean, `forge test` 14/14 passing (orchestrator-reported); `bun run generate` then succeeded end-to-end
- **Committed in:** `a5874e5` (pre-existing, orchestrator commit — not part of this plan's task commits)

---

**Total deviations:** 2 (1 auto-fixed directly [Rule 1], 1 diagnosed-and-escalated with an out-of-scope fix applied by the orchestrator [Rule 3])
**Impact on plan:** The `exclude: []` fix was necessary for `ABI-02`/`ABI-03` correctness (`ierc20Abi` must actually exist) and is fully contained within this plan's own file (`ui/wagmi.config.ts`). The contracts-side fix was outside this plan's scope entirely and did not touch any file this plan owns — no scope creep into `ui/`.

## Issues Encountered

Covered above under Deviations — no additional unresolved issues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `@/lib/generated` import path and the `DecodedBridgeError` return shape are committed and proven end-to-end, ready for Plan 01-02 (remaining eight decoder branches) and Plan 01-03 (opaque type-import, no `kind` switch) to build on without re-deriving either contract.
- `bridgeErrorAbi`'s 21 error names are asserted by test, not by inspection — Plan 01-02 can add named branches for any of the remaining 20 without needing to re-verify the underlying ABI merge/dedup logic.
- No blockers for 01-02/01-03. The one open item is cosmetic: the plan's literal `grep -c "exclude"` acceptance criterion no longer holds (see Deviations #1) — flagged here so a future audit doesn't mistake it for an unnoticed regression.

---
*Phase: 01-pure-foundation-abi-error-mapping-flow-state-derivation*
*Completed: 2026-07-25*

## Self-Check: PASSED

All created files verified present on disk (`ui/wagmi.config.ts`, `ui/src/lib/generated.ts`,
`ui/src/lib/decode-bridge-error.ts`, `ui/src/lib/decode-bridge-error.test.ts`, this SUMMARY.md);
`ui/src/lib/abis.ts`, `collateral-abi.json`, `synthetic-abi.json` confirmed deleted; all three
commits (`047b244`, `197cac6`, `911956d`) confirmed present in `git log --oneline --all`.
