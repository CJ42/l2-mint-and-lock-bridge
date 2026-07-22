import { chainKeys, type ChainKey } from "./config"

export interface RelayerState {
  lastProcessedBlock: Record<ChainKey, string>
}

export interface StateStore {
  getCheckpoint: ({ chain }: { chain: ChainKey }) => bigint
  setCheckpoint: ({ chain, blockNumber }: { chain: ChainKey; blockNumber: bigint }) => Promise<void>
  snapshot: () => RelayerState
}

export async function createStateStore({
  path,
  deployBlocks,
}: {
  path: string
  deployBlocks: Record<ChainKey, bigint>
}): Promise<StateStore> {
  let state = await loadState({ path, deployBlocks })
  let writeTail = Promise.resolve()

  function getCheckpoint({ chain }: { chain: ChainKey }): bigint {
    return BigInt(state.lastProcessedBlock[chain])
  }

  async function setCheckpoint({
    chain,
    blockNumber,
  }: {
    chain: ChainKey
    blockNumber: bigint
  }): Promise<void> {
    if (blockNumber < 0n) throw new Error("Checkpoint cannot be negative")
    if (blockNumber < getCheckpoint({ chain })) return

    state = {
      lastProcessedBlock: {
        ...state.lastProcessedBlock,
        [chain]: blockNumber.toString(),
      },
    }
    const serialized = serializeState({ state })
    writeTail = writeTail.then(
      () => Bun.write(path, serialized).then(() => undefined),
      () => Bun.write(path, serialized).then(() => undefined),
    )
    await writeTail
  }

  function snapshot(): RelayerState {
    return structuredClone(state)
  }

  return { getCheckpoint, setCheckpoint, snapshot }
}

export async function loadState({
  path,
  deployBlocks,
}: {
  path: string
  deployBlocks: Record<ChainKey, bigint>
}): Promise<RelayerState> {
  const defaults = createDefaultState({ deployBlocks })
  const file = Bun.file(path)
  if (!(await file.exists())) return defaults

  const value: unknown = await file.json()
  if (!isRecord(value) || !isRecord(value.lastProcessedBlock))
    throw new Error(`Invalid relayer state file: ${path}`)

  const checkpoints = { ...defaults.lastProcessedBlock }
  for (const chain of chainKeys) {
    const checkpoint = value.lastProcessedBlock[chain]
    if (checkpoint === undefined) continue
    if (typeof checkpoint !== "string" || !/^\d+$/.test(checkpoint))
      throw new Error(`Invalid ${chain} checkpoint in state file: ${path}`)
    checkpoints[chain] = checkpoint
  }

  return { lastProcessedBlock: checkpoints }
}

function createDefaultState({
  deployBlocks,
}: {
  deployBlocks: Record<ChainKey, bigint>
}): RelayerState {
  return {
    lastProcessedBlock: {
      baseSepolia: deployBlocks.baseSepolia.toString(),
      arbitrumSepolia: deployBlocks.arbitrumSepolia.toString(),
    },
  }
}

function serializeState({ state }: { state: RelayerState }): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
