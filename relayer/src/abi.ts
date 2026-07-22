import { parseAbi } from "viem"

export const bridgeAbi = parseAbi([
  "event BridgeInitiated(bytes32 indexed messageId, address indexed sender, address indexed recipient, uint256 amount, uint256 nonce, uint256 originChainId, uint256 destinationChainId)",
  "function processed(bytes32 messageId) view returns (bool)",
  "function mint((uint256 originChainId, uint256 destinationChainId, address token, address sender, address recipient, uint256 amount, uint256 nonce) message)",
  "function unlock((uint256 originChainId, uint256 destinationChainId, address token, address sender, address recipient, uint256 amount, uint256 nonce) message)",
])

export const bridgeInitiatedEvent = bridgeAbi[0]
