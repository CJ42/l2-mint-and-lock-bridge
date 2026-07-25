import { describe, expect, test } from 'bun:test'
import { ContractFunctionRevertedError, encodeErrorResult, type Hex } from 'viem'

import { bridgeErrorAbi, decodeBridgeError } from './decode-bridge-error'

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
