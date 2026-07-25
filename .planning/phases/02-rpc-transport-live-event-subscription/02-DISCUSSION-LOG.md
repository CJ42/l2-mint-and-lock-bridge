# Phase 2: RPC Transport & Live Event Subscription - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-25
**Phase:** 2-RPC Transport & Live Event Subscription
**Areas discussed:** WSS endpoints & credentials

---

## Gray Area Selection

Four gray areas were presented; the user selected one.

| Area | Description | Selected |
|------|-------------|----------|
| WSS endpoints & credentials | Which provider, committed vs env config, rule on smoke-test failure | ✓ |
| Transport wiring scope | `webSocket()` in `ui/src/wagmi.ts`'s `fallback()` vs dedicated live-events clients only | |
| Degrade & recovery policy | Watchdog threshold, strict switch vs parallel reconciliation, WS re-upgrade | |
| Transport health visibility | Visible live/degraded badge vs internal state only | |

**Notes:** The three unselected areas are in scope for Phase 2 and were recorded as open in
CONTEXT.md's `<deferred>` section for the researcher and planner to resolve.

---

## WSS Endpoints & Credentials

### Q1 — Which WSS endpoints should the smoke test target first?

| Option | Description | Selected |
|--------|-------------|----------|
| Both no-key candidates, keyed as backstop *(recommended)* | Smoke-test PublicNode and dRPC side by side; pick whichever answers `eth_subscribe` and delivers a notification. Keyed Alchemy/Ankr only if both fail. Zero credentials in the browser bundle. | ✓ |
| dRPC only | Already the HTTP fallback in `ui/src/lib/config.ts`; docs document `eth_subscribe` on both chains. One provider for HTTP and WS. Risk: free-tier shared testnet WS is the infrastructure most prone to silent death. | |
| Keyed Alchemy free tier from the start | Confirmed WS on both testnets, most reliable for a live walkthrough. Cost: key ships in the client bundle via `NEXT_PUBLIC_`, plus signup and a per-environment `.env` step. | |
| PublicNode only | No key, no signup, well-established `https`→`wss` hostname convention. Risk: the exact `wss://` URL for these two hostnames is the least-verified assumption in the milestone. | |

**User's choice:** Both no-key candidates, keyed as backstop

---

### Q2 — How should the chosen WSS URLs be configured in the app?

| Option | Description | Selected |
|--------|-------------|----------|
| Committed default + optional `NEXT_PUBLIC_` override *(recommended)* | A `ws` field in `rpcUrls` with the winning URL committed, overridable by env. Mirrors the env-first-with-default pattern `addresses` already uses; a keyed URL drops in later with no code change. | |
| Committed constants only | A plain `ws` string per chain, exactly like the existing hard-coded `default`/`fallback` HTTP URLs. No env plumbing. Clone-and-run works with zero setup; swapping later means editing `config.ts`. | ✓ |
| Env vars required, no committed default | WS URLs come from `.env` or the WS path stays off. Keeps a future keyed URL out of git entirely. Cost: a fresh clone gets no live subscriptions. | |

**User's choice:** Committed constants only

**Notes:** This interacts with Q1's keyed backstop — an API key does not belong in a committed
constant. CONTEXT.md D-02 records that if the smoke test forces the keyed path for a chain, the
committed-constants decision must be revisited for that chain only.

---

### Q3 — What's the rule when an endpoint fails the LIVE-02 smoke-test gate?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-chain: enable WS only where verified *(recommended)* | Base and Arbitrum are configured independently. One working chain gets subscriptions, the other starts in HTTP-polling mode — the same code path the degrade already supports. The phase ships either way. | ✓ |
| All-or-nothing: both verified or both HTTP-only | Consistent behaviour across chains, easier to reason about and demo. Cost: throws away a working endpoint because its counterpart is broken. | |
| Escalate to keyed before falling back | Sign up for an Alchemy/Ankr free key rather than accepting HTTP-only. Best demo reliability, but reopens the env-var decision from Q2. | |

**User's choice:** Per-chain: enable WS only where verified

---

### Q4 — What should the smoke test prove, and where is the evidence kept?

| Option | Description | Selected |
|--------|-------------|----------|
| Repeatable Bun script asserting subscribe+receive, output committed *(recommended)* | A committed script opens each `wss://` URL, calls `eth_subscribe("newHeads")`, and fails unless a notification frame arrives within a timeout. `newHeads` guarantees traffic in seconds, unlike a bridge event needing a real transfer. Output goes into the plan SUMMARY as LIVE-02 evidence; re-runnable when an endpoint rots. | ✓ |
| Manual `wscat` run, output pasted into a phase note | Paste the subscription id and first notification into a committed `02-SMOKE-TEST.md`. Zero code to maintain, exactly what the roadmap criterion describes. Cost: not re-runnable without redoing it by hand. | |
| Connection + `eth_blockNumber` only | Proves the socket opens and answers a request. Fast and simple, but an endpoint can accept a connection and serve JSON-RPC while dropping `eth_subscribe` — the exact failure the requirement exists to catch. | |

**User's choice:** Repeatable Bun script asserting subscribe+receive, output committed

---

### Q5 — Continue or write context?

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Write `02-CONTEXT.md` now; record the three unselected gray areas as open. | ✓ |
| More questions about WSS endpoints | Dig into `webSocket()` reconnect/keepAlive tuning, or whether the smoke script gates CI. | |
| Discuss the other gray areas too | Transport wiring scope, degrade & recovery policy, transport health visibility. | |

**User's choice:** I'm ready for context

---

## Claude's Discretion

- Exact file location and CLI shape of the smoke-test script, its timeout value, and its output
  format.
- Whether the smoke script is wired as a `package.json` script entry.
- Optionality/shape of the new `ws` field on the `RpcUrls` type in `ui/src/lib/config.ts`.

## Deferred Ideas

None deferred to other phases — the discussion stayed inside Phase 2's boundary.

Three in-phase gray areas were left open for the researcher and planner (full detail in
CONTEXT.md `<deferred>`): transport wiring scope, degrade & recovery policy, and transport health
visibility — plus a related open question on whether the relay step confirms on first sight of a
`BridgeFinalized` log or only after a confirmation depth.
