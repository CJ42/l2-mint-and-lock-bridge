# Codebase Structure

**Analysis Date:** 2026-07-24

## Directory Layout

```
l2-mint-and-lock-bridge/
├── contracts/              # Smart contracts (Solidity 0.8.27)
│   ├── src/                # Contract source
│   │   ├── BridgeBase.sol   # Abstract base with relayer, nonce, processed tracking
│   │   ├── CollateralTokenBridge.sol  # Lock/unlock on Base Sepolia
│   │   ├── SyntheticTokenBridge.sol   # Burn/mint on Arbitrum Sepolia
│   │   ├── WrappedToken.sol # ERC20 wrapper for synthetic token
│   │   ├── IBridge.sol      # Bridge interface
│   │   ├── Errors.sol       # Custom errors
│   │   ├── Types.sol        # BridgeMessage struct, chain IDs
│   │   └── BridgeLib.sol    # Message ID computation
│   ├── script/              # Deployment scripts
│   │   ├── DeployBase.s.sol   # Deploy CollateralTokenBridge to Base
│   │   └── DeployArb.s.sol    # Deploy SyntheticTokenBridge to Arbitrum
│   ├── test/                # Foundry tests
│   │   ├── BridgeUnit.t.sol   # Unit tests for bridge logic
│   │   ├── Replay.t.sol       # Replay attack prevention tests
│   │   └── TestSetup.sol      # Test utilities and fixtures
│   ├── lib/                 # External dependencies (OpenZeppelin, forge-std)
│   ├── out/                 # Compiled artifacts (generated)
│   ├── broadcast/           # Deployment records (generated)
│   ├── cache/               # Build cache (generated)
│   ├── foundry.toml         # Foundry configuration
│   └── package.json         # Solidity dev dependencies
│
├── relayer/                 # Relayer process (Bun + TypeScript)
│   ├── src/                 # Source code
│   │   ├── index.ts         # Entry point: setup clients, watchers, submitters
│   │   ├── config.ts        # Load config from env vars + addresses.json
│   │   ├── watcher.ts       # Poll for events, track checkpoints
│   │   ├── submitter.ts     # Queue and submit cross-chain transactions
│   │   ├── message.ts       # Reconstruct BridgeMessage from event log
│   │   ├── state.ts         # Checkpoint state store (JSON file)
│   │   ├── logger.ts        # Structured JSON logging
│   │   └── abi.ts           # Bridge ABI and event definitions
│   ├── test/                # Bun tests
│   │   ├── message.test.ts  # Message reconstruction tests
│   │   ├── state.test.ts    # State store tests
│   │   ├── submitter.test.ts # Submitter queue tests
│   │   └── watcher.test.ts  # Watcher polling tests (empty)
│   ├── dist/                # Compiled output (generated)
│   ├── tsconfig.json        # TypeScript configuration
│   ├── package.json         # Dependencies: viem, bun-types
│   └── bunfig.toml          # Bun bundler configuration
│
├── ui/                      # Next.js frontend (TypeScript + React)
│   ├── src/
│   │   ├── app/             # Next.js App Router
│   │   │   ├── page.tsx     # Home page with bridge interface
│   │   │   ├── layout.tsx   # Root layout with providers
│   │   │   ├── providers.tsx # Wagmi + RainbowKit setup
│   │   │   ├── globals.css  # Global styles
│   │   │   └── page.module.css # Page-level styles
│   │   ├── components/      # React components
│   │   │   ├── bridge-card.tsx       # Lock/burn bridge form
│   │   │   ├── bridge-card.module.css # Bridge card styles
│   │   │   ├── message-explorer.tsx  # View bridge messages
│   │   │   └── message-explorer.module.css # Explorer styles
│   │   ├── hooks/           # Custom React hooks
│   │   │   └── use-bridge-messages.ts # Fetch and cache messages
│   │   ├── lib/             # Utility libraries
│   │   │   ├── bridge.ts    # Bridge types, formatters, labels
│   │   │   ├── config.ts    # UI configuration (chain IDs, token addresses)
│   │   │   └── abis.ts      # Bridge ABI imports
│   │   └── public/          # Static assets
│   ├── next.config.ts       # Next.js configuration
│   ├── tsconfig.json        # TypeScript configuration
│   ├── package.json         # Dependencies: next, react, viem, rainbowkit
│   └── .next/               # Build output (generated)
│
├── .planning/               # GSD planning documents
│   └── codebase/            # Architecture, structure, concerns analysis
│
├── package.json             # Root monorepo configuration (Turbo)
├── tsconfig.json            # Root TypeScript configuration
├── turbo.json               # Turbo pipeline configuration
├── bun.lock                 # Bun lock file
├── addresses.json           # Deployment addresses (Base Sepolia, Arbitrum Sepolia)
├── CLAUDE.md                # Project specification and guidelines
├── SPECIFICATIONS.md        # Detailed protocol specification
└── README.md                # Project overview
```

## Directory Purposes

**`contracts/src/`:**
- Purpose: Smart contract implementations
- Contains: Bridge contracts, token wrapper, error definitions, type definitions
- Key files: `BridgeBase.sol` (abstract base), `CollateralTokenBridge.sol`, `SyntheticTokenBridge.sol`

**`contracts/script/`:**
- Purpose: Deployment automation
- Contains: Forge scripts for deploying to each chain
- Key files: `DeployBase.s.sol`, `DeployArb.s.sol`

**`contracts/test/`:**
- Purpose: Unit and integration tests
- Contains: Foundry tests for bridge logic, replay protection, state management
- Key files: `BridgeUnit.t.sol` (main tests), `TestSetup.sol` (fixtures)

**`relayer/src/`:**
- Purpose: Core relayer logic
- Contains: Event watcher, message submitter, configuration, logging
- Key files: `index.ts` (orchestration), `watcher.ts` (event polling), `submitter.ts` (tx submission)

**`relayer/test/`:**
- Purpose: Bun unit tests for relayer modules
- Contains: Tests for message reconstruction, state management, queue submission
- Key files: `message.test.ts`, `submitter.test.ts`

**`ui/src/app/`:**
- Purpose: Next.js App Router pages and layout
- Contains: Home page, root layout, provider setup, global styles
- Key files: `page.tsx` (home page), `layout.tsx`, `providers.tsx`

**`ui/src/components/`:**
- Purpose: Reusable React components
- Contains: Bridge form, message explorer, styling
- Key files: `bridge-card.tsx` (main form), `message-explorer.tsx`

**`ui/src/hooks/`:**
- Purpose: Custom React hooks for data fetching and state
- Contains: Hooks for bridge messages, wallet state
- Key files: `use-bridge-messages.ts`

**`ui/src/lib/`:**
- Purpose: Utility functions and type definitions
- Contains: Bridge types, formatters, configuration, ABIs
- Key files: `bridge.ts` (types, formatters), `config.ts` (chains, token addresses)

## Key File Locations

**Entry Points:**
- `relayer/src/index.ts`: Relayer process startup; loads config, creates clients, starts watchers
- `ui/src/app/page.tsx`: Next.js home page; renders bridge UI
- `ui/src/app/providers.tsx`: Wagmi + RainbowKit wallet provider setup
- `contracts/script/DeployBase.s.sol`: Base Sepolia deployment script
- `contracts/script/DeployArb.s.sol`: Arbitrum Sepolia deployment script

**Configuration:**
- `relayer/src/config.ts`: Relayer config loading (env vars, RPC endpoints, addresses)
- `ui/src/lib/config.ts`: UI config (chain IDs, token addresses, directions)
- `addresses.json`: Deployment addresses (shared between relayer, UI, contracts)
- `.env.example`: Example environment variables for relayer

**Core Logic:**
- `contracts/src/BridgeBase.sol`: Base contract with nonce, processed, relayer tracking
- `contracts/src/CollateralTokenBridge.sol`: Lock/unlock implementation (Base)
- `contracts/src/SyntheticTokenBridge.sol`: Burn/mint implementation (Arbitrum)
- `relayer/src/watcher.ts`: Event polling and checkpoint management
- `relayer/src/submitter.ts`: Transaction submission with retry logic
- `relayer/src/message.ts`: BridgeMessage reconstruction from logs
- `ui/src/components/bridge-card.tsx`: Bridge form and lock/burn logic

**Testing:**
- `contracts/test/BridgeUnit.t.sol`: Unit tests for bridge operations
- `contracts/test/TestSetup.sol`: Test setup and fixtures
- `relayer/test/message.test.ts`: Message reconstruction tests
- `relayer/test/submitter.test.ts`: Submitter queue tests

## Naming Conventions

**Files:**
- Contracts: `PascalCase.sol` (e.g., `BridgeBase.sol`, `WrappedToken.sol`)
- TypeScript: `kebab-case.ts` or `camelCase.ts` (e.g., `bridge-card.tsx`, `use-bridge-messages.ts`)
- Test files: `*.test.ts` (Bun) or `*.t.sol` (Foundry)
- Styles: `.module.css` (CSS Modules) or `.css` (global)

**Directories:**
- Package directories: lowercase (e.g., `contracts`, `relayer`, `ui`)
- Feature directories: lowercase plural (e.g., `components`, `hooks`, `scripts`)

**Functions & Variables:**
- Contract functions: `camelCase` (e.g., `lock()`, `_consumeMessage()`)
- TypeScript functions: `camelCase` (e.g., `createSubmitter()`, `loadConfig()`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `DESTINATION_CHAIN_ID`, `maxBlockRange`)
- Types: `PascalCase` (e.g., `BridgeMessage`, `SubmitterActions`)

**Exports:**
- Named exports for utilities (e.g., `export function loadConfig()`)
- Default exports for React components (e.g., `export default function BridgeCard()`)
- Type exports use `export type` or `export interface`

## Where to Add New Code

**New Feature (e.g., Multi-hop Bridge):**
- Primary code: `contracts/src/MultiHopBridge.sol` (new bridge implementation)
- Tests: `contracts/test/MultiHop.t.sol`
- Relayer support: Add new submitter in `relayer/src/index.ts`
- UI support: New component in `ui/src/components/multi-hop-card.tsx`

**New Component/Module:**
- UI components: `ui/src/components/{feature}-card.tsx` + `.module.css`
- React hooks: `ui/src/hooks/use-{feature}.ts`
- Relayer modules: `relayer/src/{module}.ts` + `relayer/test/{module}.test.ts`

**Utilities:**
- Shared formatters/validators: `ui/src/lib/{feature}.ts`
- Relayer utilities: `relayer/src/{utility}.ts`
- Contract libraries: `contracts/src/{LibName}.sol`

**Configuration:**
- Add env vars to `relayer/src/config.ts:loadConfig()`
- Update `addresses.json` for new deployment addresses
- Add UI config to `ui/src/lib/config.ts`

**Tests:**
- Unit tests: Colocate in `{workspace}/test/` directory
- Test fixtures: `contracts/test/TestSetup.sol` (contracts) or `relayer/test/fixtures.ts` (relayer)
- Run via `bun test` (relayer) or `forge test` (contracts)

## Special Directories

**`contracts/lib/`:**
- Purpose: External dependencies (OpenZeppelin, forge-std)
- Generated: No
- Committed: Yes (git submodules for OZ, forge-std)

**`relayer/dist/`:**
- Purpose: Compiled relayer output
- Generated: Yes (via `bun build`)
- Committed: No (in .gitignore)

**`ui/.next/`:**
- Purpose: Next.js build output and cache
- Generated: Yes (via `next build`)
- Committed: No (in .gitignore)

**`contracts/out/`:**
- Purpose: Compiled contract artifacts (ABI, bytecode)
- Generated: Yes (via `forge build`)
- Committed: No (in .gitignore)

**`.planning/codebase/`:**
- Purpose: GSD architecture documentation
- Generated: Yes (via `/gsd-map-codebase`)
- Committed: Yes (in-repo analysis documents)

**`addresses.json`:**
- Purpose: Deployment addresses for contracts on each chain
- Format: `{ baseSepolia: { collateralBridge, syntheticBridge, usdc, deployBlock }, arbitrumSepolia: {...} }`
- Used by: Relayer config, UI config, deployment scripts
- Update: After deploying to new chains or with new addresses

---

*Structure analysis: 2026-07-24*
