# Phase 2: RPC Transport & Live Event Subscription - Research

**Researched:** 2026-07-25
**Domain:** viem/wagmi WebSocket transport mechanics, live contract-event subscriptions, and HTTP-polling degrade on Base Sepolia + Arbitrum Sepolia testnets
**Confidence:** MEDIUM — transport API mechanics are HIGH confidence (official viem/wagmi docs, cross-checked); WSS endpoint availability for these two testnets remains LOW confidence and is *by design* resolved at runtime by the phase's own smoke-test script (D-04), not by this document

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The smoke test evaluates both no-key candidate providers side by side for each chain, and the winner is whichever actually answers `eth_subscribe` and delivers a notification: PublicNode (`wss://base-sepolia-rpc.publicnode.com`, `wss://arbitrum-sepolia-rpc.publicnode.com`) and dRPC (`wss://base-sepolia.drpc.org`, `wss://arbitrum-sepolia.drpc.org`, already the project's HTTP fallback provider). A keyed provider (Alchemy/Ankr free tier) is a backstop only, reached solely if both no-key candidates fail the gate for a given chain. Reversible — swapping the chosen URL touches only the `rpcUrls` constant in `ui/src/lib/config.ts`.
- **D-02:** WSS URLs are committed constants, not environment variables. Extend the existing `rpcUrls` object in `ui/src/lib/config.ts` with a `ws` field per chain, exactly matching the shape of the existing hard-coded `default`/`fallback` HTTP URLs. No `NEXT_PUBLIC_*_WS_URL` plumbing, no `.env.example` entry. Note: a keyed backstop URL would carry an API key, which does not belong in a committed constant — if the smoke test forces the keyed path for a chain, this decision must be revisited for that chain only. The `RpcUrls` type needs a `ws` member; whether it is `ws?: string` or a required-but-empty-capable field is Claude's discretion, but it must express "this chain has no verified WSS endpoint" per D-03.
- **D-03:** Smoke-test failure is handled per chain, not globally. If only one chain has a verified WSS URL, that chain gets live subscriptions and the other starts directly in HTTP-polling mode — the same code path the degrade already has to support. The phase ships either way; a failed smoke test is a recorded outcome, not a blocker.
- **D-04:** LIVE-02's "recorded as passing" evidence is produced by a committed, repeatable Bun script (e.g. `scripts/smoke-ws.ts`), not a one-off manual `wscat` session. The script opens each candidate `wss://` URL, issues `eth_subscribe("newHeads")`, and fails unless an actual notification frame arrives within a timeout — `newHeads` is chosen deliberately over a bridge event because it guarantees traffic within seconds without needing a real transfer. Its output is committed into the phase's plan SUMMARY as the LIVE-02 evidence. Rationale: an endpoint can accept a WS connection and answer ordinary JSON-RPC while rejecting or silently dropping `eth_subscribe` — that is precisely the failure LIVE-02 exists to catch. Being re-runnable also matters because free-tier testnet endpoints rot.

### Claude's Discretion

- Exact file location and CLI shape of the smoke-test script (`scripts/` at repo root vs `ui/scripts/`), its timeout value, and its output format — follow existing conventions (kebab-case filenames, `bun <file>`, structured output in the style of `relayer/src/logger.ts`'s `logJson` if a machine-readable record is useful).
- Whether the smoke script is also wired as a `package.json` script entry.
- Optionality/shape of the new `ws` field on the `RpcUrls` type (see D-02).

### Deferred Ideas (OUT OF SCOPE)

None deferred to other phases — the discussion stayed inside Phase 2's boundary.

However, three gray areas within this phase were surfaced and deliberately left open for the researcher and planner to resolve (in scope for Phase 2, just not discussed in the CONTEXT session):

1. **Transport wiring scope** — does `webSocket()` go into `ui/src/wagmi.ts`'s `fallback()` array (every wagmi read/write/simulate transits WS first, and `use-relay-status.ts` could then use wagmi's `useWatchContractEvent`), or stay confined to dedicated live-events `createPublicClient` instances? Flagged as "the highest-consequence open decision in the phase." See this document's "Open Questions" section for a researched recommendation.
2. **Degrade & recovery policy** — the staleness-watchdog threshold (fixed ms vs. a multiple of block time, given Base ~2s vs Arbitrum ~0.25s block times differ by an order of magnitude); once degraded, stay polling for the session or periodically retry the WS upgrade; does a slow `getLogs` reconciliation pass run permanently alongside a healthy WS subscription (STACK.md's stance) or only in fallback mode (PITFALLS.md's stance) — the two research documents give opposing advice, and the planner must pick one and say why. See "Open Questions" below for a researched synthesis.
3. **Transport health visibility** — PITFALLS.md's Pitfall 1 wants connection health as explicit, testable state (`'connected' | 'stale' | 'reconnecting' | 'polling-fallback'`) rather than an implicit assumption. LIVE-05/LIVE-06 require the behavior but not surfacing it to the user; whether a visible live/degraded indicator renders in the UI, and where, is undecided.

A related question also flagged: whether the relay step is marked confirmed on first sight of a `BridgeFinalized` log (fast, with rollback on `removed: true`) or only after a confirmation depth on the destination chain (slower, safer). LIVE-07 mandates only that a `removed: true` log must not leave anything falsely confirmed — it does not choose between these two mechanisms.

</user_constraints>

## Project Constraints (from CLAUDE.md)

Both root `CLAUDE.md` and `.claude/CLAUDE.md` apply; the following are the directives this phase must respect:

- **Transport:** viem only — no ethers.js anywhere, including the smoke-test script and any hand-rolled reconnect logic.
- **Runtime:** Bun for install/run/test/build (`bun run`, `bun test`, `bun <file>`) — never `npm`/`yarn`/`pnpm`/`node`/`ts-node`/`jest`/`vitest`. Bun ships a native `WebSocket` global; do not add the `ws` package for the smoke-test script.
- **TypeScript:** strict mode; functions over classes where functions suffice; object parameters for functions with 2+ args (existing convention, e.g. `scanChain({ client, bridgeAddress, chainId })`).
- **Amounts:** all token amounts are 6-decimal — not directly touched by this phase's transport/subscription work, but any event-derived `amount` field passed through must not be reformatted assuming 18 decimals.
- **Networks:** Base Sepolia and Arbitrum Sepolia testnets only.
- **Semantics:** never change nonce/`processed` semantics or the `messageId` encoding — this phase only *reads* `messageId` as a dedupe/state key, never re-derives or alters it.
- **Env loading:** Bun automatically loads `.env`; no `dotenv` package. Not directly relevant here since D-02 keeps WSS URLs as committed constants, not env vars.
- **Commits:** one build-order block (§10) per commit minimum; this phase's three named plans (02-01, 02-02, 02-03) are the natural commit granularity.
- **Styling:** CSS Modules only, no new component framework — not applicable to this phase (no rendering work), but relevant if Open Question 3 (transport health visibility) results in any UI surface being added.
- **Structured logging:** relayer code uses `logJson` with a mandatory `status` field (`relayer/src/logger.ts`) — the smoke-test script should follow the same shape even though it cannot import across the `relayer`/`ui` workspace boundary (see Code Examples below).
- **GSD workflow enforcement (`.claude/CLAUDE.md`):** file-changing work must go through a GSD command (`/gsd-execute-phase` etc.), not direct ad-hoc edits — applies to whoever executes this phase's plans, not to this research document itself.

## Summary

This phase adds nothing new to the dependency tree — `viem@2.55.5` and `wagmi@2.19.5` (both already installed, both npm-registry-confirmed current on their `^2` ranges) already contain every primitive needed: `webSocket()`, `fallback()`, `watchContractEvent`, `getLogs`, and (for component-bound hooks) `useWatchContractEvent`. The work is entirely wiring and correctness discipline, not library adoption.

Two facts, both confirmed against official docs in this session, are the load-bearing constraints for every plan in this phase. First, `fallback()`'s own retry logic **only** covers request/response JSON-RPC calls (`getLogs`, `simulateContract`, etc.) — it does not extend to live subscriptions, because `watchContractEvent` bypasses `fallback()`'s retry machinery entirely and calls `.subscribe()` directly on whichever transport in the array has `config.type === 'webSocket'`, found by scanning **index 0**. This is why LIVE-03's ranking-disabled, WS-at-index-0 requirement is a hard constraint, not a preference, and why LIVE-05's degrade-to-HTTP-polling must be hand-built in the app via `onError` (confirmed: `rank` defaults `false`, must stay that way for this client). Second, `viem`'s own reconnect/keepAlive machinery on `webSocket()` recovers the *socket*, not necessarily the *subscription's liveness signal* — a documented viem bug (`wevm/viem#2325`) shows the transport can remain silently `CLOSED` after certain disconnects with no automatic recovery, which is precisely why a staleness watchdog independent of `onError` (LIVE-06) is mandatory, not defensive over-engineering.

A design correction worth surfacing before planning starts: the staleness watchdog cannot be built by tracking "time since last `BridgeFinalized`/`BridgeInitiated` log," because those events are sparse — a healthy subscription can legitimately go minutes without a log. The watchdog must instead track a dense heartbeat (a `newHeads`/block subscription, which is also what the LIVE-02 smoke-test script itself uses) decoupled from the sparse bridge-event stream.

**Primary recommendation:** Build the live-events client the same way `use-bridge-messages.ts` already builds its HTTP-only clients today — module-level `createPublicClient` per chain, `fallback([webSocket(...), http(...), http(...)])` with `rank` omitted (defaults `false`) and WebSocket pinned at index 0 — then layer a `watchBlocks`-based heartbeat watchdog and an `onError`-driven degrade-to-`poll:true` path on top, reusing the existing bounded `scanChain()`/`getLogs` primitive as both the pre-subscription seed (LIVE-04) and the resubscribe/reconcile pass (Pitfall 3), with all event state merged by `messageId`, never appended.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WSS endpoint verification (smoke test) | Build/Dev tooling (Bun script) | — | Runs once, out-of-band, before any app code depends on the result; not part of the served app runtime |
| Live relay-status subscription (`use-relay-status.ts`) | Browser / Client | — | `'use client'` hook; module-level viem client connects to RPC directly from the browser. Project explicitly excludes a relayer-side WS backend ("no new service to host") |
| Message explorer live list (`use-bridge-messages.ts`) | Browser / Client | — | Same pattern as above; already the file's existing architecture |
| Transport degrade (WS → HTTP fallback) | Browser / Client | — | `fallback()` + `onError` handler both execute inside the browser's viem client instance |
| Bounded `getLogs` seed scan | Browser / Client | — | Direct RPC call from the browser via the public client; reuses `scanChain()` |
| Reorg (`removed: true`) handling | Browser / Client | — | Applied inside the `onLogs` callback, in-browser, no server round trip |
| Transport-mode / staleness state | Browser / Client | — | Plain React/hook state; optionally surfaced to Phase 3's UI, but owned here |

No capability in this phase touches a Frontend-SSR, API/Backend, CDN, or Database tier — this is consistent with the milestone's explicit "no relayer HTTP/WebSocket backend" exclusion and the existing `use-bridge-messages.ts` architecture (module-level clients built outside React/wagmi context, reading chain state directly in the browser).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIVE-01 | `BridgeFinalized` watched with explicit `chainId`, works regardless of wallet chain | Pitfall 6 (existing PITFALLS.md) + module-level two-client pattern below; `chainId` must never be inferred from wallet state |
| LIVE-02 | WSS endpoints verified by smoke test before app code depends on them | D-04 (CONTEXT.md) + "Code Examples: Smoke-Test Script" below; confirmed no first-party guaranteed WSS exists for either testnet (LOW confidence upheld) |
| LIVE-03 | WebSocket at `fallback()` index 0, ranking disabled | "Critical API Behavior" below — confirmed against official `viem.sh/docs/clients/transports/fallback` docs: `rank` defaults `false` |
| LIVE-04 | Bounded `getLogs` seed before subscription opens | Reuse `scanChain()` (already implements chunked, bounded, `strict: true` scanning) — see "Don't Hand-Roll" |
| LIVE-05 | WS failure degrades to HTTP polling via explicit `onError`, flow keeps working | "Critical API Behavior" below — `fallback()`'s retry does not cover subscriptions; `onError` → `poll: true` re-invoke is the only path |
| LIVE-06 | Staleness watchdog detects a silently-dead socket, triggers fallback | "Design correction: heartbeat vs. sparse events" below — `wevm/viem#2325`; recommend `watchBlocks` heartbeat, decoupled from bridge-event sparsity |
| LIVE-07 | `removed: true` logs never leave a step falsely confirmed | `log.removed` confirmed to pass through `onLogs` unmodified; see "Reorg Handling" below and recommendation on first-sight-vs-confirmation-depth |
| LIVE-08 | Event state keyed by `messageId`, duplicates applied once | Existing dedupe-by-key pattern (Pitfall 3, PITFALLS.md) — `Map.set(messageId, event)`, never `[...prev, event]` |
| LIVE-09 | Message explorer upgraded to the same live-watch mechanism | Same client/subscription pattern as `use-relay-status.ts`, applied to `use-bridge-messages.ts`'s existing two-chain scan |

</phase_requirements>

## Standard Stack

### Core (all already installed — no new packages this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `viem` | `2.55.5` installed (`2.55.8` current on npm registry, verified via `npm view viem version`) [VERIFIED: npm registry] | `webSocket()`, `fallback()`, `watchContractEvent`, `watchBlocks`, `getLogs` | Project-wide "viem only" rule; every transport primitive this phase needs already ships here |
| `wagmi` | `2.19.5` installed (npm registry `latest` is `3.7.4`, but `@rainbow-me/rainbowkit@2.2.11` hard-pins `wagmi: ^2.9.0` — do not upgrade) [VERIFIED: npm registry] | `useWatchContractEvent` (only if transport wiring scope extends to `wagmi.ts`, see below), `Config` transports map | Already the project's wallet/hook layer; RainbowKit peer-dep constraint rules out v3 |

No `Installation` step is needed — everything is already in `ui/package.json`.

### Supporting APIs (inside `viem`, no new installs)

| API | Purpose | When to Use |
|-----|---------|-------------|
| `webSocket(url, opts)` | WS JSON-RPC transport | First entry (`index 0`) in the live-events client's `fallback([...])` array |
| `fallback(transports, opts)` | Ordered transport degradation | Live-events client and (optionally, see open question below) `wagmi.ts`'s transports map |
| `watchContractEvent` (viem action) | Non-React live event subscription | `use-bridge-messages.ts` and `use-relay-status.ts`, both built on module-level `createPublicClient` instances |
| `watchBlocks` (viem action) | Lightweight `newHeads`/block-header subscription | The staleness-watchdog heartbeat — decoupled from the sparse bridge-event stream (see below) |
| `client.transport.getSocket()` | Access the underlying WebSocket instance | Only documented mechanism (community-confirmed, `github.com/wevm/viem/discussions/620`) to inspect raw connection state (`readyState`, attach `close`/`error` listeners) if the watchdog needs socket-level signal in addition to the `watchBlocks` heartbeat |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Module-level `createPublicClient` + raw `watchContractEvent` action | wagmi's `useWatchContractEvent` hook | The hook self-manages subscribe/unsubscribe lifecycle (less hand-rolled cleanup code) but only works for hooks called inside a component that reads wagmi's `Config` from context, and requires `wagmi.ts`'s transports map to also carry `webSocket()` — see "Open Question: Transport Wiring Scope" below |
| `watchBlocks` heartbeat for staleness detection | Tracking "time since last bridge event" | Rejected — bridge events (`BridgeInitiated`/`BridgeFinalized`) are sparse; a healthy subscription can go minutes with no event, making that signal indistinguishable from a dead one |
| Committed WSS URL constants (D-02) | `NEXT_PUBLIC_*_WS_URL` env vars | Already decided by CONTEXT.md D-02 — no alternative to research here |

## Package Legitimacy Audit

Not applicable — this phase installs **no new packages**. `viem` and `wagmi` are already installed, already in production use elsewhere in the codebase (`ui/src/wagmi.ts`, `ui/src/hooks/use-bridge-messages.ts`), and their versions are verified above via direct `npm view` registry query. No `checkpoint:human-verify` gate is needed for this phase's dependencies.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │              Browser (Client tier)            │
                    │                                                │
  page load ───────▶│  1. Bounded getLogs seed scan (scanChain())   │
                    │     fromBlock = latest - blockWindow           │
                    │     chunked by chunkSize, strict: true         │
                    │            │                                   │
                    │            ▼                                   │
                    │  2. Merge into messageId-keyed state           │
                    │     (Map, never array-append)                  │
                    │            │                                   │
                    │            ▼                                   │
                    │  3. Open live subscription                     │
                    │     watchContractEvent({ chainId, poll:undef })│
                    │     transport = fallback([webSocket, http, http])
                    │     ┌──────────────┴───────────────┐           │
                    │     ▼                               ▼           │
                    │  onLogs(logs)                   onError(err)   │
                    │  - check log.removed             - tear down   │
                    │    per entry, roll back            subscription │
                    │    if true                       - resubscribe │
                    │  - merge by messageId              with poll:true
                    │    (dedupe)                       (HTTP fallback)
                    │            │                               │   │
                    │            ▼                               ▼   │
                    │  4. watchBlocks heartbeat (parallel, own       │
                    │     watcher) — "last block received at" ref    │
                    │            │                                   │
                    │            ▼                                   │
                    │  5. Staleness watchdog (setInterval)            │
                    │     now - lastHeartbeat > threshold?            │
                    │     → force degrade to HTTP polling             │
                    │            │                                   │
                    │            ▼                                   │
                    │  6. Transport-mode state exposed from hook      │
                    │     ('connected'|'stale'|'reconnecting'|        │
                    │      'polling-fallback')                        │
                    └─────────────────────────────────────────────┘
                                 │                    │
                                 ▼                    ▼
                    Base Sepolia RPC        Arbitrum Sepolia RPC
                    (explicit chainId,      (explicit chainId,
                     never wallet-inferred)  never wallet-inferred)
```

A reader can trace the primary path: page load → seed scan → merged state → live subscription opens → either a log arrives (checked for `removed`, merged by `messageId`) or an error/staleness event fires → degrade to polling → transport-mode surfaced. Two independent instances of this pipeline exist, one pinned to `baseSepolia.id` and one to `arbitrumSepolia.id`, matching the existing `baseClient`/`arbitrumClient` split.

### Recommended Project Structure

```
ui/
├── src/
│   ├── lib/
│   │   └── config.ts              # rpcUrls gains `ws` field per chain (D-02); scanConfiguration unchanged
│   ├── hooks/
│   │   ├── use-bridge-messages.ts # upgraded: watchContractEvent replaces setInterval poll (LIVE-09)
│   │   └── use-relay-status.ts    # new: seed-then-subscribe for one messageId on explicit destination chainId
│   └── wagmi.ts                    # open question: does its transports map also gain webSocket()? (see below)
└── scripts/                        # or repo-root scripts/ — Claude's discretion per CONTEXT.md
    └── smoke-ws.ts                 # LIVE-02 evidence: bun scripts/smoke-ws.ts
```

### Pattern 1: WebSocket-first fallback transport, ranking disabled

**What:** `fallback([webSocket(wsUrl, {...}), http(defaultUrl), http(fallbackUrl)])` with `rank` omitted.
**When to use:** Any client used for a live subscription (`use-relay-status.ts`, `use-bridge-messages.ts`'s live path). Never for one-off request clients where ranking-by-latency is actually desirable.
**Example:**
```ts
// Source: https://viem.sh/docs/clients/transports/fallback (rank default: false, confirmed 2026-07-25)
//         https://viem.sh/docs/clients/transports/websocket (reconnect/keepAlive defaults, confirmed 2026-07-25)
import { createPublicClient, fallback, http, webSocket } from 'viem'
import { baseSepolia } from 'viem/chains'
import { rpcUrls } from '@/lib/config'

const baseClient = createPublicClient({
  chain: baseSepolia,
  transport: rpcUrls.baseSepolia.ws
    ? fallback([
        webSocket(rpcUrls.baseSepolia.ws, {
          reconnect: { attempts: 5, delay: 2_000 }, // viem defaults, explicit for clarity
          keepAlive: true,                           // viem default
          retryCount: 3,
        }),
        http(rpcUrls.baseSepolia.default),
        http(rpcUrls.baseSepolia.fallback),
      ])
    : fallback([
        http(rpcUrls.baseSepolia.default),
        http(rpcUrls.baseSepolia.fallback),
      ]),
  // rank intentionally omitted — default false, keeps webSocket() pinned at index 0 when present
})
```
Per CONTEXT.md D-03, the conditional branch on `rpcUrls.baseSepolia.ws` being present/absent is the per-chain, no-WS-is-shippable behavior the smoke test is allowed to produce.

### Pattern 2: Heartbeat-based staleness watchdog, decoupled from sparse events

**What:** A `watchBlocks` subscription (or periodic `getBlockNumber()` poll on HTTP) whose sole purpose is to update a `lastHeartbeatAt` ref; a separate `setInterval` checks `Date.now() - lastHeartbeatAt` against a threshold and triggers degrade if exceeded.
**When to use:** Always, for both `use-relay-status.ts` and `use-bridge-messages.ts`'s live path — this is the mechanism LIVE-06 requires.
**Why not watch the bridge event itself:** `BridgeInitiated`/`BridgeFinalized` are sparse — a healthy connection can go minutes without either firing, which is indistinguishable from a dead connection if that's the only signal tracked. `watchBlocks` fires roughly every block (~2s on Base Sepolia, sub-second on Arbitrum Sepolia — see "Common Pitfalls" for the exact numbers and why a single constant does not fit both).
```ts
// Pattern (not from a single doc page — synthesizes viem watchBlocks + Pitfall 1's staleness guidance)
const lastHeartbeatAt = useRef(Date.now())

useEffect(() => {
  const unwatch = client.watchBlocks({
    onBlock: () => { lastHeartbeatAt.current = Date.now() },
    onError: () => setTransportMode('reconnecting'),
  })
  const watchdog = setInterval(() => {
    if (Date.now() - lastHeartbeatAt.current > STALENESS_THRESHOLD_MS) {
      setTransportMode('polling-fallback')
      // tear down live subscription(s), re-invoke with poll: true
    }
  }, WATCHDOG_CHECK_INTERVAL_MS)
  return () => { unwatch(); clearInterval(watchdog) }
}, [])
```

### Pattern 3: Reorg-safe, dedupe-safe `onLogs` handler

**What:** Every `onLogs` callback checks `log.removed` per entry before merging into state, and merges (never appends) keyed by `messageId`.
**When to use:** Both hooks, every log delivery, not just first-mount.
```ts
// Source: log.removed is standard go-ethereum pubsub log-object field, confirmed to pass through
// viem's watchContractEvent onLogs callback unmodified (no viem-side stripping/transform)
function onLogs(logs: Log[]) {
  setMessages((prev) => {
    const next = new Map(prev)
    for (const log of logs) {
      if (log.removed) {
        next.delete(log.args.messageId)   // roll back, don't leave falsely confirmed (LIVE-07)
        continue
      }
      next.set(log.args.messageId, toMessage(log))  // dedupe by key (LIVE-08), never [...prev, log]
    }
    return next
  })
}
```

### Anti-Patterns to Avoid

- **Relying on `onError` alone as the liveness signal:** `wevm/viem#2325` documents the transport remaining silently `CLOSED` with no error surfaced after certain disconnects — `onError` is necessary but not sufficient; the heartbeat watchdog (Pattern 2) is required alongside it.
- **`rank: true` on the live-events client:** silently reorders `transports`, can move `webSocket()` out of index 0, silently degrading to polling with zero error. Leave `rank` unset (default `false`).
- **Appending events to an array instead of merging by `messageId`:** breaks both LIVE-07 (reorg rollback) and LIVE-08 (dedupe) simultaneously — this single design choice satisfies two requirements at once when done correctly, and violates both when done wrong.
- **Watching the bridge-event stream itself as the staleness signal:** produces constant false positives (sparse events) or, if the threshold is set generously enough to avoid false positives, becomes too slow to catch a genuinely dead connection. Use the `watchBlocks` heartbeat instead.
- **Letting `use-relay-status.ts`/`use-bridge-messages.ts`'s destination-chain watcher infer `chainId` from the connected wallet:** breaks LIVE-01 the moment a user is connected to the origin chain (Pitfall 6, existing PITFALLS.md) — always pass explicit `chainId`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bounded, chunked historical log scan | A new `getLogs` pagination loop | `scanChain()` (`use-bridge-messages.ts`, already chunked by `chunkSize`, window-bounded by `blockWindow`, `strict: true`) | It is already exactly the LIVE-04 seed primitive and the Pitfall-3 reconciliation primitive — reuse, don't reimplement |
| WebSocket reconnect/keepalive logic | A custom `ws.onclose` → manual re-`new WebSocket()` loop | `webSocket()`'s built-in `reconnect`/`keepAlive` options | viem already implements exponential-backoff reconnect and ping keepalive; hand-rolling duplicates this and is exactly the kind of code the `wevm/viem#2325` bug lives in upstream, not a good place to add more surface area |
| Deciding WS-vs-poll per transport | Manually checking `client.transport.type` before calling `watchContractEvent` | Pass `poll: undefined` (the default) and let `watchContractEvent`'s internal index-0 introspection decide | This is exactly the documented, source-verified auto-detection behavior (viem docs, confirmed 2026-07-25) — reimplementing it risks getting the index-0 check subtly wrong |
| Reorg detection | Comparing block hashes/numbers manually across log deliveries | `log.removed` (delivered as-is by `eth_subscribe`/viem) | The protocol-level signal already exists; don't build a parallel reorg-detection mechanism |

**Key insight:** every "don't hand-roll" item in this phase already has a working reference implementation somewhere in this repo or ships built into viem — the phase's job is composition and correctness discipline (ordering, explicit `chainId`, merge-not-append), not new algorithms.

## Common Pitfalls

### Pitfall: Staleness watchdog threshold picked as one constant for both chains

**What goes wrong:** Base Sepolia's block time (~2s, mirrors Base mainnet's OP-stack cadence) and Arbitrum Sepolia's block time (~0.25–0.4s, confirmed via block-time chart data during this research — [CITED: arbiscan.io/chart/blocktime style data, cross-checked against Arbitrum's rollup architecture]) differ by roughly an order of magnitude. A single "3× block time" constant either fires constantly on Arbitrum Sepolia (a sub-second threshold reacting to normal jitter) or is far too slow to be useful on Base Sepolia.
**Why it happens:** Copy-pasting a single `STALENESS_THRESHOLD_MS` constant feels simpler than per-chain tuning.
**How to avoid:** Use `threshold = max(3 × expectedBlockTimeMs, floorMs)` per chain, where `floorMs` (e.g. 8_000–10_000ms) absorbs Arbitrum Sepolia's sub-second block time into a sane, jitter-tolerant floor, while Base Sepolia's `3 × 2_000 = 6_000ms` naturally sits close to or under the same floor. In practice this can converge to a single effective floor value for both chains — document the formula, not just the resulting number, so a future block-time change doesn't require re-deriving it from scratch.
**Warning signs:** A watchdog that fires within the first few seconds on Arbitrum Sepolia during normal healthy operation; a watchdog on Base Sepolia that takes over 30s to react to a killed connection.

### Pitfall: `fallback()`'s built-in retry mistaken for subscription resilience

**What goes wrong:** A developer sees `fallback([webSocket(...), http(...), http(...)])` and assumes that if the WS transport dies, `fallback()` automatically routes the *live subscription* to the next HTTP transport, the same way it would for a one-off `getLogs` call.
**Why it happens:** `fallback()` genuinely does this for request/response calls — the behavior is real, just scoped narrower than intuition suggests.
**How to avoid:** Confirmed via direct viem source inspection (documented in `.planning/research/STACK.md`) that `subscribeContractEvent()` finds the WS transport inside the fallback array and calls `.subscribe()` on it directly, bypassing `fallback()`'s own retry/degrade path entirely. The `onError` → re-invoke-with-`poll:true` pattern (Pattern 1/2 above) is not optional hardening; it is the only mechanism that provides subscription-level fallback.
**Warning signs:** No `onError` handler on `watchContractEvent`/`useWatchContractEvent`; assuming "I have `fallback()` configured" is sufficient for LIVE-05.

### Pitfall: Smoke-test script proves the wrong thing

**What goes wrong:** A smoke test that only opens the WS connection and calls a plain JSON-RPC method (`eth_blockNumber`) can pass while `eth_subscribe` itself is rejected or silently dropped by the endpoint — exactly the gap D-04 already identified and designed around.
**Why it happens:** "The socket connected" feels like sufficient evidence.
**How to avoid:** Already resolved by CONTEXT.md D-04 — the script must issue `eth_subscribe("newHeads")` and fail unless an actual notification frame (a JSON-RPC message with `method: "eth_subscription"`, not just the subscription-id response) arrives within a timeout. This is also the correct template for the runtime `watchBlocks` heartbeat (Pattern 2) — the same "did a notification actually arrive" check, just running continuously instead of once.
**Warning signs:** A smoke test that resolves successfully the instant the subscription ID is returned, without waiting for a subsequent notification.

### Pitfall: React StrictMode double-subscribe on `next dev`

**What goes wrong:** A raw `useEffect` that opens a `watchContractEvent` subscription without capturing and calling its returned `unwatch()` in cleanup leaves an orphaned subscription alive after StrictMode's mount→unmount→remount cycle, doubling event delivery in dev only.
**Why it happens:** Easy to fire-and-forget the subscription call, especially when the effect also needs to manage the heartbeat watcher and watchdog interval — three things to clean up, not one.
**How to avoid:** Return a single cleanup function from the effect that calls all three teardown functions (`unwatch()` for the event subscription, `unwatch()` for the `watchBlocks` heartbeat, `clearInterval()` for the watchdog check) — see Pattern 2's combined cleanup.
**Warning signs:** Events/steps appear to fire twice under `next dev` but once under `next build`.

*(This document supplements, and does not repeat in full, the ten pitfalls already catalogued in `.planning/research/PITFALLS.md`, all of which apply directly to this phase — see CONTEXT.md's `<canonical_refs>` for the mapping. The four above are the pitfalls newly surfaced or sharpened by this session's transport-level verification.)*

## Code Examples

### Smoke-test script skeleton (LIVE-02 evidence)

```ts
// Source: pattern synthesized from viem's webSocket() transport semantics + CONTEXT.md D-04's
// requirement ("fails unless an actual notification frame arrives, not just a socket open").
// Bun ships a native `WebSocket` global (browser-API-compatible) — no `ws` package needed,
// consistent with root CLAUDE.md's "WebSocket is built-in. Don't use `ws`."

interface SmokeResult {
  chain: string
  url: string
  status: 'pass' | 'fail'
  reason?: string
  subscriptionId?: string
  notificationLatencyMs?: number
}

async function smokeTestWs(chain: string, url: string, timeoutMs = 10_000): Promise<SmokeResult> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url)
    const startedAt = Date.now()
    let subscriptionId: string | undefined

    const timer = setTimeout(() => {
      socket.close()
      resolve({ chain, url, status: 'fail', reason: 'timeout waiting for eth_subscription notification' })
    }, timeoutMs)

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_subscribe', params: ['newHeads'] }))
    })

    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data as string)
      if (payload.id === 1 && payload.result) {
        subscriptionId = payload.result
        return // subscription ACK is not proof — wait for an actual notification
      }
      if (payload.method === 'eth_subscription' && payload.params?.subscription === subscriptionId) {
        clearTimeout(timer)
        socket.close()
        resolve({
          chain, url, status: 'pass', subscriptionId,
          notificationLatencyMs: Date.now() - startedAt,
        })
      }
    })

    socket.addEventListener('error', () => {
      clearTimeout(timer)
      resolve({ chain, url, status: 'fail', reason: 'socket error' })
    })
  })
}
```

Reuse `relayer/src/logger.ts`'s `logJson({ status, ... })` shape (structured JSON, `status` field mandatory) as the output-format precedent — note `logger.ts` itself lives in the `relayer` workspace and is not importable from `ui/` or repo-root scripts without a shared package, so the smoke script should define its own equivalent `logJson` helper (a five-line function, not worth extracting into a shared package for this milestone) rather than reach across workspace boundaries.

## Open Questions

1. **Transport wiring scope: does `ui/src/wagmi.ts` also gain `webSocket()`?** (CONTEXT.md deferred item #1, flagged there as "the highest-consequence open decision in the phase")
   - What we know: `watchContractEvent`'s auto-detection and `useWatchContractEvent`'s config-from-context resolution are both confirmed via official docs in this session. If `wagmi.ts`'s `transports` map does not carry `webSocket()`, `useWatchContractEvent` can never subscribe (always polls) for any hook using the shared wagmi `Config` — including any future component that wants live updates without building its own client.
   - What's unclear: whether the planner should build `use-relay-status.ts` as a wagmi-context hook (`useWatchContractEvent`) or as a module-level raw-client hook matching `use-bridge-messages.ts`'s existing architecture.
   - Recommendation: build `use-relay-status.ts` with the same module-level `createPublicClient` pattern as `use-bridge-messages.ts` (STACK.md's existing "Stack Patterns by Variant" guidance — the explicit-`chainId`, wallet-independent requirement (LIVE-01) is more naturally expressed via two dedicated clients than a shared wagmi `Config`). Separately, extending `wagmi.ts`'s `transports` map with the same conditional `webSocket()` entry costs nothing and is low-risk (per-chain conditional, `fallback()`'s own retry still protects one-off `simulateContract`/`readContract` calls used elsewhere in the app) — recommend doing it for consistency and to keep `useWatchContractEvent` available as an option for any future component-local subscription, but it is not required for this phase's two named hooks to function correctly.

2. **Degrade & recovery policy: watchdog threshold value, and does the `getLogs` reconciliation pass run permanently or only in fallback mode?** (CONTEXT.md deferred item #2 — STACK.md and PITFALLS.md give opposing advice)
   - What we know: STACK.md recommends keeping a slower reconciliation pass running "regardless of subscription state" as "the cheaper, more robust option for a demo." PITFALLS.md's Performance Traps table warns against running the old 6-second poll "permanently in parallel" with a healthy WS subscription, citing "double RPC load, double state-update churn, possible duplicate-event bugs."
   - What's unclear: which framing the planner should adopt as the phase's actual behavior.
   - Recommendation (synthesis, not a pick-one): the two documents are talking about different cadences. Running the **original fast 6-second poll** in parallel with a healthy subscription is genuinely wasteful and is what PITFALLS.md correctly warns against — don't do that. But because state is already merged by `messageId` (never appended), an **infrequent** reconciliation pass (e.g. every 60s, or on `visibilitychange` when the tab regains focus) is cheap, safe-by-construction (dedupe absorbs any overlap), and delivers STACK.md's "robust for a demo" property without the cost PITFALLS.md flags. Recommend: fast subscription is primary; slow (~60s) reconciliation runs always as a safety net; only the fast *polling* path (matching the old 6s cadence) is reserved exclusively for confirmed-unhealthy/fallback mode. Threshold formula for staleness itself: see "Common Pitfalls" above (`max(3× blockTime, floor)`), exact constants left to the planner.

3. **Transport health visibility: does connection state reach the UI in this phase?** (CONTEXT.md deferred item #3)
   - What we know: LIVE-05/LIVE-06 require the *behavior* (degrade works) but not that it be *visible*. PITFALLS.md's Pitfall 1 wants it as explicit, testable state regardless of UI rendering.
   - What's unclear: whether Phase 2 renders anything, or just returns the state from the hook.
   - Recommendation: make the union type (`'connected' | 'stale' | 'reconnecting' | 'polling-fallback'`) part of both hooks' return objects now — it costs nothing extra (the state must be tracked internally for the watchdog to function at all) and follows the existing `UseBridgeMessagesResult { messages, isLoading, error, refresh }` shape convention (add `transportMode` as a new field). Whether Phase 3's `bridge-card.tsx` actually renders it is that phase's decision, not this one's — but not returning it from the hook would force Phase 3 to reach back into Phase 2's internals later, which is worse.

4. **Relay-confirmation mechanism: first-sight-with-rollback vs. confirmation-depth for `BridgeFinalized`.** (Related question surfaced in CONTEXT.md's `<deferred>` section, tied to Pitfall 4)
   - What we know: LIVE-07's exact requirement text is "does not leave a step or a message falsely marked confirmed" after a `removed: true` log — it does not mandate *which* mechanism achieves that.
   - What's unclear: whether the planner should implement destination-chain confirmation-depth tracking (safer, more complex — requires watching N blocks past the event before flipping state) or first-sight + rollback-on-`removed` (simpler, and directly satisfies LIVE-07's literal wording since the rollback path is required either way for correctness).
   - Recommendation: first-sight + rollback-on-`removed` (Pattern 3 above) is sufficient to satisfy LIVE-07 as written, is significantly less machinery for this phase, and the rollback path it requires is needed regardless of which mechanism is chosen (a confirmation-depth design still needs to handle a `removed: true` arriving before the depth threshold is reached). Confirmation-depth can be layered on later without changing the dedupe/rollback foundation. Flag this as the recommended default; the planner should record the choice explicitly rather than leaving it implicit.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `wss://base-sepolia-rpc.publicnode.com` and `wss://arbitrum-sepolia-rpc.publicnode.com` follow PublicNode's documented https→wss same-hostname convention | Standard Stack / Pattern 1 | Already mitigated by design — CONTEXT.md D-04 mandates a runtime smoke test before any code depends on these URLs; if wrong, the smoke test fails per-chain (D-03) and that chain starts HTTP-only, which is an explicitly acceptable, shippable outcome |
| A2 | dRPC's Base Sepolia WS endpoint documents `eth_subscribe` the same way its confirmed Arbitrum Sepolia docs do | Standard Stack | Same mitigation as A1 — resolved by the smoke test, not assumed into the plan |
| A3 | Base Sepolia block time ≈2s / Arbitrum Sepolia block time ≈0.25–0.4s are stable enough to inform a watchdog-threshold formula | Common Pitfalls | Low risk — the formula (`max(3×blockTime, floor)`) is designed to be insensitive to moderate drift in the exact number; a large regime change (e.g. Arbitrum Sepolia moving to multi-second blocks) would need the floor revisited, but the floor already dominates for Arbitrum's current regime |
| A4 | No PublicNode-specific or provider-specific `eth_getLogs` block-range limit for these two testnets was found this session; the project's existing `scanConfiguration` (`blockWindow: 50_000n`, `chunkSize: 2_000n`) is treated as already-tuned | Standard Stack / Don't Hand-Roll | If a provider silently rejects a 2,000-block chunk, `scanChain()` would surface an RPC error on the affected chunk — recommend the planner add a smoke-test-adjacent check (or note in the plan) that the existing chunk size still succeeds against whichever provider wins the WS smoke test, since HTTP and WS often share the same underlying node/rate-limit bucket |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | Smoke-test script (D-04), all `bun run`/`bun test` commands | ✓ | 1.3.3 (project requires 1.2.0+) | — |
| Base Sepolia WSS endpoint (PublicNode or dRPC) | LIVE-01 through LIVE-06 live-subscription behavior | ✗ (not verified this session — LOW confidence, by design deferred to the phase's own smoke test) | — | Per-chain HTTP-only mode (D-03) — the same code path the degrade must support anyway |
| Arbitrum Sepolia WSS endpoint (PublicNode or dRPC) | Same as above | ✗ (same caveat) | — | Same fallback |
| Keyed backstop provider (Alchemy/Ankr free tier) | Only reached if both no-key candidates fail the smoke test for a given chain (D-01) | Not probed this session — out of scope unless the smoke test forces it | — | If needed, D-02's committed-constants decision must be revisited for that chain only (per CONTEXT.md's explicit note) |
| `wscat`/`websocat` | Not used — D-04 supersedes manual `wscat` with the committed Bun script | N/A (intentionally not a dependency) | — | — |
| Foundry (`forge`) | Not required by this phase (ABI generation is Phase 1's concern) | ✓ | 1.7.1 | — |

**Missing dependencies with no fallback:** None — every missing item above has an explicit, already-decided fallback (HTTP-polling per chain, or the keyed-backstop escalation path).

**Missing dependencies with fallback:** Both testnets' WSS endpoints, pending the phase's own smoke test (this is the intended, designed-for outcome of this phase, not a gap in research).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | This phase has no auth surface — read-only RPC subscriptions |
| V3 Session Management | No | No session state introduced |
| V4 Access Control | No | Public, read-only chain data; no access boundaries to enforce |
| V5 Input Validation | Marginal | The smoke-test script and hooks parse untrusted JSON-RPC responses from third-party WS endpoints (PublicNode/dRPC/keyed backstop) — must not `eval`/blindly trust payload shape; `JSON.parse` + explicit field checks (as in the Code Examples skeleton) is sufficient, no external validation library needed |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Malformed/malicious WS payload from a third-party RPC provider (PublicNode/dRPC are third-party, unauthenticated public infrastructure) | Tampering | Never trust `log.args`/subscription payloads as pre-validated — viem's ABI-decoded event args are already type-checked against the generated ABI (Phase 1 dependency); the smoke-test script's own hand-rolled JSON parsing (Code Examples above) should defensively check `payload.method`/`payload.id` shape before acting on it, not assume well-formed JSON-RPC |
| A WS endpoint silently substituting a different chain's data (misconfigured or malicious provider) | Spoofing | Explicit `chainId` on every watcher (already a hard requirement for LIVE-01/Pitfall 6) is itself a mitigation — a payload delivered on the wrong chain's client is structurally impossible if `chainId` is pinned per-client rather than inferred |
| Denial of service via a public, rate-limited, no-key RPC endpoint being exhausted or deliberately abused | Denial of Service | Bounded `getLogs` window (`blockWindow`/`chunkSize`, already tuned) and the recommended infrequent (~60s) reconciliation cadence (see Open Question 2) both limit RPC call volume; this is a testnet-demo risk profile, not a production security boundary |

No new secrets, keys, or credentials are introduced by this phase (D-01/D-02 explicitly keep zero credentials in the client bundle for the no-key tier; a keyed backstop, if ever reached, is out of scope for this research since it's a contingency, not the default path).

## Sources

### Primary (HIGH confidence — official docs, fetched and quoted directly this session)
- https://viem.sh/docs/clients/transports/websocket — `reconnect`/`keepAlive`/`retryCount`/`retryDelay`/`timeout` defaults, fetched 2026-07-25
- https://viem.sh/docs/clients/transports/fallback — `rank`/`retryCount`/`retryDelay`/`shouldThrow` defaults, fetched 2026-07-25, confirms `rank` defaults `false`
- https://viem.sh/docs/contract/watchContractEvent — `poll`/`batch`/`onError`/`UnwatchFn` semantics, fetched 2026-07-25
- https://wagmi.sh/react/api/hooks/useWatchContractEvent — full parameter list, config resolution hierarchy, fetched 2026-07-25
- `npm view viem version` / `npm view wagmi version` — registry-verified current versions, cross-checked against installed `node_modules/*/package.json`, run 2026-07-25

### Secondary (MEDIUM confidence — community/GitHub sources cross-checked against official behavior)
- https://github.com/wevm/viem/issues/2325 — WebSocket transport can remain silently `CLOSED` after certain disconnects with no automatic recovery; version `2.13.1`, no fix/PR recorded as of this research
- https://github.com/wevm/viem/discussions/620 — `client.transport.getSocket()` as the documented mechanism to access the raw WebSocket instance
- https://drpc.org/docs/arbitrum-api/subscriptions/eth_subscribe — dRPC's `eth_subscribe` support confirmed for Arbitrum (Sepolia listed in dRPC's Arbitrum chainlist); Base-Sepolia-specific subscribe docs not directly located this session

### Tertiary (LOW confidence — general web search, not independently load-tested)
- PublicNode `wss://` URL convention for Base Sepolia / Arbitrum Sepolia — hostname pattern inferred from PublicNode's general practice across other chains, exact URL string not printed on either fetched PublicNode page; this is the reason CONTEXT.md D-04 mandates a runtime smoke test rather than trusting this research
- `eth_getLogs` block-range limits — general 2026 provider guidance (50–1000 blocks typical, 10,000-result caps common), no PublicNode- or Base/Arbitrum-Sepolia-specific number found
- Arbitrum Sepolia (~0.25–0.4s) / Base Sepolia (~2s, inherited from Base mainnet's OP-stack cadence) block times — general search results, not independently verified against a live block-time query this session

### Carried forward from milestone-level research (already HIGH confidence, not re-verified this session — see `.planning/research/STACK.md` and `.planning/research/PITFALLS.md` for full detail)
- `fallback()`'s index-0 WS introspection and subscription-bypasses-retry behavior — confirmed via direct `viem@2.22.17` source inspection (`actions/public/watchContractEvent.ts`), cross-checked against `2.55.5` docs
- All ten pitfalls in PITFALLS.md, in particular Pitfalls 1–7 (explicitly this phase per CONTEXT.md's `<canonical_refs>`)

## Metadata

**Confidence breakdown:**
- Transport API mechanics (`fallback`/`webSocket`/`watchContractEvent` defaults and behavior): HIGH — official docs fetched and quoted directly this session, consistent with the milestone-level STACK.md's source-level inspection
- WSS endpoint availability/exact URLs: LOW — by design, resolved at runtime by the phase's own smoke-test script (D-04), not by desk research; this document does not attempt to override that decision
- Staleness-watchdog design (heartbeat-vs-sparse-event correction, threshold formula): MEDIUM — synthesized from HIGH-confidence transport docs plus general block-time search data, not a documented pattern with an authoritative source
- Open-question recommendations (transport wiring scope, degrade/recovery policy, health visibility, confirmation mechanism): MEDIUM — reasoned recommendations reconciling STACK.md/PITFALLS.md's own noted disagreements, explicitly flagged as recommendations for the planner to confirm, not locked decisions

**Research date:** 2026-07-25
**Valid until:** 7 days (fast-moving: public testnet RPC endpoint availability is explicitly called out across all research documents as the one area most likely to rot)
