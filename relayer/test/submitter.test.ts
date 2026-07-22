import { describe, expect, test } from "bun:test"
import type { Hex } from "viem"
import type { LogEntry } from "../src/logger"
import { hashBridgeMessage, type BridgeMessage } from "../src/message"
import {
  createSubmitter,
  maxAttempts,
  submitMessage,
  type Submission,
  type SubmitterActions,
} from "../src/submitter"

describe("submitter", () => {
  test("skips a message already processed on the destination", async () => {
    let simulationCount = 0
    const submission = createSubmission({ nonce: 1n })

    await submitMessage({
      direction: "base-to-arbitrum",
      submission,
      actions: {
        isProcessed: async () => true,
        simulate: async () => {
          simulationCount += 1
          return {}
        },
        write: async () => txHash,
        wait: async () => "success",
      },
      log: () => undefined,
    })

    expect(simulationCount).toBe(0)
  })

  test("retries eight times with exponential backoff capped at 60 seconds", async () => {
    const delays: number[] = []
    let attempts = 0

    await expect(
      submitMessage({
        direction: "base-to-arbitrum",
        submission: createSubmission({ nonce: 2n }),
        actions: {
          isProcessed: async () => false,
          simulate: async () => {
            attempts += 1
            throw new Error("temporarily unavailable")
          },
          write: async () => txHash,
          wait: async () => "success",
        },
        log: () => undefined,
        wait: async ({ milliseconds }) => {
          delays.push(milliseconds)
        },
      }),
    ).rejects.toThrow("temporarily unavailable")

    expect(attempts).toBe(maxAttempts)
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000])
  })

  test("continues the queue after a permanently failed item", async () => {
    const logEntries: LogEntry[] = []
    const actions = createQueueActions()
    const submitter = createSubmitter({
      direction: "arbitrum-to-base",
      actions,
      log: (entry) => logEntries.push(entry),
      wait: async () => undefined,
    })

    submitter.enqueue(createSubmission({ nonce: 0n }))
    submitter.enqueue(createSubmission({ nonce: 1n }))
    await submitter.onIdle()

    expect(logEntries.some((entry) => entry.status === "failed")).toBeTrue()
    expect(logEntries.some((entry) => entry.status === "finalized")).toBeTrue()
  })
})

function createQueueActions(): SubmitterActions {
  return {
    isProcessed: async () => false,
    simulate: async ({ message }) => {
      if (message.nonce === 0n) throw new Error("permanent failure")
      return message
    },
    write: async () => txHash,
    wait: async () => "success",
  }
}

function createSubmission({ nonce }: { nonce: bigint }): Submission {
  const message: BridgeMessage = {
    originChainId: 84_532n,
    destinationChainId: 421_614n,
    token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    sender: "0x1111111111111111111111111111111111111111",
    recipient: "0x2222222222222222222222222222222222222222",
    amount: 1_000_000n,
    nonce,
  }
  return { message, messageId: hashBridgeMessage({ message }) }
}

const txHash = `0x${"ab".repeat(32)}` as Hex
