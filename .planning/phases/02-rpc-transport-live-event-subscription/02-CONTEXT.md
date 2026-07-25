# Phase 2: RPC Transport & Live Event Subscription - Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify that real WebSocket RPC endpoints exist and actually deliver `eth_subscribe`
notifications for Base Sepolia and Arbitrum Sepolia, then wire live event subscriptions on top
of them — with a bounded `getLogs` seed, a staleness watchdog, an HTTP-polling degrade path, and
reorg (`removed: true`) safety — for two consumers: the single-message relay watch
(`use-relay-status.ts`) and the message explorer (`use-bridge-messages.ts`, replacing its
6-second `getLogs` poll).

This phase is deliberately isolated: it is the one LOW-confidence area in the milestone's
research, and a WSS failure here must not block Phase 3. Nothing in this phase renders a stepper,
an action button, or an error banner (Phase 3), and nothing here generates ABIs or decodes
reverts (Phase 1) — it only consumes the event fragments Phase 1's generated ABI produces.

</domain>

<decisions>
## Implementation Decisions

### WSS Endpoints & Credentials

- **D-01:** The smoke test evaluates **both no-key candidate providers side by side** for each
  chain, and the winner is whichever actually answers `eth_subscribe` and delivers a
  notification:
  - PublicNode — `wss://base-sepolia-rpc.publicnode.com`, `wss://arbitrum-sepolia-rpc.publicnode.com`
  - dRPC — `wss://base-sepolia.drpc.org`, `wss://arbitrum-sepolia.drpc.org` (dRPC is already the
    project's HTTP fallback provider in `ui/src/lib/config.ts`, and its docs explicitly document
    `eth_subscribe` for both Base and Arbitrum)

  A keyed provider (Alchemy / Ankr free tier) is a **backstop only** — reached for solely if both
  no-key candidates fail the gate for a given chain. The intent is to keep zero credentials in
  the client bundle.
  — **Reversibility:** reversible — swapping the chosen URL touches only the `rpcUrls` constant
  in `ui/src/lib/config.ts`.

- **D-02:** WSS URLs are **committed constants**, not environment variables. Extend the existing
  `rpcUrls` object in `ui/src/lib/config.ts` with a `ws` field per chain, exactly matching the
  shape of the existing hard-coded `default` / `fallback` HTTP URLs. No `NEXT_PUBLIC_*_WS_URL`
  plumbing, no `.env.example` entry. A fresh clone gets live subscriptions with zero setup;
  swapping an endpoint later means editing `config.ts`.
  - Note the interaction with D-01: a keyed backstop URL would carry an API key, and a key does
    not belong in a committed constant. If the smoke test forces the keyed path for a chain, the
    committed-constants decision must be revisited **for that chain only** — do not silently
    commit a keyed URL.
  - The `RpcUrls` type in `ui/src/lib/config.ts` currently declares `{ default: string; fallback:
    string }`; it needs a `ws` member. Whether `ws` is optional (`ws?: string`) or a required
    field that can be empty is Claude's discretion, but it must be able to express "this chain has
    no verified WSS endpoint" per D-03.

- **D-03:** Smoke-test failure is handled **per chain, not globally**. Base and Arbitrum are
  already configured independently. If only one chain has a verified WSS URL, that chain gets
  live subscriptions and the other starts directly in HTTP-polling mode — which is the same code
  path the degrade already has to support, so it costs nothing extra. **The phase ships either
  way**; a failed smoke test is a recorded outcome, not a blocker.

- **D-04:** LIVE-02's "recorded as passing" evidence is produced by a **committed, repeatable Bun
  script** (e.g. `scripts/smoke-ws.ts`), not a one-off manual `wscat` session. The script:
  - opens each candidate `wss://` URL,
  - issues `eth_subscribe("newHeads")`,
  - **fails unless an actual notification frame arrives within a timeout** — `newHeads` is chosen
    deliberately over a bridge event because it guarantees traffic within seconds without needing
    a real transfer to be executed,
  - and its output is committed into the phase's plan SUMMARY as the LIVE-02 evidence.

  Rationale for the stronger assertion: an endpoint can accept a WS connection and answer
  ordinary JSON-RPC (`eth_blockNumber`) while rejecting or silently dropping `eth_subscribe` —
  that is precisely the failure LIVE-02 exists to catch. Being re-runnable also matters because
  free-tier testnet endpoints rot.

### Resolved during plan-phase (were `<deferred>` gray areas; answered by the user after research)

- **D-05:** Transport wiring covers **both the hooks and `ui/src/wagmi.ts`**. `use-relay-status.ts`
  is built on the **module-level `createPublicClient` pattern** already used by
  `use-bridge-messages.ts` — this expresses LIVE-01's explicit-`chainId`, wallet-independent
  requirement more naturally than a shared wagmi `Config`. Separately, `wagmi.ts`'s `transports`
  map **also gains the same conditional `webSocket()` entry**, so `useWatchContractEvent` remains a
  real option for any future component-local subscription instead of silently degrading to polling.
  Resolves deferred item #1 (flagged there as the highest-consequence open decision in the phase).

- **D-06:** Degrade & recovery policy — **slow reconciliation always, fast poll only on fallback**.
  The WS subscription is the primary path. A **slow (~60s) `getLogs` reconciliation pass runs
  permanently** as a safety net; it is cheap and safe-by-construction because state is merged by
  `messageId` rather than appended, so dedupe absorbs any overlap. The **fast (old 6-second cadence)
  poll is reserved exclusively for confirmed-unhealthy / fallback mode**. This is the synthesis of
  STACK.md's "keep a reconciliation pass running regardless of subscription state" and PITFALLS.md's
  warning against running the *fast* poll permanently in parallel with a healthy subscription —
  the two documents were describing different cadences, not disagreeing. Staleness threshold uses
  the `max(3 × blockTime, floor)` formula from RESEARCH.md; exact constants are Claude's discretion.
  Resolves deferred item #2.

- **D-07:** Transport health is **returned from both hooks but not rendered this phase**. Add a
  `transportMode` field typed `'connected' | 'stale' | 'reconnecting' | 'polling-fallback'` to both
  hooks' return objects, following the existing `UseBridgeMessagesResult { messages, isLoading,
  error, refresh }` shape convention. This state must be tracked internally for the watchdog to
  function at all, so returning it costs nothing; whether `bridge-card.tsx` renders it is Phase 3's
  decision. Not returning it would force Phase 3 to reach back into Phase 2's internals.
  Resolves deferred item #3.

- **D-08:** Relay confirmation uses **first-sight + rollback-on-`removed`**, not confirmation-depth
  tracking. A step/message is marked confirmed on first sight of the `BridgeFinalized` log and
  rolled back when a `removed: true` log for the same `messageId` arrives. This satisfies LIVE-07 as
  written ("does not leave a step or a message falsely marked confirmed"), and the rollback path is
  required under either mechanism — a confirmation-depth design still has to handle a `removed: true`
  arriving before the depth threshold. Confirmation-depth can be layered on later without changing
  the dedupe/rollback foundation. The choice must be recorded explicitly in the plan, not left implicit.

### Claude's Discretion

- Exact file location and CLI shape of the smoke-test script (`scripts/` at repo root vs
  `ui/scripts/`), its timeout value, and its output format — follow existing conventions
  (kebab-case filenames, `bun <file>`, structured output in the style of `relayer/src/logger.ts`'s
  `logJson` if a machine-readable record is useful).
- Whether the smoke script is also wired as a `package.json` script entry.
- Optionality/shape of the new `ws` field on the `RpcUrls` type (see D-02).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Transport mechanics — the load-bearing research for this phase
- `.planning/research/STACK.md` § "Critical API Behavior: `fallback([webSocket(...), http(...)])`
  and live subscriptions" — the index-0 introspection in viem's `watchContractEvent`, why `rank`
  must stay off, and why `fallback()`'s retry logic does **not** cover the subscription code path
  (this is the reason LIVE-05's degrade must be implemented in the app via `onError`)
- `.planning/research/STACK.md` § "RPC Endpoint Availability (LOW confidence)" — the candidate
  WSS URLs and the explicit instruction to smoke-test them before wiring
- `.planning/research/STACK.md` § "Stack Patterns by Variant" — why `use-bridge-messages.ts` uses
  the raw viem `watchContractEvent` action rather than wagmi's `useWatchContractEvent` hook
- `.planning/research/PITFALLS.md` — Pitfalls 1 through 7 are all this phase: silent WS death and
  the staleness watchdog (1), testnet WSS availability (2), missed/duplicate events on reconnect
  (3), reorg `removed: true` (4), React StrictMode double-subscribe (5), watching the destination
  chain regardless of connected wallet chain (6), cold start on refresh (7). Also its
  "Looks Done But Isn't" checklist and Pitfall-to-Phase mapping table.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — LIVE-01 through LIVE-09 (this phase's full requirement set)
- `.planning/ROADMAP.md` § "Phase 2" — the five success criteria and the three named plans
  (02-01 transport wiring, 02-02 `use-relay-status.ts`, 02-03 message-explorer upgrade)
- `.planning/PROJECT.md` § "Key Decisions" — in particular *"Keyed WS provider decision deferred
  to the transport phase"*, which D-01/D-02 above now resolve, and *"Observe relay progress
  through on-chain events, not a relayer-side channel"*

### Upstream phase dependency
- `.planning/phases/01-pure-foundation-abi-error-mapping-flow-state-derivation/01-CONTEXT.md` —
  Phase 1's locked ABI-generation decisions (D-01 through D-04 there). This phase reads the
  `BridgeTxInitiated` / `BridgeFinalized` **event** fragments from Phase 1's generated
  `ui/src/lib/generated.ts`; note D-04 there, which explains that per-contract named ABI exports
  are what the generator emits.

### Existing code being changed
- `ui/src/lib/config.ts` — `rpcUrls` (gains a `ws` field per D-02), `scanConfiguration`
  (`blockWindow: 50_000n`, `chunkSize: 2_000n`, `pollingInterval: 6_000` — the poll being replaced)
- `ui/src/hooks/use-bridge-messages.ts` — the module-level `baseClient`/`arbitrumClient`
  `createPublicClient` instances whose `fallback([http, http])` transports gain a `webSocket()` at
  index 0, and the `scanChain()` / `fetchMessages()` / 6-second `setInterval` logic being replaced
- `ui/src/wagmi.ts` — `getConfig()`'s `transports` map, currently `fallback([http, http])` per
  chain. **Whether `webSocket()` is added here too is an open question** (see `<deferred>`)

### Contracts (event source of truth)
- `contracts/src/IBridge.sol` — the `BridgeTxInitiated` / `BridgeFinalized` event definitions
  (verified: both are declared here, not in `BridgeBase.sol`)
- `contracts/src/BridgeBase.sol` — the `processed[messageId]` mapping and `_consumeMessage()`
  semantics that make `messageId` the correct dedupe key for LIVE-08

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ui/src/hooks/use-bridge-messages.ts`'s `scanChain()` is already exactly the bounded
  `getLogs` seed primitive LIVE-04 requires — chunked (`chunkSize`), window-bounded
  (`blockWindow`), `strict: true`, two chains in parallel. `.planning/research/PITFALLS.md`
  Pitfall 3 is explicit that this should be **reused as the reconciliation primitive**, not
  replaced.
- The module-level two-client pattern (`baseClient` / `arbitrumClient`, one per chain, built
  outside React) is already the correct answer to Pitfall 6 (never infer the watched chain from
  the connected wallet). Carry it into `use-relay-status.ts` rather than collapsing to a single
  wallet-chain-aware client.
- `blockTimestampCache` (a module-level `Map` keyed `${chainId}:${blockNumber}`) is the existing
  precedent for caching across subscription lifecycles.

### Established Patterns
- Object parameters for functions with 2+ args; explicit return types on exported functions;
  result objects shaped like `UseBridgeMessagesResult { messages, isLoading, error, refresh }`
  (`.planning/codebase/CONVENTIONS.md`). A `use-relay-status.ts` result should follow the same
  shape.
- Status values as string-literal union types (`status: 'pending' | 'finalized'` in
  `ui/src/lib/bridge.ts`) — the natural precedent for a transport-mode / connection-health union.
- No barrel files — import from specific module paths.
- `'use client'` at the top of hook files; subscriptions live in `useEffect` with the `unwatch()`
  handle captured and called in cleanup (Pitfall 5 — StrictMode double-mount).

### Integration Points
- `ui/src/lib/config.ts` `rpcUrls` — the single place both `ui/src/wagmi.ts` and
  `ui/src/hooks/use-bridge-messages.ts` read transport URLs from. The `ws` field lands here once
  and is consumed by both.
- `ui/src/components/message-explorer.tsx` consumes `useBridgeMessages()` — its result-object
  shape is the compatibility contract for the LIVE-09 upgrade.
- `ui/src/lib/abis.ts` currently supplies `bridgeAbi[0]` / `bridgeAbi[1]` (positional event
  fragments) to `getLogs`. Phase 1 deletes this file, so this phase's `getLogs`/watch calls must
  move to named event fragments from the generated ABI — a real, unavoidable coupling to Phase 1's
  output, not just an import rename.

</code_context>

<specifics>
## Specific Ideas

- Zero credentials in the client bundle is the preferred end state — the no-key providers are
  tried first specifically to avoid a `NEXT_PUBLIC_` API key, and the keyed tier is framed as a
  backstop rather than a default.
- The smoke test should be a real gate, not a formality: "the socket opened" is not evidence, "a
  subscription notification arrived" is. Re-runnability matters because these endpoints are
  expected to rot.
- A chain without a working WSS endpoint is an acceptable, shippable outcome — not a failure
  state. This mirrors the milestone-wide stance that HTTP polling is the always-correct path and
  WebSocket is a latency optimization layered on top.

</specifics>

<deferred>
## Deferred Ideas

None deferred to other phases — the discussion stayed inside Phase 2's boundary.

**However, three gray areas within this phase were surfaced and deliberately left open** for the
researcher and planner to resolve. They are in scope for Phase 2; they simply were not discussed
this session:

1. **Transport wiring scope.** Does `webSocket()` go into `ui/src/wagmi.ts`'s `fallback()` array
   — making every wagmi read/write/simulate transit WS first — or does it stay confined to the
   dedicated live-events `createPublicClient` instances in `use-bridge-messages.ts` /
   `use-relay-status.ts`? This determines whether `use-relay-status.ts` can use wagmi's
   `useWatchContractEvent` at all (the hook reads wagmi's `Config` from context, so it only
   subscribes if that config's transport has WS at index 0). `.planning/research/STACK.md`
   § "Stack Patterns by Variant" leans toward the raw viem action for non-React module-level
   clients, but does not settle whether the wagmi config itself should also carry WS.
   **This is the highest-consequence open decision in the phase.**

2. **Degrade & recovery policy.** The staleness-watchdog threshold (a fixed millisecond value vs a
   multiple of block time — and Base ~2s vs Arbitrum ~0.25s block times differ by an order of
   magnitude, so one constant may not fit both). Once degraded to polling: stay polling for the
   session, or periodically retry the WS upgrade? And does a slow `getLogs` reconciliation pass
   run permanently alongside a healthy WS subscription — `.planning/research/STACK.md` §3 calls
   this "the cheaper, more robust option for a demo" — or only in fallback mode, which
   `.planning/research/PITFALLS.md` § "Performance Traps" warns against running permanently in
   parallel? **The two research documents give opposing advice here; the planner must pick one
   and say why.**

3. **Transport health visibility.** `.planning/research/PITFALLS.md` Pitfall 1 wants connection
   health as explicit, testable state (`'connected' | 'stale' | 'reconnecting' | 'polling-fallback'`)
   rather than an implicit assumption. LIVE-05/LIVE-06 require the behaviour but do not require
   surfacing it to the user. Whether a visible live/degraded indicator renders in the UI — and if
   so, where — is undecided. Note the tension: the milestone's core value is "the user is never
   left guessing," and Pitfall 1's failure mode is a UI that looks live but has silently stopped.

A related question the planner should also settle, flagged by `.planning/research/PITFALLS.md`
Pitfall 4: whether the relay step is marked confirmed on **first sight** of a `BridgeFinalized`
log (fast, with rollback on `removed: true`) or only after a **confirmation depth** on the
destination chain (slower, safer). LIVE-07 mandates only that a `removed: true` log must not leave
anything falsely confirmed — it does not choose between these two mechanisms.

</deferred>

---

*Phase: 2-RPC Transport & Live Event Subscription*
*Context gathered: 2026-07-25*
</content>
