import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem"

export interface BridgeMessage {
  originChainId: bigint
  destinationChainId: bigint
  token: Address
  sender: Address
  recipient: Address
  amount: bigint
  nonce: bigint
}

export interface BridgeInitiatedLog {
  address: Address
  args: {
    messageId?: Hex
    sender?: Address
    recipient?: Address
    amount?: bigint
    nonce?: bigint
    originChainId?: bigint
    destinationChainId?: bigint
  }
  blockNumber: bigint
  transactionHash: Hex
  logIndex: number
}

export function reconstructMessage({
  log,
  canonicalToken,
}: {
  log: BridgeInitiatedLog
  canonicalToken: Address
}): { message: BridgeMessage; messageId: Hex } {
  const { args } = log
  if (
    !args.messageId ||
    !args.sender ||
    !args.recipient ||
    args.amount === undefined ||
    args.nonce === undefined ||
    args.originChainId === undefined ||
    args.destinationChainId === undefined
  )
    throw new Error("BridgeInitiated log is missing required arguments")

  const message: BridgeMessage = {
    originChainId: args.originChainId,
    destinationChainId: args.destinationChainId,
    token: getAddress(canonicalToken),
    sender: getAddress(args.sender),
    recipient: getAddress(args.recipient),
    amount: args.amount,
    nonce: args.nonce,
  }
  const computedMessageId = hashBridgeMessage({ message })
  if (computedMessageId.toLowerCase() !== args.messageId.toLowerCase())
    throw new Error(
      `BridgeInitiated messageId mismatch: emitted ${args.messageId}, computed ${computedMessageId}`,
    )

  return { message, messageId: computedMessageId }
}

export function hashBridgeMessage({ message }: { message: BridgeMessage }): Hex {
  return keccak256(
    encodeAbiParameters(messageParameters, [
      message.originChainId,
      message.destinationChainId,
      message.token,
      message.sender,
      message.recipient,
      message.amount,
      message.nonce,
    ]),
  )
}

const messageParameters = [
  { type: "uint256", name: "originChainId" },
  { type: "uint256", name: "destinationChainId" },
  { type: "address", name: "token" },
  { type: "address", name: "sender" },
  { type: "address", name: "recipient" },
  { type: "uint256", name: "amount" },
  { type: "uint256", name: "nonce" },
] as const
