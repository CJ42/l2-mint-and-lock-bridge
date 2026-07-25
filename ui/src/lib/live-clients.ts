import { createPublicClient, fallback, http, webSocket } from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'

import { rpcUrls } from '@/lib/config'

export const webSocketOptions = {
  reconnect: { attempts: 5, delay: 2_000 },
  keepAlive: true,
  retryCount: 3,
  timeout: 10_000,
} as const

export const baseLiveClient = createPublicClient({
  chain: baseSepolia,
  transport: rpcUrls.baseSepolia.ws
    ? fallback([
        webSocket(rpcUrls.baseSepolia.ws, webSocketOptions),
        http(rpcUrls.baseSepolia.default),
        http(rpcUrls.baseSepolia.fallback),
      ])
    : fallback([
        http(rpcUrls.baseSepolia.default),
        http(rpcUrls.baseSepolia.fallback),
      ]),
})

export const arbitrumLiveClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: rpcUrls.arbitrumSepolia.ws
    ? fallback([
        webSocket(rpcUrls.arbitrumSepolia.ws, webSocketOptions),
        http(rpcUrls.arbitrumSepolia.default),
        http(rpcUrls.arbitrumSepolia.fallback),
      ])
    : fallback([
        http(rpcUrls.arbitrumSepolia.default),
        http(rpcUrls.arbitrumSepolia.fallback),
      ]),
})

export function getLiveClient({
  chainId,
}: {
  chainId: number
}): typeof baseLiveClient | typeof arbitrumLiveClient {
  if (chainId === baseSepolia.id) return baseLiveClient
  if (chainId === arbitrumSepolia.id) return arbitrumLiveClient
  throw new Error(`No live client is configured for chain ${chainId}`)
}

export function isWebSocketEnabled({ chainId }: { chainId: number }): boolean {
  if (chainId === baseSepolia.id) return Boolean(rpcUrls.baseSepolia.ws)
  if (chainId === arbitrumSepolia.id) return Boolean(rpcUrls.arbitrumSepolia.ws)
  throw new Error(`No live transport is configured for chain ${chainId}`)
}
