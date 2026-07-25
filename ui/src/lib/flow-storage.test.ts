import { describe, expect, test } from 'bun:test'
import type { Address, Hex } from 'viem'

import {
  clearPersistedFlow,
  PERSISTED_FLOW_VERSION,
  readPersistedFlow,
  writePersistedFlow,
  type FlowStorageBackend,
  type PersistedFlow,
} from './flow-storage'

const addressA = '0x1111111111111111111111111111111111111111' as Address
const addressB = '0x2222222222222222222222222222222222222222' as Address
const hash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex

function createMemoryBackend(): FlowStorageBackend {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

function createRecord(
  overrides: Partial<PersistedFlow> = {},
): PersistedFlow {
  return {
    version: PERSISTED_FLOW_VERSION,
    address: addressA,
    directionKey: 'baseToArbitrum',
    amountInput: '1.5',
    recipientInput: addressA,
    ...overrides,
  }
}

describe('flow-storage', () => {
  test('round-trips a record for the same address', () => {
    const backend = createMemoryBackend()
    const record = createRecord({ approveHash: hash, messageId: hash })

    writePersistedFlow({ record, backend })
    expect(readPersistedFlow({ address: addressA, backend })).toEqual(record)
  })

  test('returns undefined when no record exists', () => {
    const backend = createMemoryBackend()
    expect(readPersistedFlow({ address: addressA, backend })).toBeUndefined()
  })

  test('scopes records by address', () => {
    const backend = createMemoryBackend()
    writePersistedFlow({ record: createRecord({ address: addressA }), backend })
    writePersistedFlow({
      record: createRecord({ address: addressB, amountInput: '2' }),
      backend,
    })

    expect(readPersistedFlow({ address: addressA, backend })?.amountInput).toBe(
      '1.5',
    )
    expect(readPersistedFlow({ address: addressB, backend })?.amountInput).toBe(
      '2',
    )
    expect(readPersistedFlow({ address: addressB, backend })?.address).toBe(
      addressB,
    )
  })

  test('rejects malformed, wrong-version, and invalid amount records', () => {
    const backend = createMemoryBackend()
    const key = `l2-bridge:flow:${addressA.toLowerCase()}`

    backend.setItem(key, '{not-json')
    expect(readPersistedFlow({ address: addressA, backend })).toBeUndefined()

    backend.setItem(
      key,
      JSON.stringify(createRecord({ version: 99 as typeof PERSISTED_FLOW_VERSION })),
    )
    expect(readPersistedFlow({ address: addressA, backend })).toBeUndefined()

    backend.setItem(
      key,
      JSON.stringify(createRecord({ amountInput: '1.1234567' })),
    )
    expect(readPersistedFlow({ address: addressA, backend })).toBeUndefined()
  })

  test('clear removes only the requested address', () => {
    const backend = createMemoryBackend()
    writePersistedFlow({ record: createRecord({ address: addressA }), backend })
    writePersistedFlow({ record: createRecord({ address: addressB }), backend })

    clearPersistedFlow({ address: addressA, backend })
    expect(readPersistedFlow({ address: addressA, backend })).toBeUndefined()
    expect(readPersistedFlow({ address: addressB, backend })).toBeDefined()
  })

  test('hostile backends degrade without throwing', () => {
    const throwingRead: FlowStorageBackend = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
      removeItem: () => {},
    }
    const throwingWrite: FlowStorageBackend = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('quota')
      },
    }

    expect(readPersistedFlow({ address: addressA, backend: throwingRead })).toBeUndefined()
    expect(() =>
      writePersistedFlow({ record: createRecord(), backend: throwingWrite }),
    ).not.toThrow()
    expect(() =>
      clearPersistedFlow({ address: addressA, backend: throwingWrite }),
    ).not.toThrow()
  })
})
