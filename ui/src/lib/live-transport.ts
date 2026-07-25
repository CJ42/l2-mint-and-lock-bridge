import type { Hex } from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'

export type TransportMode = 'connected' | 'stale' | 'reconnecting' | 'polling-fallback'

export const transportModePriority: Record<TransportMode, number> = {
  connected: 0,
  stale: 1,
  reconnecting: 2,
  'polling-fallback': 3,
}

export function combineTransportModes({
  modes,
}: {
  modes: readonly TransportMode[]
}): TransportMode {
  // No watcher established is not a healthy connection.
  if (modes.length === 0) return 'reconnecting'

  return modes.reduce((worst, mode) =>
    transportModePriority[mode] > transportModePriority[worst] ? mode : worst,
  )
}

export const STALENESS_FLOOR_MS = 10_000
export const WATCHDOG_CHECK_INTERVAL_MS = 2_000

// Approximate observed block times. The formula, not these current values, is the contract.
export const chainBlockTimeMs: Record<number, number> = {
  [baseSepolia.id]: 2_000,
  [arbitrumSepolia.id]: 400,
}

export function blockTimeMsForChain({ chainId }: { chainId: number }): number {
  const blockTimeMs = chainBlockTimeMs[chainId]
  if (blockTimeMs === undefined)
    throw new Error(`No block time is configured for chain ${chainId}`)
  return blockTimeMs
}

export function stalenessThresholdMs({
  blockTimeMs,
}: {
  blockTimeMs: number
}): number {
  return Math.max(3 * blockTimeMs, STALENESS_FLOOR_MS)
}

export interface KeyedLogUpdate<TEntry> {
  messageId: Hex
  removed: boolean
  entry: TEntry
}

export function applyLogsByMessageId<TEntry>({
  current,
  updates,
}: {
  current: ReadonlyMap<string, TEntry>
  updates: readonly KeyedLogUpdate<TEntry>[]
}): Map<string, TEntry> {
  const next = new Map(current)

  // First sight confirms, duplicate delivery overwrites, and a removed log rolls confirmation back.
  for (const update of updates) {
    const key = update.messageId.toLowerCase()
    if (update.removed) {
      next.delete(key)
      continue
    }
    next.set(key, update.entry)
  }

  return next
}
