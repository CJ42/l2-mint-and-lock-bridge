import { formatUnits, type Address, type Hex } from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'

export interface BridgeMessage {
  messageId: Hex
  sender: Address
  recipient: Address
  amount: bigint
  nonce: bigint
  originChainId: number
  destinationChainId: number
  originTransactionHash: Hex
  destinationTransactionHash?: Hex
  blockNumber: bigint
  timestamp: number
  status: 'pending' | 'finalized'
}

export interface BridgeDirection {
  originChainId: typeof baseSepolia.id | typeof arbitrumSepolia.id
  destinationChainId: typeof baseSepolia.id | typeof arbitrumSepolia.id
  originName: string
  destinationName: string
  tokenSymbol: 'USDC' | 'wUSDC'
  action: 'lock' | 'burn'
}

export const directions: Record<'baseToArbitrum' | 'arbitrumToBase', BridgeDirection> = {
  baseToArbitrum: {
    originChainId: baseSepolia.id,
    destinationChainId: arbitrumSepolia.id,
    originName: 'Base Sepolia',
    destinationName: 'Arbitrum Sepolia',
    tokenSymbol: 'USDC',
    action: 'lock',
  },
  arbitrumToBase: {
    originChainId: arbitrumSepolia.id,
    destinationChainId: baseSepolia.id,
    originName: 'Arbitrum Sepolia',
    destinationName: 'Base Sepolia',
    tokenSymbol: 'wUSDC',
    action: 'burn',
  },
}

export function formatTokenAmount(amount: bigint) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6,
  }).format(Number(formatUnits(amount, 6)))
}

export function truncateHash(value: string, leading = 6, trailing = 4) {
  return `${value.slice(0, leading)}…${value.slice(-trailing)}`
}

export function getDirectionLabel(originChainId: number) {
  if (originChainId === baseSepolia.id) return 'Base→Arb'
  return 'Arb→Base'
}

export function getExplorerUrl(chainId: number, hash: Hex) {
  const explorer =
    chainId === baseSepolia.id
      ? baseSepolia.blockExplorers.default.url
      : arbitrumSepolia.blockExplorers.default.url

  return `${explorer}/tx/${hash}`
}

export function getAge(timestamp: number) {
  const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp)
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`
  if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)}m`
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)}h`
  return `${Math.floor(elapsedSeconds / 86_400)}d`
}
