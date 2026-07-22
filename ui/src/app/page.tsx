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
        <a className={styles.brand} href="/" aria-label="Mint and Lock home">
          <span>ML</span>
          Mint & Lock
        </a>
        <ConnectButton
          accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
          chainStatus="icon"
          showBalance={false}
        />
      </header>

      <div className={styles.intro}>
        <p>Lock on one L2. Mint on the other.</p>
      </div>
      <BridgeCard
        messages={messages}
        activeMessageId={activeMessageId}
        onActiveMessageChange={setActiveMessageId}
      />
      <MessageExplorer
        messages={messages}
        activeMessageId={activeMessageId}
        isLoading={isLoading}
        error={error}
      />
    </main>
  )
}
