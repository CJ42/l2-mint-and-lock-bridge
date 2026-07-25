'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'

import type { UseBridgeFlowResult } from '@/hooks/use-bridge-flow'
import {
  chains,
  directions,
  formatTokenAmount,
  type ChainMeta,
} from '@/lib/bridge'
import { isBridgeDeployed } from '@/lib/config'
import type { BridgeFlowState, BridgeStepId } from '@/lib/derive-flow-state'

import { Spinner } from './spinner'
import styles from './bridge-card.module.css'

interface BridgeCardProps {
  flow: UseBridgeFlowResult
}

export function BridgeCard({ flow }: BridgeCardProps) {
  const {
    flowState,
    directionKey,
    amountInput,
    recipientInput,
    recipientError,
    originBalance,
    destinationBalance,
    explorerUrl,
    setAmountInput,
    setRecipientInput,
    setMaxAmount,
    setSelfRecipient,
    flipDirection,
    submit,
  } = flow

  const isBaseOrigin = directionKey === 'baseToArbitrum'
  const direction = directions[directionKey]
  const originChain = isBaseOrigin ? chains.base : chains.arbitrum
  const destinationChain = isBaseOrigin ? chains.arbitrum : chains.base
  const isConnected =
    flowState.phase !== 'blocked' || flowState.reason !== 'disconnected'
  const action = resolveAction({ flowState, explorerUrl })

  return (
    <section className={styles.card} aria-labelledby="bridge-heading">
      <div className={styles.cardHeading}>
        <h2 id="bridge-heading">Transfer</h2>
        <span className={styles.tag}>Testnet</span>
      </div>

      {!isBridgeDeployed && (
        <div className={styles.notice}>
          Contracts are not deployed. Add public addresses to enable writes.
        </div>
      )}

      <div className={styles.route}>
        <ChainPanel
          label="From"
          chain={originChain}
          balance={originBalance}
          isConnected={isConnected}
        />
        <button
          type="button"
          className={styles.swap}
          onClick={flipDirection}
          aria-label="Swap direction"
        >
          <SwapIcon />
        </button>
        <ChainPanel
          label="To"
          chain={destinationChain}
          balance={destinationBalance}
          isConnected={isConnected}
          isDestination
        />
      </div>

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label htmlFor="amount">Amount</label>
          <button type="button" className={styles.ghost} onClick={setMaxAmount}>
            Max
          </button>
        </div>
        <div className={styles.inputShell}>
          <input
            id="amount"
            className={styles.amountInput}
            inputMode="decimal"
            placeholder="0.00"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
          />
          <span className={styles.token}>
            <Image src={originChain.logo} alt="" width={16} height={16} />
            {direction.tokenSymbol}
          </span>
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label htmlFor="recipient">Recipient</label>
        </div>
        <div className={styles.recipientRow}>
          <div
            className={
              recipientError
                ? `${styles.inputShell} ${styles.inputShellInvalid}`
                : styles.inputShell
            }
          >
            <input
              id="recipient"
              className={styles.recipientInput}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(recipientError)}
              aria-describedby={recipientError ? 'recipient-error' : undefined}
              value={recipientInput}
              onChange={(event) => setRecipientInput(event.target.value)}
            />
          </div>
          {isConnected && (
            <button
              type="button"
              className={styles.self}
              onClick={setSelfRecipient}
            >
              Self
            </button>
          )}
        </div>
        {recipientError && (
          <p id="recipient-error" className={styles.error}>
            {recipientError}
          </p>
        )}
      </div>

      {flowState.phase === 'failed' && (
        <div className={styles.banner} role="alert">
          <strong>
            {failureHeadline(flowState.failedStep, flowState.failure.kind)}
          </strong>
          <p>{flowState.failure.message}</p>
        </div>
      )}

      {action.href ? (
        <a
          className={`${styles.action} ${styles.actionSuccess}`}
          href={action.href}
          target="_blank"
          rel="noreferrer"
        >
          <CheckIcon />
          {action.label}
        </a>
      ) : (
        <button
          type="button"
          className={
            flowState.phase === 'done'
              ? `${styles.action} ${styles.actionSuccess}`
              : styles.action
          }
          onClick={() => void submit()}
          disabled={action.isDisabled}
        >
          {action.showSpinner ? <Spinner mode="on-blue" /> : action.icon}
          {action.label}
        </button>
      )}
    </section>
  )
}

function ChainPanel({
  label,
  chain,
  balance,
  isConnected,
  isDestination = false,
}: {
  label: string
  chain: ChainMeta
  balance?: bigint
  isConnected: boolean
  isDestination?: boolean
}) {
  return (
    <div
      className={
        isDestination ? `${styles.chain} ${styles.chainEnd}` : styles.chain
      }
    >
      <span className={styles.chainLabel}>{label}</span>
      {isConnected && (
        <span className={styles.chainBalance}>
          Balance on {chain.name} ={' '}
          {balance === undefined
            ? '…'
            : `${formatTokenAmount(balance)} ${chain.tokenSymbol}`}
        </span>
      )}
      <span className={styles.chainName}>
        <Image src={chain.logo} alt="" width={22} height={22} />
        {chain.name}
      </span>
    </div>
  )
}

function resolveAction({
  flowState,
  explorerUrl,
}: {
  flowState: BridgeFlowState
  explorerUrl?: string
}): {
  label: string
  isDisabled: boolean
  showSpinner: boolean
  icon?: ReactNode
  href?: string
} {
  if (flowState.phase === 'blocked') {
    switch (flowState.reason) {
      case 'disconnected':
        return {
          label: 'Connect wallet',
          isDisabled: false,
          showSpinner: false,
          icon: <WalletIcon />,
        }
      case 'undeployed':
        return {
          label: 'Bridge undeployed',
          isDisabled: true,
          showSpinner: false,
        }
      case 'wrong-chain':
        return {
          label: 'Switch network',
          isDisabled: false,
          showSpinner: false,
          icon: <RetryIcon />,
        }
      case 'switching-chain':
        return {
          label: 'Switching network…',
          isDisabled: true,
          showSpinner: true,
        }
      case 'invalid-amount':
        return {
          label: 'Enter an amount',
          isDisabled: true,
          showSpinner: false,
        }
      case 'invalid-recipient':
        return {
          label: 'Enter a recipient',
          isDisabled: true,
          showSpinner: false,
        }
    }
  }

  if (flowState.phase === 'ready')
    return {
      label: 'Bridge',
      isDisabled: false,
      showSpinner: false,
      icon: <TransferIcon />,
    }

  if (flowState.phase === 'approving') {
    const approve = flowState.steps[0]
    if (approve.status === 'pending')
      return {
        label: 'Confirm approval in wallet',
        isDisabled: true,
        showSpinner: true,
      }
    return { label: 'Approving…', isDisabled: true, showSpinner: true }
  }

  if (flowState.phase === 'submitting') {
    const submitStep = flowState.steps[1]
    if (submitStep.status === 'pending')
      return {
        label: 'Confirm in wallet',
        isDisabled: true,
        showSpinner: true,
      }
    return { label: 'Submitting…', isDisabled: true, showSpinner: true }
  }

  if (flowState.phase === 'relaying')
    return { label: 'Relaying…', isDisabled: true, showSpinner: true }

  if (flowState.phase === 'done')
    return {
      label: 'Done ✓ — view on explorer',
      isDisabled: false,
      showSpinner: false,
      href: explorerUrl,
      icon: <CheckIcon />,
    }

  return {
    label: 'Try again',
    isDisabled: false,
    showSpinner: false,
    icon: <RetryIcon />,
  }
}

function failureHeadline(failedStep: BridgeStepId, kind: string) {
  if (kind === 'wallet-rejected') return 'Transaction rejected'
  if (failedStep === 'approve') return 'Approval failed'
  if (failedStep === 'submit') return 'Bridge transaction failed'
  return 'Relay failed'
}

function SwapIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.5 5.25h11.25M9.75 2.25l3 3M14.5 10.75H3.25M6.25 13.75l-3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5h11v8h-11zM2.5 4.5 4 2.75h6.5L12 4.5M10.5 8.5h3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TransferIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 8h11M10 4.5 13.5 8 10 11.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RetryIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.25 6.25A5 5 0 1 1 4 11.5M3.25 6.25V3.5M3.25 6.25H6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.5 8.25 6.5 11.25 12.5 4.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
