import { describe, expect, test } from 'bun:test'
import { ContractFunctionRevertedError, encodeErrorResult, zeroAddress, type Hex } from 'viem'

import { bridgeErrorAbi, decodeBridgeError } from './decode-bridge-error'

// viem's built-in `Error(string)`/`Panic(uint256)` fragments (`solidityError`/`solidityPanic`)
// are not part of viem's public package export surface, so we mirror their well-known shape
// locally to build test fixtures. `bridgeErrorAbi` never needs these — `decodeErrorResult`
// (used internally by `ContractFunctionRevertedError`) appends both automatically at decode time.
const solidityErrorAbiItem = {
  type: 'error',
  name: 'Error',
  inputs: [{ name: 'message', type: 'string' }],
} as const
const solidityPanicAbiItem = {
  type: 'error',
  name: 'Panic',
  inputs: [{ name: 'reason', type: 'uint256' }],
} as const

const EXPECTED_ERROR_NAMES = [
  'BridgeCannotBeZeroAddress',
  'BridgeMessageAlreadyProcessed',
  'BurningTokensDisallowedForUsers',
  'CallerIsNotBridge',
  'EnforcedPause',
  'ERC20InsufficientAllowance',
  'ERC20InsufficientBalance',
  'ERC20InvalidApprover',
  'ERC20InvalidReceiver',
  'ERC20InvalidSender',
  'ERC20InvalidSpender',
  'ExpectedPause',
  'InvalidBridgeTxInputs',
  'InvalidDestinationChainId',
  'NotRelayer',
  'OwnableInvalidOwner',
  'OwnableUnauthorizedAccount',
  'ReentrancyGuardReentrantCall',
  'RelayerCannotBeZeroAddress',
  'SafeERC20FailedOperation',
  'TokenCannotBeZeroAddress',
]

describe('bridgeErrorAbi', () => {
  test('contains all 21 distinct bridge error names', () => {
    const names = bridgeErrorAbi
      .filter((item) => item.type === 'error')
      .map((item) => item.name)

    expect(new Set(names).size).toBe(21)
    for (const errorName of EXPECTED_ERROR_NAMES) {
      expect(names).toContain(errorName)
    }
  })
})

describe('decodeBridgeError', () => {
  test('decodes a BridgeMessageAlreadyProcessed revert into a human sentence naming the messageId', () => {
    const messageId = `0x${'ab'.repeat(32)}` as Hex
    const reverted = createRevertedError({
      errorName: 'BridgeMessageAlreadyProcessed',
      args: [messageId],
    })

    const result = decodeBridgeError({ error: reverted })

    expect(result.kind).toBe('bridge-custom-error')
    expect(result.errorName).toBe('BridgeMessageAlreadyProcessed')
    expect(result.message).toContain(messageId)
  })

  test('falls back to unknown for a 4-byte selector absent from bridgeErrorAbi, without throwing', () => {
    const unknownSelector = '0xdeadbeef' as Hex
    const reverted = new ContractFunctionRevertedError({
      abi: bridgeErrorAbi,
      data: unknownSelector,
      functionName: 'lock',
    })

    const result = decodeBridgeError({ error: reverted })

    expect(result.kind).toBe('unknown')
    expect(result.message).toContain(unknownSelector)
    expect(result.rawData).toBe(unknownSelector)
  })

  test('returns unknown and never throws for undefined', () => {
    const result = decodeBridgeError({ error: undefined })

    expect(result.kind).toBe('unknown')
  })

  test('returns unknown and never throws for a plain Error', () => {
    const result = decodeBridgeError({ error: new Error('boom') })

    expect(result.kind).toBe('unknown')
  })

  test('returns unknown and never throws for a non-Error value', () => {
    const result = decodeBridgeError({ error: 'not an error object' })

    expect(result.kind).toBe('unknown')
  })

  test('returns unknown with a "no revert data" message for a ContractFunctionRevertedError carrying neither raw nor signature', () => {
    // NOTE: Plan 01-02 Task 2 inserts a more specific empty-revert-data decoder ahead of this
    // generic fallback, which reclassifies this exact fixture from 'unknown' to 'out-of-gas' —
    // see the corresponding test in the "empty revert data" describe block added by Task 2.
    const reverted = new ContractFunctionRevertedError({
      abi: bridgeErrorAbi,
      functionName: 'lock',
    })

    const result = decodeBridgeError({ error: reverted })

    expect(result.kind).toBe('unknown')
    expect(result.message).not.toContain('undefined')
    expect(result.message).not.toContain('()')
    expect(result.message.length).toBeGreaterThan(0)
  })
})

describe('decodeBridgeError — Tier 1 bespoke copy', () => {
  test('decodes InvalidDestinationChainId naming both the expected and received chain id', () => {
    const reverted = createRevertedError({
      errorName: 'InvalidDestinationChainId',
      args: [421614n, 84532n],
    })

    const result = decodeBridgeError({ error: reverted })

    expect(result.kind).toBe('bridge-custom-error')
    expect(result.message).toContain('421614')
    expect(result.message).toContain('84532')
  })

  test('decodes InvalidBridgeTxInputs naming the supplied recipient and amount', () => {
    const reverted = createRevertedError({
      errorName: 'InvalidBridgeTxInputs',
      args: [zeroAddress, 0n],
    })

    const result = decodeBridgeError({ error: reverted })

    expect(result.kind).toBe('bridge-custom-error')
    expect(result.message).toContain(zeroAddress)
    expect(result.message).toContain('0')
  })

  test('decodes SafeERC20FailedOperation as token-operation-failed naming the token address', () => {
    const token = '0x1111111111111111111111111111111111111111' as const
    const reverted = createRevertedError({
      errorName: 'SafeERC20FailedOperation',
      args: [token],
    })

    const result = decodeBridgeError({ error: reverted })

    expect(result.kind).toBe('token-operation-failed')
    expect(result.message).toContain(token)
  })

  test('decodes ERC20InsufficientAllowance with 6-decimal renderings, directing the user to re-run approve', () => {
    const spender = '0x2222222222222222222222222222222222222222' as const
    const reverted = createRevertedError({
      errorName: 'ERC20InsufficientAllowance',
      args: [spender, 1_000_000n, 5_000_000n],
    })

    const result = decodeBridgeError({ error: reverted })

    expect(result.kind).toBe('insufficient-allowance')
    expect(result.message).toContain('1')
    expect(result.message).toContain('5')
    expect(result.message).not.toContain('1000000')
    expect(result.message).not.toContain('5000000')
    expect(result.message.toLowerCase()).toContain('approve')
  })

  test('ERC20InsufficientAllowance with args undefined still directs to re-run approve without printing undefined or an empty parenthetical', () => {
    // decodeErrorResult always attaches args when a real 3-input error decodes successfully, so
    // the "args unavailable" path is simulated by clearing the already-decoded `.data.args` on the
    // public property — the decoder's own undefined-guarded interpolation is what's under test.
    const reverted = createRevertedError({
      errorName: 'ERC20InsufficientAllowance',
      args: ['0x3333333333333333333333333333333333333333', 1n, 1n],
    })
    if (reverted.data) reverted.data = { ...reverted.data, args: undefined }

    const result = decodeBridgeError({ error: reverted })

    expect(result.kind).toBe('insufficient-allowance')
    expect(result.message).not.toContain('undefined')
    expect(result.message).not.toContain('()')
    expect(result.message.toLowerCase()).toContain('approve')
  })
})

const TIER_TWO_NAMES = [
  'NotRelayer',
  'RelayerCannotBeZeroAddress',
  'TokenCannotBeZeroAddress',
  'BridgeCannotBeZeroAddress',
  'CallerIsNotBridge',
  'BurningTokensDisallowedForUsers',
  'OwnableUnauthorizedAccount',
  'OwnableInvalidOwner',
  'ReentrancyGuardReentrantCall',
  'EnforcedPause',
  'ExpectedPause',
] as const

const TIER_TWO_ARGS: Record<string, readonly unknown[]> = {
  NotRelayer: ['0x4444444444444444444444444444444444444444'],
  CallerIsNotBridge: ['0x5555555555555555555555555555555555555555'],
  OwnableUnauthorizedAccount: ['0x6666666666666666666666666666666666666666'],
  OwnableInvalidOwner: ['0x7777777777777777777777777777777777777777'],
}

describe('decodeBridgeError — Tier 2 unmapped-custom-error', () => {
  for (const errorName of TIER_TWO_NAMES) {
    test(`${errorName} resolves to kind: 'unmapped-custom-error' with the error name in the message`, () => {
      const reverted = createRevertedError({
        errorName,
        args: TIER_TWO_ARGS[errorName] ?? [],
      })

      const result = decodeBridgeError({ error: reverted })

      expect(result.kind).toBe('unmapped-custom-error')
      expect(result.message).toContain(errorName)
    })
  }

  test('NotRelayer has no special-case branch anywhere in the decode chain (D-05)', () => {
    // Static-source guard companion — see the acceptance criterion:
    //   grep -v '^ *[/*]' ui/src/lib/decode-bridge-error.ts | grep -c "NotRelayer"
    // returns 0. This behavioural test just confirms NotRelayer still resolves correctly by
    // falling through like any other unmapped name (asserted above), not via a dedicated branch.
    const reverted = createRevertedError({
      errorName: 'NotRelayer',
      args: TIER_TWO_ARGS.NotRelayer ?? [],
    })

    const result = decodeBridgeError({ error: reverted })

    expect(result.kind).toBe('unmapped-custom-error')
  })
})

const PANIC_CODES = [1, 17, 18, 33, 34, 49, 50, 65, 81] as const

describe('decodeBridgeError — Panic(uint256)', () => {
  test('code 17 describes arithmetic overflow/underflow and contains 0x11', () => {
    const result = decodeBridgeError({ error: createPanicRevert(17n) })

    expect(result.kind).toBe('panic')
    expect(result.message.toLowerCase()).toContain('overflow')
    expect(result.message).toContain('0x11')
  })

  test('code 18 describes division or modulo by zero and contains 0x12', () => {
    const result = decodeBridgeError({ error: createPanicRevert(18n) })

    expect(result.kind).toBe('panic')
    expect(result.message.toLowerCase()).toContain('divide')
    expect(result.message).toContain('0x12')
  })

  test('all nine documented panic codes produce nine mutually distinct messages', () => {
    const messages = PANIC_CODES.map((code) => decodeBridgeError({ error: createPanicRevert(BigInt(code)) }).message)

    expect(new Set(messages).size).toBe(PANIC_CODES.length)
    for (const result of PANIC_CODES.map((code) => decodeBridgeError({ error: createPanicRevert(BigInt(code)) }))) {
      expect(result.kind).toBe('panic')
    }
  })

  test('an undocumented panic code still yields kind: panic, never kind: unknown', () => {
    const result = decodeBridgeError({ error: createPanicRevert(255n) })

    expect(result.kind).toBe('panic')
    expect(result.message).toContain('0xff')
  })
})

describe('decodeBridgeError — revert-string (Error(string))', () => {
  test('a Solidity revert string decodes to kind: revert-string containing the reason', () => {
    const result = decodeBridgeError({ error: createErrorStringRevert('boom') })

    expect(result.kind).toBe('revert-string')
    expect(result.message).toContain('boom')
  })

  test('a revert reason longer than 200 characters is truncated with an ellipsis', () => {
    const longReason = 'x'.repeat(250)
    const result = decodeBridgeError({ error: createErrorStringRevert(longReason) })

    expect(result.kind).toBe('revert-string')
    expect(result.message).toContain('...')
    expect(result.message.length).toBeLessThan(longReason.length + 50)
  })
})

function createRevertedError({
  errorName,
  args,
}: {
  errorName: string
  args: readonly unknown[]
}): ContractFunctionRevertedError {
  const data = encodeErrorResult({
    abi: bridgeErrorAbi,
    errorName,
    args,
  })

  return new ContractFunctionRevertedError({
    abi: bridgeErrorAbi,
    data,
    functionName: 'mint',
  })
}

function createPanicRevert(code: bigint): ContractFunctionRevertedError {
  const data = encodeErrorResult({
    abi: [solidityPanicAbiItem],
    errorName: 'Panic',
    args: [code],
  })

  return new ContractFunctionRevertedError({
    abi: bridgeErrorAbi,
    data,
    functionName: 'lock',
  })
}

function createErrorStringRevert(reason: string): ContractFunctionRevertedError {
  const data = encodeErrorResult({
    abi: [solidityErrorAbiItem],
    errorName: 'Error',
    args: [reason],
  })

  return new ContractFunctionRevertedError({
    abi: bridgeErrorAbi,
    data,
    functionName: 'lock',
  })
}
