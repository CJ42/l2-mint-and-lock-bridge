# Feature Research

**Domain:** Cross-chain bridge transaction-flow UX (progress feedback, not bridge mechanics)
**Researched:** 2026-07-24
**Confidence:** MEDIUM (production-bridge behavior corroborated across 8 independent products; exact UI copy strings could not be pulled from live app source for most of them — see Sources — so patterns are HIGH confidence, verbatim wording is LOW-MEDIUM)

## Scope Note

This research is deliberately narrow per the milestone brief: it covers **only** the transaction-state feedback surface (stepper, per-step visual language, waiting/ETA communication, failure messaging, gas/allowance handling, refresh recovery). Bridge mechanics, liquidity, routing, and fee design are explicitly out of scope and not researched here — see `.planning/PROJECT.md` Out of Scope and `.planning/codebase/` for the existing system.

All findings below respect the hard constraints already locked in `.planning/PROJECT.md`: hand-built CSS Modules (no shadcn), no relayer/contract changes, coarse states only (no expandable internal detail), no backend service, and the fixed 3-step flow (Bridge Approved → Bridge tx submitted → Bridge tx relayed) where approve always runs.

## Feature Landscape

### Table Stakes (Users Expect These)

Features present in effectively every production bridge surveyed (Across, Hop, Stargate, Superbridge, Orbiter, Socket/Bungee, Arbitrum native bridge). Missing these makes the flow feel broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-step progress indicator (approve → submit → relay/fill) | Every surveyed bridge decomposes the flow into named steps rather than one opaque "loading" state — Across documents exactly this 3-part model (approve, deposit, fill); Superbridge documents approve→deposit→confirm | LOW | Already scoped as the fixed 3-step stepper; matches industry norm almost exactly |
| Distinct visual state per step (idle / active-pending / done / error) | Users scan steppers left-to-right for "where am I" — a checkmark vs spinner vs neutral dot is the baseline visual grammar across every product reviewed | LOW | Spec already defines blue spinner / green checkmark; add a third (error/red) state not in the original `TX_FLOW.md` spec but required by the "decode reverts" requirement — a step can't stay a blue spinner forever if the tx reverted |
| Per-step short status copy that changes with tx lifecycle (submitted → picked up/processing → confirmed) | Hop's `TxStatusModal` gates Pending→Complete on confirmations; wording changes at each transition rather than a static "loading…" | LOW | Matches spec exactly: pending / processing / confirmed copy is already defined in `TX_FLOW.md` and `PROJECT.md` |
| Action button state mirrors the stepper state (label + disabled + variant) | Every wallet-connected dApp does this; user should never be able to press "Bridge" while a step is in flight, and the button is the primary place attention is focused pre-confirmation | LOW | Already exists as `getActionState`; this milestone unifies it with the stepper off one state machine rather than two |
| Pre-flight simulation before wallet popup | `useSimulateContract` catching a revert before the wallet prompt is a documented wagmi pattern (wagmi discussions #2837, #3618); avoids the worst UX moment — a wallet popup for a doomed tx | MEDIUM | Already scoped. Needs care: `useWriteContract`'s internal simulation only decodes against the ABI passed to it, so cross-contract reverts need explicit `decodeErrorResult` with the right ABI (see Pitfalls in Architecture research if produced) |
| Self-serve link to view the transaction on a block explorer | Universal — Stargate explicitly tells users to independently verify via source+destination explorer using the tx hash rather than trust the in-app tracker alone; Hop has a dedicated explorer | LOW | Bridge card already links to explorer on completion; extend to link per-step (origin tx hash once submitted, destination tx hash once relayed) |
| Persisted "last active transaction" that survives a page refresh | Socket/Bungee explicitly persists pending transaction history in `localStorage` and highlights it until completion — this is the industry's answer to "user refreshes mid-bridge" | LOW-MEDIUM | No backend needed (respects hard constraint). Persist only the small identifier set (bridge tx hash, messageId, direction) to `localStorage`; on mount, rehydrate and let `useWaitForTransactionReceipt` / event watcher pick the in-flight tx back up. This is not currently in `PROJECT.md` Active scope — flag as a gap (see Gaps) |
| Insufficient-allowance handling that funnels back into "Approve" | Universal pattern — every bridge treats allowance as a gate, not an error; the UI should just re-render "Approve" as the next step, not surface a raw revert | LOW | Already scoped: "allowance too low → re-run approve" |
| Plain-language failure state distinct from the pending/success states | Users need a visually distinct terminal-failure state, not an indefinite spinner or a silent reset — general UX consensus (Cloud Four "Truth, Lies and Progress Bars") | LOW | Needs a fourth stepper visual (red/error) alongside the spec's blue spinner / green check — flag as an addition to the two-state spec in `TX_FLOW.md` |

### Differentiators (Competitive Advantage)

Where this project can visibly outperform production bridges — directly serving the stated goal of demonstrating calldata-level failure debugging to a technical reviewer.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Decoded custom-error messages with the evidence values inline (e.g. "This transfer was already relayed — messageId 0x1234…") | **This is the showpiece feature.** None of the 7 production bridges surveyed expose decoded contract errors to end users — Arbitrum's own troubleshooting docs are explicitly light on UI copy and instead point users to external dashboards (Retryables Dashboard) or "contact support with your tx hash." A UI that decodes `NotRelayer(address)` / `BridgeMessageAlreadyProcessed(bytes32)` / `InvalidDestinationChainId(uint256,uint256)` into readable sentences with the actual on-chain values *is* the differentiator a JD asking for "debugs a failed transaction by inspecting calldata" is looking for. | MEDIUM | Already scoped (`decodeErrorResult` against `collateral-abi.json`/`synthetic-abi.json`). The research finding is about *positioning*: this should be the most visually prominent part of the failure state, not a footnote — it's the one thing competitors visibly don't do |
| Pre-flight simulation catching the failure *before* the wallet even opens, with the same decoded-error UI as a post-submit failure | Most production bridges only decode/report errors after a tx reverts on-chain (post-facto). Doing the decode pre-flight and re-using the identical error component for both paths (simulate-caught vs on-chain-reverted) shows the error-mapping layer is a real abstraction, not a one-off `catch` block | LOW (given decode logic is already shared) | Reinforces the "errors and UI improve together" narrative from `TX_FLOW.md` |
| Small, explicitly-extensible gas/allowance error-mapping layer, visibly documented as narrow in a code comment | Signals engineering judgment (not over-building) to a reviewer reading the source — the opposite of the sprawling, half-finished error-handling code common in bridge UIs (see Anti-Features) | LOW | Already scoped; the differentiator is doing it narrowly and *documenting the boundary*, not doing more of it |
| Per-step explorer links (origin tx once submitted, destination tx once relayed) rather than only a final "Done" link | Table stakes at the *end* of a flow (every bridge has this); doing it live, per-step, mid-flow is less common — most bridges gate the destination-explorer link until the very end | LOW | Cheap addition once step-level hashes/messageId are already tracked in state |
| A visually distinct "step failed" state that names *which* step failed and offers the specific decoded reason at that step, rather than a single generic error banner below the form | Superbridge/Socket/Orbiter all use a single activity item or banner for status, not per-step failure attribution. Tying the decoded error to the specific stepper node makes the "at every moment the UI shows exactly which state" core value (from `PROJECT.md`) concretely visible | LOW-MEDIUM | Natural extension of the shared state machine — no new data, just better failure placement |

### Anti-Features (Commonly Requested, Often Problematic)

Patterns that look like natural additions but are explicitly ruled out by the hard constraints, by researched UX consensus, or both.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Fake/animated percentage progress bar for the relay wait | Feels "more informative" than a spinner; common instinct for the longest wait in the flow | UX literature is explicit: faking progress when true completion time is unknown creates a trust problem the moment the estimate is visibly wrong ("Truth, Lies and Progress Bars") — and relay time here has no reliable model to base a percentage on | Indeterminate spinner + honest plain-language copy ("being processed…"), exactly as already specified in `TX_FLOW.md` |
| Invented / hardcoded ETA countdown ("~2 minutes remaining") | Reviewers/users like a number; several production bridges show elapsed or rough estimates | Every source reviewed converges on the same point: bridge wait time depends on finality policy, confirmation depth, and relayer timing, not a fixed constant — a wrong countdown reads as broken software, worse than no countdown. This project's relayer has retry/backoff, so any fixed number would frequently be wrong | Show elapsed time ("started 45s ago") if anything, never a countdown promise; this matches the milestone's own instruction not to invent architecture |
| Expandable "raw relayer internals" panel (attempt counts, simulation failures, checkpoint state) | Feels like it would *further* demonstrate technical depth to a reviewer | **Explicitly out of scope per hard constraints.** Also genuinely bad UX for the primary audience (a person bridging tokens) — Orbiter/Hop/Stargate all keep the end-user surface coarse and push deep diagnostics to a separate explorer/support flow, never inline | Keep the 3 coarse states; if deeper debugging is ever needed, it belongs in dev tools/logs, not the transaction card |
| A hosted relayer-side status/WebSocket backend for push notifications | Would feel "more real-time" than polling/on-chain event watching | **Explicitly out of scope per hard constraints** — no backend service. Also unnecessary: `BridgeTxInitiated`→`BridgeFinalized` on-chain events already fully determine the 3 coarse states | Live on-chain event subscription (`watchContractEvent` via WebSocket, HTTP-fallback) — already scoped |
| Full transaction history/"Activity" drawer duplicating the existing message explorer | Superbridge and Socket both center their UI on a persistent "Activity" list rather than an inline stepper | The existing UI already has a message explorer for past transfers (`PROJECT.md` Validated); building a second, competing history surface duplicates it and dilutes the stepper as the focal point for the *current* transaction | Keep the stepper scoped to the single in-flight transaction; the existing message explorer remains the historical record |
| Auto-retry/auto-resubmit on failure without user action | Feels helpful — "just handle it for them" | Silent retries hide state changes from the user (violates the stated core value: "the user is never left guessing") and risk resubmitting with stale simulation results | Surface the decoded failure and let the user explicitly re-trigger (e.g. re-run approve, or press Bridge again) — matches existing "allowance too low → re-run approve" pattern |
| Skipping approval when allowance is already sufficient (the classic "optimize UX" instinct) | Fewer transactions = feels faster | **Explicitly decided against** in `PROJECT.md` Key Decisions — approving the exact amount every time keeps all 3 steps always executing, which is required for the stepper to be demonstrable and predictable | Approve-every-time is already the decision; do not "optimize" this away |
| Generic raw error string / wallet-native revert text (e.g. `execution reverted`) shown as the failure message | Zero extra engineering effort | Directly contradicts the milestone's core value and the differentiator this project is built to demonstrate; also the exact failure mode production bridges are criticized for ("user not well informed about status") | Always route through the decode layer; raw error text is a fallback of last resort only, and even then should be trimmed/short (existing `getTransactionError` already does basic trimming — extend, don't replace, with the decode layer) |

## Feature Dependencies

```
Shared transaction state machine (bridge-card.tsx replacement)
    └──requires──> Stepper component (3 fixed steps, 4 visual states: idle/pending/success/error)
    └──requires──> Action button driven by same state machine
    └──requires──> Pre-flight simulation (useSimulateContract)
                       └──requires──> Error decode layer (decodeErrorResult against collateral-abi.json / synthetic-abi.json)
                                          └──enhances──> Gas/allowance error-mapping layer (small, extensible)
                                          └──enhances──> Per-step failure attribution (differentiator)

Live event subscription (watchContractEvent + WebSocket)
    └──requires──> HTTP-polling fallback (mandatory per Constraints — flaky testnet WS)
    └──enhances──> "Bridge tx relayed" step (drives its pending→confirmed transition)

Page-refresh recovery (persist last tx hash / messageId to localStorage)
    └──requires──> Live event subscription OR useWaitForTransactionReceipt rehydration
    └──enhances──> Stepper (resumes mid-flow instead of resetting to step 1)

Fake progress bar / invented ETA ──conflicts──> Core value ("never faked or simulated for the demo")
Expandable relayer internals ──conflicts──> Hard constraint (coarse states only)
Relayer-side status backend ──conflicts──> Hard constraint (no backend service)
```

### Dependency Notes

- **Stepper requires the shared state machine, not the reverse:** the state machine must be built first (unifying the ~10 states in the current `getActionState` with the 3-step model), then both the stepper and the button subscribe to it. Building the stepper as a visual layer before the state machine exists risks two competing sources of truth — exactly the bug class the existing code has today (button state and receipt state computed ad hoc, not from one machine).
- **Error decode layer requires pre-flight simulation to have somewhere to route decoded errors on the simulate path, and requires post-submit revert handling to have somewhere to route them on the on-chain path.** Build the decode function once (`decodeErrorResult` + gas/allowance mapping), consumed by both `useSimulateContract`'s `error` and `useWaitForTransactionReceipt`'s `error`/`useWriteContractAsync`'s thrown error. This is what makes "errors and UI improve together" (per `TX_FLOW.md`) real rather than aspirational.
- **Per-step failure attribution (differentiator) enhances but does not require anything beyond the state machine + decode layer already being built** — it's a placement decision (show the decoded error at the failed step's node) not new data or new hooks.
- **Page-refresh recovery is not currently in `PROJECT.md` Active scope.** It is table stakes by the researched standard (Socket/Bungee ships this as a basic `localStorage` pattern) and is low-to-medium complexity given the event-subscription work is already planned. Flagging as a gap for requirements review rather than assuming it in scope — see Gaps below.
- **Fake progress / invented ETA conflicts directly with the project's own stated constraint** ("no state may be faked or simulated for the demo — the state machine has to be genuinely correct," `PROJECT.md` Context) — this is not just a general UX anti-pattern here, it would violate an explicit project rule.

## MVP Definition

Scoped to what `PROJECT.md` Active already commits to; this section maps table-stakes/differentiator features onto that existing scope rather than proposing a new cut, per the brownfield/subsequent-milestone framing.

### Launch With (v1 — matches current `PROJECT.md` Active scope)

- [ ] Shared 3-step state machine replacing `getActionState` — foundation everything else sits on
- [ ] Stepper: blue spinner / green checkmark / (add) red error state per step
- [ ] Per-step status copy (pending / processing / confirmed, exact copy per `TX_FLOW.md`)
- [ ] Action button driven by the same state machine
- [ ] Pre-flight simulation (`useSimulateContract`) before wallet prompt
- [ ] Decoded custom-error messages with evidence values — the core differentiator
- [ ] Small gas/allowance error-mapping layer, documented as extensible
- [ ] Live event subscription (WebSocket) with HTTP-polling fallback
- [ ] Approve-every-time (already decided) so all 3 steps always execute

### Add After Validation (v1.x — currently a gap, recommend pulling into this milestone if effort allows)

- [ ] Persist last active tx hash/messageId to `localStorage` and rehydrate the stepper on page refresh — cheap once event subscription exists, closes the single biggest table-stakes gap versus production bridges (see Gaps)
- [ ] Per-step explorer links (not just a final "Done" link)

### Future Consideration (v2+ — explicitly out of scope, do not build now)

- [ ] Any backend/relayer-side status channel — ruled out by hard constraint
- [ ] Expandable raw relayer internals — ruled out by hard constraint
- [ ] Countdown-style ETA — ruled out by researched anti-pattern + core value conflict
- [ ] Full standalone activity/history drawer distinct from the existing message explorer — duplicates existing feature

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shared state machine + stepper + button unification | HIGH | MEDIUM | P1 |
| Decoded custom-error messages (differentiator) | HIGH | MEDIUM | P1 |
| Pre-flight simulation | HIGH | MEDIUM | P1 |
| Gas/allowance error-mapping layer | MEDIUM | LOW | P1 |
| Live WebSocket event subscription + HTTP fallback | MEDIUM | MEDIUM | P1 |
| Page-refresh recovery via localStorage | MEDIUM | LOW-MEDIUM | P2 |
| Per-step explorer links | LOW-MEDIUM | LOW | P2 |
| Per-step failure attribution UI polish | MEDIUM | LOW | P2 |
| Countdown ETA | LOW (net negative per research) | — | Do not build |
| Expandable relayer internals | LOW (out of scope) | — | Do not build |

**Priority key:**
- P1: Must have for launch (already committed in `PROJECT.md` Active)
- P2: Should have, add when possible (recommend for requirements review — closes real UX gaps at low cost)
- Do not build: Anti-features per research + hard constraints

## Competitor Feature Analysis

| Feature | Across | Hop | Superbridge/Base | Socket/Bungee | This Project's Approach |
|---------|--------|-----|-------------------|----------------|--------------------------|
| Step naming | Deposit → Fill (+ optional Approve) | Send → Bond (relay) → Complete | Approve → Deposit → L2 confirm | Approve (if needed) → Bridge/Swap | Bridge Approved → Bridge tx submitted → Bridge tx relayed (fixed, always 3) |
| Progress visual | Status field per deposit (`pending`/`filled`/`expired`/`refunded`) | `TxStatusModal`, confirmation-gated | Persistent "Activity" banner, not inline stepper | Highlighted pending item in local-storage-backed history | Inline stepper directly in the card — more visible than a banner/drawer pattern |
| ETA | None shown as a hard number; ~2s typical fill quoted in docs, not UI | None found | ~2-3 min quoted in docs, not enforced in UI as countdown | None found | Deliberately no countdown; plain-language state copy only |
| Failure/error detail | Not decoded to end user in surveyed docs | Manual-claim guidance after 1-2 hrs, no decoded reason | Generic; explorer-driven troubleshooting | Generic status via polling API | **Decoded custom errors with evidence values — this is the gap this project fills** |
| Refresh recovery | Not documented | Explorer lookup by tx hash (external) | Activity banner persists (mechanism undocumented) | Explicit `localStorage`-backed pending history | Recommend the same `localStorage` pattern (currently a gap — see Gaps) |
| Gas/allowance guidance | Not found in surveyed docs | Not found | Generic wallet-balance checks | Not found | Explicit faucet-link mapping for insufficient testnet gas — none of the surveyed production bridges do this, likely because they target mainnet; this is a natural fit for a testnet demo |

## Sources

- [Tracking Events | Across Documentation](https://docs.across.to/reference/tracking-events) — HIGH relevance, official docs; step/status model (approve/deposit/fill, `pending`/`filled`/`expired`/`refunded`)
- [Bridge | Across Documentation](https://docs.across.to/developer-quickstart/bridge)
- [UI: tx history "pending" status · Issue #252 · hop-protocol/hop](https://github.com/hop-protocol/hop/issues/252) — Hop `TxStatusModal` confirmation-gating behavior
- [Debugging LI.FI Bridging Transactions via Hop](https://help.li.fi/hc/en-us/articles/10981038334107-Debugging-LI-FI-Bridging-Transactions-via-Hop) — Bonder pickup delay guidance
- [Introduction | User Docs - Stargate](https://stargateprotocol.gitbook.io/stargate/user-docs) — explorer-verification guidance
- [Bridging via SuperBridge (OP Mainnet, Base, Unichain) | Lido: Help](https://help.lido.fi/en/articles/11384344-bridging-via-superbridge-op-mainnet-base-unichain) — deposit/withdrawal step counts, Activity banner
- [Withdrawals | Superbridge Docs](https://docs.superbridge.app/optimism/withdrawals) — 3-tx withdrawal + 7-day challenge period, prove-tx timing clarification
- [Bridges - Base Documentation](https://docs.base.org/base-chain/network-information/bridges-mainnet) — confirms Base bridge is Superbridge/OP-Stack derived
- [FAQ | Orbiter Finance](https://docs.orbiter.finance/faq) — History/Search tab, 5-10 min guidance before escalation
- [Lifecycle of bridging session | Bungee Docs](https://docs.bungee.exchange/bungee-legacy/get-started/how-bungee-works/bungee-lifecycle/) — multi-step bridging lifecycle
- [AppController_getBridgingStatus | Bungee Docs](https://docs.bungee.exchange/socket-api-reference/app-controller-get-bridging-status/) — status polling model
- [Troubleshooting: Arbitrum bridge | Arbitrum Docs](https://docs.arbitrum.io/arbitrum-bridge/troubleshooting) — MEDIUM relevance; confirms official docs are light on in-UI error copy, point to Retryables Dashboard instead
- [wevm/wagmi Discussion #2837 — useContractWrite "Execution reverted for an unknown reason"](https://github.com/wevm/wagmi/discussions/2837) — MEDIUM, community discussion not official docs
- [wevm/wagmi Discussion #3618 — decode un-decoded error from useSimulateContract with different ABI](https://github.com/wevm/wagmi/discussions/3618) — MEDIUM, confirms the cross-ABI decode gap relevant to this project's two-ABI (`collateral-abi.json`/`synthetic-abi.json`) setup
- [useSimulateContract | Wagmi](https://wagmi.sh/react/api/hooks/useSimulateContract) — official docs
- [Write to Contract | Wagmi](https://wagmi.sh/react/guides/write-to-contract) — official docs, simulate+write pattern
- [Truth, Lies and Progress Bars – Cloud Four](https://cloudfour.com/thinks/truth-lies-and-progress-bars/) — MEDIUM, general UX writing; anti-pattern evidence for fake progress/ETA
- [Progress Bar UI/UX in SaaS: Stop Losing Users to Bad Waits](https://userpilot.com/blog/progress-bar-ui-ux-saas/) — LOW-MEDIUM, general UX blog
- [Making Crypto Bridging a Delightful and Anxiety-Free Experience — Medium](https://medium.com/@rajiv.manuel/making-crypto-bridging-a-delightful-and-anxiety-free-experience-249ade0904d9) — LOW, opinion/case-study piece, corroborates "bridges are criticized for poor status/ETA transparency"
- [Bridge Transaction Stuck? How to Fix Cross-Chain Transfer Delays (2026)](https://bridge-stuck.github.io/) — LOW, aggregator-style content site; used only for the generic "causes of stuck transfers" taxonomy, cross-checked against Across/Hop/Arbitrum official docs before inclusion

**Confidence caveat:** No official MCP-backed documentation provider (Context7/Ref/Exa/Tavily) was available in this environment; all research used the built-in `WebSearch`/`WebFetch` tools, which `classify-confidence` scores as LOW-tier per source. Findings were cross-checked across at least 2-3 independent bridges/sources wherever presented as a pattern (not a single-source claim) to raise effective confidence to MEDIUM at the pattern level, but exact UI copy strings for any bridge other than the wording already specified in this project's own `TX_FLOW.md` should be treated as indicative, not verbatim.

---
*Feature research for: cross-chain bridge transaction-flow UX*
*Researched: 2026-07-24*
