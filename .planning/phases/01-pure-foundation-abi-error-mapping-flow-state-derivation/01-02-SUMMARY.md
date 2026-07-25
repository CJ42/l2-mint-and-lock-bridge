---
phase: 01-pure-foundation-abi-error-mapping-flow-state-derivation
plan: 02
subsystem: ui
tags: [viem, error-decoding, abi, panic-codes, gas-estimation, bun-test]

requires:
  - phase: 01-01
    provides: "bridgeErrorAbi (21 deduped error fragments), the ten-member DecodedBridgeErrorKind contract, the ordered decoder-chain shape, and the encodeErrorResult-against-the-generated-ABI fixture pattern"
provides:
  - "ui/src/lib/decode-bridge-error.ts — all ten DecodedBridgeErrorKind branches implemented in one file: five Tier-1 bespoke branches, the Tier-2 fall-through, the nine-code Panic table, the bounded revert-string branch, wallet rejection, empty-data out-of-gas, computed native-gas shortfall, and the terminal generic fallback"
  - "computeGasShortfall — three-source (explicit gasEstimate → metaMessages recovery → fixed 0.0004 default) native-ETH shortfall figure with an isComputed flag so a default is never worded as a measurement"
  - "GAS_FAUCETS — chain-name + Alchemy faucet URL keyed by numeric chain id (84532, 421614) only"
  - "ui/src/lib/decode-bridge-error.test.ts — 46 tests / 172 assertions including the exhaustiveness invariant proving all ten kinds reachable, collision-free, and the chain total"
affects: [01-03, phase-2, phase-3]

tech-stack:
  added: []
  patterns:
    - "Ordered total decode chain: an array of `(context) => DecodedBridgeError | undefined` decoders, most-specific first, terminal branch total — extended by APPENDING, never by restructuring"
    - "Typed-class classification over substring matching: viem's UserRejectedRequestError / InsufficientFundsError / ContractFunctionRevertedError walked off the cause chain, with the EIP-1193 code 4001 check as a documented narrow secondary"
    - "Tier-1/Tier-2 error tiering by fall-through: Tier 2 never name-checks anything, so admin-only errors reach it without a dedicated branch (D-05)"
    - "Attacker-influenceable payload bounding: raw revert hex lowercased and capped at selector + 64 hex chars; Error(string) reasons capped at 200 chars (T-02-02, T-02-03)"

key-files:
  created: []
  modified:
    - ui/src/lib/decode-bridge-error.ts
    - ui/src/lib/decode-bridge-error.test.ts

key-decisions:
  - "D-07's literal mechanism was not implementable and was replaced by three ordered sources: viem's InsufficientFundsError carries only `{ cause }` (no gas/fee fields), so it CLASSIFIES the failure while the figure comes from the caller's explicit gasEstimate, then a metaMessages parse, then the fixed 0.0004 default"
  - "The panic table is our own plain-language wording, not viem's `panicReasons` — `viem/constants` is not in viem's public export allow-list, so importing it would have been a private-path dependency"
  - "Test fixtures declare local `Error(string)`/`Panic(uint256)` ABI items for the same reason: viem's `solidityError`/`solidityPanic` fragments are not publicly exported, and `decodeErrorResult` appends both at decode time anyway"
  - "The gas shortfall is rendered with `formatEther` and rounded UP to 4 decimals in bigint arithmetic (never `Number`), deliberately NOT with the project's 6-decimal `formatTokenAmount` — this figure is native ETH, not a bridged token amount"
  - "A zero gas or zero fee from any source is treated as that source FAILING (fall through to the next), never as a zero figure, so the quoted amount can never render as `0` or `NaN`"

patterns-established:
  - "Kind-primary decode results: `kind` is set by the decoder that actually fired and is asserted kind-by-kind in tests, so a missing ABI fragment surfaces as a failing invariant rather than a silently generic message"
  - "Exhaustiveness invariant test: a Record<DecodedBridgeErrorKind, DecodeBridgeErrorInput> fixture table that fails to TYPECHECK when a kind is added to the union without a fixture, plus runtime assertions that every kind is reachable, no two branches collide, and no mapped-kind fixture falls through to 'unknown'"
  - "Totality assertion over non-error inputs (undefined, null, plain Error, bare string, plain object, empty-cause BaseError) — never throws, never returns nullish"

requirements-completed: [ERR-01, ERR-02, ERR-03, ERR-04, ERR-05, ERR-06, ERR-07, ERR-08, ERR-09]

coverage:
  - id: D1
    description: "Five Tier-1 errors each resolve to their own message carrying the real decoded evidence: BridgeMessageAlreadyProcessed (messageId), InvalidDestinationChainId (expected + received chain id), InvalidBridgeTxInputs (recipient + 6-decimal amount), SafeERC20FailedOperation (token address, kind 'token-operation-failed'), ERC20InsufficientAllowance (6-decimal allowance + needed, kind 'insufficient-allowance')"
    requirement: "ERR-01"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#decodes a BridgeMessageAlreadyProcessed revert into a human sentence naming the messageId"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#decodes InvalidDestinationChainId naming both the expected and received chain id"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#decodes InvalidBridgeTxInputs naming the supplied recipient and amount"
        status: pass
    human_judgment: false
  - id: D2
    description: "SafeERC20FailedOperation resolves to kind 'token-operation-failed' naming the token address, never falling through to 'unknown'"
    requirement: "ERR-04"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#decodes SafeERC20FailedOperation as token-operation-failed naming the token address"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#the generic unknown kind is reachable only for an unrecognised selector — no mapped-kind fixture falls through to it"
        status: pass
    human_judgment: false
  - id: D3
    description: "ERC20InsufficientAllowance directs the user to re-run approve, renders both amounts via formatUnits(value, 6), never prints the raw undivided digit strings, and still produces a clean sentence when args are absent (no 'undefined', no empty parenthetical)"
    requirement: "ERR-03"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#decodes ERC20InsufficientAllowance with 6-decimal renderings, directing the user to re-run approve"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#ERC20InsufficientAllowance with args undefined still directs to re-run approve without printing undefined or an empty parenthetical"
        status: pass
      - kind: other
        ref: "grep -c 'formatUnits(.*18\\|parseUnits(.*18' ui/src/lib/decode-bridge-error.ts → 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "All eleven named-but-unmapped custom errors resolve to kind 'unmapped-custom-error' with one shared message naming the real decoded error name; NotRelayer reaches it purely by fall-through with no special-case branch anywhere in the module (D-05)"
    requirement: "ERR-01"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#decodeBridgeError — Tier 2 unmapped-custom-error (11 table-driven cases)"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#NotRelayer has no special-case branch anywhere in the decode chain (D-05)"
        status: pass
      - kind: other
        ref: "grep -v '^ *[/*]' ui/src/lib/decode-bridge-error.ts | grep -c 'NotRelayer' → 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "A wallet rejection resolves to kind 'wallet-rejected', distinct from every on-chain failure kind, detected from viem's typed UserRejectedRequestError with a bare EIP-1193 code 4001 as the documented narrow secondary"
    requirement: "ERR-05"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#a UserRejectedRequestError anywhere in the cause chain resolves to kind: wallet-rejected"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#an error whose only rejection signal is a numeric code of 4001, with no typed class, still resolves to wallet-rejected"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#wallet-rejected is distinct from every on-chain failure kind"
        status: pass
    human_judgment: false
  - id: D6
    description: "Revert data that is absent, '0x', or '0X' resolves to kind 'out-of-gas' with its own specific message — never 'unknown', never 'revert-string' — detected by viem's `size` zero-byte-length semantics after lowercasing"
    requirement: "ERR-06"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#raw \"0x\" with no decoded data resolves to kind: out-of-gas, never unknown or revert-string"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#raw undefined with no decoded data resolves identically to raw \"0x\""
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#raw \"0X\" (uppercase prefix) classifies identically to \"0x\""
        status: pass
    human_judgment: false
  - id: D7
    description: "Panic(uint256) resolves to kind 'panic' with nine mutually distinct plain-language sentences for the nine documented codes, each naming the hex code; an undocumented code (0xff) still yields kind 'panic'"
    requirement: "ERR-07"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#all nine documented panic codes produce nine mutually distinct messages"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#an undocumented panic code still yields kind: panic, never kind: unknown"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#code 17 describes arithmetic overflow/underflow and contains 0x11"
        status: pass
    human_judgment: false
  - id: D8
    description: "Insufficient native gas resolves to kind 'insufficient-gas' naming the chain and Alchemy faucet URL selected by numeric chain id (84532 / 421614) only, with the ETH figure computed in wei via formatEther and rounded UP to 4 decimals; an unrecognised or absent chain id yields no faucet URL rather than a wrong one"
    requirement: "ERR-02"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#an explicit gasEstimate on Base Sepolia names the chain, the faucet, and the computed figure"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#an explicit gasEstimate on Arbitrum Sepolia names the chain and its own faucet"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#an unrecognised chainId yields a message containing neither faucet URL"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#an absent chainId yields a message containing neither faucet URL"
        status: pass
    human_judgment: false
  - id: D9
    description: "The gas figure is genuinely computed whenever either real source supplies it (explicit gasEstimate, or recovery from the walked cause chain's metaMessages), falls back to the fixed 0.0004 default only when neither does, and the defaulted wording never claims the figure was measured from this failure"
    requirement: "ERR-02"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#a figure recovered from metaMessages is used instead of the default, and differs from 0.0004"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#neither gasEstimate nor a parseable arguments block available falls back to the 0.0004 default, still naming the chain and faucet, without claiming it was measured"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#gas: 0n falls back to the 0.0004 default, never rendering 0 ETH or NaN"
        status: pass
    human_judgment: false
  - id: D10
    description: "The generic fallback exposes the raw revert data from `raw` or, when absent, from `signature`, lowercased and bounded to the 4-byte selector plus at most 64 further hex chars with an ellipsis; when neither is available it states in words that no revert data was returned. Error(string) reasons are bounded to 200 characters."
    requirement: "ERR-08"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#falls back to unknown for a 4-byte selector absent from bridgeErrorAbi, without throwing"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#a revert reason longer than 200 characters is truncated with an ellipsis"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#a Solidity revert string decodes to kind: revert-string containing the reason"
        status: pass
    human_judgment: false
  - id: D11
    description: "The whole decode chain plus the gas-shortfall helper live in the single file ui/src/lib/decode-bridge-error.ts, whose head comment documents it as intentionally narrow, extensible, and order-dependent (naming the two non-obvious ordering constraints); the chain is proven total, collision-free, and fully reachable across all ten kinds"
    requirement: "ERR-09"
    verification:
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#every declared kind is reachable from at least one fixture"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#the set of observed kinds across the whole table equals the full declared union"
        status: pass
      - kind: unit
        ref: "ui/src/lib/decode-bridge-error.test.ts#decodeBridgeError is total: it never throws and always returns a non-empty DecodedBridgeError"
        status: pass
      - kind: other
        ref: "ls ui/src/lib/decode-bridge-error*.ts | wc -l → 2"
        status: pass
    human_judgment: false
  - id: D12
    description: "The module reads as genuinely narrow and extensible to a future maintainer — appending a decoder and a kind is the documented extension path, and the in-code Alchemy faucet note flags the link-rot risk"
    verification: []
    human_judgment: true
    rationale: "ERR-09's 'reads as extensible' property is a judgement no automated check can make — the plan records this as an UNRESOLVED edge-probe row whose verification is structural only (one file, a head comment naming both properties, an append-only ordered array)."

duration: ~80min
completed: 2026-07-25
status: complete
---

# Phase 1 Plan 2: Full Ordered Decode Chain Summary

**All ten `DecodedBridgeErrorKind` branches implemented in one file — five Tier-1 errors carrying real decoded evidence, eleven Tier-2 names sharing one debuggable message, nine distinct Solidity panic sentences, a wallet-rejection and empty-data out-of-gas branch, and a genuinely computed native-ETH gas shortfall — proven total and collision-free by 46 fixture-driven tests.**

## Performance

- **Duration:** ~80 min (three task commits 17:17–17:22 +01:00; close-out summary/state pass completed in a follow-up session at 17:27 +01:00)
- **Started:** 2026-07-25T15:06:40Z
- **Completed:** 2026-07-25T16:27:32Z
- **Tasks:** 3 completed
- **Files modified:** 2 (0 created, 2 modified)

## Accomplishments

- **Tier 1 — five bespoke branches with real evidence:** `BridgeMessageAlreadyProcessed` names the messageId; `InvalidDestinationChainId` names both the expected and received chain id in `Errors.sol`'s declared parameter order; `InvalidBridgeTxInputs` names the recipient and the 6-decimal amount; `SafeERC20FailedOperation` gets its own `kind: 'token-operation-failed'` naming the token address; `ERC20InsufficientAllowance` gets `kind: 'insufficient-allowance'` naming the 6-decimal current allowance and needed amount and directing the user to re-run approve. Every branch omits its parenthetical entirely when `args` is absent rather than interpolating `undefined`.
- **Tier 2 — one shared message by pure fall-through (D-05):** `decodeUnmappedCustomError` name-checks nothing at all, so all eleven admin-only/invariant errors (`NotRelayer`, `RelayerCannotBeZeroAddress`, `TokenCannotBeZeroAddress`, `BridgeCannotBeZeroAddress`, `CallerIsNotBridge`, `BurningTokensDisallowedForUsers`, `OwnableUnauthorizedAccount`, `OwnableInvalidOwner`, `ReentrancyGuardReentrantCall`, `EnforcedPause`, `ExpectedPause`) land there with the real error name in parentheses. The `grep -c "NotRelayer"` static guard over non-comment lines returns 0.
- **Panic table — nine distinct plain-language sentences**, each quoting the hex code (Solidity documents these in hex; the decoded arg is decimal). An undocumented code such as `0xff` still returns `kind: 'panic'`.
- **Wallet rejection first in the chain (ERR-05):** viem's typed `UserRejectedRequestError` is the primary signal, with a bare EIP-1193 `code === 4001` anywhere in the walked chain as a deliberately narrow, in-code-documented secondary — the `bridge-card.tsx` `'user rejected'` substring match is NOT carried forward.
- **Empty-data out-of-gas (ERR-06):** classified by `size()` zero-byte-length semantics after lowercasing, so `undefined`, `'0x'` and `'0X'` are identical, and placed before every branch that reads decoded data because `decodeErrorResult` throws `AbiDecodingZeroDataError` on zero-length input.
- **Computed native-gas shortfall (ERR-02, D-07, D-08):** `computeGasShortfall` resolves `{ gas, feePerGas }` from three ordered sources, multiplies in wei, renders via `formatEther`, and rounds UP to 4 decimals in bigint arithmetic. It returns an `isComputed` flag so the copy for a defaulted figure reads "You'll typically need around 0.0004 ETH…" rather than "You need ~0.0004 ETH…", honouring the plan's prohibition on presenting a default as a measurement.
- **Exhaustiveness invariant (ERR-09):** a `Record<DecodedBridgeErrorKind, DecodeBridgeErrorInput>` fixture table that fails to *typecheck* if a kind is added without a fixture, plus runtime assertions that every kind is reachable, that the observed kind set equals the declared union, that no mapped-kind fixture reaches `'unknown'`, and that six non-error inputs (`undefined`, `null`, plain `Error`, bare string, plain object, empty-cause `BaseError`) all return a non-empty `DecodedBridgeError` without throwing.
- **Suite:** 46 tests / 172 assertions passing; `bun run typecheck` clean; both files lint clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Revert-data decoders — Tier 1, Tier 2, Panic table, bounded generic fallback** - `9e85e6a` (feat)
2. **Task 2: Non-revert decoders — wallet rejection, empty-data out-of-gas, computed native-gas shortfall** - `4ea8321` (feat)
3. **Task 3: Exhaustiveness invariant test and the ERR-09 narrow-and-extensible contract** - `9ec0f10` (test)

## Files Created/Modified

- `ui/src/lib/decode-bridge-error.ts` - grew from two working branches to all ten: `decodeWalletRejection`, `decodeEmptyRevertData`, `decodeInsufficientGas`, `decodePanic`, `decodeRevertString`, `decodeBridgeCustomError`, `decodeUnmappedCustomError`, terminal `decodeUnknown`; plus the `PANIC_MESSAGES` table, the `GAS_FAUCETS` chain-id lookup, `computeGasShortfall` / `extractGasArgsFromChain` / `parseGasArgsBlock` / `ceilToFourDecimalsEth`, and the finalised head comment
- `ui/src/lib/decode-bridge-error.test.ts` - grew from 6 to 46 tests: fixture builders (`createRevertedError`, `createPanicRevert`, `createErrorStringRevert`, `createEstimateGasErrorWithArgs`), a `describe` block per decoder group, the eleven-name Tier-2 table, the nine-code Panic table, and the exhaustiveness/totality invariant block

## Decisions Made

### The three gas-figure sources — which the tests exercise, and whether the `metaMessages` parse is worth keeping

All three are exercised, and the plan's `planner_flagged_decisions` correction to D-07 held up: `InsufficientFundsError`'s constructor really does take only `{ cause }`, so it classifies the failure and supplies no figure.

| # | Source | Exercised by | Verdict |
|---|--------|--------------|---------|
| 1 | Explicit `gasEstimate` on `DecodeBridgeErrorInput` | Base Sepolia + Arbitrum Sepolia tests (200 000 gas × 1.5 gwei → `0.0003`), and the `gas: 0n` boundary | **Primary.** Non-fragile; Phase 3's hook already holds `useSimulateContract`'s `data.request.gas` and its fee data. |
| 2 | `metaMessages` recovery off the walked cause chain | the `EstimateGasExecutionError`-wrapped test (500 000 gas × 2 gwei → `0.001`, asserted `!== 0.0004`) | **Keep as secondary, but it is the fragile one.** It parses viem's own `prettyPrint` output — two leading spaces, key, colon, padding, value — which is formatting, not API. It works against the installed `viem@2.55.5` and is proven by a fixture built from the real error class rather than a hand-written string, so a viem formatting change breaks the test rather than silently degrading the UI. Every failure mode (missing heading, unparseable `gas`, zero fee) is treated as *this source failing*, never as a zero. |
| 3 | Fixed `0.0004` default | the no-source test and the `gas: 0n` test | **Kept, and worded as a default.** `isComputed: false` switches the sentence to "You'll typically need around…", which is the binding `must_haves.prohibitions` constraint. |

### Final panic-code wording table

| Code | Decimal | Message (plus " (0xNN)." appended) |
|------|---------|-----------------------------------|
| `0x01` | 1 | An internal assertion failed unexpectedly |
| `0x11` | 17 | This operation caused a number to overflow or underflow |
| `0x12` | 18 | The contract tried to divide or take the modulo of a number by zero |
| `0x21` | 33 | The contract tried to convert a value into an enum type it doesn't support |
| `0x22` | 34 | The contract read a storage byte array that was encoded incorrectly |
| `0x31` | 49 | The contract tried to remove an item from an array that was already empty |
| `0x32` | 50 | The contract tried to access an array element that's out of bounds |
| `0x41` | 65 | The contract tried to allocate more memory than is allowed |
| `0x51` | 81 | The contract called an internal function variable that was never initialised |
| any other | — | An unexpected internal error occurred in the contract |

### Error names not present in `bridgeErrorAbi`

**No regression against Plan 01-01's 21-name assertion.** All 21 names still resolve, and every Tier-1/Tier-2 fixture encodes successfully against the generated ABI — which is exactly the point of encoding fixtures through `encodeErrorResult({ abi: bridgeErrorAbi })`: a missing fragment would fail the fixture build, not silently produce a generic message.

Two names are *deliberately* absent and must not be added: **`Error(string)`** and **`Panic(uint256)`**. These are Solidity built-ins, not bridge errors — viem's `decodeErrorResult` appends its own `solidityError`/`solidityPanic` fragments at decode time, so `ContractFunctionRevertedError` populates `data.errorName` for both without `bridgeErrorAbi` declaring them. The test file mirrors their well-known shape locally purely to *encode* fixtures, because viem does not publicly export those fragments.

### Other decisions

- **Panic wording is ours, not viem's.** viem's `panicReasons` lives in `viem/constants`, which is not in viem's public subpath export allow-list; importing it would have created a private-path dependency for text we want to control anyway.
- **Native ETH is not a 6-decimal token.** The shortfall uses `formatEther` + ceiling-to-4-decimals; `formatTokenAmount`/`formatUnits(value, 6)` is used only for the token amounts in `InvalidBridgeTxInputs` and `ERC20InsufficientAllowance`.
- **`walkChain` is deliberately not gated on `instanceof BaseError`,** because the code-4001 secondary must survive a wallet provider that attaches a plain `.cause` without extending viem's class. It is cycle-safe via a `seen` set.

## Deviations from Plan

None - plan executed exactly as written. Every task-level acceptance criterion and every plan-level `<verification>` check was re-run and passes (see Self-Check).

## Issues Encountered

One process issue, not a code issue: the three task commits landed but the plan's `<output>` SUMMARY.md was not written in the same session, leaving the plan in the `atomic_close_out_invariant`'s illegal partial state (production commits present, SUMMARY absent). Resolved by a follow-up close-out pass that re-ran the full verification set before writing this summary — no code changes were needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `decodeBridgeError` is feature-complete for Phase 3: every branch a bridge failure can hit is implemented, and the return shape (`{ kind, message, errorName?, rawData? }`) is unchanged from Plan 01-01, so Plan 01-03 and Phase 3 build on a stable contract.
- **Carried constraint on Phase 3 (T-02-02):** `message` may contain attacker-influenceable bytes (bounded raw hex, decoded args, a 200-char-capped revert reason). It must be rendered as a React text child and never via `dangerouslySetInnerHTML`.
- **Carried constraint on Phase 3 (D-07 reversibility, rated `costly`):** the orchestration hook should pass `gasEstimate: { gas, feePerGas }` from `useSimulateContract`'s `data.request.gas` and the fee data it submits with. Without it, every gas message degrades to the `metaMessages` parse or the `0.0004` default.
- **Known residual, unverified in this phase:** a wallet that reports rejection with neither viem's typed class nor EIP-1193 code 4001 would fall through to an on-chain-failure kind. No live wallet was available to test against; the code-4001 secondary is documented in-module as the deliberately narrow degradation.
- No blockers for 01-03 (pure `deriveFlowState()`), which touches a different module entirely.

---
*Phase: 01-pure-foundation-abi-error-mapping-flow-state-derivation*
*Completed: 2026-07-25*

## Self-Check: PASSED

Re-ran the complete verification set at close-out:

- `cd ui && bun test` → **46 pass / 0 fail**, 172 assertions, 1 file
- `cd ui && bun run typecheck` (`tsc --noEmit`) → exit 0, no output
- `grep -v '^ *[/*]' ui/src/lib/decode-bridge-error.ts | grep -c "NotRelayer"` → **0** (D-05)
- `grep -c "formatUnits(.*18\|parseUnits(.*18" ui/src/lib/decode-bridge-error.ts` → **0**
- `ls ui/src/lib/decode-bridge-error*.ts | wc -l` → **2** (chain not split, D-09)
- Both faucet URLs present (`alchemy.com/faucets/base-sepolia`, `alchemy.com/faucets/arbitrum-sepolia`), both chain ids present (`84532`, `421614`), plus `formatEther`, `0.0004`, `UserRejectedRequestError`, `InsufficientFundsError` all ≥ 1
- Head comment contains `narrow`, `extensible` and `ORDER`
- Alchemy faucet-terms note present in-module on `GAS_FAUCETS`
- Linter clean on both files
- All three task commits confirmed in `git log` (`9e85e6a`, `4ea8321`, `9ec0f10`)
