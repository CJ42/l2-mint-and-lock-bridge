import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { cookieStorage, createStorage, http } from 'wagmi'
import { arbitrumSepolia, baseSepolia } from 'wagmi/chains'

import { rpcUrls } from '@/lib/config'

export function getConfig() {
  return getDefaultConfig({
    appName: 'Mint & Lock Bridge',
    projectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
      'development-project-id',
    chains: [baseSepolia, arbitrumSepolia],
    ssr: true,
    transports: {
      [baseSepolia.id]: http(rpcUrls.base),
      [arbitrumSepolia.id]: http(rpcUrls.arbitrum),
    },
  })
}

declare module 'wagmi' {
  interface Register {
    config: ReturnType<typeof getConfig>
  }
}
