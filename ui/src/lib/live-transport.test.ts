import { expect, test } from 'bun:test'
import type { Hex } from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'

import {
  applyLogsByMessageId,
  blockTimeMsForChain,
  combineTransportModes,
  stalenessThresholdMs,
  transportModePriority,
  type KeyedLogUpdate,
  type TransportMode,
} from './live-transport'

const modes: readonly TransportMode[] = [
  'connected',
  'stale',
  'reconnecting',
  'polling-fallback',
]

test('staleness floor dominates Base Sepolia block time', () => {
  expect(stalenessThresholdMs({ blockTimeMs: 2_000 })).toBe(10_000)
})

test('staleness floor dominates Arbitrum Sepolia block time', () => {
  expect(stalenessThresholdMs({ blockTimeMs: 400 })).toBe(10_000)
})

test('three-times-block-time dominates for a synthetic slow chain', () => {
  expect(stalenessThresholdMs({ blockTimeMs: 9_000 })).toBe(27_000)
})

test('returns Base Sepolia observed block time', () => {
  expect(blockTimeMsForChain({ chainId: baseSepolia.id })).toBe(2_000)
})

test('returns Arbitrum Sepolia observed block time', () => {
  expect(blockTimeMsForChain({ chainId: arbitrumSepolia.id })).toBe(400)
})

test('throws for an unsupported chain id', () => {
  expect(() => blockTimeMsForChain({ chainId: 1 })).toThrow(
    'No block time is configured for chain 1',
  )
})

test('an empty transport list is reconnecting, never connected', () => {
  const result = combineTransportModes({ modes: [] })

  expect(result).toBe('reconnecting')
  expect(result).not.toBe('connected')
})

test('combines transport modes by worst-first priority', () => {
  expect(combineTransportModes({ modes: ['connected', 'polling-fallback'] })).toBe(
    'polling-fallback',
  )
  expect(combineTransportModes({ modes: ['connected', 'stale'] })).toBe('stale')
  expect(combineTransportModes({ modes: ['connected', 'connected'] })).toBe('connected')
  expect(combineTransportModes({ modes: ['stale', 'reconnecting'] })).toBe(
    'reconnecting',
  )
})

test('transport mode combination is total over all 16 ordered pairs', () => {
  for (const left of modes) {
    for (const right of modes) {
      expect(modes).toContain(combineTransportModes({ modes: [left, right] }))
    }
  }
})

test('transport priority defines exactly the four explicit modes', () => {
  expect(Object.keys(transportModePriority).sort()).toEqual([...modes].sort())
})

test('empty updates return a fresh empty map', () => {
  const current = new Map<string, Entry>()
  const result = applyLogsByMessageId({ current, updates: [] })

  expect(result).not.toBe(current)
  expect(result.size).toBe(0)
})

test('one update creates one lower-case-keyed entry', () => {
  const update = createUpdate({ messageId: upperMessageId, value: 'first' })
  const result = applyLogsByMessageId({ current: new Map(), updates: [update] })

  expect(result.size).toBe(1)
  expect(result.get(lowerMessageId)).toEqual({ value: 'first' })
})

test('duplicate updates in one batch collapse with the later entry winning', () => {
  const result = applyLogsByMessageId({
    current: new Map(),
    updates: [
      createUpdate({ value: 'first' }),
      createUpdate({ value: 'second' }),
    ],
  })

  expect(result.size).toBe(1)
  expect(result.get(lowerMessageId)).toEqual({ value: 'second' })
})

test('a duplicate delivered in a later call replaces the prior entry', () => {
  const first = applyLogsByMessageId({
    current: new Map(),
    updates: [createUpdate({ value: 'first' })],
  })
  const second = applyLogsByMessageId({
    current: first,
    updates: [createUpdate({ value: 'second' })],
  })

  expect(second.size).toBe(1)
  expect(second.get(lowerMessageId)).toEqual({ value: 'second' })
})

test('mixed-case forms of one message id dedupe to one entry', () => {
  const result = applyLogsByMessageId({
    current: new Map(),
    updates: [
      createUpdate({ messageId: upperMessageId, value: 'upper' }),
      createUpdate({ messageId: lowerMessageId, value: 'lower' }),
    ],
  })

  expect(result.size).toBe(1)
  expect(result.get(lowerMessageId)).toEqual({ value: 'lower' })
})

test('a removed update deletes an existing entry', () => {
  const current = new Map([[lowerMessageId, { value: 'existing' }]])
  const result = applyLogsByMessageId({
    current,
    updates: [createUpdate({ removed: true })],
  })

  expect(result.has(lowerMessageId)).toBe(false)
})

test('removing an unknown message id is a no-op', () => {
  const current = new Map([['0xother', { value: 'existing' }]])
  const result = applyLogsByMessageId({
    current,
    updates: [createUpdate({ removed: true })],
  })

  expect([...result.entries()]).toEqual([...current.entries()])
})

test('set then remove in one batch leaves the entry absent', () => {
  const result = applyLogsByMessageId({
    current: new Map(),
    updates: [
      createUpdate({ value: 'set' }),
      createUpdate({ removed: true }),
    ],
  })

  expect(result.has(lowerMessageId)).toBe(false)
})

test('remove then set in one batch leaves the later entry present', () => {
  const result = applyLogsByMessageId({
    current: new Map([[lowerMessageId, { value: 'old' }]]),
    updates: [
      createUpdate({ removed: true }),
      createUpdate({ value: 'new' }),
    ],
  })

  expect(result.get(lowerMessageId)).toEqual({ value: 'new' })
})

test('applying updates never mutates the current map', () => {
  const current = new Map([[lowerMessageId, { value: 'old' }]])
  const snapshot = new Map(current)

  applyLogsByMessageId({
    current,
    updates: [createUpdate({ value: 'new' })],
  })

  expect(current).toEqual(snapshot)
})

interface Entry {
  value: string
}

const upperMessageId = `0x${'AB'.repeat(32)}` as const
const lowerMessageId = upperMessageId.toLowerCase() as Hex

function createUpdate({
  messageId = lowerMessageId,
  removed = false,
  value = 'entry',
}: {
  messageId?: `0x${string}`
  removed?: boolean
  value?: string
} = {}): KeyedLogUpdate<Entry> {
  return {
    messageId,
    removed,
    entry: { value },
  }
}
