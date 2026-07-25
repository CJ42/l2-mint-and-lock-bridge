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
}

export interface ChainMeta {
  id: typeof baseSepolia.id | typeof arbitrumSepolia.id
  name: string
  logo: string
  tokenSymbol: 'USDC' | 'wUSDC'
}

export const chains: Record<'base' | 'arbitrum', ChainMeta> = {
  base: {
    id: baseSepolia.id,
    name: 'Base Sepolia',
    logo: '/base-logo.png',
    tokenSymbol: 'USDC',
  },
  arbitrum: {
    id: arbitrumSepolia.id,
    name: 'Arbitrum Sepolia',
    logo: '/arbitrum-logo.png',
    tokenSymbol: 'wUSDC',
  },
}

export const directions: Record<'baseToArbitrum' | 'arbitrumToBase', BridgeDirection> = {
  baseToArbitrum: {
    originChainId: baseSepolia.id,
    destinationChainId: arbitrumSepolia.id,
    originName: 'Base Sepolia',
    destinationName: 'Arbitrum Sepolia',
    tokenSymbol: 'USDC',
  },
  arbitrumToBase: {
    originChainId: arbitrumSepolia.id,
    destinationChainId: baseSepolia.id,
    originName: 'Arbitrum Sepolia',
    destinationName: 'Base Sepolia',
    tokenSymbol: 'wUSDC',
  },
}

export function formatTokenAmount(amount: bigint) {
  const [integer, fraction = ''] = formatUnits(amount, 6).split('.')
   const formattedInteger = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
     BigInt(integer),
   )
   const trimmedFraction = fraction.replace(/0+$/, '')
   return trimmedFraction ? `${formattedInteger}.${trimmedFraction}` : formattedInteger
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
