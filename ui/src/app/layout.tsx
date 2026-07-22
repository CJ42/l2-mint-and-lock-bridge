import '@rainbow-me/rainbowkit/styles.css'
import './globals.css'
import type { Metadata } from 'next'
import { type ReactNode } from 'react'

import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Mint & Lock Bridge',
  description: 'Bridge USDC between Base Sepolia and Arbitrum Sepolia',
}

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{props.children}</Providers>
      </body>
    </html>
  )
}
