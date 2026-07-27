# Testing Patterns

**Analysis Date:** 2026-07-24

## Test Framework

**Runner:**
- **Solidity:** Forge (part of Foundry) - configured in `contracts/foundry.toml`
- **TypeScript/Relayer:** Bun test - native test runner (`bun test`)

**Assertion Library:**
- Solidity: Forge standard library (DSTest-style assertions)
- TypeScript: Bun's built-in `expect` from `bun:test`

**Run Commands:**
```bash
# Solidity
cd contracts && bun run test                # Runs: forge test
cd contracts && bun run lint                # Runs: forge fmt --check

# TypeScript/Relayer
cd relayer && bun test                      # Run all tests
cd relayer && bun --watch test              # Watch mode (can be configured)
cd relayer && bun test --coverage           # Coverage (if supported)

# Entire workspace
bun run test                                 # Runs all package test scripts via Turbo
```

## Test File Organization

**Location:**
- Solidity: `contracts/test/` directory (co-located with src directory structure)
- TypeScript: `relayer/test/` directory (co-located with src)

**Naming:**
- Solidity: `{ComponentName}.t.sol` (e.g., `BridgeUnit.t.sol`, `Replay.t.sol`)
- TypeScript: `{module}.test.ts` (e.g., `message.test.ts`, `state.test.ts`, `watcher.test.ts`)

**Structure:**
```
contracts/
├── src/
│   ├── BridgeBase.sol
│   ├── Types.sol
│   └── Errors.sol
├── test/
│   ├── BridgeUnit.t.sol      (imports from src/)
│   ├── Replay.t.sol
│   └── TestSetup.sol         (shared test utilities)

relayer/
├── src/
│   ├── message.ts
│   ├── state.ts
│   └── watcher.ts
└── test/
    ├── message.test.ts
    ├── state.test.ts
    └── watcher.test.ts
```

## Test Structure

**Solidity Test Suite:**
```solidity
// contracts/test/BridgeUnit.t.sol
contract BridgeUnitTest is TestSetup {
    event BridgeTxInitiated(
        bytes32 indexed messageId,
        address indexed sender,
        // ... event params
    );

    function testMessageIdSeparatesChainPairs() public view {
        Types.BridgeMessage memory firstMessage = baseToArbitrumMessage(0);
        Types.BridgeMessage memory secondMessage = baseToArbitrumMessage(0);
        secondMessage.originChainId = ARBITRUM_CHAIN_ID;
        
        assertNotEq(
            firstMessage.computeBridgeMessageId(),
            secondMessage.computeBridgeMessageId()
        );
    }
    
    function testLockPullsUsdcIncrementsNonce() public {
        vm.chainId(BASE_CHAIN_ID);
        vm.startPrank(user);
        usdc.approve(address(collateralBridge), AMOUNT);
        
        vm.expectEmit(true, true, true, true);
        emit BridgeTxInitiated(...);
        collateralBridge.bridgeTx(recipient, AMOUNT);
        vm.stopPrank();
        
        assertEq(collateralBridge.nonces(user), 1);
    }
}
```

**TypeScript Test Suite:**
```typescript
// relayer/test/message.test.ts
import { describe, expect, test } from "bun:test"
import type { Address, Hex } from "viem"
import { 
  hashBridgeMessage,
  reconstructMessage,
  type BridgeMessage,
} from "../src/message"

describe("bridge message integrity", () => {
  test("reconstructs a message and accepts its canonical hash", () => {
    const message = createMessage()
    const messageId = hashBridgeMessage({ message })
    const result = reconstructMessage({
      log: createLog({ message, messageId }),
      canonicalToken: canonicalUsdcAddress,
    })

    expect(result).toEqual({ message, messageId })
  })

  test("rejects an emitted message id that does not match", () => {
    const message = createMessage()
    const badMessageId = `0x${"00".repeat(32)}` as Hex

    expect(() =>
      reconstructMessage({
        log: createLog({ message, messageId: badMessageId }),
        canonicalToken: canonicalUsdcAddress,
      }),
    ).toThrow("messageId mismatch")
  })
})
```

**Patterns:**
- **Setup:** Solidity uses base contract inheritance from `TestSetup` for shared test state; TypeScript uses helper functions (`createMessage()`)
- **Teardown:** Solidity uses `vm` cheatcodes for state rollback; TypeScript uses `afterEach` for cleanup:
  ```typescript
  afterEach(async () => {
    await Promise.all(
      createdPaths.splice(0).map(async (path) => {
        const file = Bun.file(path)
        if (await file.exists()) await file.delete()
      }),
    )
  })
  ```
- **Assertion:** Solidity uses `assertEq()`, `assertNotEq()`, `assertThrows()`; TypeScript uses `expect().toBe()`, `expect().toEqual()`, `expect().toThrow()`
- **Expectations:** Solidity uses `vm.expectEmit()` to verify event emission before the transaction

## Mocking

**Framework:** 
- Solidity: Forge VM cheatcodes (`vm.prank()`, `vm.startPrank()`, `vm.stopPrank()`, `vm.chainId()`, `vm.expectEmit()`)
- TypeScript: No external mocking library; use Bun file operations or helper functions

**Patterns - Solidity:**
```solidity
// Prank (single tx)
vm.prank(user);
bridge.bridgeTx(recipient, AMOUNT);

// Prank range
vm.startPrank(relayer);
syntheticBridge.finalizeBridgeTx(message);
vm.stopPrank();

// Chain ID spoofing
vm.chainId(BASE_CHAIN_ID);

// Event expectation
vm.expectEmit(true, true, true, true);  // indexed, indexed, indexed, non-indexed match
emit BridgeTxInitiated(...);
collateralBridge.bridgeTx(recipient, AMOUNT);
```

**Patterns - TypeScript:**
```typescript
// No external mock library used
// Instead, use helper functions that create test doubles

function createMessage(): BridgeMessage {
  return {
    originChainId: 84_532n,
    destinationChainId: 421_614n,
    token: canonicalUsdcAddress,
    sender: "0x1111111111111111111111111111111111111111",
    recipient: "0x2222222222222222222222222222222222222222",
    amount: 1_000_000n,
    nonce: 7n,
  }
}

function createLog({
  message,
  messageId,
}: {
  message: BridgeMessage
  messageId: Hex
}): BridgeTxInitiatedLog {
  return {
    address: "0x3333333333333333333333333333333333333333" as Address,
    args: {
      messageId,
      sender: message.sender,
      recipient: message.recipient,
      // ...
    },
    blockNumber: 100n,
    transactionHash: `0x${"ab".repeat(32)}`,
    logIndex: 0,
  }
}
```

**What to Mock:**
- Solidity: User accounts via `vm.prank()`, chain context via `vm.chainId()`, external calls via events and expectations
- TypeScript: Test data via builder functions; filesystem operations via `Bun.file()` for state persistence tests

**What NOT to Mock:**
- Core business logic in message hashing/reconstruction (test the real functions)
- Cryptographic operations (keccak256, encodeAbiParameters)—these are deterministic and testable
- State persistence—test actual file I/O in `relayer/test/state.test.ts` to catch real bugs

## Fixtures and Factories

**Test Data:**
- Solidity: Inherited constants from `TestSetup` contract:
  ```solidity
  uint256 public constant BASE_CHAIN_ID = 84_532;
  uint256 public constant ARBITRUM_CHAIN_ID = 421_614;
  uint256 public constant AMOUNT = 100e6;
  ```
- TypeScript: Builder functions in test file:
  ```typescript
  function createMessage(): BridgeMessage { ... }
  function createLog({ message, messageId }): BridgeTxInitiatedLog { ... }
  function createPath(): string { ... }  // For file-based tests
  ```

**Location:**
- Solidity: `contracts/test/TestSetup.sol` contains shared test utilities and constants
- TypeScript: Helper functions inline in test files (no separate fixtures file)

## Coverage

**Requirements:** Not enforced (no coverage configuration detected)

**View Coverage:**
- Solidity: `forge coverage` (if added to package scripts)
- TypeScript: `bun test --coverage` (if Bun supports it, not currently configured)

**Current State:** Coverage tracking not configured in this project.

## Test Types

**Unit Tests:**
- **Solidity:** Message integrity tests (`testMessageIdSeparatesChainPairs`, `testMessageIdUsesCanonicalAbiEncoding`)
- **TypeScript:** Function-level tests for message reconstruction, state persistence, config loading
- **Scope:** Test isolated functions/contracts without chain state
- **Approach:** Use cheatcodes (Solidity) or test data builders (TypeScript)

**Integration Tests:**
- **Solidity:** Round-trip tests (`testMintAndBurnRoundTrip`) verifying interaction between collateral and synthetic bridges
- **Solidity:** State transition tests (`testLockPullsUsdcIncrementsNonce`) verifying storage updates and transfers
- **Scope:** Test multiple contracts interacting, or contract + token
- **Approach:** Use `vm.prank()` to simulate user/relayer roles; verify state changes and events

**E2E Tests:**
- **Status:** Not present in this codebase
- **Rationale:** E2E would require running chains (Forge fork mode or local testnet); beyond scope of unit/integration tests

## Common Patterns

**Async Testing - TypeScript:**
```typescript
test("persists both watcher checkpoints without clobbering either", async () => {
  const path = createPath()
  const state = await createStateStore({
    path,
    deployBlocks: { baseSepolia: 10n, arbitrumSepolia: 20n },
  })

  await Promise.all([
    state.setCheckpoint({ chain: "baseSepolia", blockNumber: 100n }),
    state.setCheckpoint({ chain: "arbitrumSepolia", blockNumber: 200n }),
  ])

  const restored = await createStateStore({
    path,
    deployBlocks: { baseSepolia: 0n, arbitrumSepolia: 0n },
  })
  expect(restored.getCheckpoint({ chain: "baseSepolia" })).toBe(100n)
})
```
- Use `async` function signatures
- `await` before promises
- Cleanup in `afterEach` hook

**Error Testing:**
```typescript
// TypeScript
test("rejects an emitted message id that does not match", () => {
  expect(() =>
    reconstructMessage({
      log: createLog({ message, messageId: badMessageId }),
      canonicalToken: canonicalUsdcAddress,
    }),
  ).toThrow("messageId mismatch")
})

// Solidity (via TestSetup)
function testOnlyRelayerCanFinalize() public {
  vm.expectRevert();  // Expects revert, no specific reason
  vm.prank(attacker);
  syntheticBridge.finalizeBridgeTx(message);
}
```

**Event Testing - Solidity:**
```solidity
function testLockEmitsExactMessage() public {
  vm.startPrank(user);
  usdc.approve(address(collateralBridge), AMOUNT);

  Types.BridgeMessage memory message = baseToArbitrumMessage(0);
  bytes32 id = message.computeBridgeMessageId();
  
  vm.expectEmit(true, true, true, true);  // 4 params: all indexed
  emit BridgeTxInitiated(
    id,
    user,
    recipient,
    AMOUNT,
    0,
    BASE_CHAIN_ID,
    ARBITRUM_CHAIN_ID
  );
  
  collateralBridge.bridgeTx(recipient, AMOUNT);
  vm.stopPrank();
}
```
- `vm.expectEmit()` with matching flags (indexed positions)
- Emit event with exact expected values
- Transaction that should emit follows immediately

---

*Testing analysis: 2026-07-24*
