<!-- GSD:project-start source:PROJECT.md -->

## Project

**L2 Mint & Lock Bridge — Transaction Flow UX**

A two-way token bridge between Base Sepolia and Arbitrum Sepolia (canonical USDC locked on
origin, synthetic wUSDC minted on destination) with an off-chain Bun relayer and a Next.js
web UI. This milestone rebuilds the **transaction flow experience** in that UI so a user
always knows the exact state of their bridge transaction — from approval, through submission,
through relay to the destination chain — and gets a readable, evidence-backed explanation
whenever something fails.

**Core Value:** The user is never left guessing: at every moment the UI shows exactly which state their
bridge transaction is in, and when it fails it says why in plain language backed by the
actual on-chain error.

### Constraints

- **Tech stack**: viem only, no ethers — project-wide rule
- **Tech stack**: TypeScript strict mode; functions over classes where functions suffice
- **Tech stack**: Bun for install/run/test, not npm/yarn/pnpm/jest/vitest
- **Styling**: CSS Modules in `ui/src/components/*.module.css`, matching the existing UI; no
  new component framework

- **Amounts**: all token amounts are 6-decimal — never format or convert assuming 18
- **Network**: Base Sepolia and Arbitrum Sepolia testnets only
- **Transport**: WebSocket RPC endpoints for testnets are unreliable — an HTTP fallback path
  is mandatory, not optional, or the demo breaks in exactly the moment it matters

- **Contracts**: Solidity 0.8.24+, OpenZeppelin only, checks-effects-interactions, SafeERC20,
  custom errors not require-strings, NatSpec on external functions — applies if contracts are
  ever touched (they are out of scope here)

- **Semantics**: never change nonce/`processed` semantics or the `messageId` encoding without
  explicit instruction

- **Commits**: one build-order block per commit minimum

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- Solidity 0.8.28 - Smart contracts for the L2 bridge (`contracts/src/`)
- TypeScript 5.9.3 (UI) / 7.0.2 (relayer) - Full strict mode - UI and relayer applications (`ui/`, `relayer/`)
- HTML/CSS - UI styling with TailwindCSS 4.3.3 (`ui/src/app/`)

## Runtime

- Bun 1.2.0 - Primary runtime for TypeScript execution and development
- Node.js (compatible) - Can run TypeScript/JavaScript via Bun
- Foundry/Forge - Solidity development and testing runtime
- Bun 1.2.0 - Configured as primary package manager in root `package.json`
- Lockfile: `bun.lock` (Bun's native lockfile format)

## Frameworks

- Next.js (latest) - React SSR framework for UI (`ui/`)
- React (latest) - UI library with strict type safety
- Solidity 0.8.28 - Smart contract language with OpenZeppelin dependencies
- viem 2.55.5 (relayer) / 2.x (UI) - Ethereum client library (primary, no ethers.js)
- wagmi 2.x - React hooks for Ethereum (`ui/`)
- @rainbow-me/rainbowkit 2.x - Wallet connection UI (`ui/`)
- @tanstack/react-query (latest) - Server state management in UI
- TailwindCSS 4.3.3 - Utility CSS framework
- @tailwindcss/postcss 4.3.3 - PostCSS integration
- PostCSS 8.5.22 - CSS processing
- Turbo 2.5.0 - Monorepo orchestration at root level (`turbo.json`)
- Foundry (Forge) - Solidity build, test, and deployment (`contracts/foundry.toml`)
- TypeScript 5.9.3 - Type checking (strict mode enabled)

## Key Dependencies

- viem 2.55.5 - Web3 client library; handles contract calls, wallet interactions, chain management
- wagmi 2.x - React hooks layer over viem; wallet connection, chain switching
- @rainbow-me/rainbowkit 2.x - Wallet UI for MetaMask, WalletConnect, and other providers
- openzeppelin-contracts (via git submodule in `contracts/lib/`) - ERC20, access control, security utilities
- Bun runtime - Execution environment for relayer and build processes
- Turbo 2.5.0 - Cross-workspace builds and dependency management
- @tanstack/react-query (latest) - Async state and caching for bridge messages
- TypeScript 5.9.3+ - Strict type checking across UI and relayer

## Configuration

- Bun automatically loads `.env` files (no dotenv package needed)
- Environment variables configure:
- See `.env.example` files in each workspace for required configuration
- `tsconfig.json` (root) - Shared strict TypeScript settings with bundler module resolution
- `ui/tsconfig.json` - Extends root, adds Next.js plugin and DOM types
- `relayer/tsconfig.json` - Extends root, targets ES2022
- `contracts/foundry.toml` - Solidity compiler settings (0.8.28, optimizer enabled with 200 runs)
- `turbo.json` - Build order: `build` depends on transitive builds, `test` depends on `build`

## Platform Requirements

- Bun 1.2.0+ installed
- Node.js 18+ (for compatibility, though Bun is primary)
- Foundry installed (for contract compilation and testing)
- TypeScript 5.9.3+ in IDE
- Bun runtime for relayer deployment
- Browser with Web3 wallet support (MetaMask, etc.) for UI
- Access to Base Sepolia and Arbitrum Sepolia testnet RPC endpoints
- `.env` file with secrets at deployment time

## Deployment Targets

- Base Sepolia testnet - Collateral bridge (ERC20 locking)
- Arbitrum Sepolia testnet - Synthetic bridge (wrapped token minting)
- Static Next.js build with SSR capability
- Runs client-side Web3 wallet connections
- Bun standalone binary (builds to `dist/index.ts` as compiled bundle)
- Watches Base Sepolia and Arbitrum Sepolia for bridge events
- Executes cross-chain message relay

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- TypeScript/TSX: kebab-case (e.g., `bridge-card.tsx`, `use-bridge-messages.ts`, `bridge-card.module.css`)
- Solidity: PascalCase (e.g., `BridgeBase.sol`, `Types.sol`, `Errors.sol`)
- Test files: same base name + `.test.ts` (TypeScript) or `.t.sol` (Solidity)
- camelCase for all functions: `formatTokenAmount()`, `reconstructMessage()`, `useBridgeMessages()`, `getExplorerUrl()`
- Hook functions start with `use`: `useBridgeMessages()` in `ui/src/hooks/use-bridge-messages.ts`
- Private/internal functions prefixed with underscore in Solidity: `_validateInputs()`, `_consumeMessage()`
- Helper test functions (setup/builders) are camelCase: `createMessage()`, `createLog()`, `baseToArbitrumMessage()`
- camelCase for all variables and constants: `amountInput`, `recipientInput`, `approveHash`, `bridgeAddress`, `blockTimestampCache`
- bigint literals with numeric separators for readability: `1_000_000n`, `84_532n`, `4_000` (milliseconds)
- Const names in uppercase: `chainKeys`, `BASE_CHAIN_ID`, `ARBITRUM_CHAIN_ID`, `AMOUNT`
- PascalCase for interfaces and type aliases: `BridgeMessage`, `BridgeCardProps`, `BridgeDirection`, `ChainMeta`, `RelayerConfig`
- Exported types in interfaces (e.g., `interface LogEntry`)
- Viem types imported with `type` keyword: `type Address`, `type Hex`, `type Transport`, `type Chain`, `type PublicClient`
- String literal unions for directional config: `type Direction = "base-to-arbitrum" | "arbitrum-to-base"`
- Status strings as union types: `status: 'pending' | 'finalized'`
- Chain keys as const tuples: `chainKeys = ["baseSepolia", "arbitrumSepolia"] as const`

## Code Style

- No explicit formatter configured (no .prettierrc or ESLint in root)
- Solidity: Forge fmt used (configured in `contracts/foundry.toml`)
- TypeScript: Manual formatting (observed consistent 2-space indentation)
- Solidity: `forge fmt --check` (run with `npm run lint` in contracts)
- TypeScript UI: `tsc --noEmit` (type checking only, no ESLint)
- Relayer: `tsc --noEmit` for type checking

## Import Organization

- `@/` points to `ui/src/` (Next.js convention)
- No other path aliases configured; use relative imports for contracts and relayer

## Error Handling

- Use custom errors (not `require` strings) with parameters: `error NotRelayer(address invalidAddress);`
- Throw custom errors with named parameters: `require(..., Errors.NotRelayer({invalidAddress: msg.sender}))`
- Validation is done in separate functions like `_validateInputs()` before state changes
- Throw `new Error()` with descriptive messages: `throw new Error("BridgeTxInitiated log is missing required arguments")`
- Validation errors include context: `throw new Error(\`BridgeTxInitiated messageId mismatch: emitted ${args.messageId}, computed ${computedMessageId}\`)`
- In React components, set state for errors: `setFormError(...)` or return error in custom hook result: `{ messages, isLoading, error: string | null, ... }`
- Relayer: Use structured JSON logging with error status

## Logging

- Always include `status` field in log entry: `logJson({ status: "...", ... })`
- Structured JSON format with timestamp ISO string
- BigInt values automatically converted to strings in JSON serialization
- Usage: `logJson({ status: "message_processed", messageId, amount: amount.toString() })`
- No console.log calls for business logic—use `logJson` for relayer output

## Comments

- TODOs mark known limitations or future work: `// TODO(signature-verification): Production finalization would...`
- Comments explain *why*, not what: `// Fallback RPC if primary endpoint fails` is better than `// Set fallback RPC`
- Minimal inline comments; code should be self-documenting through clear naming
- Solidity: NatSpec on external functions with `@notice` and `@param`:
- TypeScript: No mandatory JSDoc; export types/interfaces are self-documenting

## Function Design

- Small functions (< 20 lines preferred)
- Helpers are extracted: `readBlockTimestamp()`, `scanChain()`, `reconstructMessage()` are separate functions, not inlined
- Use object parameters for functions with 2+ parameters: `reconstructMessage({ log, canonicalToken })`
- Object parameters allow named arguments and better readability
- Single parameter: `logJson(entry)` can use direct parameter
- Explicit return types: `function useBridgeMessages(): UseBridgeMessagesResult`
- Multiple returns via objects: `{ message, messageId }`, `{ messages, isLoading, error, refresh }`
- Promise-based: `async function readBlockTimestamp(...): Promise<number>`

## Module Design

- Named exports for functions and types: `export function formatTokenAmount(...)`, `export interface BridgeMessage {...}`
- Default exports only for React components in Next.js pages (implicit in page.tsx)
- Barrel files not used—import from specific module paths
- Not used in this codebase; import types/functions from their specific source files
- Example: `import { bridgeAbi, erc20Abi } from '@/lib/abis'` (abis.ts is the single source)

## Solidity-Specific Conventions

- Visibility explicitly declared: `address public relayer;`, `mapping(bytes32 messageId_ => bool isProcessed) public processed;`
- Naming convention for mappings includes the key context: `mapping(address sender => uint256 nonce) public nonces;`
- Using `for` syntax to attach library functions: `using {BridgeLib.computeBridgeMessageId} for Types.BridgeMessage;`
- Imported libraries used as namespaces: `import "./BridgeLib.sol" as BridgeLib;`
- Abstract contracts for shared logic: `abstract contract BridgeBase is IBridge, Ownable2Step, Pausable`
- OpenZeppelin only for dependencies (CLAUDE.md requirement)

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File(s) |
|-----------|----------------|---------|
| **Smart Contracts** | Lock/burn tokens, track message IDs, prevent replays | `contracts/src/BridgeBase.sol`, `CollateralTokenBridge.sol`, `SyntheticTokenBridge.sol` |
| **Relayer** | Watch for events, reconstruct messages, submit cross-chain transactions | `relayer/src/index.ts`, `watcher.ts`, `submitter.ts` |
| **UI** | Display bridge interface, show message status, submit user transactions | `ui/src/app/page.tsx`, `components/bridge-card.tsx` |
| **Shared Utilities** | ABI definitions, configuration, logging | `relayer/src/config.ts`, `ui/src/lib/bridge.ts` |

## Pattern Overview

- **Two-way bridge:** Base→Arbitrum (lock+mint) and Arbitrum→Base (burn+unlock)
- **Relayer-submitted:** User calls lock/burn; relayer submits corresponding mint/unlock
- **No message signing:** Relayer is trusted via onlyRelayer modifier (TODO: EIP-712 signatures in production)
- **Nonce-based replay protection:** Per-sender nonce incremented on lock/burn
- **Event polling:** Relayer polls for BridgeTxInitiated logs with confirmation buffer

## Layers

- Purpose: Manage token escrow, enforce bridge invariants, emit events
- Location: `contracts/src/`
- Contains: Bridge implementations, token wrappers, type definitions
- Depends on: OpenZeppelin contracts (ERC20, SafeERC20, Ownable2Step, Pausable, ReentrancyGuardTransient)
- Used by: Relayer (reads state, submits txs); UI (submits user transactions)
- Purpose: Listen for lock/burn events, reconstruct messages, submit mint/unlock transactions
- Location: `relayer/src/`
- Contains: Event watcher, message reconstructor, transaction submitter, state store, configuration
- Depends on: viem, Bun runtime
- Used by: Smart contracts (via onlyRelayer modifier), state store for checkpointing
- Purpose: Provide user interface for locking/burning tokens, viewing bridge messages
- Location: `ui/src/`
- Contains: Next.js app, React components, bridge utilities, wallet integration
- Depends on: viem, RainbowKit, Next.js
- Used by: End users via browser

## Data Flow

### Primary Request Path: Base → Arbitrum (Lock & Mint)

### Secondary Path: Arbitrum → Base (Burn & Unlock)

- **On-chain:** Contract tracks `processed[messageId]` mapping; prevents double-execution
- **Off-chain:** Relayer stores checkpoint in `state.json` per chain; tracks `{ chain, blockNumber }`
- **In-memory:** Submitter manages queue as Promise chain; onIdle() waits for current queue to drain

## Key Abstractions

- Purpose: Represents a cross-chain token transfer request
- Examples: `contracts/src/Types.sol`, `relayer/src/message.ts`, `ui/src/lib/bridge.ts`
- Pattern: Immutable data structure passed between contract and relayer; same format on all layers
- Purpose: Serialize message submissions to avoid race conditions and state inconsistency
- Examples: `relayer/src/submitter.ts` (createSubmitter)
- Pattern: Sequential Promise chain (`queueTail = queueTail.then(...)`); no concurrent writes
- Purpose: Track confirmed events on each chain with confirmation buffer
- Examples: `relayer/src/watcher.ts` (runWatcher, pollWatcher)
- Pattern: Poll at fixed interval; process logs in batches; update checkpoint after each batch

## Entry Points

- Location: `relayer/src/index.ts`
- Triggers: `bun run dev` (dev mode) or `bun dist/index.js` (production)
- Responsibilities:
- Location: `ui/src/app/page.tsx`
- Triggers: Browser navigation to `/`
- Responsibilities:
- `CollateralTokenBridge.bridgeTx()` - User locks canonical tokens
- `CollateralTokenBridge.finalizeBridgeTx()` - Relayer unlocks canonical tokens on destination
- `SyntheticTokenBridge.bridgeTx()` - User burns wrapped tokens
- `SyntheticTokenBridge.finalizeBridgeTx()` - Relayer mints wrapped tokens on destination

## Architectural Constraints

- **Threading:** Single-threaded event loop (Bun). Relayer uses Promise chains to serialize message submissions; no race conditions.
- **Global state:** None in relayer code. State persisted to `state.json` (checkpoint per chain). Contracts use mappings for `nonces[sender]` and `processed[messageId]`.
- **Circular imports:** None detected. Imports flow: UI → lib → contracts (ABI); relayer → config → addresses.json.
- **ABI versioning:** ABIs in `relayer/src/abi.ts` and `ui/src/lib/abis.ts` must match contract event/function signatures. Mismatch causes runtime errors.
- **RPC endpoint failover:** Configured via `fallback()` in config.ts; if primary endpoint fails, falls back to DRPC.
- **Message format immutability:** BridgeMessage struct is part of contract ABI. Changes require careful migration and replay risk assessment.

## Anti-Patterns

### Silent Log Rejection

### Unbounded Retry Loop

## Error Handling

- **Watcher errors:** Catch, log, continue to next poll
- **Submission errors:** Retry up to 8 times with exponential backoff (1s→60s); log each retry
- **Config errors:** Throw early on startup (missing env vars, invalid addresses)
- **Contract errors:** Simulated transactions reveal errors before write; if write fails, logged and retried

## Cross-Cutting Concerns

- **UI:** Form validation in bridge-card component (amount > 0, recipient != zero address)
- **Contract:** `_validateInputs()` checks recipient and amount; `_consumeMessage()` checks chain ID, message ID not processed
- **Relayer:** `reconstructMessage()` verifies messageId matches log; validates chain IDs match config

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
