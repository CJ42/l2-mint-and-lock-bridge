'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useState } from 'react'
import type { Hex } from 'viem'

import { BridgeCard } from '@/components/bridge-card'
import { MessageExplorer } from '@/components/message-explorer'
import { useBridgeMessages } from '@/hooks/use-bridge-messages'

import styles from './page.module.css'

export default function HomePage() {
  const [activeMessageId, setActiveMessageId] = useState<Hex>()
  const { messages, isLoading, error } = useBridgeMessages()

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="L2 Bridge home">
          [ L2 BRIDGE ]
        </a>
        <ConnectButton
          accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
          chainStatus="icon"
          showBalance={false}
        />
      </header>

      <div className={styles.top}>
        <div className={styles.hero}>
          <h1 className={styles.title}>
            L2 Bridge<span aria-hidden="true">.</span>
          </h1>
          <p className={styles.subtitle}>
            Move tokens between Arbitrum and Base Sepolia
          </p>
          <ul className={styles.facts}>
            {heroFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
        <BridgeCard
          messages={messages}
          activeMessageId={activeMessageId}
          onActiveMessageChange={setActiveMessageId}
        />
      </div>
      <MessageExplorer
        messages={messages}
        activeMessageId={activeMessageId}
        isLoading={isLoading}
        error={error}
      />
    </main>
  )
}

const heroFacts = [
  'Lock USDC on Base Sepolia to mint wUSDC on Arbitrum Sepolia',
  'Burn wUSDC on Arbitrum Sepolia to unlock the original collateral',
  '6-decimal amounts · 5 confirmation relay target · testnets only',
]
