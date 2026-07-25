# Phase 2: RPC Transport & Live Event Subscription - Pattern Map

**Mapped:** 2026-07-25
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `ui/src/lib/config.ts` (modify) | config | CRUD (constant read) | itself (existing `rpcUrls`/`scanConfiguration`) | exact — extend in place |
| `ui/src/wagmi.ts` (modify) | provider/config | request-response | itself (existing `transports` map) | exact — extend in place |
| `ui/src/hooks/use-bridge-messages.ts` (modify) | hook | streaming (was: poll) | itself (module-level client + `scanChain`) | exact — upgrade in place |
| `ui/src/hooks/use-relay-status.ts` (new) | hook | streaming/event-driven | `ui/src/hooks/use-bridge-messages.ts` | role-match, same architecture family |
| `scripts/smoke-ws.ts` (new, repo root — see rationale below) | utility/CLI | request-response (one-shot WS probe) | `relayer/src/watcher.ts` + `relayer/src/logger.ts` | partial — closest existing "poll chain, log status" precedent; no existing standalone script exists |
| Watchdog/heartbeat logic embedded in both hooks (`watchBlocks`-based) | utility (in-hook) | event-driven | `relayer/src/watcher.ts` (`pollWatcher`/`runWatcher` loop-with-checkpoint shape) | partial — same "poll, checkpoint, log status" spirit, different runtime (browser `useEffect` vs Bun loop) |

**Note on `scripts/smoke-ws.ts` location:** No `scripts/` directory exists yet at repo root or under `ui/`. Per CONTEXT.md, this is Claude's discretion. Repo root is recommended because the script does not import any `ui/`-workspace code (it only needs Bun's native `WebSocket` and a hand-rolled `logJson`, per RESEARCH.md's explicit note that `relayer/src/logger.ts` is not importable across the workspace boundary) — putting it at `ui/scripts/` would misleadingly imply a Next.js/UI-workspace dependency it doesn't have. Root `package.json` was not read this session; if a `scripts` entry is wired (Claude's discretion per D-04), check root `package.json` before assuming shape.

## Pattern Assignments

### `ui/src/lib/config.ts` (config, modify)

**Analog:** itself — extend existing shape.

**Current `RpcUrls` type and `rpcUrls` constant** (`ui/src/lib/config.ts` lines 5-45):
```typescript
type RpcUrls = {
  [chain: string]: {
    default: string;
    fallback: string;
  };
};

export const rpcUrls: RpcUrls = {
  baseSepolia: {
    default: baseSepolia.rpcUrls.default.http[0],
    fallback: "https://base-sepolia.drpc.org"
  },
  arbitrumSepolia: {
    default: arbitrumSepolia.rpcUrls.default.http[0],
    fallback: "https://arbitrum-sepolia.drpc.org"
  }
}
```

**Pattern to copy:** Add a `ws` member to the `RpcUrls` type (`ws?: string` recommended per D-02/D-03's "must be able to express no verified endpoint" requirement — an optional string is the simplest way to express absence without a sentinel value) and populate per-chain after the smoke test resolves winners. Keep the flat object-literal shape exactly as-is; do not switch to a class or factory.

**`scanConfiguration`** (lines 53-57) is reused unmodified as the seed-scan tuning (`blockWindow: 50_000n`, `chunkSize: 2_000n`); `pollingInterval: 6_000` is the value D-06 restricts to fallback-mode-only — do not delete it, its meaning changes but the constant is still needed.

---

### `ui/src/wagmi.ts` (provider/config, modify)

**Analog:** itself.

**Current transports map** (`ui/src/wagmi.ts` lines 1-24):
```typescript
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { fallback } from "viem";
import { cookieStorage, createStorage, http } from 'wagmi'
import { arbitrumSepolia, baseSepolia } from 'wagmi/chains'

import { rpcUrls } from '@/lib/config'

export function getConfig() {
  return getDefaultConfig({
    appName: 'Mint & Lock Bridge',
    projectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
      'development-project-id',
    chains: [baseSepolia, arbitrumSepolia],
    ssr: true,
    transports: {
      [baseSepolia.id]: fallback([http(rpcUrls.baseSepolia.default), http(rpcUrls.baseSepolia.fallback)]),
      [arbitrumSepolia.id]: fallback([
        http(rpcUrls.arbitrumSepolia.default),
        http(rpcUrls.arbitrumSepolia.fallback)
      ])
    },
  })
}
```

**Pattern to copy (per D-05):** Add a conditional `webSocket()` at index 0 per chain, mirroring Pattern 1 from RESEARCH.md — `rpcUrls.baseSepolia.ws ? fallback([webSocket(rpcUrls.baseSepolia.ws), http(...), http(...)]) : fallback([http(...), http(...)])`. `rank` must stay unset (default `false`) — do not add `{ rank: true }` anywhere in this file. `import { fallback, webSocket } from "viem"` — note the existing file already imports `http` from `wagmi`, not `viem`; keep that split (`webSocket`/`fallback` from `viem`, `http`/`cookieStorage`/`createStorage` from `wagmi`) consistent with the current import layout.

---

### `ui/src/hooks/use-bridge-messages.ts` (hook, modify — upgrade in place)

**Analog:** itself. This is the file being upgraded; every new pattern in this phase should match its existing conventions exactly.

**Imports pattern** (lines 1-18):
```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createPublicClient,
  http,
  fallback,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
} from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'

import { bridgeAbi } from '@/lib/abis'
import type { BridgeMessage } from '@/lib/bridge'
import { addresses, rpcUrls, scanConfiguration } from '@/lib/config'
```
For the phase-2 upgrade: add `webSocket` and `watchBlocks`-adjacent types to this import list; replace `import { bridgeAbi } from '@/lib/abis'` with named event-fragment imports from `@/lib/generated.ts` per Phase 1's D-04 (positional `bridgeAbi[0]`/`bridgeAbi[1]` access at lines 121/128 below must become named `event:` references — `abis.ts` is deleted by Phase 1).

**Module-level two-client pattern** (lines 20-34) — the load-bearing precedent for both hooks in this phase, cited directly in CONTEXT.md D-05:
```typescript
const baseClient = createPublicClient({
  chain: baseSepolia,
  transport: fallback([
    http(rpcUrls.baseSepolia.default),
    http(rpcUrls.baseSepolia.fallback),
  ])
})

const arbitrumClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: fallback([
    http(rpcUrls.arbitrumSepolia.default),
    http(rpcUrls.arbitrumSepolia.fallback),
  ])
})
```
Upgrade pattern: wrap each `transport:` value in RESEARCH.md's Pattern 1 conditional (`rpcUrls.baseSepolia.ws ? fallback([webSocket(...), http(...), http(...)]) : fallback([http(...), http(...)])`). This exact two-client-outside-React shape is also the correct shape for `use-relay-status.ts` (Pitfall 6 — never infer chain from wallet).

**Bounded seed-scan primitive `scanChain()`** (lines 90-158) — reuse verbatim as the LIVE-04 seed and the D-06 slow reconciliation pass, per RESEARCH.md's explicit "don't hand-roll" guidance:
```typescript
async function scanChain<TTransport extends Transport, TChain extends Chain>({
  client,
  bridgeAddress,
  chainId,
}: {
  client: PublicClient<TTransport, TChain>
  bridgeAddress: Address | undefined
  chainId: number
}): Promise<ChainEvents> {
  if (!bridgeAddress) return { initiated: [], finalized: [] }

  const latestBlock = await client.getBlockNumber()
  const fromBlock =
    latestBlock >= scanConfiguration.blockWindow
      ? latestBlock - scanConfiguration.blockWindow + 1n
      : 0n
  // ... chunked getLogs loop by scanConfiguration.chunkSize, strict: true
}
```
Do not reimplement this loop for the new WS-subscription seed; call `scanChain()` directly before opening the live subscription, and again on the ~60s reconciliation interval (D-06).

**Block-timestamp cache pattern** (lines 36, 68-88) — module-level `Map` keyed `${chainId}:${blockNumber}`, the existing precedent for any new cross-lifecycle cache (e.g. a `lastHeartbeatAt` ref is per-hook-instance via `useRef`, not this module-level `Map` pattern — don't conflate the two; the `Map` is specifically for expensive RPC-derived values that are safe to cache indefinitely across all hook instances).

**Result-object shape `UseBridgeMessagesResult`** (lines 61-66) — the shape both hooks in this phase must extend, per D-07:
```typescript
interface UseBridgeMessagesResult {
  messages: BridgeMessage[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}
```
Add `transportMode: 'connected' | 'stale' | 'reconnecting' | 'polling-fallback'` as a new field, following the existing `status: 'pending' | 'finalized'` string-literal-union convention in `ui/src/lib/bridge.ts` line 16.

**Hook lifecycle / cleanup pattern** (lines 212-244) — the existing `useEffect` + `setInterval` + cleanup shape to extend (not replace) with the subscription/watchdog/heartbeat teardown from RESEARCH.md Pattern 2:
```typescript
export function useBridgeMessages(): UseBridgeMessagesResult {
  const [messages, setMessages] = useState<BridgeMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isFetchingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      setMessages(await fetchMessages())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to scan events')
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), scanConfiguration.pollingInterval)
    return () => window.clearInterval(interval)
  }, [refresh])

  return { messages, isLoading, error, refresh }
}
```
Per D-06, this `setInterval(refresh, 6_000)` becomes the **fallback-only** fast-poll path (gated by `transportMode === 'polling-fallback'`), not the default; the default path becomes `watchContractEvent` + a slow (~60s) reconciliation `setInterval` calling the same `refresh`/`scanChain`. The single-cleanup-function-returns-all-teardowns convention (Pitfall — StrictMode double-subscribe) should be followed here: one `return () => { unwatchEvents(); unwatchHeartbeat(); clearInterval(watchdogTimer); clearInterval(reconcileTimer) }`.

---

### `ui/src/hooks/use-relay-status.ts` (hook, new)

**Analog:** `ui/src/hooks/use-bridge-messages.ts` (same file, different section emphasis — this is a new file, so treat the whole analog as the template).

**Pattern to copy:** Same `'use client'` header, same module-level two-client (`baseClient`/`arbitrumClient`) pattern (do not build a third client type — reuse or mirror the exact `createPublicClient({ chain, transport: ... })` shape). Single-message scope means no `scanChain`-style loop is needed for the primary watch, but the LIVE-04 seed step still requires one bounded `getLogs` call (scoped by `messageId` via `args: { messageId }` on `getLogs`, not a full chain scan) before the subscription opens — mirror `scanChain`'s chunking discipline if the seed lookback window is non-trivial, otherwise a single unchunked `getLogs` call bounded by `scanConfiguration.blockWindow` is sufficient for a single message.

**Object-parameter convention:** functions taking 2+ args use a single destructured object parameter, e.g. `scanChain({ client, bridgeAddress, chainId })` — apply the same to any new helper (e.g. `watchRelayStatus({ client, chainId, messageId, onUpdate })`).

**Result shape:** follow `UseBridgeMessagesResult`'s pattern — likely `{ status: 'pending' | 'finalized', transportMode: ..., error: string | null }` or similar, named to match this hook's single-message scope; do not reuse `BridgeMessage[]` as the return type.

---

### `scripts/smoke-ws.ts` (utility/CLI, new)

**Analog:** `relayer/src/watcher.ts` (poll/log-status loop shape) + `relayer/src/logger.ts` (structured logging shape). No existing standalone script in the repo to copy file-level scaffolding from — this is a genuinely new artifact.

**Structured logging shape to copy** (`relayer/src/logger.ts`, full file, lines 1-19):
```typescript
export interface LogEntry {
  status: string
  [key: string]: unknown
}

export type Log = (entry: LogEntry) => void

export function logJson(entry: LogEntry): void {
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        ...entry,
      },
      (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    ),
  )
}
```
Per RESEARCH.md, this cannot be imported across the `relayer`/`ui` workspace boundary — `scripts/smoke-ws.ts` must define its own equivalent 5-line `logJson` helper (same field shape: mandatory `status`, ISO `timestamp` spread first, bigint-safe `JSON.stringify` replacer) rather than importing `relayer/src/logger.ts` directly.

**Error-message extraction pattern** (`relayer/src/watcher.ts` lines 115-117), reuse verbatim as the shape for catching `WebSocket`/`JSON.parse` errors in the smoke script:
```typescript
function getErrorMessage({ error }: { error: unknown }): string {
  return error instanceof Error ? error.message : String(error)
}
```

**Object-parameter + explicit-return-type convention** (`relayer/src/watcher.ts` lines 28-35, `pollWatcher`) — apply the same shape to the smoke test's core function:
```typescript
export async function pollWatcher({
  chain,
  client,
  confirmations,
  state,
  onLog,
  log,
}: Omit<WatcherOptions, "pollIntervalMs" | "signal">): Promise<void> {
```
i.e. `async function smokeTestWs({ chain, url, timeoutMs }: { chain: string; url: string; timeoutMs?: number }): Promise<SmokeResult>` — matches both this codebase's convention and RESEARCH.md's own skeleton (RESEARCH.md Code Examples section already provides a near-complete implementation using Bun's native `WebSocket` — no `ws` package).

**No test-file analog exists** for this script (no smoke-test-style scripts anywhere in the repo); this is a "no analog" item for its own execution/CLI harness, but its internal logic patterns (logging, error extraction, object params) are fully covered by the citations above.

---

## Shared Patterns

### Two-client-per-chain, module-level, wallet-independent
**Source:** `ui/src/hooks/use-bridge-messages.ts` lines 20-34
**Apply to:** `use-bridge-messages.ts` (upgrade in place) and `use-relay-status.ts` (new)
```typescript
const baseClient = createPublicClient({ chain: baseSepolia, transport: /* fallback([...]) */ })
const arbitrumClient = createPublicClient({ chain: arbitrumSepolia, transport: /* fallback([...]) */ })
```
Never infer `chainId` from a connected wallet (Pitfall 6 / LIVE-01) — both new/modified hooks must keep this exact two-constant-outside-React shape.

### WebSocket-first fallback, rank disabled
**Source:** RESEARCH.md Pattern 1 (synthesizing `ui/src/wagmi.ts` and `ui/src/hooks/use-bridge-messages.ts`'s existing `fallback([http, http])` shape)
**Apply to:** `ui/src/lib/config.ts` (`ws` field), `ui/src/wagmi.ts` (`transports` map), `ui/src/hooks/use-bridge-messages.ts` (`baseClient`/`arbitrumClient`), `ui/src/hooks/use-relay-status.ts` (its own clients)
```typescript
transport: rpcUrls.baseSepolia.ws
  ? fallback([webSocket(rpcUrls.baseSepolia.ws), http(rpcUrls.baseSepolia.default), http(rpcUrls.baseSepolia.fallback)])
  : fallback([http(rpcUrls.baseSepolia.default), http(rpcUrls.baseSepolia.fallback)])
```
`rank` must never be set to `true` anywhere it's introduced this phase.

### Bounded, chunked `getLogs` seed/reconciliation
**Source:** `ui/src/hooks/use-bridge-messages.ts` lines 90-158 (`scanChain`)
**Apply to:** LIVE-04 seed step in both hooks; D-06's ~60s reconciliation pass in `use-bridge-messages.ts`
Reuse `scanChain()` directly — do not reimplement chunking/windowing logic.

### Merge-by-`messageId`, never append; check `log.removed`
**Source:** RESEARCH.md Pattern 3 (new pattern, no direct existing-code precedent — the existing `fetchMessages()` in `use-bridge-messages.ts` lines 173-178 already merges `finalized` by `messageId` via a `Map`, which is the closest existing precedent)
```typescript
const finalizedById = new Map(
  [...baseEvents.finalized, ...arbitrumEvents.finalized].map((event) => [event.messageId, event]),
)
```
**Apply to:** both hooks' `onLogs` callbacks — extend this existing `Map`-keyed-by-`messageId` merge pattern to also delete-on-`removed` (LIVE-07/LIVE-08).

### Result-object shape with `transportMode`
**Source:** `ui/src/hooks/use-bridge-messages.ts` lines 61-66 (`UseBridgeMessagesResult`); string-literal union precedent from `ui/src/lib/bridge.ts` line 16 (`status: 'pending' | 'finalized'`)
**Apply to:** both hooks' return types, per D-07.

### Structured JSON logging with mandatory `status`
**Source:** `relayer/src/logger.ts` (full file, 19 lines) — cannot be imported into `ui/` or root `scripts/`; redefine equivalently.
**Apply to:** `scripts/smoke-ws.ts` only (the only new artifact outside the `ui/` React tree in this phase).

### Poll-loop-with-checkpoint/logging shape
**Source:** `relayer/src/watcher.ts` lines 28-87 (`pollWatcher`/`runWatcher`)
**Apply to:** conceptual precedent for the staleness watchdog's `setInterval` check loop in both hooks — not a direct copy (browser `useEffect` cleanup differs from Bun's `AbortSignal` loop), but the "loop, check condition, log status transition" shape is the same spirit.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/smoke-ws.ts` (CLI entry/harness shape, as opposed to its internal logic) | utility | request-response (one-shot) | No standalone CLI script exists anywhere in the repo (`relayer/src/index.ts` is a long-running service entry point, not a one-shot script) — RESEARCH.md's Code Examples section supplies a near-complete skeleton to use directly since no better in-repo precedent exists |
| Watchdog/heartbeat (`watchBlocks`-based staleness detection) | utility (in-hook) | event-driven | No existing heartbeat/health-check pattern anywhere in the UI codebase; RESEARCH.md Pattern 2 is the only available template |

## Metadata

**Analog search scope:** `ui/src/hooks/`, `ui/src/lib/`, `ui/src/wagmi.ts`, `relayer/src/`, repo root and `ui/` for existing `scripts/`
**Files scanned:** `ui/src/hooks/use-bridge-messages.ts`, `ui/src/lib/config.ts`, `ui/src/lib/bridge.ts`, `ui/src/wagmi.ts`, `relayer/src/watcher.ts`, `relayer/src/logger.ts`, `ui/package.json`
**Pattern extraction date:** 2026-07-25
