# Stack Research

**Domain:** Live, simulation-gated, error-decoding transaction flow UX in an existing Next.js App Router + wagmi v2 / viem v2 dApp
**Researched:** 2026-07-24
**Confidence:** MEDIUM-HIGH (hook/API surface confirmed against both live official docs and the actual installed `viem` source; RPC endpoint availability is LOW confidence and needs a runtime smoke test)

No new stack is being adopted. Every recommendation below uses packages already installed in `ui/package.json` (`wagmi ^2` → resolved `2.19.5`, `viem ^2` → resolved `2.55.5`, `@wagmi/cli` devDependency → resolved `2.10.0`, `@tanstack/react-query` latest → resolved `5.101.4`, `@rainbow-me/rainbowkit ^2` → resolved `2.2.11`). This document is the API-surface reference for wiring them together correctly.

## Recommended Stack

### Core Technologies

| Technology | Version (installed) | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `wagmi` | `2.19.5` (range `^2`) | React hooks for wallet/contract state | Already the project's Web3 hook layer; `useSimulateContract`, `useWriteContract`, `useWaitForTransactionReceipt`, `useWatchContractEvent` are all stable, documented hooks on this exact major version — no upgrade needed for this milestone |
| `viem` | `2.55.5` (range `^2`) | Low-level EVM client, transports, ABI codec | Project-wide "viem only" rule; `decodeErrorResult`, `BaseError`, `ContractFunctionRevertedError`, `InsufficientFundsError`, `webSocket()`, `fallback()`, `watchContractEvent` all live here and are what wagmi's hooks call under the hood |
| `@wagmi/cli` | `2.10.0` (devDependency, already installed, unused) | Generates typed ABI/hook bindings from a source of truth | Only package in the stack that needs to be *activated* this milestone — see "ABI Source of Truth" below |

### Supporting Libraries / APIs (all inside `wagmi`/`viem`, no new installs)

| API | Package | Purpose | When to Use |
|-----|---------|---------|-------------|
| `webSocket(url, opts)` | `viem` (re-exported by `wagmi`) | WS JSON-RPC transport | Wrap as the **first** entry in a `fallback([...])` array so `watchContractEvent` auto-detects it (see gotcha below) |
| `fallback(transports, opts)` | `viem` (re-exported by `wagmi`) | Ordered transport degradation | Already used in `ui/src/wagmi.ts` and `use-bridge-messages.ts` for HTTP-only fallback; extend with a `webSocket()` entry at index 0 |
| `useWatchContractEvent` | `wagmi` | React-bound live event subscription | Use only inside components/hooks that already read wagmi's `Config` from context |
| `watchContractEvent` (action) | `viem` | Non-React live event subscription | Use in `use-bridge-messages.ts`, which builds its own `createPublicClient` outside of React/wagmi context — matches the file's existing pattern |
| `useSimulateContract` | `wagmi` | Pre-flight dry-run before opening the wallet | Gate the submit button; feed `data.request` straight into `writeContract` |
| `simulateContract` (action) | `viem` | Non-hook simulate, e.g. inside the small error-mapping helper for manual retries | Rarely needed directly since the hook covers the UI path |
| `decodeErrorResult({ abi, data })` | `viem` | Decode raw revert calldata against an ABI | Fallback path for any revert not already carried as a typed `ContractFunctionRevertedError` (e.g. decoding a stored failed-tx hash later) |
| `BaseError` / `.walk(predicate)` | `viem` | Traverse nested error causes | Primary pattern for both `ContractFunctionRevertedError` (custom errors) and `InsufficientFundsError` (gas) |
| `ContractFunctionRevertedError` | `viem` | Typed revert with **already-decoded** `data.errorName` / `data.args` | Preferred over calling `decodeErrorResult` yourself — viem decodes internally at construction time (verified in `viem/errors/contract.ts`) |
| `InsufficientFundsError` | `viem` | Typed "not enough native token for gas × price + value" error | Drives the "You need ~0.0004 ETH on Base Sepolia" mapping |
| `useWriteContract` | `wagmi` | Submit a write, returns `writeContractAsync`, `isPending`, `data` (hash) | Already used in `bridge-card.tsx`; keep the existing `writeContractAsync` pattern, add the simulate gate in front of it |
| `useWaitForTransactionReceipt` | `wagmi` | Poll/wait for the submitted tx's receipt | Already used in `bridge-card.tsx`; drives "processing" / "confirmed" stepper states |

### ABI Source of Truth: `@wagmi/cli` foundry plugin (replaces both `lib/abis.ts` and the loose `collateral-abi.json`/`synthetic-abi.json`)

Two competing patterns exist in the working tree right now and neither is right long-term:

1. `ui/src/lib/abis.ts` — a hand-written `parseAbi([...])` with only `lock`/`burn`/events. **Missing every custom error.** Decoding `NotRelayer`, `BridgeMessageAlreadyProcessed`, `InvalidDestinationChainId`, `InvalidBridgeTxInputs` against this ABI will silently fail.
2. `collateral-abi.json` / `synthetic-abi.json` (untracked, root-level) — full `forge build` artifact ABIs, confirmed by inspection to include all 12 error fragments (`BridgeMessageAlreadyProcessed`, `EnforcedPause`, `ExpectedPause`, `InvalidBridgeTxInputs`, `InvalidDestinationChainId`, `NotRelayer`, `OwnableInvalidOwner`, `OwnableUnauthorizedAccount`, `ReentrancyGuardReentrantCall`, `RelayerCannotBeZeroAddress`, `SafeERC20FailedOperation`/`TokenCannotBeZeroAddress`). Correct content, but a manual copy step with no mechanism to stay in sync with `contracts/src/`.

**Recommendation:** add `ui/wagmi.config.ts` using the already-installed `@wagmi/cli` with its `foundry` plugin pointed at `../contracts`, and drop both `collateral-abi.json`/`synthetic-abi.json` and the hand-written `parseAbi` block:

```ts
// ui/wagmi.config.ts
import { defineConfig } from '@wagmi/cli'
import { foundry } from '@wagmi/cli/plugins'
import { react } from '@wagmi/cli/plugins'

export default defineConfig({
  out: 'src/lib/generated.ts',
  plugins: [
    foundry({
      project: '../contracts',        // foundry.toml lives here
      artifacts: 'out',               // matches contracts/foundry.toml `out = "out"`
      include: [
        'CollateralBridge.sol/**',
        'SyntheticBridge.sol/**',
        'IERC20.sol/**',              // or the project's ERC20 wrapper contract
      ],
      exclude: ['**/*.t.sol/**', '**/test/**'],
      forge: { build: true },         // runs `forge build` for you before reading `out/`
    }),
    react(),
  ],
})
```

Run with `bunx wagmi generate` (add as a `package.json` script, e.g. `"generate": "wagmi generate"`, run via `bun run generate`). This produces one generated file with the full ABI — including every custom error — that regenerates on demand from `forge build` output, so error decoding can never silently drift from the contracts. This is the direct answer to `TX_FLOW.md`'s "use the `collateral-abi.json`/`synthetic-abi.json` files" instruction: those files are the right *content* (raw forge ABI) but the wrong *mechanism* (manual copy). `@wagmi/cli` was already a devDependency for exactly this reason and was simply never wired up.

## Critical API Behavior: `fallback([webSocket(...), http(...)])` and live subscriptions

This is the load-bearing detail behind hard requirement #1 and is **not obvious from the docs alone** — confirmed by reading the actual `viem` action source (`actions/public/watchContractEvent.ts`) shipped in a local `viem@2.22.17` install, cross-checked against the officially documented behavior for `2.55.5`:

1. `watchContractEvent` (and therefore `useWatchContractEvent`) decides `poll` vs. subscribe like this:
   ```ts
   if (typeof poll_ !== 'undefined') return poll_
   if (client.transport.type === 'webSocket') return false            // subscribe
   if (client.transport.type === 'fallback' &&
       client.transport.transports[0].config.type === 'webSocket')
     return false                                                      // subscribe
   return true                                                         // poll (getFilterChanges/getLogs)
   ```
   **`transports[0]` — the WebSocket transport must be listed FIRST in the `fallback([...])` array**, or it silently falls back to HTTP polling with no error. This was originally reported as a bug ([viem#776](https://github.com/wevm/viem/issues/776), closed 2024) and the fix that shipped is exactly this index-0 introspection — it is present in the currently-installed viem line, but the ordering requirement is a hard constraint, not a nice-to-have.
2. When it does subscribe, `subscribeContractEvent()` finds the WebSocket transport inside the fallback list (`client.transport.transports.find(t => t.config.type === 'webSocket')`) and calls `.value.subscribe(...)` on it directly — this bypasses `fallback()`'s own request-level retry/degrade logic (`shouldThrow`/next-transport) entirely.
3. **Practical consequence:** `fallback()`'s automatic "try the next transport" behavior only applies to request/response JSON-RPC calls (`simulateContract`, `writeContract`, `readContract`, `getLogs`). It does **not** automatically move a live *subscription* from WebSocket to HTTP polling if the socket dies after its own `reconnect` attempts are exhausted. The mandatory HTTP-polling fallback for requirement #1 must be implemented in the app: listen on `onError` from `watchContractEvent`/`useWatchContractEvent`, and on that callback tear down the subscription and re-invoke the same action with `poll: true` (or keep the existing `use-bridge-messages.ts` `getLogs`-scan loop running as a slower reconciliation pass regardless of subscription state — the cheaper, more robust option for a demo).
4. Do **not** enable `fallback()`'s `rank` option (`rank: true`) on the client used for live events. `rank` defaults to `false`; if enabled it re-orders `transports` based on live latency/stability pings, which can move the WebSocket transport out of index 0 and silently degrade subscriptions to polling. Leave `rank` off on this client; it's fine to use on other read-only clients if desired.

```ts
// Recommended shape for the live-events client (viem action, matches use-bridge-messages.ts style)
import { createPublicClient, fallback, http, webSocket } from 'viem'
import { baseSepolia } from 'viem/chains'

const baseClient = createPublicClient({
  chain: baseSepolia,
  transport: fallback([
    webSocket(rpcUrls.baseSepolia.ws, {
      reconnect: { attempts: 5, delay: 2_000 }, // viem default; explicit for clarity
      retryCount: 3,
    }),
    http(rpcUrls.baseSepolia.default),
    http(rpcUrls.baseSepolia.fallback),
  ]),
  // rank intentionally omitted (default false) — keeps webSocket() pinned at index 0
})
```

## Hook Signatures & Exact Semantics (confirmed against live wagmi/viem docs, 2026)

### `useSimulateContract` (`wagmi`)

```ts
const { data, error, isPending, isSuccess, isFetching, status, refetch } =
  useSimulateContract({
    abi, address, functionName, args,
    query: { enabled: Boolean(/* form is valid */) }, // gate: don't fire until inputs are valid
  })
```
- `data.request` is the exact object to hand to `writeContract`/`writeContractAsync` — pass it through unchanged so the wallet prompt uses the already-validated calldata.
- `error` is `SimulateContractErrorType | null`. On a revert this is (or wraps) a `BaseError` whose `.walk()` chain contains a `ContractFunctionRevertedError` with `error.data.errorName`/`error.data.args` **already decoded** — no manual `decodeErrorResult` call needed in the common case.
- Gate the submit button on `!isSuccess || isFetching` in addition to the existing form-validity checks — this is what "before the wallet prompt opens" means concretely.

### `useWriteContract` (`wagmi`)

```ts
const { writeContractAsync, isPending, data: hash } = useWriteContract()
```
- `isPending` is `true` from the moment `writeContractAsync`/`writeContract` is called until it resolves or rejects — i.e. it spans **both** "wallet prompt is open" and "node has accepted the submitted tx" (it does not track on-chain confirmation). This matches `TX_FLOW.md`'s copy: *"Your transaction is being submitted to the network…"*.

### `useWaitForTransactionReceipt` (`wagmi`)

```ts
const { isFetching, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash, chainId })
```
- `isFetching` is `true` during the initial receipt fetch **and** any background refetch while polling — this is the "picked up and being processed…" state.
- `isSuccess` is `true` once a receipt has been fetched with no error, i.e. tx is mined and confirmed on the origin chain. This is *not* the same as "relayed to destination" — that third stepper state ("Bridge tx relayed") has to come from the `BridgeFinalized` event subscription, not from this hook.

### `useWatchContractEvent` (`wagmi`) / `watchContractEvent` (viem action)

```ts
useWatchContractEvent({
  abi, address, eventName: 'BridgeFinalized',
  onLogs(logs) { /* … */ },
  onError(err) { /* degrade to poll: true, see gotcha above */ },
  // poll: undefined — let viem auto-detect from the transport (see gotcha section)
})
```
- `batch` defaults `true` (all logs since last invocation delivered together).
- On an HTTP-only transport it calls `eth_newFilter` + `eth_getFilterChanges` on `pollingInterval`, falling back further to `eth_getLogs` if the RPC doesn't support filters at all (many public testnet RPCs don't).
- On a WebSocket transport (or `fallback()` with WS at index 0) it uses `eth_subscribe(["logs", …])` for push delivery — no polling interval involved.

### Error decoding (`viem`)

```ts
import { BaseError, ContractFunctionRevertedError, InsufficientFundsError } from 'viem'

function mapBridgeError(err: unknown, chainName: string): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const { errorName, args } = reverted.data ?? {}
      // switch on errorName — this is the "small, deliberately narrow, extensible" mapping layer
      if (errorName === 'BridgeMessageAlreadyProcessed')
        return `This transfer was already relayed (messageId ${args?.[0]}).`
      if (errorName === 'NotRelayer')
        return `Only the bridge relayer can call this (caller ${args?.[0]}).`
      // … add more named errors here as needed
      return `Transaction would revert: ${errorName}.`
    }

    const insufficientFunds = err.walk((e) => e instanceof InsufficientFundsError)
    if (insufficientFunds)
      return `You need a small amount of ETH on ${chainName} for gas — here's the faucet.`
  }
  return 'Transaction could not be submitted.'
}
```
- `decodeErrorResult({ abi, data })` returns `{ errorName, args }` and is only needed for raw hex you obtained yourself (e.g. from a stored past failure) — inside the `useSimulateContract`/`useWriteContract` error path, `ContractFunctionRevertedError.data` is already the decoded result (viem calls `decodeErrorResult` internally when constructing it — confirmed in `viem/errors/contract.ts`).

## Installation

No new packages required — everything above ships inside the already-installed `wagmi`, `viem`, and `@wagmi/cli`.

```bash
# Only new thing to wire up: a script to run the ABI generator
# add to ui/package.json "scripts": { "generate": "wagmi generate" }
bun run generate   # ui/, after adding wagmi.config.ts
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `@wagmi/cli` foundry plugin generating `generated.ts` | Committing `collateral-abi.json`/`synthetic-abi.json` as-is (per `TX_FLOW.md`) | Only if you truly cannot run `bunx wagmi generate` in CI/dev (e.g. no Foundry toolchain available in some environment) — otherwise this is strictly worse: no compile-time drift protection |
| Raw viem `watchContractEvent` action inside `use-bridge-messages.ts` | wagmi's `useWatchContractEvent` hook | Use the hook only for subscriptions that live inside a component that already reads wagmi `Config` from context (e.g. a small "connection status" widget); `use-bridge-messages.ts` intentionally builds its own clients outside React/wagmi, matching its current architecture |
| `fallback([webSocket(...), http(...), http(...)])` with WS pinned at index 0 | `webSocket()` alone with no fallback | Never for this project — `TX_FLOW.md`/`PROJECT.md` explicitly call WS-only unacceptable because public testnet WS endpoints are unreliable |
| Manual `onError`-driven degrade from subscription to `poll: true` | Relying on `fallback()`'s built-in retry to auto-degrade subscriptions | Never — as shown above, `fallback()`'s retry logic does not cover the subscription code path at all |
| `err.walk()` + typed error classes (`ContractFunctionRevertedError`, `InsufficientFundsError`) | String-matching on `error.message` | Never for the custom-error case — string matching is what the current `getTransactionError()` in `bridge-card.tsx` does for the generic "user rejected" case, and it's acceptable there only because there's no structured alternative for wallet-level rejection; for anything ABI-decodable, typed classes are strictly better and already exist |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `ethers.js` for any part of this (decoding, error typing, providers) | Project-wide hard rule; also viem's error classes/`decodeErrorResult` have no ethers equivalent with the same fidelity | `viem` exclusively, as above |
| Upgrading to `wagmi@3` | `@rainbow-me/rainbowkit@2.2.11` (installed, and its `latest` on npm as of this research) declares a peer dependency of `wagmi: ^2.9.0` — a v3 upgrade would break wallet connection and is far outside a UI-only milestone | Stay on `wagmi ^2` (current resolved: `2.19.5`); the hooks used here (`useSimulateContract`, `useWriteContract`, `useWaitForTransactionReceipt`, `useWatchContractEvent`) are stable v2 API and not deprecated |
| Manual `decodeErrorResult()` calls inside the `useSimulateContract`/`useWriteContract` catch blocks | Redundant — viem already decodes into `ContractFunctionRevertedError.data` for you; hand-rolling this duplicates logic and risks getting the ABI/selector matching subtly wrong | `err.walk(e => e instanceof ContractFunctionRevertedError)` then read `.data.errorName`/`.data.args` |
| `fallback()`'s `rank: true` option on the client used for live event subscriptions | Reorders the transport array based on live pings, which can move `webSocket()` out of index 0 and silently disable `eth_subscribe` in favor of polling, with no error surfaced | Leave `rank` at its default (`false`) for this client; only consider it for a read-only, non-subscribing client if ever needed |
| Hand-written `parseAbi([...])` fragments for anything involving custom errors (current `ui/src/lib/abis.ts`) | Easy to forget to add a new error when the contract gains one; already missing all 4+ custom errors today | Generated ABI from `@wagmi/cli` foundry plugin (includes every fragment automatically) |
| `shadcn/ui` stepper component (per `TX_FLOW.md`) | Out of scope per `PROJECT.md` — not initialized, UI is CSS Modules, one-component migration not worth it | Hand-built stepper in CSS Modules, described in `ARCHITECTURE.md`/`PITFALLS.md` if produced |

## Stack Patterns by Variant

**If wiring the stepper/button state machine inside `bridge-card.tsx` (a component already inside wagmi's `WagmiProvider`):**
- Use `useSimulateContract` → `useWriteContract` → `useWaitForTransactionReceipt`, all from `wagmi`, all reading the same `Config` already provided by `getConfig()` in `ui/src/wagmi.ts`
- Because these hooks need no extra plumbing — they already share the transport config (once it includes `webSocket()`) and the RainbowKit-connected account

**If updating `use-bridge-messages.ts`'s live event source (outside any component, module-level clients):**
- Use viem's `watchContractEvent` action directly on the existing `baseClient`/`arbitrumClient` `createPublicClient` instances, not the `useWatchContractEvent` hook
- Because the file is intentionally not React/wagmi-bound (it already builds its own clients so it can batch-scan two chains at once); introducing the hook here would force it into being called from inside a component tree for no benefit

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `wagmi@2.19.5` | `viem@2.55.5`, `@rainbow-me/rainbowkit@2.2.11` | RainbowKit 2.x hard-pins `wagmi: ^2.9.0` and `viem: 2.x` — do not bump either major version independently |
| `@wagmi/cli@2.10.0` | Foundry (`forge`) on `PATH` | The `forge: { build: true }` option shells out to `forge build`; confirm the same `forge` binary Foundry/CI already uses is discoverable, matching `contracts/foundry.toml` (`solc_version = 0.8.28`, `out = "out"`) |
| `viem@2.55.5`'s `fallback()` + `webSocket()` subscribe detection | Verified present via source inspection of `viem@2.22.17` (`actions/public/watchContractEvent.ts` lines ~157–167, ~299–309); behavior has been stable across the 2.x line since the fix for `viem#776` | Treat as reliable, but do a quick manual smoke test (open devtools Network→WS tab, confirm an `eth_subscribe` frame, not repeated `eth_getFilterChanges` polls) once wired up, since the exact `2.55.5` source wasn't directly inspected |

## RPC Endpoint Availability (LOW confidence — verify before relying on for the demo)

| Chain | HTTP (already in `ui/src/lib/config.ts`) | Candidate WS endpoint | Confidence |
|-------|---|---|-----|
| Base Sepolia | `https://sepolia.base.org` (default), `https://base-sepolia.drpc.org` (fallback) | `wss://base-sepolia-rpc.publicnode.com` — PublicNode documents a free, no-API-key RPC for this chain and its site labels a "SepoliaWS RPC" variant, but the exact `wss://` URL was not directly confirmed on the page content fetched during this research | LOW — PublicNode's convention (swap `https://` scheme for `wss://` on the same hostname) is well-established across their other chains, but not confirmed specifically for this hostname in this session |
| Arbitrum Sepolia | (project default) `https://sepolia-rollup.arbitrum.io/rpc`, `https://arbitrum-sepolia.drpc.org` (fallback) | `wss://arbitrum-sepolia-rpc.publicnode.com` — same PublicNode pattern; Arbitrum's own official public RPC (`sepolia-rollup.arbitrum.io/rpc`) is confirmed to have **no** WebSocket support at all | LOW, same caveat as above |

**Recommendation:** treat both WS URLs above as the first thing to smoke-test manually (`wscat -c wss://base-sepolia-rpc.publicnode.com` or a throwaway `webSocket()` client + `getBlockNumber()`) before wiring them into `lib/config.ts`. If either is flaky or unavailable, a free API key from Alchemy or Ankr (both confirmed to offer WS on these testnets, keyed) is the fallback — but given the mandatory HTTP-polling degrade path described above, the demo does not hard-depend on WS working at all; it only loses "live push" responsiveness and falls back to the existing 6s poll cadence.

## Sources

- https://wagmi.sh/react/api/hooks/useWatchContractEvent — fetched directly, MEDIUM confidence (official docs, not cross-verified against source for this specific hook, though same code path as `watchContractEvent` action)
- https://wagmi.sh/react/api/hooks/useSimulateContract — fetched directly, MEDIUM confidence
- https://wagmi.sh/react/api/hooks/useWriteContract — fetched directly, MEDIUM confidence
- https://wagmi.sh/react/api/hooks/useWaitForTransactionReceipt — fetched directly, MEDIUM confidence
- https://viem.sh/docs/contract/decodeErrorResult — fetched directly, MEDIUM confidence
- https://viem.sh/docs/contract/watchContractEvent — fetched directly, corroborated by source inspection, HIGH confidence
- https://viem.sh/docs/clients/transports/websocket — fetched directly, MEDIUM confidence
- https://viem.sh/docs/clients/transports/fallback — fetched directly, corroborated by source inspection, HIGH confidence
- https://viem.sh/docs/contract/simulateContract — fetched directly (BaseError/walk/ContractFunctionRevertedError pattern), MEDIUM confidence
- https://wagmi.sh/cli/api/plugins/foundry — fetched directly, MEDIUM confidence
- `viem@2.22.17` source, `actions/public/watchContractEvent.ts` and `clients/transports/fallback.ts` (read locally from a sibling project's `node_modules`) — HIGH confidence, direct source inspection, cross-checked against docs for `2.55.5`
- `viem` source, `errors/contract.ts` (`ContractFunctionRevertedError`) and `errors/node.ts` (`InsufficientFundsError`) — HIGH confidence, direct source inspection
- https://github.com/wevm/viem/issues/776 (+ `gh api` comments) — confirms the fallback/webSocket subscription-detection history; HIGH confidence on the historical bug, MEDIUM on "still current behavior" (corroborated by source read above)
- `npm view wagmi version`, `npm view @rainbow-me/rainbowkit peerDependencies` — HIGH confidence, direct registry query confirming wagmi v3 exists but RainbowKit still pins `wagmi: ^2.9.0`
- Local inspection: `collateral-abi.json`, `synthetic-abi.json`, `contracts/src/Errors.sol`, `ui/src/lib/abis.ts`, `ui/src/wagmi.ts`, `ui/src/lib/config.ts`, `ui/src/hooks/use-bridge-messages.ts`, `ui/src/components/bridge-card.tsx`, `ui/package.json` — ground truth for the existing codebase this research targets
- WebSearch for Base Sepolia / Arbitrum Sepolia public WSS endpoints — LOW confidence, unverified at runtime, flagged for a manual smoke test

---
*Stack research for: transaction-flow UX in a Next.js + wagmi/viem cross-chain bridge dApp (subsequent milestone, UI-only)*
*Researched: 2026-07-24*
