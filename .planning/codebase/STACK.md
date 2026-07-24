# Technology Stack

**Analysis Date:** 2026-07-24

## Languages

**Primary:**
- Solidity 0.8.28 - Smart contracts for the L2 bridge (`contracts/src/`)
- TypeScript 5.9.3 (UI) / 7.0.2 (relayer) - Full strict mode - UI and relayer applications (`ui/`, `relayer/`)
- HTML/CSS - UI styling with TailwindCSS 4.3.3 (`ui/src/app/`)

## Runtime

**Environment:**
- Bun 1.2.0 - Primary runtime for TypeScript execution and development
- Node.js (compatible) - Can run TypeScript/JavaScript via Bun
- Foundry/Forge - Solidity development and testing runtime

**Package Manager:**
- Bun 1.2.0 - Configured as primary package manager in root `package.json`
- Lockfile: `bun.lock` (Bun's native lockfile format)

## Frameworks

**Core:**
- Next.js (latest) - React SSR framework for UI (`ui/`)
- React (latest) - UI library with strict type safety
- Solidity 0.8.28 - Smart contract language with OpenZeppelin dependencies

**Web3:**
- viem 2.55.5 (relayer) / 2.x (UI) - Ethereum client library (primary, no ethers.js)
- wagmi 2.x - React hooks for Ethereum (`ui/`)
- @rainbow-me/rainbowkit 2.x - Wallet connection UI (`ui/`)

**State Management:**
- @tanstack/react-query (latest) - Server state management in UI

**Styling:**
- TailwindCSS 4.3.3 - Utility CSS framework
- @tailwindcss/postcss 4.3.3 - PostCSS integration
- PostCSS 8.5.22 - CSS processing

**Monorepo:**
- Turbo 2.5.0 - Monorepo orchestration at root level (`turbo.json`)

**Build & Dev:**
- Foundry (Forge) - Solidity build, test, and deployment (`contracts/foundry.toml`)
- TypeScript 5.9.3 - Type checking (strict mode enabled)

## Key Dependencies

**Critical:**
- viem 2.55.5 - Web3 client library; handles contract calls, wallet interactions, chain management
- wagmi 2.x - React hooks layer over viem; wallet connection, chain switching
- @rainbow-me/rainbowkit 2.x - Wallet UI for MetaMask, WalletConnect, and other providers
- openzeppelin-contracts (via git submodule in `contracts/lib/`) - ERC20, access control, security utilities
- Bun runtime - Execution environment for relayer and build processes

**Infrastructure:**
- Turbo 2.5.0 - Cross-workspace builds and dependency management
- @tanstack/react-query (latest) - Async state and caching for bridge messages
- TypeScript 5.9.3+ - Strict type checking across UI and relayer

## Configuration

**Environment:**
- Bun automatically loads `.env` files (no dotenv package needed)
- Environment variables configure:
  - Relayer private key (`RELAYER_PRIVATE_KEY`)
  - RPC endpoints for chains (fallback to DRPC if primary fails)
  - WalletConnect project ID (`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`)
  - Bridge and token addresses (`NEXT_PUBLIC_*_ADDRESS` env vars)
- See `.env.example` files in each workspace for required configuration

**Build:**
- `tsconfig.json` (root) - Shared strict TypeScript settings with bundler module resolution
- `ui/tsconfig.json` - Extends root, adds Next.js plugin and DOM types
- `relayer/tsconfig.json` - Extends root, targets ES2022
- `contracts/foundry.toml` - Solidity compiler settings (0.8.28, optimizer enabled with 200 runs)
- `turbo.json` - Build order: `build` depends on transitive builds, `test` depends on `build`

## Platform Requirements

**Development:**
- Bun 1.2.0+ installed
- Node.js 18+ (for compatibility, though Bun is primary)
- Foundry installed (for contract compilation and testing)
- TypeScript 5.9.3+ in IDE

**Production:**
- Bun runtime for relayer deployment
- Browser with Web3 wallet support (MetaMask, etc.) for UI
- Access to Base Sepolia and Arbitrum Sepolia testnet RPC endpoints
- `.env` file with secrets at deployment time

## Deployment Targets

**Contracts:**
- Base Sepolia testnet - Collateral bridge (ERC20 locking)
- Arbitrum Sepolia testnet - Synthetic bridge (wrapped token minting)

**UI:**
- Static Next.js build with SSR capability
- Runs client-side Web3 wallet connections

**Relayer:**
- Bun standalone binary (builds to `dist/index.ts` as compiled bundle)
- Watches Base Sepolia and Arbitrum Sepolia for bridge events
- Executes cross-chain message relay

---

*Stack analysis: 2026-07-24*
