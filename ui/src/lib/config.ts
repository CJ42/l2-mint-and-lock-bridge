import { getAddress, isAddress, zeroAddress, type Address } from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'
import deploymentAddresses from '../../../addresses.json'

type RpcUrls = {
  [chain: string]: {
    default: string
    fallback: string
    ws?: string
  }
}

function readAddress(value: string | undefined): Address | undefined {
  if (!value || !isAddress(value) || value === zeroAddress) return undefined

  return getAddress(value)
}

export const addresses = {
  baseBridge:
     readAddress(process.env.NEXT_PUBLIC_BASE_BRIDGE_ADDRESS) ??
     readAddress(deploymentAddresses.baseSepolia.collateralBridge),
   baseUsdc:
     readAddress(process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS) ??
     readAddress(deploymentAddresses.baseSepolia.usdc),
   arbitrumBridge:
     readAddress(process.env.NEXT_PUBLIC_ARBITRUM_BRIDGE_ADDRESS) ??
     readAddress(deploymentAddresses.arbitrumSepolia.syntheticBridge),
   arbitrumWusdc:
     readAddress(process.env.NEXT_PUBLIC_ARBITRUM_WUSDC_ADDRESS) ??
     readAddress(deploymentAddresses.arbitrumSepolia.wrappedUsdc),
}

/**
 * @dev Always ensure 
 */
export const rpcUrls: RpcUrls = {
  baseSepolia: {
    default: baseSepolia.rpcUrls.default.http[0],
    fallback: 'https://base-sepolia.drpc.org',
    ws: 'wss://base-sepolia-rpc.publicnode.com',
  },
  arbitrumSepolia: {
    default: arbitrumSepolia.rpcUrls.default.http[0],
    fallback: 'https://arbitrum-sepolia.drpc.org',
    ws: 'wss://arbitrum-sepolia-rpc.publicnode.com',
  },
}

export const isBaseDeployed = Boolean(addresses.baseBridge && addresses.baseUsdc)
export const isArbitrumDeployed = Boolean(
  addresses.arbitrumBridge && addresses.arbitrumWusdc,
)
export const isBridgeDeployed = isBaseDeployed && isArbitrumDeployed

export const scanConfiguration = {
  blockWindow: 50_000n,
  chunkSize: 2_000n,
  pollingInterval: 6_000,
  reconcileInterval: 60_000,
}
