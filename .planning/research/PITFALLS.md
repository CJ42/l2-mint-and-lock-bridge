# Pitfalls Research

**Domain:** Live WebSocket contract-event subscriptions and transaction-state UX in an EVM dApp (wagmi v2 / viem v2, Next.js App Router, Base Sepolia + Arbitrum Sepolia)
**Researched:** 2026-07-24
**Confidence:** MEDIUM — WebSocket transport mechanics and wagmi/viem API behavior are HIGH confidence (official docs, `viem.sh`/`wagmi.sh`, maintainer discussions). Public testnet WSS endpoint *specifics* (exact rate limits, exact uptime) are LOW confidence — provider docs describe capability, not testnet-specific SLAs, and were not independently load-tested for this repo's endpoints.

## Governing recommendation

**Keep HTTP polling as the primary, always-correct path. Treat WebSocket subscriptions as a latency optimization layered on top, not a replacement.** This matches the milestone's own constraint ("HTTP-polling fallback when the WebSocket endpoint is unavailable or drops" is mandatory, not optional) and is reinforced by every pitfall below — the single biggest risk in this phase is a subscription that looks alive but has silently stopped delivering, with the UI never knowing. See Pitfall 1.

## Critical Pitfalls

### Pitfall 1: Silent WebSocket death — the UI looks live but has stopped updating

**What goes wrong:**
The `eth_subscribe` socket drops (proxy timeout, load balancer idle-kill, RPC node restart) but no JS `error` event fires and no `onError` callback in `watchContractEvent`/`useWatchContractEvent` runs — because nothing *errored*, the connection just went quiet. The stepper freezes on "processing" forever while looking perfectly healthy (spinner still spinning, no error banner). This is the exact failure mode documented by viem maintainers and users in [viem discussion #534](https://github.com/wevm/viem/discussions/534): "the websocket connection just silently dies and never reconnects," across Alchemy, Infura and Ankr, on both WS and HTTP-filter transports, with the library maintainers acknowledging viem has no heartbeat mechanism of its own to detect it.

**Why it happens:**
TCP can stay "established" at the OS level for a while after a mid-stream proxy or load balancer has stopped forwarding frames; without protocol-level pings, neither side notices for a long time (or ever, if the reverse proxy silently swallows the connection). Public testnet RPC infrastructure is the environment most likely to do this — shared, rate-limited, subject to idle-connection reaping.

**How to avoid:**
- Do not rely on `onError` alone as the liveness signal. Track "time since last message/log received" per subscription and treat staleness past a threshold (e.g. 2–3x the expected block time) as a dead connection requiring manual resubscribe.
- Explicitly configure viem's `webSocket()` `keepAlive` (ping) and `reconnect` options rather than trusting silent defaults — verify in code that `reconnect: { attempts, delay }` and `keepAlive: { interval }` are set to values tuned for a flaky testnet (short interval, generous attempts), and confirm reconnect actually re-establishes the *subscription*, not just the socket.
- On reconnect, always re-fetch current state via `getLogs`/`getBlockNumber` reconciliation rather than assuming the stream picked up where it left off (see Pitfall 3).
- Surface connection health in the UI as an explicit, testable piece of state (e.g. `wsStatus: 'connected' | 'stale' | 'reconnecting' | 'polling-fallback'`), not an implicit assumption.

**Warning signs:**
- Manual test: open the app, let a subscription sit idle for several minutes (simulate by throttling network / killing WS in devtools), then trigger an event and confirm the UI updates without a page refresh.
- No "last event received at" timestamp anywhere in state/logs.
- `onError` is the only mechanism gating a fallback-to-polling decision.

**Phase to address:**
The phase that builds the WebSocket subscription hook (`use-bridge-messages` replacement) — this must ship with a liveness/staleness watchdog and the HTTP-polling fallback from day one, not as a later hardening pass.

---

### Pitfall 2: Public testnet WSS endpoints don't exist where you assume, or aren't reliable enough for a demo

**What goes wrong:**
Base's and Arbitrum's own public RPC endpoints (`sepolia.base.org`, Arbitrum's public Sepolia RPC) are HTTP-only — they do not expose `wss://` / `eth_subscribe` at all. The codebase's current fallback HTTP RPC (`base-sepolia.drpc.org`, `arbitrum-sepolia.drpc.org`) is on dRPC, which *does* document WebSocket + `eth_subscribe` support, but dRPC's public/free tier WS endpoints for testnets are shared, rate-limited infrastructure, not a guaranteed-uptime service — exactly the kind of endpoint most prone to Pitfall 1's silent-death behavior. There is no first-party, no-signup, guaranteed-available WSS endpoint for either Base Sepolia or Arbitrum Sepolia.

**Why it happens:**
Teams assume "the same RPC provider that serves my HTTP calls also serves WS," without checking that the *specific URL* they're using is HTTP-only, or without accounting for the fact that free-tier WS endpoints get deprioritized/rate-limited more aggressively than HTTP under provider load.

**How to avoid:**
- Verify at build time (not runtime, not by assumption) which concrete WSS URL will be used for each of Base Sepolia and Arbitrum Sepolia, and confirm it is distinct from and does not silently alias to the HTTP endpoint.
- Do not assume a "free" WSS URL from a public aggregator is durable enough to be a load-bearing part of a portfolio demo; if a paid/keyed tier (Alchemy, QuickNode, Dwellir) is available and within scope, prefer it over an anonymous public WSS endpoint for demo reliability.
- Because this is explicitly a testnet-only, unreliable-transport situation (already called out as a project constraint), the HTTP-polling fallback is not optional hardening — it is the thing that makes the demo work when, not if, the WS endpoint misbehaves during a live walkthrough.

**Warning signs:**
- The WSS URL used in code was copied without confirming with the provider's own docs/dashboard that it serves the correct testnet and supports `eth_subscribe`.
- No manual verification that a raw `wscat`/`websocat` connection to the URL, followed by an `eth_subscribe` logs request, actually returns a subscription id and later delivers a notification.

**Phase to address:**
Config/setup phase, before the subscription hook is built — pin down the exact WSS provider/URL and confirm live subscription delivery once, manually, outside the app.

---

### Pitfall 3: Missed events during the reconnect gap, and duplicate/reordered events on resubscribe

**What goes wrong:**
Every `eth_subscribe` reconnect creates a brand-new subscription starting from "now" — there is no server-side replay of what happened while disconnected. Any `BridgeTxInitiated`/`BridgeFinalized` event emitted during the gap is silently lost unless the client explicitly backfills. Separately, on manual reconnect logic that re-subscribes without deduping against already-known events, the same event can be delivered twice (once before disconnect finished processing, once after resubscribe re-scans overlapping range), corrupting a naive "append to list" reducer.

**Why it happens:**
`eth_subscribe`/`watchContractEvent` is a live tail, not a durable log; developers conflate "I have a live subscription" with "I will never miss anything," and skip the reconciliation step needed on every (re)connect.

**How to avoid:**
- On every subscribe and every resubscribe (not just first mount), run a bounded `getLogs` backfill from "last known block" to "current head" *before* trusting the live stream, then switch to live delivery. This is the same block-range-scanning logic already in `use-bridge-messages.ts` — reuse it as the reconciliation primitive rather than replacing it outright.
- Key all event state by a stable identity (`messageId` for this bridge, already present) and dedupe/merge on that key, never append blindly — this also protects against the wagmi/viem-documented duplicate-delivery behavior around filter regeneration.
- Track "last processed block per chain" in component/hook state so a resubscribe knows exactly where to resume the backfill.

**Warning signs:**
- Reducer/state-update logic does `[...prev, newEvent]` instead of `map.set(messageId, event)`.
- No block-number bookkeeping across subscribe/unsubscribe cycles.

**Phase to address:**
Same phase as the subscription hook — this is not separable from "add WebSocket subscriptions," it's a required correctness property of doing so.

---

### Pitfall 4: Chain reorg invalidates an already-shown "confirmed" step

**What goes wrong:**
`eth_subscribe` logs subscriptions re-emit a previously delivered log with `removed: true` when a reorg drops it from the canonical chain, and then emit the replacement log from the new canonical chain (which may have a different block hash/number, or may never arrive if the transaction didn't make it into the reorg'd chain). A stepper that has already flipped a step to "confirmed ✓" on the first delivery, with no listener for `removed: true`, will keep showing a false "done" state after the underlying event has been reorg'd away. On L2 testnets like Base Sepolia and Arbitrum Sepolia this is a lower-probability event than L1 but not zero, especially around sequencer hiccups.

**Why it happens:**
Most tutorial-level `watchContractEvent`/`useWatchContractEvent` code only handles the "new log arrived" path and never checks or even reads the `removed` field on the log object.

**How to avoid:**
- Explicitly check `log.removed` in the `onLogs` handler; on `removed: true`, roll the corresponding step back to its prior (non-confirmed) state rather than ignoring the notification.
- Treat "confirmed" in the stepper as tied to a confirmation depth on the *origin* transaction receipt (`useWaitForTransactionReceipt` already provides this via block confirmations), not merely "an event was seen once" — the milestone's own design already separates "tx submitted" from "tx relayed," which naturally absorbs most of this risk if the "relayed" step's source of truth is the destination-chain receipt/confirmation count, not just the first log delivery.

**Warning signs:**
- `onLogs` handler has no branch for `log.removed`.
- Stepper state is one-way (can only advance, never regress).

**Phase to address:**
Subscription-hook phase for the `removed` handling; stepper/state-machine phase for making "confirmed" a function of confirmation depth rather than first-sight.

---

### Pitfall 5: React 18 StrictMode double-mount and Next.js Fast Refresh leak orphaned sockets

**What goes wrong:**
In dev, React 18 StrictMode intentionally mounts a `'use client'` component, runs its effects, unmounts it, and remounts it to surface missing cleanup. A `useEffect` that opens a WebSocket subscription without properly closing it in the cleanup function (or that stores the socket/unwatch handle in a way that gets lost on remount) leaves an orphaned first connection still receiving and processing events with nothing referencing it to unsubscribe — on top of a second, "real" subscription now also running. Symptoms: duplicated stepper transitions, doubled toasts/state updates, or two independent reconnect loops fighting each other. Next.js Fast Refresh compounds this during active development by re-running effects without a full page reload.

**Why it happens:**
`watchContractEvent`'s return value is an `unwatch` function that must be captured and called in the effect cleanup; if the subscription is created as a bare side effect without capturing and returning that cleanup (or if it's memoized incorrectly across renders), StrictMode's mount→unmount→mount cycle silently doubles it.

**How to avoid:**
- Always capture the `unwatch()`/unsubscribe handle returned by `watchContractEvent` and call it in the `useEffect` cleanup function — never fire-and-forget the subscription call.
- Prefer wagmi's `useWatchContractEvent` hook (which manages this lifecycle internally) over hand-rolling `watchContractEvent` calls in a raw `useEffect`, specifically because the hook already handles StrictMode-safe mount/unmount.
- If a raw viem client + `useEffect` is used instead (e.g. because two clients need coordinating for cross-chain watching), guard against double-subscribe with a ref flag, and verify in dev that toggling StrictMode does not double the emitted events.

**Warning signs:**
- Events appear to fire twice in dev but once in production build.
- `useEffect` for the subscription has no return / cleanup function, or the cleanup doesn't reference the actual subscription instance created in that same effect run.

**Phase to address:**
Subscription-hook phase — write the StrictMode double-mount check into that phase's verification steps (run `next dev`, not just `next build`, to catch it).

---

### Pitfall 6: Watching destination-chain events while the wallet is connected to the origin chain

**What goes wrong:**
The bridge is inherently cross-chain: a user bridging Base Sepolia → Arbitrum Sepolia has their wallet connected to Base Sepolia, but the "relayed" step depends on an event (`BridgeFinalized`) on Arbitrum Sepolia. If the subscription setup implicitly relies on the wallet's currently-connected chain (as some wagmi hooks default to when `chainId` is omitted), the destination-chain watcher either watches the wrong chain or fails to initialize until the user manually switches networks — which they should never have to do just to see their own transaction's status.

**Why it happens:**
Many wagmi hooks (`useWatchContractEvent`, `useSimulateContract`, `useReadContract`) default to the *connected* chain if `chainId` isn't explicitly passed. It's easy to write the destination-chain watcher correctly for the "happy path" direction and forget it needs an explicit, hardcoded `chainId` independent of wallet state, especially once "flip direction" swaps which chain is origin vs destination.

**How to avoid:**
- Always pass `chainId` explicitly on every hook/watcher instance — one watcher pinned to `baseSepolia.id`, one pinned to `arbitrumSepolia.id`, regardless of which one is "origin" for the current direction or what the wallet is connected to. This mirrors what `use-bridge-messages.ts` already does correctly (two separate `publicClient`s, one per chain) — carry that pattern into the subscription replacement rather than collapsing to a single wallet-chain-aware client.
- Never gate the destination-chain subscription's existence on `chainId === direction.originChainId`; the wallet's connected chain is irrelevant to which chains need watching.

**Warning signs:**
- A watcher hook is called without an explicit `chainId` prop.
- Destination-chain events stop appearing specifically after a `switchChain` call, or only appear when the wallet happens to be on that chain.

**Phase to address:**
Subscription-hook phase — this is a design constraint on the hook's public API (accept `chainId` per watcher, never infer it).

---

### Pitfall 7: Cold start — a fresh page load or refresh shows an empty flow mid-bridge

**What goes wrong:**
A WebSocket subscription only delivers events emitted *after* it opens. A user who refreshes the page (or opens the app fresh) while their bridge transaction is mid-flight — submitted but not yet relayed — sees a blank stepper with no memory of the in-flight transaction, because the live stream never replays history and the component's local React state (which held `bridgeHash`/`activeMessageId`) was lost on refresh.

**Why it happens:**
Subscriptions are treated as the sole data source, when they are only correct for "what happens next," not "what has already happened." The existing polling hook (`use-bridge-messages.ts`) actually gets this right today by design — every poll does a bounded `getLogs` scan of the last N blocks, so a refresh mid-flight still reconstructs pending messages. A naive WS-only replacement loses that property.

**How to avoid:**
- On mount, always run one bounded historical scan (reuse the existing `getLogs`/block-window logic) to reconstruct current state *before* attaching the live subscription — the subscription is additive to, not a replacement for, an initial snapshot read.
- If the milestone intends to keep client-only tx tracking (`activeMessageId` in `bridge-card.tsx`) as the primary "which message is mine" pointer, also persist it (e.g. `sessionStorage`) so a refresh doesn't strand the user with no way to find their in-flight transaction; falling back to "most recent message from my connected address" via the historical scan is the backstop if that pointer is lost.

**Warning signs:**
- Refreshing the page mid-bridge (after tx submitted, before relay completes) shows the stepper reset to step 1 instead of resuming at "submitted" or "processing."
- The subscription hook has no initial `getLogs` call, only `watchContractEvent`/`eth_subscribe`.

**Phase to address:**
Subscription-hook phase — cold start must be part of that phase's acceptance criteria, not deferred; this is also explicitly a scenario a portfolio demo is likely to hit (reviewer refreshes the page to "check it's real").

---

### Pitfall 8: `useSimulateContract` staleness — simulation passes but the real transaction still reverts

**What goes wrong:**
`useSimulateContract` is TanStack Query-backed with a **default `staleTime` of 0**, and simulates against a specific block/state at the moment it runs. Between the moment the pre-flight simulation succeeds (gating the "submit" button/removing the disabled state) and the moment the user actually confirms in their wallet, on-chain state can change — someone else's transaction lands first, an allowance gets consumed, a nonce advances, `processed[messageId]` flips true for a race condition on the other bridge direction. The simulation was a snapshot, not a guarantee; a green light from `useSimulateContract` does not mean the subsequent `writeContract` call cannot revert.

**Why it happens:**
Teams treat pre-flight simulation as a hard gate ("if simulate succeeded, the write will succeed") rather than what it actually is: a best-effort filter that catches the *common*, deterministic failure cases (bad inputs, insufficient allowance, wrong chain) while leaving race-condition and state-drift failures possible on the real send. This project's specific `processed[messageId]` / nonce-based replay protection (explicitly "never touch" per CLAUDE.md) is exactly the kind of state that can flip between simulate and submit if two tabs/users interact with the same message.

**How to avoid:**
- Never treat a passed simulation as removing the need to handle a reverted real transaction — the write-side error handling (custom error decoding) must exist and be tested independently of whether simulation ran, not as a "should never happen" branch.
- Keep the simulation's `staleTime` intentionally low or `0` (the default) so it re-runs close to submit time rather than trusting a cached pass from much earlier in the session — but be aware this means simulation contributes real RPC load (see below), so don't also poll it faster than needed.
- Explicitly pass `chainId` and, where relevant, `account`, to `useSimulateContract` so it never silently simulates against the wrong chain or the wrong sender (see Pitfall 6's pattern — same discipline applies here).

**Warning signs:**
- Code path assumes `useSimulateContract`'s `isSuccess` means the subsequent `writeContractAsync` call is guaranteed to succeed and doesn't wrap it in its own try/catch with error decoding.
- No manual test of "simulate passes, then someone else processes the same message first" (can be approximated by re-running a bridge action twice quickly).

**Phase to address:**
Pre-flight simulation phase for the staleness/chainId discipline; error-decoding phase for guaranteeing the fallback path exists regardless.

---

### Pitfall 9: Live re-simulation on every keystroke/render burns RPC budget

**What goes wrong:**
`useSimulateContract`'s query key typically includes the function args (recipient, amount). If it's wired directly to controlled input state without debouncing, every keystroke while typing an amount triggers a new `eth_call` simulation against the RPC endpoint. On a rate-limited public testnet RPC (the same endpoints already flagged as rate-limited in Pitfall 2), this can visibly degrade or throttle the rest of the app's RPC usage (balance reads, the event backfill scan) during normal form interaction.

**Why it happens:**
Direct binding of raw input state to a query-hook's args without debouncing or an `enabled` gate feels correct in isolation but multiplies RPC calls by keystroke count.

**How to avoid:**
- Debounce the amount/recipient values that feed `useSimulateContract`'s `args`, and/or gate the hook with `query.enabled` so it only runs once inputs are valid and the user has paused typing (or is about to submit), not on every render.
- Reuse the amount/recipient validation that already exists in `bridge-card.tsx` (`parseAmount`, `parseRecipient`) as the enable-gate, so simulation only fires once those already pass.

**Warning signs:**
- `useSimulateContract({ args: [recipient, amount] })` wired straight to `useState` input values with no debounce/enabled gate.
- Network tab shows a new `eth_call` on every keystroke while typing an amount.

**Phase to address:**
Pre-flight simulation phase.

---

### Pitfall 10: Custom error decoding fails silently or shows the wrong message

**What goes wrong:**
Several distinct failure shapes get conflated into "decode the error," but each needs different handling:
1. **Selector not in the supplied ABI** — `decodeErrorResult` throws "Unable to decode signature as it was not found on the provided ABI" if the ABI passed doesn't contain the error that actually reverted (e.g. simulating a bridge call whose revert originates from the underlying ERC20's `SafeERC20`/`ERC20Burnable` error, not one of `contracts/src/Errors.sol`'s bridge-specific errors). Decoding against only `bridgeAbi`/`collateral-abi.json`/`synthetic-abi.json` individually will miss errors from other contracts in the call chain (e.g. token contract reverts).
2. **Wallet-wrapped errors** — MetaMask/RainbowKit-connected wallets often wrap the raw RPC error in their own envelope (user rejection, provider-specific codes) before it reaches viem; the raw revert data may be nested several layers deep or, for wallet-side rejections, absent entirely (there is no calldata to decode — it's a user action, not a chain response).
3. **`BaseError.walk()` misuse** — `walk()` needs a predicate that correctly identifies `ContractFunctionRevertedError` (or the relevant subclass) inside the error chain; a naive `instanceof` check on the top-level caught error will usually find only a generic wrapper, not the decoded revert.
4. **Solidity `Panic(uint256)` codes** (arithmetic overflow, array out-of-bounds, division by zero, etc.) are a *different* built-in error type from custom errors and from plain `require` strings — they need their own decode/mapping path (viem has `decodeErrorResult`/panic-specific helpers), not lumped into the same "custom error" branch, or panics will fall through to a generic "unknown error."
5. **Out-of-gas reverts have zero return data** — there is nothing to decode; this must be its own detection branch (heuristically: revert with empty data, or a specific viem error subtype) rather than assumed to be a decode failure of a "real" error.

**Why it happens:**
The happy path (decode one of the four bridge-specific custom errors from `Errors.sol` against a single known ABI) is what gets built and tested; the four variants above are exactly the "long tail" that doesn't show up until a demo does something unexpected — which, per this project's stated goal (a portfolio piece meant to *demonstrate* debugging a failed transaction), is likely to happen live in front of a reviewer.

**How to avoid:**
- Build the error-decoding function to accept a *combined* ABI (bridge + ERC20 + any other contracts in the call path) so `decodeErrorResult` has a chance regardless of which contract actually reverted, per the project's own error-mapping-layer design (already scoped as "small, deliberately narrow, documented as extensible").
- Explicitly special-case, in priority order: (a) user-rejected-in-wallet (no calldata, distinct error shape/code from viem's wallet connectors) → generic "you cancelled" copy; (b) empty revert data → "transaction ran out of gas or failed with no error message" copy, not a decode attempt; (c) `Panic(uint256)` → map the known panic codes to plain language separately from custom-error mapping; (d) known custom error selector → the rich, evidence-bearing message the milestone wants; (e) unrecognized selector → a safe generic fallback that still surfaces the raw selector/hex for the "I can read calldata" portfolio narrative, rather than swallowing it.
- Use `BaseError.walk()` with a predicate that checks for the viem error class that actually carries the decoded `data` (commonly `ContractFunctionRevertedError`), and verify with a real failing testnet transaction (not just a local Anvil revert) since wallet-wrapping behavior differs by connector.

**Warning signs:**
- Error-mapping function only ever tested against `contracts/src/Errors.sol`'s four errors in isolation, never against an ERC20 revert, a panic, an out-of-gas call, or a wallet-rejected `writeContractAsync`.
- No explicit branch for empty/`0x` revert data.

**Phase to address:**
Error-decoding phase — this is the highest-payoff phase to get right given the project's stated portfolio goal, and the one most likely to look "done" after only the four happy-path custom errors are handled (see the Looks-Done-But-Isn't checklist below).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| WS-only subscription, no HTTP backfill/polling fallback | Simpler hook, less code | Silent stale UI on any WS drop (Pitfall 1/2); breaks the exact demo moment it matters | Never — project constraint already forbids this |
| Trusting `useSimulateContract` as a hard success gate, skipping robust write-side error decoding | Less error-handling code to write | Real revert on submit shows a blank/generic failure, undermining the "evidence-backed" goal | Never for this project — the write-side decode is the actual point of the milestone |
| Decoding errors against only the bridge ABI, ignoring the ERC20/token ABI | One ABI to wire up | Any allowance/transfer-originated revert (a very likely real failure mode) shows as "unknown error" | Never — token errors are a first-class expected failure |
| Skipping the `removed:true` branch on log subscriptions | Simpler `onLogs` handler | Stepper can show a false "confirmed" after a reorg | Acceptable short-term on L2 testnets given low reorg probability, but must be flagged as a known gap, not silently absent |
| No debounce/enable-gate on `useSimulateContract` args | Fewer lines wiring the hook | RPC rate-limit exhaustion on already-fragile public testnet endpoints, degrading everything else | Never on rate-limited public RPC — cheap to fix, not worth the risk |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Base Sepolia / Arbitrum Sepolia public RPC | Assuming the same URL serves both HTTP and WSS, or that a free public WSS endpoint has production-grade uptime | Confirm the exact WSS URL and provider per chain; treat testnet public WSS as best-effort, never as the sole path |
| viem `webSocket()` transport | Relying on default `reconnect`/`keepAlive` without verifying they reconnect the *subscription*, not just the socket | Explicitly configure and test reconnect+keepAlive; verify a live event still arrives after a forced disconnect |
| wagmi `fallback([webSocket(), http()])` | Assuming `fallback()` protects a live subscription the same way it protects one-off HTTP reads | `fallback()` retries failed *requests*; a silently-dead WS subscription that never errors won't trigger fallback — the app-level staleness watchdog (Pitfall 1) is still required |
| MetaMask/RainbowKit wallet errors | Assuming all thrown errors from `writeContractAsync` are decodable calldata reverts | Branch on user-rejection vs RPC-returned revert vs no-data-empty-revert before attempting `decodeErrorResult` |
| `useSimulateContract` / `useWatchContractEvent` without `chainId` | Letting the hook default to the connected wallet chain | Always pass explicit `chainId` per hook instance, independent of wallet state |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Un-debounced `useSimulateContract` on every keystroke | Rapid-fire `eth_call` requests while typing an amount | Debounce + `query.enabled` gate on validated input | Immediately on a rate-limited public testnet RPC |
| Backfill `getLogs` scan re-run on every reconnect without bounding the range | Growing RPC call volume as the subscription flaps | Bound backfill to "since last known block," not a fixed large window, each time | As reconnects become frequent (flaky WS), scan cost compounds |
| Keeping the existing 6-second poll running *in addition to* the new WS subscription "just in case" indefinitely | Double RPC load, double state-update churn, possible duplicate-event bugs | Poll should be an explicit fallback mode entered only when WS is confirmed unhealthy, not a permanently-parallel path | As soon as both run simultaneously by default |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client-reported "confirmed" state (from a single log delivery) as the basis for any UI action that assumes finality | A reorg'd-away event could make the UI claim funds moved when they didn't (misleading, not fund-risking here since it's read-only UI) | Tie "confirmed" to receipt confirmation depth, not first log delivery; handle `removed:true` (Pitfall 4) |
| Decoding and displaying raw revert calldata/selectors to the user without sanitization | Low risk here (data is public on-chain), but blindly rendering unexpected byte strings in UI copy is sloppy | Always route unrecognized selectors through the same safe-fallback copy path, don't string-interpolate raw hex into arbitrary UI positions without escaping |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|--------------|-------------------|
| Fake/optimistic progress (advancing the stepper before the underlying event actually arrived) | User believes a step completed when it didn't; erodes trust exactly where the milestone's "Core Value" is about never leaving the user guessing | Every step transition must be driven by a real observed state (tx hash mined, event received, confirmation depth reached) — explicitly ruled out already by the project's own "no state may be faked" constraint |
| Unrecoverable stuck state with no escape hatch | User stuck on "processing" forever after a relayer hiccup or WS death, no way to check for themselves | Always provide a manual "check status" / refresh action and a link to the block explorer for the relevant tx hash, independent of subscription health |
| Generic, non-actionable error copy ("Something went wrong") | User can't self-serve, defeats the "evidence-backed explanation" goal | Every mapped error state (from Pitfall 10's branches) must include a concrete next action — link, amount, or explanation — never a bare failure message |
| Approve-then-bridge always required (per this milestone's own design decision) shown without explaining *why* a second wallet popup appears | User confusion/distrust seeing two prompts for "one" bridge action | Stepper's first state ("Bridge Approved") should make the two-transaction nature explicit before the first wallet popup, not just label it after the fact |

## "Looks Done But Isn't" Checklist

- [ ] **WebSocket subscription hook:** Looks done once it renders live events on the happy path — verify it also handles: a forced disconnect mid-session recovering without a page refresh, a page refresh mid-bridge reconstructing state (Pitfall 7), and a reorg'd log (`removed:true`) not left as a false "confirmed."
- [ ] **HTTP-polling fallback:** Looks done if it exists in code — verify it actually activates automatically when the WS connection is confirmed unhealthy (not just available as an unused code path), and that switching between WS and polling doesn't duplicate events.
- [ ] **`useSimulateContract` pre-flight gate:** Looks done once it blocks the four known custom-error cases — verify it doesn't falsely gate on stale results (Pitfall 8) and doesn't hammer RPC on every keystroke (Pitfall 9).
- [ ] **Custom error decoding:** Looks done once it decodes the four `Errors.sol` errors — verify it also handles an ERC20-originated revert, a wallet-rejected transaction, an out-of-gas empty-data revert, and a Panic code, each with distinct correct copy (Pitfall 10).
- [ ] **Destination-chain watching:** Looks done when tested on the default direction — verify it still works correctly after flipping direction and after switching the connected wallet chain (Pitfall 6).
- [ ] **Dev-mode testing only:** If the subscription hook was only ever run under `next dev` without deliberately checking for StrictMode double-subscription artifacts, or only ever run under `next build` (StrictMode inactive) without checking dev behavior, one of the two failure modes (Pitfall 5) was never actually exercised.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|-----------------|
| Silent WS death shipped without a staleness watchdog | MEDIUM | Add a "last event timestamp" ref per subscription, a threshold check on an interval, and force-resubscribe (or fall back to polling) past threshold; retrofit is localized to the subscription hook |
| Missing reconciliation backfill causing missed/duplicate events | MEDIUM | Add the bounded `getLogs` backfill on connect/reconnect and switch state updates to key-based dedup (`messageId`) instead of append-only |
| Error decoding only covers the four bridge errors | LOW | Extend the ABI list passed to `decodeErrorResult` and add the panic/empty-data/wallet-rejection branches; the project already scopes this as "narrow but extensible," so retrofit is expected, not a rewrite |
| Stepper advanced optimistically instead of from real state | MEDIUM–HIGH | Requires re-deriving the state machine from actual receipt/event data rather than local optimistic flags; touches the shared state machine feeding both button and stepper, so higher cost the later it's caught |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. Silent WS death | WebSocket subscription hook phase | Force-kill the WS connection mid-session in devtools; confirm the UI detects staleness and recovers (resubscribe or fallback) without a page refresh |
| 2. Public testnet WSS reliability | Config/setup, before subscription phase | Manually confirm the chosen WSS URL delivers a real `eth_subscribe` notification outside the app (e.g. `websocat`) before wiring it into React |
| 3. Missed/duplicate events on reconnect | WebSocket subscription hook phase | Disconnect, trigger an event server-side (or wait for one), reconnect, confirm no gap and no duplicate in the message list |
| 4. Reorg invalidates confirmed state | WebSocket subscription hook + stepper/state-machine phase | Code review confirms `log.removed` is handled; "confirmed" is defined as confirmation-depth, not first-sight |
| 5. StrictMode/Fast Refresh double-subscribe | WebSocket subscription hook phase | Run under `next dev` (StrictMode active) and confirm events aren't duplicated; confirm `unwatch()`/cleanup is always called |
| 6. Watching the wrong/disconnected chain | WebSocket subscription hook phase | Test both bridge directions, and test with wallet connected to each chain, confirming destination-chain events always appear regardless |
| 7. Cold start on refresh mid-bridge | WebSocket subscription hook phase | Submit a bridge tx, refresh the page before it's relayed, confirm the stepper resumes at the correct step, not step 1 |
| 8. Stale/wrong-chain simulation | Pre-flight simulation phase | Confirm `chainId` is always explicit; confirm write-side error handling exists and is tested independently of simulation passing |
| 9. Live re-simulation RPC cost | Pre-flight simulation phase | Confirm debounce/enabled-gate exists; observe network tab shows one simulation call per completed input, not one per keystroke |
| 10. Custom error decoding gaps | Error-decoding phase | Test against: ERC20 revert, wallet rejection, out-of-gas empty-data revert, a Panic code, and an unrecognized selector — not just the four bridge errors |

## Sources

- [viem — WebSocket Transport docs](https://viem.sh/docs/clients/transports/websocket) — HIGH confidence (official docs): `reconnect`/`keepAlive` option names and defaults
- [viem — watchContractEvent docs](https://viem.sh/docs/contract/watchContractEvent) — HIGH confidence (official docs): `poll`/`batch`/`onError` behavior, WS-uses-`eth_subscribe` default
- [viem GitHub Discussion #534 — watchEvents seem to be skipping events](https://github.com/wevm/viem/discussions/534) — MEDIUM confidence (maintainer/community discussion): silent WS death, no heartbeat, filter-regeneration gaps
- [viem — decodeErrorResult docs](https://viem.sh/docs/contract/decodeErrorResult.html) — HIGH confidence (official docs)
- [wagmi — useSimulateContract docs](https://wagmi.sh/react/api/hooks/useSimulateContract) — HIGH confidence (official docs): `staleTime` default 0, `chainId`/`account` params
- [wagmi — useWatchContractEvent docs](https://wagmi.sh/react/api/hooks/useWatchContractEvent) — HIGH confidence (official docs)
- [wagmi — webSocket transport docs](https://wagmi.sh/react/api/transports/webSocket) / [fallback transport docs](https://wagmi.sh/react/api/transports/fallback) — HIGH confidence (official docs)
- [wagmi GitHub Issue #3883 — useWatchContractEvent doesn't work properly](https://github.com/wevm/wagmi/issues/3883) — MEDIUM confidence (community-reported bug pattern)
- [Base Docs — Connecting to Base](https://docs.base.org/base-chain/quickstart/connecting-to-base) — MEDIUM confidence (official docs, general Base RPC guidance; testnet-specific WSS uptime not independently verified)
- [dRPC — eth_subscribe (Base API)](https://drpc.org/docs/base-api/subscriptions/eth_subscribe) / [dRPC — eth_subscribe (Arbitrum API)](https://drpc.org/docs/arbitrum-api/subscriptions/eth_subscribe) — MEDIUM confidence (provider docs; capability confirmed, free-tier testnet SLA not verified)
- [go-ethereum — Real-time Events (pub/sub)](https://geth.ethereum.org/docs/interacting-with-geth/rpc/pubsub) and [web3.js Issue #1766 — removed=true set twice on reorg](https://github.com/web3/web3.js/issues/1766) — MEDIUM confidence: `removed: true` reorg re-emission semantics
- General React 18 StrictMode double-effect / WebSocket cleanup pattern (multiple community sources, consistent with official React docs on Strict Mode behavior) — HIGH confidence for the mechanism, MEDIUM for React community write-ups
- Community discussions on gas-estimate buffering and insufficient-funds error handling (wagmi/ethers.js GitHub discussions) — LOW–MEDIUM confidence (practitioner consensus, not a documented spec value)
- Existing codebase: `ui/src/hooks/use-bridge-messages.ts`, `ui/src/lib/config.ts`, `ui/src/components/bridge-card.tsx`, `contracts/src/Errors.sol`, `.planning/codebase/CONCERNS.md`, `TX_FLOW.md`, `.planning/PROJECT.md` — HIGH confidence (primary source, read directly)

---
*Pitfalls research for: live WebSocket event subscriptions and transaction-state UX in an EVM dApp (l2-mint-and-lock-bridge, `feat/tx-flow-ux` milestone)*
*Researched: 2026-07-24*
