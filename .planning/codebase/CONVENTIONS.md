# Coding Conventions

**Analysis Date:** 2026-07-24

## Naming Patterns

**Files:**
- TypeScript/TSX: kebab-case (e.g., `bridge-card.tsx`, `use-bridge-messages.ts`, `bridge-card.module.css`)
- Solidity: PascalCase (e.g., `BridgeBase.sol`, `Types.sol`, `Errors.sol`)
- Test files: same base name + `.test.ts` (TypeScript) or `.t.sol` (Solidity)

**Functions:**
- camelCase for all functions: `formatTokenAmount()`, `reconstructMessage()`, `useBridgeMessages()`, `getExplorerUrl()`
- Hook functions start with `use`: `useBridgeMessages()` in `ui/src/hooks/use-bridge-messages.ts`
- Private/internal functions prefixed with underscore in Solidity: `_validateInputs()`, `_consumeMessage()`
- Helper test functions (setup/builders) are camelCase: `createMessage()`, `createLog()`, `baseToArbitrumMessage()`

**Variables:**
- camelCase for all variables and constants: `amountInput`, `recipientInput`, `approveHash`, `bridgeAddress`, `blockTimestampCache`
- bigint literals with numeric separators for readability: `1_000_000n`, `84_532n`, `4_000` (milliseconds)
- Const names in uppercase: `chainKeys`, `BASE_CHAIN_ID`, `ARBITRUM_CHAIN_ID`, `AMOUNT`

**Types:**
- PascalCase for interfaces and type aliases: `BridgeMessage`, `BridgeCardProps`, `BridgeDirection`, `ChainMeta`, `RelayerConfig`
- Exported types in interfaces (e.g., `interface LogEntry`)
- Viem types imported with `type` keyword: `type Address`, `type Hex`, `type Transport`, `type Chain`, `type PublicClient`

**Enums & Unions:**
- String literal unions for directional config: `type Direction = "base-to-arbitrum" | "arbitrum-to-base"`
- Status strings as union types: `status: 'pending' | 'finalized'`
- Chain keys as const tuples: `chainKeys = ["baseSepolia", "arbitrumSepolia"] as const`

## Code Style

**Formatting:**
- No explicit formatter configured (no .prettierrc or ESLint in root)
- Solidity: Forge fmt used (configured in `contracts/foundry.toml`)
- TypeScript: Manual formatting (observed consistent 2-space indentation)

**Linting:**
- Solidity: `forge fmt --check` (run with `npm run lint` in contracts)
- TypeScript UI: `tsc --noEmit` (type checking only, no ESLint)
- Relayer: `tsc --noEmit` for type checking

## Import Organization

**Order:**
1. External/third-party imports (viem, React, etc.)
2. Type imports with `type` keyword at the end of import block
3. Relative imports from `@/` alias or `../` paths
4. Local CSS/style imports last

**Example from `ui/src/components/bridge-card.tsx`:**
```typescript
import { useConnectModal } from '@rainbow-me/rainbowkit'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import {
  formatUnits,
  getAddress,
  isAddress,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'

import { bridgeAbi, erc20Abi } from '@/lib/abis'
import { addresses, isBridgeDeployed } from '@/lib/config'

import styles from './bridge-card.module.css'
```

**Path Aliases:**
- `@/` points to `ui/src/` (Next.js convention)
- No other path aliases configured; use relative imports for contracts and relayer

## Error Handling

**Solidity Patterns:**
- Use custom errors (not `require` strings) with parameters: `error NotRelayer(address invalidAddress);`
- Throw custom errors with named parameters: `require(..., Errors.NotRelayer({invalidAddress: msg.sender}))`
- Validation is done in separate functions like `_validateInputs()` before state changes

**TypeScript Patterns:**
- Throw `new Error()` with descriptive messages: `throw new Error("BridgeTxInitiated log is missing required arguments")`
- Validation errors include context: `throw new Error(\`BridgeTxInitiated messageId mismatch: emitted ${args.messageId}, computed ${computedMessageId}\`)`
- In React components, set state for errors: `setFormError(...)` or return error in custom hook result: `{ messages, isLoading, error: string | null, ... }`
- Relayer: Use structured JSON logging with error status

## Logging

**Framework:** `console` via `logJson` utility in `relayer/src/logger.ts`

**Patterns:**
```typescript
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

- Always include `status` field in log entry: `logJson({ status: "...", ... })`
- Structured JSON format with timestamp ISO string
- BigInt values automatically converted to strings in JSON serialization
- Usage: `logJson({ status: "message_processed", messageId, amount: amount.toString() })`
- No console.log calls for business logic—use `logJson` for relayer output

## Comments

**When to Comment:**
- TODOs mark known limitations or future work: `// TODO(signature-verification): Production finalization would...`
- Comments explain *why*, not what: `// Fallback RPC if primary endpoint fails` is better than `// Set fallback RPC`
- Minimal inline comments; code should be self-documenting through clear naming

**JSDoc/TSDoc:**
- Solidity: NatSpec on external functions with `@notice` and `@param`:
  ```solidity
  /// @notice Updates the trusted relayer account.
  function setRelayer(address newRelayer) external onlyOwner { ... }
  ```
- TypeScript: No mandatory JSDoc; export types/interfaces are self-documenting

## Function Design

**Size:** 
- Small functions (< 20 lines preferred)
- Helpers are extracted: `readBlockTimestamp()`, `scanChain()`, `reconstructMessage()` are separate functions, not inlined

**Parameters:**
- Use object parameters for functions with 2+ parameters: `reconstructMessage({ log, canonicalToken })`
- Object parameters allow named arguments and better readability
- Single parameter: `logJson(entry)` can use direct parameter

**Return Values:**
- Explicit return types: `function useBridgeMessages(): UseBridgeMessagesResult`
- Multiple returns via objects: `{ message, messageId }`, `{ messages, isLoading, error, refresh }`
- Promise-based: `async function readBlockTimestamp(...): Promise<number>`

## Module Design

**Exports:**
- Named exports for functions and types: `export function formatTokenAmount(...)`, `export interface BridgeMessage {...}`
- Default exports only for React components in Next.js pages (implicit in page.tsx)
- Barrel files not used—import from specific module paths

**Barrel Files:**
- Not used in this codebase; import types/functions from their specific source files
- Example: `import { bridgeAbi, erc20Abi } from '@/lib/abis'` (abis.ts is the single source)

## Solidity-Specific Conventions

**State Variables:**
- Visibility explicitly declared: `address public relayer;`, `mapping(bytes32 messageId_ => bool isProcessed) public processed;`
- Naming convention for mappings includes the key context: `mapping(address sender => uint256 nonce) public nonces;`

**Library Usage:**
- Using `for` syntax to attach library functions: `using {BridgeLib.computeBridgeMessageId} for Types.BridgeMessage;`
- Imported libraries used as namespaces: `import "./BridgeLib.sol" as BridgeLib;`

**Inheritance & Composition:**
- Abstract contracts for shared logic: `abstract contract BridgeBase is IBridge, Ownable2Step, Pausable`
- OpenZeppelin only for dependencies (CLAUDE.md requirement)

---

*Convention analysis: 2026-07-24*
