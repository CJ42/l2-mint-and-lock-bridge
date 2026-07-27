import '@rainbow-me/rainbowkit/styles.css'
import './globals.css'
import type { Metadata } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import { type ReactNode } from 'react'

import { Providers } from './providers'

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'L2 Bridge',
  description: 'Move USDC between Base and Arbitrum Sepolia',
}

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en" className={ibmPlexMono.variable}>
      <body>
        <Providers>{props.children}</Providers>
      </body>
    </html>
  )
}
