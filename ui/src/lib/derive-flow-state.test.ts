import { describe, expect, test } from "bun:test"

import type { DecodedBridgeError } from './decode-bridge-error'
import {
  deriveFlowState,
  type BridgeBlockedReason,
  type BridgeFlowState,
  type DeriveFlowStateInput,
  type TransactionProgress,
} from './derive-flow-state'

describe('deriveFlowState blocking guards and precedence', () => {
  const blockedCases: Array<{
    reason: BridgeBlockedReason
    overrides: Partial<DeriveFlowStateInput>
  }> = [
    { reason: 'disconnected', overrides: { isConnected: false } },
    { reason: 'undeployed', overrides: { isDeployed: false } },
    {
      reason: 'wrong-chain',
      overrides: { isCorrectChain: false, isSwitchingChain: false },
    },
    {
      reason: 'switching-chain',
      overrides: { isCorrectChain: false, isSwitchingChain: true },
    },
    { reason: 'invalid-amount', overrides: { hasValidAmount: false } },
    { reason: 'invalid-recipient', overrides: { hasValidRecipient: false } },
  ]

  for (const { reason, overrides } of blockedCases) {
    test(`returns blocked/${reason}`, () => {
      const result = deriveFlowState(createFlowInput(overrides))

      expect(result.phase).toBe('blocked')
      if (result.phase === 'blocked') expect(result.reason).toBe(reason)
    })
  }

  test('uses the first blocking guard when multiple guards fail', () => {
    const result = deriveFlowState(
      createFlowInput({
        isConnected: false,
        isDeployed: false,
        isCorrectChain: false,
        hasValidAmount: false,
        hasValidRecipient: false,
      }),
    )

    expect(result).toEqual({
      phase: 'blocked',
      reason: 'disconnected',
      steps: idleSteps(),
    })
  })
})

describe('deriveFlowState happy-path progression', () => {
  test('returns ready with three idle steps before progress begins', () => {
    expect(deriveFlowState(createFlowInput())).toEqual({
      phase: 'ready',
      steps: idleSteps(),
    })
  })

  test('maps an open approval wallet prompt to approving/pending', () => {
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isPrompting: true }),
      }),
    )

    expect(result).toEqual({
      phase: 'approving',
      steps: [
        { id: 'approve', status: 'pending' },
        { id: 'submit', status: 'idle' },
        { id: 'relay', status: 'idle' },
      ],
    })
  })

  test('maps approval receipt polling to approving/processing', () => {
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isConfirming: true }),
      }),
    )

    expect(result.phase).toBe('approving')
    expect(result.steps[0]).toEqual({ id: 'approve', status: 'processing' })
  })

  test('keeps a confirmed approval while returning ready for submission', () => {
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isConfirmed: true }),
      }),
    )

    expect(result.phase).toBe('ready')
    expect(result.steps[0]).toEqual({ id: 'approve', status: 'confirmed' })
  })

  test('maps an open bridge wallet prompt to submitting/pending', () => {
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isConfirmed: true }),
        bridge: createTransactionProgress({ isPrompting: true }),
      }),
    )

    expect(result.phase).toBe('submitting')
    expect(result.steps).toEqual([
      { id: 'approve', status: 'confirmed' },
      { id: 'submit', status: 'pending' },
      { id: 'relay', status: 'idle' },
    ])
  })

  test('maps bridge receipt polling to submitting/processing', () => {
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isConfirmed: true }),
        bridge: createTransactionProgress({ isConfirming: true }),
      }),
    )

    expect(result.phase).toBe('submitting')
    expect(result.steps[1]).toEqual({ id: 'submit', status: 'processing' })
  })

  test('maps an initiated relay to relaying/processing', () => {
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isConfirmed: true }),
        bridge: createTransactionProgress({ isConfirmed: true }),
        relay: { isInitiated: true, isFinalized: false },
      }),
    )

    expect(result.phase).toBe('relaying')
    expect(result.steps[2]).toEqual({ id: 'relay', status: 'processing' })
  })

  test('maps a finalized relay to done/confirmed', () => {
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isConfirmed: true }),
        bridge: createTransactionProgress({ isConfirmed: true }),
        relay: { isInitiated: true, isFinalized: true },
      }),
    )

    expect(result.phase).toBe('done')
    expect(result.steps[2]).toEqual({ id: 'relay', status: 'confirmed' })
  })
})

describe('deriveFlowState failure behavior', () => {
  test('collapses a submitting step to idle while preserving confirmed approval', () => {
    const failure = createFailure()
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isConfirmed: true }),
        bridge: createTransactionProgress({ isConfirming: true }),
        failure,
      }),
    )

    expect(result).toEqual({
      phase: 'failed',
      failure,
      failedStep: 'submit',
      steps: [
        { id: 'approve', status: 'confirmed' },
        { id: 'submit', status: 'idle' },
        { id: 'relay', status: 'idle' },
      ],
    })
    if (result.phase === 'failed') expect(result.failure).toBe(failure)
  })

  test('identifies approval failure and collapses its wallet-prompt state', () => {
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isPrompting: true }),
        failure: createFailure(),
      }),
    )

    expect(result.phase).toBe('failed')
    if (result.phase === 'failed') expect(result.failedStep).toBe('approve')
    expect(result.steps).toEqual(idleSteps())
  })

  test('identifies relay failure and collapses relay processing to idle', () => {
    const result = deriveFlowState(
      createFlowInput({
        approve: createTransactionProgress({ isConfirmed: true }),
        bridge: createTransactionProgress({ isConfirmed: true }),
        relay: { isInitiated: true, isFinalized: false },
        failure: createFailure(),
      }),
    )

    expect(result.phase).toBe('failed')
    if (result.phase === 'failed') expect(result.failedStep).toBe('relay')
    expect(result.steps[2]).toEqual({ id: 'relay', status: 'idle' })
  })

  test('failure outranks a later wallet disconnect', () => {
    const result = deriveFlowState(
      createFlowInput({
        isConnected: false,
        failure: createFailure(),
      }),
    )

    expect(result.phase).toBe('failed')
  })
})

describe('deriveFlowState FLOW-05 invariant', () => {
  test('no failed result spins across all 64 transaction-progress combinations', () => {
    const combinations = Array.from({ length: 64 }, (_, value) => ({
      approve: {
        isPrompting: Boolean(value & 1),
        isConfirming: Boolean(value & 2),
        isConfirmed: Boolean(value & 4),
      },
      bridge: {
        isPrompting: Boolean(value & 8),
        isConfirming: Boolean(value & 16),
        isConfirmed: Boolean(value & 32),
      },
    }))

    expect(combinations).toHaveLength(64)

    for (const { approve, bridge } of combinations) {
      const result = deriveFlowState(
        createFlowInput({ approve, bridge, failure: createFailure() }),
      )

      expect(result.phase).toBe('failed')
      for (const step of result.steps) {
        expect(step.status).not.toBe('pending')
        expect(step.status).not.toBe('processing')
      }
    }
  })
})

describe('deriveFlowState purity and single-source-of-truth structure', () => {
  test('is deterministic and does not mutate its input', () => {
    const input = createFlowInput({
      approve: createTransactionProgress({ isConfirmed: true }),
      bridge: createTransactionProgress({ isConfirming: true }),
    })
    const snapshot = structuredClone(input)

    const firstResult = deriveFlowState(input)
    const secondResult = deriveFlowState(input)

    expect(firstResult).toEqual(secondResult)
    expect(input).toEqual(snapshot)
  })

  test('every phase carries exactly three ordered steps and a phase string', () => {
    const fixtures: DeriveFlowStateInput[] = [
      createFlowInput({ isConnected: false }),
      createFlowInput(),
      createFlowInput({
        approve: createTransactionProgress({ isPrompting: true }),
      }),
      createFlowInput({
        bridge: createTransactionProgress({ isPrompting: true }),
      }),
      createFlowInput({ relay: { isInitiated: true, isFinalized: false } }),
      createFlowInput({ relay: { isInitiated: true, isFinalized: true } }),
      createFlowInput({ failure: createFailure() }),
    ]

    const results = fixtures.map(deriveFlowState)

    expect(results.map(({ phase }) => phase)).toEqual([
      'blocked',
      'ready',
      'approving',
      'submitting',
      'relaying',
      'done',
      'failed',
    ])
    for (const result of results) {
      expect(typeof result.phase).toBe('string')
      expect(result.steps).toHaveLength(3)
      expect(result.steps.map(({ id }) => id)).toEqual(['approve', 'submit', 'relay'])
    }
  })

  test('never confirms a transaction step from prompting or confirming alone', () => {
    for (let value = 0; value < 16; value += 1) {
      const result = deriveFlowState(
        createFlowInput({
          approve: createTransactionProgress({
            isPrompting: Boolean(value & 1),
            isConfirming: Boolean(value & 2),
          }),
          bridge: createTransactionProgress({
            isPrompting: Boolean(value & 4),
            isConfirming: Boolean(value & 8),
          }),
        }),
      )

      expect(result.steps[0].status).not.toBe('confirmed')
      expect(result.steps[1].status).not.toBe('confirmed')
    }
  })

  test('relay is never pending for any relay input', () => {
    for (const isInitiated of [false, true]) {
      for (const isFinalized of [false, true]) {
        const result = deriveFlowState(
          createFlowInput({ relay: { isInitiated, isFinalized } }),
        )

        expect(result.steps[2].status).not.toBe('pending')
      }
    }
  })
})

function createFlowInput(
  overrides: Partial<DeriveFlowStateInput> = {},
): DeriveFlowStateInput {
  return {
    isConnected: true,
    isDeployed: true,
    isCorrectChain: true,
    isSwitchingChain: false,
    hasValidAmount: true,
    hasValidRecipient: true,
    approve: createTransactionProgress(),
    bridge: createTransactionProgress(),
    relay: { isInitiated: false, isFinalized: false },
    ...overrides,
  }
}

function createFailure(): DecodedBridgeError {
  return {
    kind: 'bridge-custom-error',
    message: 'This transfer was already relayed.',
    errorName: 'BridgeMessageAlreadyProcessed',
  }
}

function createTransactionProgress(
  overrides: Partial<TransactionProgress> = {},
): TransactionProgress {
  return {
    isPrompting: false,
    isConfirming: false,
    isConfirmed: false,
    ...overrides,
  }
}

function idleSteps(): BridgeFlowState['steps'] {
  return [
    { id: 'approve', status: 'idle' },
    { id: 'submit', status: 'idle' },
    { id: 'relay', status: 'idle' },
  ]
}
