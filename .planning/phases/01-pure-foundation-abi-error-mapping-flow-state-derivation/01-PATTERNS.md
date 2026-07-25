# Phase 1: Pure Foundation — Pattern Map

**Mapped:** 2026-07-25
**Files analyzed:** 6 (3 new/generated, 3 modified/deleted)
**Analogs found:** 5 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `ui/wagmi.config.ts` (new) | config | batch/codegen | none in repo (first `@wagmi/cli` config) | no-analog — use RESEARCH.md/STACK.md-documented `foundry()` plugin shape |
| `ui/src/generated.ts` (new, generated output — not hand-authored) | config/generated | transform | `ui/src/lib/abis.ts` (the file it replaces) | role-match |
| `ui/scripts/generate-abi.ts` or `package.json` `"generate"` script (new) | utility | batch | no existing Bun wrapper script in `ui/`; relayer has no equivalent either | no-analog — keep minimal per D-01 |
| `ui/src/lib/decode-bridge-error.ts` (new — error-mapping module) | utility | transform | `relayer/src/message.ts` (`reconstructMessage`/`hashBridgeMessage` — pure functions, object params, explicit return types, thrown `Error` with interpolated evidence) | role-match |
| `ui/src/lib/derive-flow-state.ts` (new — `deriveFlowState()`) | utility | transform | `ui/src/components/bridge-card.tsx` `getActionState()` (lines 476-520) — pure discriminated-returns function driven by boolean/status flags | role-match |
| `ui/src/lib/abis.ts` (deleted, D-02) | config | n/a | — | deletion target, no analog needed |
| `collateral-abi.json`, `synthetic-abi.json` (deleted, D-02) | config | n/a | — | deletion target, no analog needed |
| test files for the above (new) | test | n/a | `relayer/test/message.test.ts` (Bun test + inline `createMessage()`/`createLog()` fixture builders) | exact |

## Pattern Assignments

### `ui/src/lib/decode-bridge-error.ts` (utility, transform)

**Analog:** `relayer/src/message.ts` (pure-function shape) + `relayer/src/submitter.ts` (error-message extraction shape)

**Imports pattern** (`relayer/src/message.ts` lines 1-7):
```typescript
import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem"
```
For the error-mapping module, the equivalent viem imports are `decodeErrorResult`, `BaseError`, `ContractFunctionRevertedError`, `InsufficientFundsError` (per `.planning/research/STACK.md` — read that file directly before implementing; this agent did not re-derive the exact API surface, STACK.md already confirms it).

**Object-parameter + explicit-return-type pattern** (`relayer/src/message.ts` lines 34-40):
```typescript
export function reconstructMessage({
  log,
  canonicalToken,
}: {
  log: BridgeTxInitiatedLog
  canonicalToken: Address
}): { message: BridgeMessage; messageId: Hex } {
```
Apply the same shape to the decode function, e.g. `decodeBridgeError({ error }: { error: unknown }): { message: string; errorName?: string }`.

**Plain-sentence-plus-evidence error message pattern** (`relayer/src/message.ts` lines 65-67):
```typescript
throw new Error(
  `BridgeTxInitiated messageId mismatch: emitted ${args.messageId}, computed ${computedMessageId}`,
)
```
This is the closest existing precedent in the codebase for "plain sentence + parenthetical/inline raw evidence" (D-06) — interpolate real decoded values directly into the string, don't abstract them behind generic placeholders.

**Fallback/extraction pattern for unknown errors** (`relayer/src/submitter.ts` lines 144-146):
```typescript
function getErrorMessage({ error }: { error: unknown }): string {
  return error instanceof Error ? error.message : String(error)
}
```
Mirrors the Tier-2 generic fallback need (D-05) — a small last-resort helper that always returns a string, never throws.

**Small isolated helper pattern for a sub-computation** (`relayer/src/submitter.ts` — `getRetryDelayMs({ attempt })` is called inline within `submitMessage`, defined as its own top-level function). Use the same shape for the D-07 computed-gas helper (e.g. `computeGasShortfallEth({ gas, gasPrice }): string`) — a standalone function in the same module, not inlined, not split into a separate file (per D-09).

**No barrel re-export** — module is imported directly as `@/lib/decode-bridge-error`, consistent with "no barrel files" convention already followed by `ui/src/lib/bridge.ts` and `ui/src/lib/config.ts`.

---

### `ui/src/lib/derive-flow-state.ts` (utility, transform)

**Analog:** `ui/src/components/bridge-card.tsx` `getActionState()` (lines 476-520)

**Discriminated pure-function shape** (lines 476-520):
```typescript
function getActionState({
  isConnected,
  isDeployed,
  isCorrectChain,
  isSwitching,
  hasValidAmount,
  hasValidRecipient,
  needsApproval,
  isApproving,
  isApprovalConfirming,
  isBridgePromptOpen,
  isBridgeConfirming,
  activeMessage,
  hasInitiatedMessage,
}: ActionStateInput) {
  if (!isConnected)
    return { label: 'Connect wallet', isDisabled: false, isDone: false }
  if (!isDeployed)
    return { label: 'Bridge undeployed', isDisabled: true, isDone: false }
  if (!isCorrectChain)
    return {
      label: isSwitching ? 'Switching network…' : 'Switch network',
      isDisabled: isSwitching,
      isDone: false,
    }
  // ... sequential guard clauses, most-blocking-condition-first, single return shape throughout
  return { label: 'Bridge', isDisabled: false, isDone: false }
}
```

**Companion input-type pattern** (lines 522-535):
```typescript
interface ActionStateInput {
  isConnected: boolean
  isDeployed: boolean
  isCorrectChain: boolean
  // ... one boolean/status field per branch condition
  activeMessage?: BridgeMessage
  hasInitiatedMessage: boolean
}
```

`deriveFlowState()` should follow the same shape: a single object parameter (named input interface, explicit return type), a sequence of guard-clause branches ordered by precedence, and a single consistent shape for every return value (here a discriminated union over the flow-state cases per FLOW-01/FLOW-05, rather than `getActionState`'s flat `{label, isDisabled, isDone}` — `getActionState` is a *shape* reference only, not a literal template, per CONTEXT.md's explicit note that it's a reference, not code to copy verbatim). CONTEXT.md flags the exact discriminated-union shape as unresolved — resolve using FLOW-01/FLOW-05 in `.planning/REQUIREMENTS.md`.

**Note:** `getActionState` is **not exported** from `bridge-card.tsx` (it's a private, in-file helper) — confirms the codebase's convention of pure helper functions living alongside or near their primary caller, but `deriveFlowState()` must be exported from its own file since Phase 2/3 wire it in.

---

### `ui/wagmi.config.ts` (config, batch/codegen) — no analog

No existing `@wagmi/cli` config exists anywhere in the repo — `@wagmi/cli` is already a devDependency (`ui/package.json` line ~22: `"@wagmi/cli": "latest"`) but unconfigured. This is a genuinely new pattern for the codebase. Do not invent the API surface from scratch — `.planning/research/STACK.md` is cited in CONTEXT.md as already containing the confirmed API shape (`foundry()` plugin, `include` array, `react()` plugin for named exports). Read STACK.md directly during planning/implementation rather than guessing the config shape here.

Known concrete constraints from CONTEXT.md (D-03, D-04):
- `foundry` plugin `include`: `CollateralTokenBridge.sol/**`, `SyntheticTokenBridge.sol/**`, `WrappedToken.sol/**`, `IERC20.sol/**`
- Output: `ui/src/generated.ts`, replacing `ui/src/lib/abis.ts`
- `react()` plugin still runs, producing normal per-contract named exports (`collateralTokenBridgeAbi`, `syntheticTokenBridgeAbi`, `wrappedTokenAbi`, `ierc20Abi`)

---

### `ui/package.json` — new `"generate"` script

**Analog:** the existing script block itself (`ui/package.json` lines 5-11):
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "tsc --noEmit",
  "typecheck": "tsc --noEmit"
},
```
Add `"generate": "wagmi generate"` following the same flat, single-command-per-script convention — no wrapper shell script, no pre/post hooks (D-01: "minimal wrapper — it only invokes `wagmi generate`").

---

### Test files (test, n/a)

**Analog:** `relayer/test/message.test.ts` (full file read, 84 lines)

**Structure to copy:**
```typescript
import { describe, expect, test } from "bun:test"
import type { Address, Hex } from "viem"
import { canonicalUsdcAddress } from "../src/config"
import {
  hashBridgeMessage,
  reconstructMessage,
  type BridgeTxInitiatedLog,
  type BridgeMessage,
} from "../src/message"

describe("bridge message integrity", () => {
  test("reconstructs a message and accepts its canonical hash", () => {
    const message = createMessage()
    const messageId = hashBridgeMessage({ message })
    const result = reconstructMessage({
      log: createLog({ message, messageId }),
      canonicalToken: canonicalUsdcAddress,
    })

    expect(result).toEqual({ message, messageId })
  })

  test("rejects an emitted message id that does not match", () => {
    // ...
    expect(() => reconstructMessage({ ... })).toThrow("messageId mismatch")
  })
})

function createMessage(): BridgeMessage { /* fixture builder, inline in test file */ }
function createLog({ message, messageId }: { message: BridgeMessage; messageId: Hex }): BridgeTxInitiatedLog { /* fixture builder */ }
```

Apply directly: `describe`/`test`/`expect` from `bun:test`; fixture/builder functions (`createMessage()`-style) defined inline at the bottom of the test file, not in a shared test-utils file; `expect(fn).toThrow("substring")` for error-path assertions; explicit `Address`/`Hex` `type`-only imports from viem. Both `decode-bridge-error.test.ts` and `derive-flow-state.test.ts` should follow this exact structure — likely with builder functions like `createDecodedError()`/`createSimulateFailure()` and `createFlowStateInput()` respectively.

---

## Shared Patterns

### Object parameters + explicit return types (project-wide, CONVENTIONS.md-enforced)
**Source:** `relayer/src/message.ts` lines 34-40, `relayer/src/submitter.ts` lines 25-33
**Apply to:** every exported function in `decode-bridge-error.ts` and `derive-flow-state.ts`
```typescript
export function reconstructMessage({
  log,
  canonicalToken,
}: {
  log: BridgeTxInitiatedLog
  canonicalToken: Address
}): { message: BridgeMessage; messageId: Hex } { ... }
```

### Pure-function error-to-string extraction
**Source:** `relayer/src/submitter.ts` lines 144-146 (`getErrorMessage`)
**Apply to:** the Tier-2 generic fallback path in `decode-bridge-error.ts`
```typescript
function getErrorMessage({ error }: { error: unknown }): string {
  return error instanceof Error ? error.message : String(error)
}
```

### Bun test + inline fixture builders
**Source:** `relayer/test/message.test.ts` (whole file)
**Apply to:** all Phase 1 test files
```typescript
import { describe, expect, test } from "bun:test"
// ... describe/test blocks, then fixture builder functions at file bottom
```

### No barrel files
**Source:** codebase-wide convention (`ui/src/lib/bridge.ts`, `ui/src/lib/config.ts` each imported by specific path, e.g. `import { addresses, rpcUrls, scanConfiguration } from '@/lib/config'` in `ui/src/hooks/use-bridge-messages.ts` line 15)
**Apply to:** import `decode-bridge-error.ts` and `derive-flow-state.ts` directly by path from Phase 2/3 call sites — do not create an index/barrel file.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `ui/wagmi.config.ts` | config | batch/codegen | First `@wagmi/cli` config in the repo — no prior codegen config exists. Use `.planning/research/STACK.md` (explicitly cited in CONTEXT.md canonical_refs) for the confirmed API shape instead of a codebase analog. |
| ABI-generation wrapper script | utility | batch | No existing Bun-script-triggers-codegen precedent in `ui/` or `relayer/`. Keep it to the single `"generate": "wagmi generate"` npm-script line per D-01 — no separate `.ts` wrapper file is needed unless the planner decides otherwise. |

## Metadata

**Analog search scope:** `ui/src/`, `ui/src/lib/`, `ui/src/components/`, `ui/src/hooks/`, `relayer/src/`, `relayer/test/`, `contracts/src/Errors.sol`
**Files scanned:** `ui/package.json`, `ui/src/lib/abis.ts`, `ui/src/lib/bridge.ts`, `ui/src/lib/config.ts` (referenced only), `ui/src/components/bridge-card.tsx`, `ui/src/hooks/use-bridge-messages.ts`, `relayer/src/message.ts`, `relayer/src/submitter.ts`, `relayer/test/message.test.ts`, `contracts/src/Errors.sol`
**Pattern extraction date:** 2026-07-25
</content>
