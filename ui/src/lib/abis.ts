import { parseAbi } from 'viem'

export const erc20Abi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

export const bridgeAbi = parseAbi([
  'event BridgeInitiated(bytes32 indexed messageId, address indexed sender, address indexed recipient, uint256 amount, uint256 nonce, uint256 originChainId, uint256 destinationChainId)',
  'event BridgeFinalized(bytes32 indexed messageId, address indexed recipient, uint256 amount)',
  'function lock(address recipient, uint256 amount)',
  'function burn(address recipient, uint256 amount)',
])
