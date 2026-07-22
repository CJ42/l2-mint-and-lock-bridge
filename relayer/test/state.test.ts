import { afterEach, describe, expect, test } from "bun:test"
import { createStateStore } from "../src/state"

const createdPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    createdPaths.splice(0).map(async (path) => {
      const file = Bun.file(path)
      if (await file.exists()) await file.delete()
    }),
  )
})

describe("state store", () => {
  test("uses deploy blocks when no checkpoint file exists", async () => {
    const path = createPath()
    const state = await createStateStore({
      path,
      deployBlocks: { baseSepolia: 10n, arbitrumSepolia: 20n },
    })

    expect(state.getCheckpoint({ chain: "baseSepolia" })).toBe(10n)
    expect(state.getCheckpoint({ chain: "arbitrumSepolia" })).toBe(20n)
  })

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
    expect(restored.getCheckpoint({ chain: "arbitrumSepolia" })).toBe(200n)
  })
})

function createPath(): string {
  const path = `/tmp/l2-bridge-relayer-${crypto.randomUUID()}.json`
  createdPaths.push(path)
  return path
}
