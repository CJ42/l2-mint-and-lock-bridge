import { getAddress, isAddress, zeroAddress, type Address } from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'
import deploymentAddresses from '../../../addresses.json'

function readAddress(value: string | undefined): Address | undefined {
  if (!value || !isAddress(value) || value === zeroAddress) return undefined

  return getAddress(value)
}

export const addresses = {
  baseBridge: readAddress(
    process.env.NEXT_PUBLIC_BASE_BRIDGE_ADDRESS ||
      deploymentAddresses.baseSepolia.collateralBridge,
  ),
  baseUsdc: readAddress(
    process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS ||
      deploymentAddresses.baseSepolia.usdc,
  ),
  arbitrumBridge: readAddress(
    process.env.NEXT_PUBLIC_ARBITRUM_BRIDGE_ADDRESS ||
      deploymentAddresses.arbitrumSepolia.syntheticBridge,
  ),
  arbitrumWusdc: readAddress(
    process.env.NEXT_PUBLIC_ARBITRUM_WUSDC_ADDRESS ||
      deploymentAddresses.arbitrumSepolia.wrappedUsdc,
  ),
}

export const rpcUrls = {
  base:
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ??
    baseSepolia.rpcUrls.default.http[0],
  arbitrum:
    process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL ??
    arbitrumSepolia.rpcUrls.default.http[0],
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
}
