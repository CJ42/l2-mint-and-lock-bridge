'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  lightTheme,
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
          theme={lightTheme({
            accentColor: '#181EA9',
            accentColorForeground: '#ffffff',
            borderRadius: 'small',
          })}
        >
          {props.children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
