'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  darkTheme,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit'
import { type ReactNode, useState } from 'react'
import { WagmiProvider } from 'wagmi'

import { getConfig } from '@/wagmi'

export function Providers(props: { children: ReactNode }) {
  const [config] = useState(() => getConfig())
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#55e69d',
            accentColorForeground: '#06130d',
            borderRadius: 'medium',
          })}
        >
          {props.children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
