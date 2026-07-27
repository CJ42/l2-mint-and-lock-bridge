# External Integrations

**Analysis Date:** 2026-07-24

## APIs & External Services

**RPC Providers:**
- Base Sepolia public RPC (`baseSepolia.rpcUrls.default.http[0]` from viem)
  - SDK/Client: viem, wagmi
  - Fallback: `https://base-sepolia.drpc.org` (DRPC)
  - Used by: UI (`ui/src/lib/config.ts`), relayer (`relayer/src/config.ts`)

- Arbitrum Sepolia public RPC (`arbitrumSepolia.rpcUrls.default.http[0]` from viem)
  - SDK/Client: viem, wagmi
  - Fallback: `https://arbitrum-sepolia.drpc.org` (DRPC)
  - Used by: UI (`ui/src/lib/config.ts`), relayer (`relayer/src/config.ts`)

**Wallet Connection:**
- WalletConnect
  - Provider: Rainbow Wallet by @rainbow-me
  - Configuration: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` env var
  - Integration: `ui/src/wagmi.ts` → `getConfig()` → WagmiProvider
  - Supports: MetaMask, WalletConnect, and other wallet providers

## Data Storage

**On-Chain Storage:**
- Base Sepolia - Collateral bridge state and locked tokens (`contracts/src/`)
- Arbitrum Sepolia - Synthetic bridge state and wrapped token supply (`contracts/src/`)

**Local/Application Storage:**
- **Relayer State:** JSON file (`relayer/state.json`)
  - Stores: Last scanned block numbers per chain, processed message IDs
  - Loaded at startup: `relayer/src/state.ts` → `createStateStore()`
  - Persisted to disk after processing messages

- **Deployment Addresses:** `addresses.json` (repository root)
  - Contains bridge and token addresses per chain (Base Sepolia, Arbitrum Sepolia)
  - Consumed by: UI (`ui/src/lib/config.ts`), relayer (`relayer/src/config.ts`)
  - Can be overridden by environment variables (`NEXT_PUBLIC_*_ADDRESS`)

**File Storage:**
- Local filesystem only - no cloud storage
- Public assets in `ui/public/` (logos, etc.)

**Caching:**
- @tanstack/react-query (latest) - Client-side caching of bridge queries in UI
- No distributed cache (Redis, Memcached)

## Authentication & Identity

**Auth Provider:**
- Custom Web3 wallet-based authentication
- No traditional auth server or OAuth

**Implementation:**
- Relayer uses private key (`RELAYER_PRIVATE_KEY` env var)
  - Loaded: `relayer/src/config.ts` → `privateKeyToAccount(config.relayerPrivateKey)`
  - Used to sign transactions via `createWalletClient()` from viem
  
- UI uses connected wallet (via WalletConnect/MetaMask)
  - wagmi manages wallet connection state
  - User signs transactions with their wallet

**No Centralized User System:**
- All authentication is on-chain via wallet signatures
- No database of users or credentials

## Blockchain Interactions

**Contract ABIs:**
- Bridge contract ABI (`relayer/src/abi.ts`)
- Token (ERC20) contract ABI
- Loaded via viem's `readContract()` and `simulateContract()` functions

**Contract Addresses:**
- Stored in `addresses.json` and loaded at runtime
- Base Sepolia bridge: `deploymentAddresses.baseSepolia.collateralBridge`
- Arbitrum Sepolia bridge: `deploymentAddresses.arbitrumSepolia.syntheticBridge`
- Base USDC (canonical): `deploymentAddresses.baseSepolia.usdc`
- Arbitrum wrapped USDC: `deploymentAddresses.arbitrumSepolia.wrappedUsdc`

**Chain Configuration:**
- Base Sepolia chain object from viem (`viem/chains`)
- Arbitrum Sepolia chain object from viem (`viem/chains`)

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry, LogRocket, or similar

**Logs:**
- Relayer: Structured JSON logging via `relayer/src/logger.ts`
  - Uses `logJson()` helper function for consistent output format
  - No external log aggregation (stdout only)

**Performance Monitoring:**
- Not detected - No analytics or performance tracking services

## CI/CD & Deployment

**Hosting:**
- No automated deployment detected
- Contracts: Deployed manually via Forge scripts (`contracts/script/`)
- UI: Can be deployed to any static host (Next.js build artifact)
- Relayer: Runs as standalone Bun process

**CI Pipeline:**
- Not detected - No GitHub Actions, GitLab CI, or similar
- Local development and manual testing only

## Build Artifacts

**Contracts:**
- Output: `contracts/out/` directory
- Generated: ABI files, compiled bytecode
- Used by: UI and relayer via `relayer/src/abi.ts`

**UI:**
- Output: `.next/` directory (Next.js build)
- Generated: Static HTML, CSS, JavaScript bundles
- Configured in `turbo.json` as build output

**Relayer:**
- Output: `relayer/dist/` (when built)
- Generated: Standalone Bun executable
- Build command: `bun build src/index.ts --outdir dist --target bun`

## Environment Configuration

**Required env vars (Relayer):**
- `RELAYER_PRIVATE_KEY` - Hex-encoded private key for transaction signing
- Chain RPC endpoints - Loaded from viem defaults or custom URLs
- State file path - `relayer/src/config.ts` loads from `config.stateFile`

**Required env vars (UI):**
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - WalletConnect project ID (optional, defaults to development ID)
- Optional address overrides: `NEXT_PUBLIC_BASE_BRIDGE_ADDRESS`, `NEXT_PUBLIC_BASE_USDC_ADDRESS`, `NEXT_PUBLIC_ARBITRUM_BRIDGE_ADDRESS`, `NEXT_PUBLIC_ARBITRUM_WUSDC_ADDRESS`

**Secrets location:**
- `.env` files in each workspace (ignored by git, created from `.env.example`)
- Never committed to repository
- Loaded automatically by Bun at runtime

## Webhooks & Callbacks

**Incoming:**
- Not detected - No webhook endpoints

**Outgoing:**
- Not detected - Relayer polls chains via RPC, does not send webhooks

**Event Watching:**
- Relayer watches for `BridgeTxInitiated` events on both chains
- Implemented in `relayer/src/watcher.ts` via viem's polling mechanism
- Processes events and submits cross-chain messages via `relayer/src/submitter.ts`

## External Dependencies Summary

**Critical External Services:**
1. Public RPC endpoints (Base Sepolia, Arbitrum Sepolia)
2. WalletConnect for wallet connectivity
3. DRPC as fallback RPC provider

**If These Go Down:**
- UI cannot connect to wallets or send transactions
- Relayer cannot watch for bridge events or execute relays
- Contract reading/writing fails

**Mitigation:**
- Fallback RPC endpoints configured (DRPC)
- Multiple RPC transports via viem's `fallback()` mechanism
- See `relayer/src/config.ts` and `ui/src/lib/config.ts` for transport setup

---

*Integration audit: 2026-07-24*
