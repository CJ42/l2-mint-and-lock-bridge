# Phase 3: Flow Orchestration & UI Integration - Pattern Map

**Mapped:** 2026-07-25
**Files analyzed:** 6 (3 new, 3 modified)
**Analogs found:** 6 / 6

**Grounding note:** Phases 1 and 2 are planned but not executed. `ui/src/lib/generated.ts`,
`ui/src/lib/decode-bridge-error.ts`, `ui/src/lib/derive-flow-state.ts`, and
`ui/src/hooks/use-relay-status.ts` do not exist on disk. Their contracts below are quoted
verbatim from `01-03-PLAN.md` (`<resolved_open_questions>`, "Gray area 3/4") and `02-03-PLAN.md`
(Task 2 `<interface_context>`), not invented. They are **consumed, not analog-matched** — do not
treat their absence as a missing-analog gap.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `ui/src/hooks/use-bridge-flow.ts` | hook (orchestration) | event-driven / request-response (imperative async sequence) | `ui/src/hooks/use-bridge-messages.ts` | role-match (result-object shape, polling/effect conventions) — no existing imperative-multi-tx-sequence hook exists, so `bridge-card.tsx`'s current `approve()`/`bridge()`/`handleAction()` (being deleted) is the closest transaction-sequencing analog |
| `ui/src/lib/flow-storage.ts` | utility (localStorage persistence) | file-I/O (browser storage read/write) | none — first persistence helper in codebase | no analog (see "No Analog Found") |
| `ui/src/components/stepper.tsx` | component (presentational) | transform (renders `BridgeFlowState.steps` → DOM) | `ui/src/components/message-explorer.tsx` (`MessageRow`'s status badge) | role-match (badge/status-to-copy mapping pattern) |
| `ui/src/components/action-button.tsx` | component (presentational) | transform (renders `BridgeFlowState.phase` → DOM) | `bridge-card.tsx`'s `<button className={styles.action}>` block (lines 353-374, being deleted/replaced) | exact (this is literally the code being extracted) |
| `ui/src/components/spinner.tsx` | component (presentational, shared glyph) | transform | `bridge-card.tsx`'s `SwapIcon()` (lines 415-433) | exact (inline-SVG icon convention) |
| `ui/src/components/bridge-card.tsx` (refactor) | component (controlled form) | request-response (wallet writes) | itself (pre-refactor version) — controlled-input pattern precedent is `activeMessageId`/`onActiveMessageChange` lift-up already in this file | exact (in-place refactor) |
| `ui/src/app/page.tsx` (modified) | component (page/composition root) | transform (wires hook → children) | itself (pre-refactor version) — `useBridgeMessages()` call + prop-drilling is the existing precedent for `useBridgeFlow()` | exact |

## Pattern Assignments

### `ui/src/hooks/use-bridge-flow.ts` (hook, imperative async sequence)

**Analog:** `ui/src/hooks/use-bridge-messages.ts` (result-object shape, `'use client'`, effect
conventions) + the transaction logic currently in `ui/src/components/bridge-card.tsx` (being
deleted from there and rebuilt here as one straight-line `async function`).

**Imports pattern** (from `use-bridge-messages.ts` lines 1-18, adapted):
```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseEventLogs, parseUnits, isAddress, getAddress, type Address, type Hex } from 'viem'
import { useAccount, useConfig, useSwitchChain } from 'wagmi'
import { simulateContract, writeContract, waitForTransactionReceipt, getTransactionReceipt } from 'wagmi/actions'

import { decodeBridgeError } from '@/lib/decode-bridge-error'          // Phase 1 — type + value import
import { deriveFlowState, type BridgeFlowState } from '@/lib/derive-flow-state' // Phase 1
import { useRelayStatus } from '@/hooks/use-relay-status'              // Phase 2
import { collateralTokenBridgeAbi, syntheticTokenBridgeAbi, ierc20Abi } from '@/lib/generated' // Phase 1
import { chains, directions, type BridgeMessage } from '@/lib/bridge'
import { addresses, isBridgeDeployed } from '@/lib/config'
```

**Result-object pattern** — follow `UseBridgeMessagesResult`'s exact shape convention
(`use-bridge-messages.ts` lines 61-66):
```typescript
interface UseBridgeMessagesResult {
  messages: BridgeMessage[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}
```
`use-bridge-flow.ts` should mirror this: a single named-export function returning one plain
object with explicit fields (`flowState: BridgeFlowState`, plus `direction`/`amount`/`recipient`
setters per D-05, plus a `runFlow`/`retry` action) — never a tuple, never a class.

**Core imperative-sequence pattern** — copy directly from `03-RESEARCH.md` Pattern 1 (already
verified against installed `@wagmi/core@2.22.1`/`viem@2.55.5` source, not training-data recall):
```typescript
const config = useConfig()

async function runFlow() {
  setApprove({ isPrompting: true, isConfirming: false, isConfirmed: false })
  let approveHash: Hex
  try {
    approveHash = await writeContract(config, {
      abi: ierc20Abi, address: tokenAddress, functionName: 'approve',
      args: [bridgeAddress, amount], chainId: direction.originChainId,
    })
  } catch (cause) {
    setFailure({ failure: decodeBridgeError({ error: cause }), failedStep: 'approve' })
    return
  }
  setApprove((s) => ({ ...s, isPrompting: false, isConfirming: true }))
  const approveReceipt = await waitForTransactionReceipt(config, { hash: approveHash, chainId: direction.originChainId })
  setApprove((s) => ({ ...s, isConfirming: false, isConfirmed: true }))

  // D-01: simulate only after approve confirms
  let simulation
  try {
    simulation = await simulateContract(config, {
      abi: bridgeAbi, address: bridgeAddress, functionName: direction.action,
      args: [recipient, amount], chainId: direction.originChainId,
    })
  } catch (cause) {
    setFailure({ failure: decodeBridgeError({ error: cause, chainId: direction.originChainId }), failedStep: 'submit' })
    return
  }

  setBridge({ isPrompting: true, isConfirming: false, isConfirmed: false })
  let bridgeHash: Hex
  try {
    bridgeHash = await writeContract(config, simulation.request)
  } catch (cause) {
    setFailure({ failure: decodeBridgeError({ error: cause, chainId: direction.originChainId }), failedStep: 'submit' })
    return
  }
  setBridge((s) => ({ ...s, isPrompting: false, isConfirming: true }))
  const bridgeReceipt = await waitForTransactionReceipt(config, { hash: bridgeHash, chainId: direction.originChainId })

  if (bridgeReceipt.status === 'reverted') {
    // D-04: replay pinned to blockNumber, reuse simulateContract per 03-RESEARCH.md Pattern 2
    return
  }
  setBridge((s) => ({ ...s, isConfirming: false, isConfirmed: true }))
  // extract messageId from bridgeReceipt.logs — see messageId-extraction pattern below
}
```

**messageId extraction pattern** — copy exactly from `bridge-card.tsx` lines 128-138 (currently a
`useEffect`, becomes inline code inside `runFlow()`):
```typescript
const initiatedLogs = parseEventLogs({
  abi: bridgeAbi, // Phase 1's generated ABI, not the deleted ui/src/lib/abis.ts
  eventName: 'BridgeInitiated',
  logs: bridgeReceipt.logs,
})
const messageId = initiatedLogs[0]?.args.messageId
```

**Pure helpers to move, unchanged** — copy verbatim from `bridge-card.tsx` lines 435-467
(`parseAmount`, `parseRecipient`, `validateBridge`); these are already 6-decimal-correct
(`parseUnits(value, 6)`) and must not be rewritten:
```typescript
function parseAmount(value: string) {
  if (!value || !/^\d*(\.\d{0,6})?$/.test(value)) return undefined
  try {
    const amount = parseUnits(value, 6)
    return amount > 0n ? amount : undefined
  } catch {
    return undefined
  }
}
```

**Error handling pattern** — every `writeContract`/`simulateContract` call site gets its own
`try/catch`, per Pitfall 1 in `03-RESEARCH.md` ("never skip the write-side catch because
simulation already proved success"). Route every caught error through `decodeBridgeError()`
(Phase 1), never `getTransactionError()` (the old ad-hoc string-matching helper at
`bridge-card.tsx` lines 469-474, which this phase deletes rather than reuses).

**`deriveFlowState()` input contract — copy field names exactly, do not invent:**
```typescript
// Source: 01-03-PLAN.md <resolved_open_questions>, verbatim
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
Field-name mapping the hook must produce for the input object: `isConnected`, `isDeployed`,
`isCorrectChain`, `isSwitchingChain`, `hasValidAmount`, `hasValidRecipient`, `approve`/`bridge`
each `{ isPrompting, isConfirming, isConfirmed }`, `relay: { isInitiated, isFinalized }`
(`isInitiated` = messageId known locally; `isFinalized` = `useRelayStatus().status === 'finalized'`),
`failure?: DecodedBridgeError` (cleared on fresh `runFlow()` or direction flip per D-08).

**`useRelayStatus()` contract to consume verbatim** (Phase 2, `02-03-PLAN.md` line 214-218):
```typescript
export interface UseRelayStatusResult {
  status: 'pending' | 'finalized'
  destinationTransactionHash?: Hex
  transportMode: TransportMode
  error: string | null
  refresh: () => Promise<void>
}
export function useRelayStatus({ messageId, destinationChainId }: { messageId?: Hex; destinationChainId?: number }): UseRelayStatusResult
```

---

### `ui/src/lib/flow-storage.ts` (utility, new — no analog)

**No analog in codebase.** Follow `03-RESEARCH.md` Architecture Patterns Pattern 4's recommended
shape and the codebase's existing one-small-pure-helper-per-concern convention (matches how
`decode-bridge-error.ts`/`derive-flow-state.ts`/`relay-status.ts` each extract one concern into
its own file, per `03-RESEARCH.md`'s Recommended Project Structure). Named exports only, object
parameters for read/write functions, explicit return types — same conventions as every other
`ui/src/lib/*.ts` file. Key format: `bridge-flow:${address}`. Store `amount` as the raw decimal
string, never as `bigint` (Pitfall 4 in `03-RESEARCH.md`: `JSON.stringify` cannot serialize
`bigint`).

---

### `ui/src/components/stepper.tsx` (component, presentational)

**Analog:** `ui/src/components/message-explorer.tsx`'s `MessageRow` status-badge pattern (lines
102-116) — closest existing precedent for "map a status union to a styled span with conditional
class + copy," even though the stepper's states are richer (3-state circle vs 2-state badge).

**Imports pattern** (adapted from `message-explorer.tsx` lines 1-12):
```typescript
'use client'

import type { BridgeFlowState, BridgeStep } from '@/lib/derive-flow-state' // type-only

import { Spinner } from './spinner'
import styles from './stepper.module.css'
```

**Status-to-class mapping precedent** (`message-explorer.tsx` lines 102-116):
```typescript
<span className={message.status === 'finalized' ? styles.finalized : styles.pending}>
  {message.status === 'finalized' ? 'Finalized' : isDelayed ? 'Pending — relaying' : 'Pending'}
</span>
```
`stepper.tsx` must read **only** `BridgeFlowState.steps` (an array of three `BridgeStep`s) —
never re-derive `upcoming`/`pending`/`confirmed` from any other flag (BTN-01/FLOW-01 constraint,
`03-RESEARCH.md` Anti-Patterns: "Second derivation of button/stepper state"). `upcoming` = a step
whose status is `idle`; `pending`/`processing` both render the blue spinner state (per UI-SPEC's
STEP-03 copy-mapping table collapsing wallet-prompt and receipt-await sub-phases into one visual
state where the spec doesn't distinguish them); `confirmed` = the green check.

**Copy source** — hardcode the three sentences directly from `03-UI-SPEC.md`'s STEP-03 mapping
table (do not invent alternate copy):
- pending: *"Your transaction is being submitted to the network…"*
- processing: *"Your transaction has been picked up and is being processed…"*
- confirmed: *"Your transaction has completed successfully!"*

**No inline error styling** — the stepper never renders red/failed per-step; on `phase: 'failed'`
every non-`confirmed` step renders as `upcoming` (already true because `derive-flow-state.ts`
guarantees this per the FLOW-05 invariant quoted above — `stepper.tsx` needs zero failure-specific
branching of its own).

---

### `ui/src/components/action-button.tsx` (component, presentational)

**Analog:** `ui/src/components/bridge-card.tsx` lines 353-374 (the exact block being extracted) —
this is the strongest possible analog since the code is moving, not being newly invented.

**Current code to extract and adapt** (`bridge-card.tsx` lines 353-374):
```typescript
{action.isDone && completedTransactionHash ? (
  <a
    className={styles.action}
    href={getExplorerUrl(activeMessage?.destinationChainId ?? direction.originChainId, completedTransactionHash)}
    target="_blank"
    rel="noreferrer"
  >
    Done ✓ — view on explorer
  </a>
) : (
  <button
    type="button"
    className={styles.action}
    onClick={() => void handleAction()}
    disabled={action.isDisabled}
  >
    {action.label}
  </button>
)}
```
`action-button.tsx` reformulates this as a standalone component reading `BridgeFlowState.phase`
directly (BTN-01 — zero branching beyond a `switch`/lookup table over `phase`), taking an
`onClick`/`href`/`explorerUrl` prop from the parent for the anchor-vs-button dual rendering this
block already demonstrates. Copy/variant/icon/spinner comes from `03-UI-SPEC.md`'s full state
table (14 rows) — do not re-derive any of those fourteen labels from raw flags; they are only
ever read off `phase` (+ the `approving`/`submitting`/`wrong-network` sub-discriminators the plan
is free to name, per D-06 Claude's Discretion).

**CSS class to extend, not replace** (`bridge-card.module.css` `.action`, lines 258-290):
```css
.action {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  border: 1px solid var(--blue);
  border-radius: var(--radius);
  color: var(--white);
  background: var(--blue);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-decoration: none;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease;
}
.action:hover:not(:disabled) { background: var(--blue-strong); border-color: var(--blue-strong); }
.action:disabled { border-color: var(--border); color: var(--muted); background: var(--surface); cursor: not-allowed; }
```
`action-button.module.css` should compose this base class plus one new `.success` variant (green
border/accent per `03-UI-SPEC.md` Color section — `--green`/`--green-soft`/`--green-line`, new
tokens to add to `globals.css`), matching the naming convention already used for `--blue-soft`/
`--blue-line`.

---

### `ui/src/components/spinner.tsx` (component, shared glyph)

**Analog:** `bridge-card.tsx`'s `SwapIcon()` (lines 415-433) — the exact inline-SVG convention
`03-UI-SPEC.md`'s Design System table names as the icon precedent to follow ("hand-drawn inline
SVG, 16×16 viewBox, `stroke="currentColor"`, `strokeWidth="1.4"`, round caps/joins,
`aria-hidden="true"`").

**Pattern to copy exactly:**
```typescript
function SwapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 5.25h11.25M9.75 2.25l3 3M14.5 10.75H3.25M6.25 13.75l-3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```
`spinner.tsx` follows this shape (16px SVG, `aria-hidden="true"`, `currentColor` stroke) but adds
a CSS `@keyframes` rotation (`spinner.module.css`, no JS animation) and accepts one color-mode
prop so the same component serves both the stepper's blue-on-white use and the action button's
white-on-blue use (`03-UI-SPEC.md` Design System: "One component, two color props — not two
separate hand-rolled spinners").

---

### `ui/src/components/bridge-card.tsx` (refactor — controlled form)

**Analog:** itself, pre-refactor. The controlled-prop-and-callback pattern to extend is already
present for `activeMessageId`:
```typescript
interface BridgeCardProps {
  messages: BridgeMessage[]
  activeMessageId?: Hex
  onActiveMessageChange: (messageId: Hex | undefined) => void
}
```
Per D-05, every input (`directionKey`, `amountInput`, `recipientInput`) moves out of local
`useState` and becomes a prop sourced from `use-bridge-flow.ts`'s return value, following this
exact prop-plus-callback shape rather than introducing new patterns (context, reducers, etc. —
explicitly rejected in `03-CONTEXT.md` D-05).

**Deletions (exact line ranges, verified by direct read of current file):**
- `getActionState()` — lines 476-520
- `ActionStateInput` interface — lines 522-536
- `approveHash`/`bridgeHash` `useState` — lines 51-52
- `handleAction()`/`approve()`/`bridge()` — lines 155-215 (become the hook's `runFlow()`)
- Three separate error paragraphs — lines 345-351 (collapse into one banner reading
  `BridgeFlowState.failed.failure`)
- `flipDirection()`'s manual reset (`setApproveHash(undefined)`/`setBridgeHash(undefined)`) —
  moves into the hook per D-08

**ABI import migration (hard coupling, not just a rename):** `import { bridgeAbi, erc20Abi } from
'@/lib/abis'` (line 23) must become imports from Phase 1's `ui/src/lib/generated.ts`
(`collateralTokenBridgeAbi`, `syntheticTokenBridgeAbi`, `wrappedTokenAbi`, `ierc20Abi` — resolve
by name, never by array index, per `03-RESEARCH.md`'s Standard Stack table).

**Reusable, unchanged:** `ChainPanel` (lines 379-413), `SwapIcon` (moves/becomes shared
`Spinner`-adjacent convention but `SwapIcon` itself for the direction-flip button stays), the JSX
structure for the amount/recipient fields (lines 272-343) stays but inputs become
`value={props.amountInput}`/`onChange={props.onAmountInputChange}` instead of local state.

---

### `ui/src/app/page.tsx` (modified — composition root)

**Analog:** itself, pre-refactor. Existing precedent for lifting hook state up and prop-drilling
into `<BridgeCard>`:
```typescript
export default function HomePage() {
  const [activeMessageId, setActiveMessageId] = useState<Hex>()
  const { messages, isLoading, error } = useBridgeMessages()
  return (
    <main className={styles.main}>
      ...
      <div className={styles.top}>
        <div className={styles.hero}>
          ...
          <ul className={styles.facts}>...</ul>
        </div>
        <BridgeCard messages={messages} activeMessageId={activeMessageId} onActiveMessageChange={setActiveMessageId} />
      </div>
      <MessageExplorer messages={messages} activeMessageId={activeMessageId} isLoading={isLoading} error={error} />
    </main>
  )
}
```
Per D-05, add `const flow = useBridgeFlow()` (or destructured) here, and mount `<Stepper
steps={flow.flowState.steps} transportMode={...} />` directly after `styles.facts`'s closing
`</ul>` inside `styles.hero` (STEP-01's exact placement instruction), with `margin-top: 16px` per
`03-UI-SPEC.md`. Pass the flow hook's result down to `<BridgeCard>` as its new controlled props.
Re-verify `onActiveMessageChange` wiring — with D-05 the flow hook owns `messageId`/relay state,
so `MessageExplorer`'s `activeMessageId` prop source may need to come from `flow` instead of a
page-local `useState`.

## Shared Patterns

### `'use client'` + named exports only
**Source:** every existing hook/component file (`use-bridge-messages.ts` line 1, `bridge-card.tsx`
line 1, `message-explorer.tsx`).
**Apply to:** all six files in this phase — `'use client'` as the first line, no default exports
except `page.tsx`'s implicit Next.js page export, named exports for every hook/component/type.

### Object parameters for 2+ args, explicit return types
**Source:** `use-bridge-messages.ts`'s `scanChain({ client, bridgeAddress, chainId })`,
`readBlockTimestamp({ client, chainId, blockNumber })`; `bridge-card.tsx`'s
`validateBridge({ amount, balance })`.
**Apply to:** `use-bridge-flow.ts`'s internal helpers (`decodeMinedRevert({ config, simulation,
blockNumber, setFailure })` per `03-RESEARCH.md` Pattern 2), `flow-storage.ts`'s read/write
functions.

### Error rendering — never `dangerouslySetInnerHTML`
**Source:** carried threat constraint from Phase 1 (`01-03-PLAN.md` T-03-01, quoted in
`03-RESEARCH.md` Security Domain table) — decoded revert messages are attacker-influenceable and
must render as a plain React text child.
**Apply to:** the single error banner in the refactored `bridge-card.tsx`.

### CSS Modules co-location, kebab-case files, camelCase classNames
**Source:** `bridge-card.module.css` / `message-explorer.module.css` naming (`.card`, `.action`,
`.chainBalance`, `.inputShellInvalid`).
**Apply to:** `stepper.module.css`, `action-button.module.css`, `spinner.module.css` — one
`.module.css` per component, same directory, same kebab-case base filename.

### Badge/pill styling precedent for the transport-health pill
**Source:** `message-explorer.module.css` `.pending`/`.finalized` (lines 95-112):
```css
.pending, .finalized {
  display: inline-flex;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 600;
}
.pending { color: var(--orange); background: var(--orange-soft); }
```
**Apply to:** the transport-health pill inside `stepper.tsx` (`03-UI-SPEC.md`'s "Transport Health
Visibility" section) — reuse this exact pill shape (`padding`/`border-radius`/`font-weight`
values) with `--orange`/`--orange-soft` for `reconnecting`/`stale` and `--muted`/`--surface` for
`polling-fallback`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `ui/src/lib/flow-storage.ts` | utility | file-I/O (localStorage) | No existing file in this codebase reads/writes browser storage — `03-RESEARCH.md` Pattern 4 and Pitfalls 4/5 are the load-bearing reference instead of a codebase analog. Follow the general one-small-pure-helper-per-concern shape of `decode-bridge-error.ts`/`derive-flow-state.ts` (not yet on disk, but named as precedent by `03-RESEARCH.md`'s Recommended Project Structure) |

## Metadata

**Analog search scope:** `ui/src/components/`, `ui/src/hooks/`, `ui/src/lib/`, `ui/src/app/`
**Files scanned:** `bridge-card.tsx`, `bridge-card.module.css`, `use-bridge-messages.ts`,
`message-explorer.tsx`, `message-explorer.module.css`, `bridge.ts`, `page.tsx`,
`01-03-PLAN.md`, `02-03-PLAN.md` (contract quotes only, not analogs)
**Pattern extraction date:** 2026-07-25
