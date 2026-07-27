import {
  fallback,
  getAddress,
  http,
  type Address,
  type Hex,
  type Transport,
  zeroAddress,
  isHex,
  size
} from "viem"
import { arbitrumSepolia, baseSepolia } from "viem/chains"
import deploymentAddresses from "../../addresses.json"

export const chainKeys = ["baseSepolia", "arbitrumSepolia"] as const

export type ChainKey = (typeof chainKeys)[number]
export type Direction = "base-to-arbitrum" | "arbitrum-to-base"

export interface RelayerConfig {
  rpcTransports: Record<ChainKey, Transport>
  bridgeAddresses: Record<ChainKey, Address>
  deployBlocks: Record<ChainKey, bigint>
  confirmations: bigint
  pollIntervalMs: number
  stateFile: string
}

export const chains = {
  baseSepolia,
  arbitrumSepolia,
} as const

export const canonicalUsdcAddress = getAddress(
  deploymentAddresses.baseSepolia.usdc,
)

export function loadConfig(): RelayerConfig {
  return {
    // always use a fallback RPC url in case the public one
    // is congested by traffic, rate limiting, or as fallback for any RPC error
    rpcTransports: {
      baseSepolia: fallback([
        http(baseSepolia.rpcUrls.default.http[0]),
          http("https://base-sepolia.drpc.org")
      ]),
      arbitrumSepolia: fallback([
        http(arbitrumSepolia.rpcUrls.default.http[0]),
        http("https://arbitrum-sepolia.drpc.org")
      ]),
    },
    bridgeAddresses: {
      baseSepolia: validateConfiguredAddress({
        name: "deploymentAddresses.baseSepolia.collateralBridge",
        value: deploymentAddresses.baseSepolia.collateralBridge,
      }),
      arbitrumSepolia: validateConfiguredAddress({
        name: "deploymentAddresses.arbitrumSepolia.syntheticBridge",
        value: deploymentAddresses.arbitrumSepolia.syntheticBridge,
      }),
    },
    deployBlocks: {
      baseSepolia: BigInt(deploymentAddresses.baseSepolia.deployBlock),
      arbitrumSepolia: BigInt(deploymentAddresses.arbitrumSepolia.deployBlock),
    },
    confirmations: 5n,
    pollIntervalMs: 4_000,
    stateFile: "./state.json",
  }
}

/** 
 * Load the relayer private key + validate its format
 */
export function loadRelayerPrivateKey(): Hex {
  const env = Bun.env;
  const value = env["RELAYER_PRIVATE_KEY"]?.trim();
  if (!value) throw new Error(`Missing required environment variable: RELAYER_PRIVATE_KEY`)

  if (!isHex(value) && size(value as Hex) != 64) {
    throw new Error("RELAYER_PRIVATE_KEY must be a 32-byte 0x-prefixed hex value")
  }

  return value as Hex
}

function validateConfiguredAddress({
  name,
  value,
}: {
  name: string
  value: string
}): Address {
  if (!value)
    throw new Error(`Missing ${name} in addresses.json`)

  try {
    const address = getAddress(value)
    if (address === zeroAddress) throw new Error("zero address")
    return address
  } catch {
    throw new Error(`Invalid ${name} in addresses.json`)
  }
}