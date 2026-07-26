import { describe, expect, test } from "bun:test"
import type { Address, Hex } from "viem"
import { canonicalUsdcAddress } from "../src/config"
import {
  computeBridgeMessageId,
  reconstructMessage,
  type BridgeTxInitiatedLog,
  type BridgeMessage,
} from "../src/message"

describe("bridge message integrity", () => {
  test("reconstructs a message and accepts its canonical hash", () => {
    const message = createMessage()
    const messageId = computeBridgeMessageId({ message })
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

  test("chain ids and nonces change the hash", () => {
    const message = createMessage()

    expect(
      computeBridgeMessageId({
        message: { ...message, destinationChainId: message.destinationChainId + 1n },
      }),
    ).not.toBe(computeBridgeMessageId({ message }))
    expect(
      computeBridgeMessageId({ message: { ...message, nonce: message.nonce + 1n } }),
    ).not.toBe(computeBridgeMessageId({ message }))
  })
})

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
      amount: message.amount,
      nonce: message.nonce,
      originChainId: message.originChainId,
      destinationChainId: message.destinationChainId,
    },
    blockNumber: 100n,
    transactionHash: `0x${"ab".repeat(32)}`,
    logIndex: 0,
  }
}
