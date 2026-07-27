---
phase: 02-rpc-transport-live-event-subscription
plan: 01
subsystem: ui
tags: [viem, websocket, eth-subscribe, live-events, reorg, bun-test]

requires:
  - phase: 01
    provides: "Generated bridge ABIs and the tested pure-function foundation"
provides:
  - "Repeatable four-candidate WSS smoke test requiring a real eth_subscription notification"
  - "Verified PublicNode WSS constants for Base Sepolia and Arbitrum Sepolia"
  - "WebSocket-first production live clients and matching wagmi transports"
  - "Named BridgeTxInitiated and BridgeFinalized event fragments"
  - "End-to-end production-client subscription and 2,000-block getLogs probe"
  - "Pure transport health, staleness, messageId dedupe, and reorg rollback primitives"
affects: [02-02, 02-03, 02-04, phase-3]

tech-stack:
  added: []
  patterns:
    - "Per-chain fallback transport with webSocket at index 0 and two HTTP transports after it"
    - "No fallback options object, preserving authored transport order"
    - "Explicit chain-id client selection independent of wallet state"
    - "MessageId-keyed last-write-wins merge with removed-log rollback"

key-files:
  created:
    - scripts/smoke-ws.ts
    - ui/src/lib/bridge-events.ts
    - ui/src/lib/live-clients.ts
    - ui/scripts/probe-live-subscription.ts
    - ui/src/lib/live-transport.ts
    - ui/src/lib/live-transport.test.ts
  modified:
    - package.json
    - ui/package.json
    - ui/src/lib/config.ts
    - ui/src/wagmi.ts

key-decisions:
  - "PublicNode won both chains because it was the first passing candidate in the concurrent smoke-test result order; dRPC also passed both chains"
  - "Both chains receive committed no-key ws constants; no credentialed provider or environment variable is needed"
  - "Fallback ordering is authored directly and ranking options are omitted everywhere"
  - "Empty transport-mode lists resolve to reconnecting, never connected"
  - "BridgeFinalized confirmation is first-sight with removed-log rollback rather than confirmation-depth tracking"

patterns-established:
  - "Production transport introspection path: client.transport.transports[0].config.type"
  - "Production socket accessor path: client.transport.transports[0].value.getSocket() after checking the accessor exists"
  - "Staleness threshold is max(3 * blockTimeMs, 10_000)"

requirements-completed: [LIVE-02, LIVE-03, LIVE-06, LIVE-07, LIVE-08]

coverage:
  - id: D1
    description: "Four no-key candidate endpoints are probed concurrently and pass only after a matching eth_subscription notification arrives"
    requirement: "LIVE-02"
    verification:
      - kind: integration
        ref: "bun run smoke:ws (4 pass verdicts plus summary)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both production clients and wagmi transports use verified WebSocket transports at fallback index 0 without transport ranking"
    requirement: "LIVE-03"
    verification:
      - kind: integration
        ref: "cd ui && bun run probe:live#transport_index_0"
        status: pass
      - kind: other
        ref: "static source checks: no rank option in live-clients.ts or wagmi.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Production clients deliver heartbeat blocks and open BridgeFinalized subscriptions over open sockets on both chains"
    requirement: "LIVE-03"
    verification:
      - kind: integration
        ref: "cd ui && bun run probe:live#heartbeat_block and bridge_finalized_subscription"
        status: pass
    human_judgment: false
  - id: D4
    description: "The staleness formula and four-member transport-mode priority are pure and total"
    requirement: "LIVE-06"
    verification:
      - kind: unit
        ref: "ui/src/lib/live-transport.test.ts#staleness and transport mode tests"
        status: pass
    human_judgment: false
  - id: D5
    description: "Removed logs roll back entries and duplicate or mixed-case messageIds collapse deterministically with last write winning"
    requirement: "LIVE-07"
    verification:
      - kind: unit
        ref: "ui/src/lib/live-transport.test.ts#messageId merge and rollback tests"
        status: pass
    human_judgment: false
  - id: D6
    description: "The existing 2,000-block getLogs chunk is accepted by both configured production clients"
    requirement: "LIVE-08"
    verification:
      - kind: integration
        ref: "cd ui && bun run probe:live#get_logs_chunk"
        status: pass
    human_judgment: false

duration: ~8min
completed: 2026-07-25
status: complete
---

# Phase 2 Plan 1: Verified WebSocket Transport and Pure Live-State Primitives Summary

**Both testnets now have notification-proven PublicNode WSS transports at fallback index 0, verified end to end through the production clients, plus pure and tested staleness, transport-health, messageId dedupe, and reorg-rollback primitives.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-07-25T17:43:00+01:00
- **Tasks:** 2 completed
- **Files:** 6 created, 4 modified

## Accomplishments

- Added a bounded, credential-free smoke script that distinguishes a subscription acknowledgement from a real notification.
- Verified all four candidates. PublicNode was the first passing candidate for both chains; dRPC also passed both.
- Added both PublicNode winners to `rpcUrls` and wired identical WebSocket-first conditional fallbacks into dedicated live clients and wagmi.
- Proved both production clients report `webSocket` at index 0, deliver live blocks, keep an open socket while a `BridgeFinalized` watch is active, and accept the existing 2,000-block log range.
- Added 20 pure transport tests covering the staleness formula, all 16 transport-mode pairs, case-insensitive messageId dedupe, last-write-wins ordering, and removed-log rollback.
- Full UI suite passes: 90 tests, 761 assertions, 0 failures; TypeScript and IDE lint diagnostics are clean.

## LIVE-02 Smoke Evidence

The first run inside the restricted command sandbox produced immediate socket errors and was
discarded as infrastructure-blocked evidence. The same bounded script was rerun with unrestricted
network access. This is the full successful output:

```text
$ bun scripts/smoke-ws.ts
{"timestamp":"2026-07-25T16:38:59.566Z","chain":"baseSepolia","provider":"publicnode","url":"wss://base-sepolia-rpc.publicnode.com","status":"pass","subscriptionId":"0x40a47d522d2e4f99544ff8ac0eb3a376","notificationLatencyMs":1389}
{"timestamp":"2026-07-25T16:38:59.566Z","chain":"baseSepolia","provider":"drpc","url":"wss://base-sepolia.drpc.org","status":"pass","subscriptionId":"0xc4b520add435d5b8b6b7e32b79dfce0ae7fe3760","notificationLatencyMs":1447}
{"timestamp":"2026-07-25T16:38:59.566Z","chain":"arbitrumSepolia","provider":"publicnode","url":"wss://arbitrum-sepolia-rpc.publicnode.com","status":"pass","subscriptionId":"0x825e099107f2dcf40bf44132d7c49d0a","notificationLatencyMs":549}
{"timestamp":"2026-07-25T16:38:59.566Z","chain":"arbitrumSepolia","provider":"drpc","url":"wss://arbitrum-sepolia.drpc.org","status":"pass","subscriptionId":"0xc4fff68eb52af9e0acd245a15c263f4d8dbd4c7e","notificationLatencyMs":364}
{"timestamp":"2026-07-25T16:38:59.566Z","status":"summary","winners":{"baseSepolia":"publicnode","arbitrumSepolia":"publicnode"}}
```

Per-chain outcome:

- Base Sepolia: PublicNode passed and was selected; `rpcUrls.baseSepolia.ws` is populated. dRPC also passed.
- Arbitrum Sepolia: PublicNode passed and was selected; `rpcUrls.arbitrumSepolia.ws` is populated. dRPC also passed.
- No chain is HTTP-only.
- No keyed or credentialed URL was introduced or printed.

## Production Subscription Probe Evidence

Full `cd ui && bun run probe:live` output:

```text
$ bun scripts/probe-live-subscription.ts
{"timestamp":"2026-07-25T16:40:46.834Z","status":"pass","check":"transport_index_0","chain":"baseSepolia","chainId":84532,"transportType":"webSocket"}
{"timestamp":"2026-07-25T16:40:46.836Z","status":"pass","check":"transport_index_0","chain":"arbitrumSepolia","chainId":421614,"transportType":"webSocket"}
{"timestamp":"2026-07-25T16:40:47.568Z","status":"pass","check":"heartbeat_block","chain":"arbitrumSepolia","chainId":421614,"blockNumber":"291248225"}
{"timestamp":"2026-07-25T16:40:47.687Z","status":"pass","check":"heartbeat_block","chain":"baseSepolia","chainId":84532,"blockNumber":"44614679"}
{"timestamp":"2026-07-25T16:40:48.547Z","status":"pass","check":"bridge_finalized_subscription","chain":"arbitrumSepolia","chainId":421614,"socketReadyState":1,"expectedSocketReadyState":1}
{"timestamp":"2026-07-25T16:40:48.726Z","status":"pass","check":"bridge_finalized_subscription","chain":"baseSepolia","chainId":84532,"socketReadyState":1,"expectedSocketReadyState":1}
{"timestamp":"2026-07-25T16:40:48.727Z","status":"pass","check":"get_logs_chunk","chain":"arbitrumSepolia","chainId":421614,"fromBlock":"291246230","toBlock":"291248229","blockCount":"2000","logCount":0}
{"timestamp":"2026-07-25T16:40:49.066Z","status":"pass","check":"get_logs_chunk","chain":"baseSepolia","chainId":84532,"fromBlock":"44612680","toBlock":"44614679","blockCount":"2000","logCount":0}
```

The existing `scanConfiguration.chunkSize` of 2,000 blocks is accepted on both production clients;
no provider range retuning is needed before wave 3.

## Runtime Accessor Paths

The installed `viem@2.55.5` fallback transport exposes its instantiated inner transports at:

```ts
client.transport.transports[0]
```

The exact index-0 type path is:

```ts
client.transport.transports[0].config.type
```

The exact socket path, after verifying the index-0 value exposes `getSocket`, is:

```ts
client.transport.transports[0].value.getSocket()
```

The probe observed `config.type === 'webSocket'` and `readyState === WebSocket.OPEN` (`1`) for both
chains.

## Deviations from Plan

One installed-API correction was required. The plan's pseudocode passed
`event: bridgeFinalizedEvent` to `client.watchContractEvent`, but viem's installed
`watchContractEvent` API accepts `abi` plus `eventName`, not an `event` property. The probe uses:

```ts
client.watchContractEvent({
  address,
  abi: [bridgeFinalizedEvent],
  eventName: 'BridgeFinalized',
  // callbacks
})
```

This still imports and exercises the named generated event fragment and TypeScript rejects the
plan's unsupported property. `client.getLogs` does accept `event`, so that call uses the fragment
directly as planned.

## Task Commits

No commits were created because the user requested implementation but did not request a commit.

## Next Phase Readiness

- Plan 02-02 can build the seed-subscribe-degrade engine on two verified WebSocket-first clients.
- Plans 02-03 and 02-04 can import the named event fragments and pure merge/rollback primitives.
- The 2,000-block scan chunk is confirmed compatible with both configured providers.
- No transport endpoint or type uncertainty remains for the next wave.

## Self-Check: PASSED

- `bun run smoke:ws` → four pass verdicts and one winner summary
- `cd ui && bun run probe:live` → all eight checks pass
- `cd ui && bun test src/lib/live-transport.test.ts` → 20 pass
- `cd ui && bun test` → 90 pass, 0 fail
- `cd ui && bun run typecheck` → exit 0
- No lint diagnostics in changed TypeScript files
- No credentialed URL, `ws` dependency, ethers import, wallet-state chain inference, or transport ranking option
