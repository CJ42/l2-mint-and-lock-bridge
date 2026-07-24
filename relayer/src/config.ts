import {
  fallback,
  getAddress,
  http,
  type Address,
  type Hex,
  type Transport,
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
  relayerPrivateKey: Hex
  confirmations: bigint
  pollIntervalMs: number
  stateFile: string
}

export const chains = {
  baseSepolia,
  arbitrumSepolia,
} as const

const drpcUrls: Record<ChainKey, string> = {
  baseSepolia: "https://base-sepolia.drpc.org",
  arbitrumSepolia: "https://arbitrum-sepolia.drpc.org",
}

export const canonicalUsdcAddress = getAddress(
  deploymentAddresses.baseSepolia.usdc,
)

export function loadConfig(env: Record<string, string | undefined> = Bun.env): RelayerConfig {
  return {
    rpcTransports: {
      baseSepolia: fallback([
        http(chains.baseSepolia.rpcUrls.default.http[0]),
        http(drpcUrls.baseSepolia),
      ]),
      arbitrumSepolia: fallback([
        http(chains.arbitrumSepolia.rpcUrls.default.http[0]),
        http(drpcUrls.arbitrumSepolia),
      ]),
    },
    bridgeAddresses: {
      baseSepolia: getConfiguredAddress({
        env,
        name: "BASE_BRIDGE_ADDRESS",
        fallback: deploymentAddresses.baseSepolia.collateralBridge,
      }),
      arbitrumSepolia: getConfiguredAddress({
        env,
        name: "ARBITRUM_BRIDGE_ADDRESS",
        fallback: deploymentAddresses.arbitrumSepolia.syntheticBridge,
      }),
    },
    deployBlocks: {
      baseSepolia: getBigIntEnv({
        env,
        name: "BASE_DEPLOY_BLOCK",
        fallback: BigInt(deploymentAddresses.baseSepolia.deployBlock),
      }),
      arbitrumSepolia: getBigIntEnv({
        env,
        name: "ARBITRUM_DEPLOY_BLOCK",
        fallback: BigInt(deploymentAddresses.arbitrumSepolia.deployBlock),
      }),
    },
    relayerPrivateKey: getPrivateKey({ env }),
    confirmations: getBigIntEnv({ env, name: "CONFIRMATIONS", fallback: 5n }),
    pollIntervalMs: getNumberEnv({ env, name: "POLL_INTERVAL_MS", fallback: 4_000 }),
    stateFile: env.STATE_FILE?.trim() || "./state.json",
  }
}

function getRequiredEnv({
  env,
  name,
}: {
  env: Record<string, string | undefined>
  name: string
}): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function getConfiguredAddress({
  env,
  name,
  fallback,
}: {
  env: Record<string, string | undefined>
  name: string
  fallback: string
}): Address {
  const value = env[name]?.trim() || fallback
  if (!value)
    throw new Error(`Missing ${name}; set it or populate the corresponding value in addresses.json`)

  try {
    const address = getAddress(value)
    if (address === zeroAddress) throw new Error("zero address")
    return address
  } catch {
    throw new Error(`Invalid address in environment variable: ${name}`)
  }
}

function getPrivateKey({ env }: { env: Record<string, string | undefined> }): Hex {
  const value = getRequiredEnv({ env, name: "RELAYER_PRIVATE_KEY" })
  if (!/^0x[0-9a-fA-F]{64}$/.test(value))
    throw new Error("RELAYER_PRIVATE_KEY must be a 32-byte 0x-prefixed hex value")
  return value as Hex
}

function getBigIntEnv({
  env,
  name,
  fallback,
}: {
  env: Record<string, string | undefined>
  name: string
  fallback: bigint
}): bigint {
  const value = env[name]?.trim()
  if (!value) return fallback
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer`)
  return BigInt(value)
}

function getNumberEnv({
  env,
  name,
  fallback,
}: {
  env: Record<string, string | undefined>
  name: string
  fallback: number
}): number {
  const value = env[name]?.trim()
  if (!value) return fallback

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive safe integer`)
  return parsed
}

const zeroAddress = "0x0000000000000000000000000000000000000000"
