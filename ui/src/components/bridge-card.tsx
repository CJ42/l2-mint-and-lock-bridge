'use client'

import { useConnectModal } from '@rainbow-me/rainbowkit'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import {
  formatUnits,
  getAddress,
  isAddress,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'

import {
  collateralTokenBridgeAbi,
  ierc20Abi,
  syntheticTokenBridgeAbi,
} from '@/lib/generated'
import {
  chains,
  directions,
  formatTokenAmount,
  getExplorerUrl,
  type BridgeMessage,
  type ChainMeta,
} from '@/lib/bridge'
import { addresses, isBridgeDeployed } from '@/lib/config'

import styles from './bridge-card.module.css'

// Keyed lookup from the direction's action to the bridge ABI that declares it — avoids
// duplicating this ternary at both bridge-call sites below.
const bridgeAbiByAction = {
  lock: collateralTokenBridgeAbi,
  burn: syntheticTokenBridgeAbi,
} as const

interface BridgeCardProps {
  messages: BridgeMessage[]
  activeMessageId?: Hex
  onActiveMessageChange: (messageId: Hex | undefined) => void
}

export function BridgeCard({
  messages,
  activeMessageId,
  onActiveMessageChange,
}: BridgeCardProps) {
  const [directionKey, setDirectionKey] =
    useState<keyof typeof directions>('baseToArbitrum')
  const [amountInput, setAmountInput] = useState('')
  const [recipientInput, setRecipientInput] = useState('')
  const [approveHash, setApproveHash] = useState<Hex>()
  const [bridgeHash, setBridgeHash] = useState<Hex>()
  const [formError, setFormError] = useState<string | null>(null)
  const { address, chainId, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const approveWrite = useWriteContract()
  const bridgeWrite = useWriteContract()
  const isBaseOrigin = directionKey === 'baseToArbitrum'
  const direction = directions[directionKey]
  const originChain = isBaseOrigin ? chains.base : chains.arbitrum
  const destinationChain = isBaseOrigin ? chains.arbitrum : chains.base
  const tokenAddress = isBaseOrigin ? addresses.baseUsdc : addresses.arbitrumWusdc
  const bridgeAddress = isBaseOrigin
    ? addresses.baseBridge
    : addresses.arbitrumBridge
  const amount = useMemo(() => parseAmount(amountInput), [amountInput])
  const { recipient, recipientError } = useMemo(
    () => parseRecipient(recipientInput),
    [recipientInput],
  )
  const activeMessage = messages.find(
    (message) => message.messageId === activeMessageId,
  )

  const { data: baseBalance } = useReadContract({
    abi: ierc20Abi,
    address: addresses.baseUsdc,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chains.base.id,
    query: { enabled: Boolean(addresses.baseUsdc && address) },
  })
  const { data: arbitrumBalance } = useReadContract({
    abi: ierc20Abi,
    address: addresses.arbitrumWusdc,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chains.arbitrum.id,
    query: { enabled: Boolean(addresses.arbitrumWusdc && address) },
  })
  const {
    data: allowanceData,
    refetch: refetchAllowance,
  } = useReadContract({
    abi: ierc20Abi,
    address: tokenAddress,
    functionName: 'allowance',
    args: address && bridgeAddress ? [address, bridgeAddress] : undefined,
    chainId: direction.originChainId,
    query: { enabled: Boolean(tokenAddress && bridgeAddress && address) },
  })
  const approveReceipt = useWaitForTransactionReceipt({
    hash: approveHash,
    chainId: direction.originChainId,
    query: { enabled: Boolean(approveHash) },
  })
  const bridgeReceipt = useWaitForTransactionReceipt({
    hash: bridgeHash,
    chainId: direction.originChainId,
    query: { enabled: Boolean(bridgeHash) },
  })

  const balance = (isBaseOrigin ? baseBalance : arbitrumBalance) ?? 0n
  const allowance = allowanceData ?? 0n
  const needsApproval = Boolean(amount && amount > allowance)

  useEffect(() => {
    if (!approveReceipt.isSuccess) return
    void refetchAllowance()
  }, [approveReceipt.isSuccess, refetchAllowance])

  useEffect(() => {
    if (!address) return
    setRecipientInput((current) => current || address)
  }, [address])

  useEffect(() => {
    if (!bridgeReceipt.data) return

    const initiatedLogs = parseEventLogs({
      abi: bridgeAbiByAction[direction.action],
      eventName: 'BridgeInitiated',
      logs: bridgeReceipt.data.logs,
    })
    const messageId = initiatedLogs[0]?.args.messageId
    if (messageId) onActiveMessageChange(messageId)
  }, [bridgeReceipt.data, onActiveMessageChange])

  function flipDirection() {
    setDirectionKey((current) =>
      current === 'baseToArbitrum' ? 'arbitrumToBase' : 'baseToArbitrum',
    )
    setApproveHash(undefined)
    setBridgeHash(undefined)
    setFormError(null)
    onActiveMessageChange(undefined)
  }

  function setMaxAmount() {
    setAmountInput(formatUnits(balance, 6))
    setFormError(null)
  }

  async function approve() {
    if (!tokenAddress || !bridgeAddress || !amount) return

    setFormError(null)
    try {
      const hash = await approveWrite.writeContractAsync({
        abi: ierc20Abi,
        address: tokenAddress,
        functionName: 'approve',
        args: [bridgeAddress, amount],
        chainId: direction.originChainId,
      })
      setApproveHash(hash)
    } catch (cause) {
      setFormError(getTransactionError(cause))
    }
  }

  async function bridge() {
    if (!bridgeAddress || !recipient || !amount) return

    const validationError = validateBridge({ amount, balance })
    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    onActiveMessageChange(undefined)
    try {
      const hash = await bridgeWrite.writeContractAsync({
        abi: bridgeAbiByAction[direction.action],
        address: bridgeAddress,
        functionName: direction.action,
        args: [recipient, amount],
        chainId: direction.originChainId,
      })
      setBridgeHash(hash)
    } catch (cause) {
      setFormError(getTransactionError(cause))
    }
  }

  async function handleAction() {
    if (!isConnected) {
      openConnectModal?.()
      return
    }

    if (chainId !== direction.originChainId) {
      await switchChainAsync({ chainId: direction.originChainId })
      return
    }

    if (needsApproval) {
      await approve()
      return
    }

    await bridge()
  }

  const action = getActionState({
    isConnected,
    isDeployed: isBridgeDeployed,
    isCorrectChain: chainId === direction.originChainId,
    isSwitching,
    hasValidAmount: Boolean(amount),
    hasValidRecipient: Boolean(recipient),
    needsApproval,
    isApproving: approveWrite.isPending,
    isApprovalConfirming: approveReceipt.isLoading,
    isBridgePromptOpen: bridgeWrite.isPending,
    isBridgeConfirming: bridgeReceipt.isLoading,
    activeMessage,
    hasInitiatedMessage: Boolean(activeMessageId),
  })
  const completedTransactionHash =
    activeMessage?.destinationTransactionHash ?? bridgeHash

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
          balance={isBaseOrigin ? baseBalance : arbitrumBalance}
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
          balance={isBaseOrigin ? arbitrumBalance : baseBalance}
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
            onChange={(event) => {
              setAmountInput(event.target.value)
              setFormError(null)
            }}
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
              onChange={(event) => {
                setRecipientInput(event.target.value)
                setFormError(null)
              }}
            />
          </div>
          {address && (
            <button
              type="button"
              className={styles.self}
              onClick={() => {
                setRecipientInput(address)
                setFormError(null)
              }}
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

      {formError && <p className={styles.error}>{formError}</p>}
      {approveReceipt.error && (
        <p className={styles.error}>Approval failed on-chain.</p>
      )}
      {bridgeReceipt.error && (
        <p className={styles.error}>Bridge transaction failed on-chain.</p>
      )}

      {action.isDone && completedTransactionHash ? (
        <a
          className={styles.action}
          href={getExplorerUrl(
            activeMessage?.destinationChainId ?? direction.originChainId,
            completedTransactionHash,
          )}
          target="_blank"
          rel="noreferrer"
        >
          Done ✓ — view on explorer
        </a>
      ) : (
        <button
          type="button"
          className={styles.action}
          onClick={() => void handleAction()}
          disabled={action.isDisabled}
        >
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

function parseAmount(value: string) {
  if (!value || !/^\d*(\.\d{0,6})?$/.test(value)) return undefined

  try {
    const amount = parseUnits(value, 6)
    return amount > 0n ? amount : undefined
  } catch {
    return undefined
  }
}

function parseRecipient(value: string): {
  recipient?: Address
  recipientError: string | null
} {
  const trimmed = value.trim()
  if (!trimmed) return { recipientError: null }
  if (!isAddress(trimmed, { strict: false }))
    return { recipientError: 'Enter a valid Ethereum address (0x + 40 hex).' }

  return { recipient: getAddress(trimmed), recipientError: null }
}

function validateBridge({
  amount,
  balance,
}: {
  amount: bigint
  balance: bigint
}) {
  if (amount > balance) return 'Amount exceeds your available balance.'
  return null
}

function getTransactionError(cause: unknown) {
  if (!(cause instanceof Error)) return 'Transaction could not be submitted.'
  if (cause.message.toLowerCase().includes('user rejected'))
    return 'Transaction rejected in wallet.'
  return cause.message.split('\n')[0] ?? 'Transaction could not be submitted.'
}

function getActionState({
  isConnected,
  isDeployed,
  isCorrectChain,
  isSwitching,
  hasValidAmount,
  hasValidRecipient,
  needsApproval,
  isApproving,
  isApprovalConfirming,
  isBridgePromptOpen,
  isBridgeConfirming,
  activeMessage,
  hasInitiatedMessage,
}: ActionStateInput) {
  if (!isConnected)
    return { label: 'Connect wallet', isDisabled: false, isDone: false }
  if (!isDeployed)
    return { label: 'Bridge undeployed', isDisabled: true, isDone: false }
  if (!isCorrectChain)
    return {
      label: isSwitching ? 'Switching network…' : 'Switch network',
      isDisabled: isSwitching,
      isDone: false,
    }
  if (!hasValidAmount)
    return { label: 'Enter an amount', isDisabled: true, isDone: false }
  if (!hasValidRecipient)
    return { label: 'Enter a recipient', isDisabled: true, isDone: false }
  if (isApproving)
    return { label: 'Confirm approval in wallet', isDisabled: true, isDone: false }
  if (isApprovalConfirming)
    return { label: 'Approving…', isDisabled: true, isDone: false }
  if (needsApproval)
    return { label: 'Approve token', isDisabled: false, isDone: false }
  if (isBridgePromptOpen)
    return { label: 'Confirm in wallet', isDisabled: true, isDone: false }
  if (isBridgeConfirming)
    return { label: 'Locking…', isDisabled: true, isDone: false }
  if (activeMessage?.status === 'finalized')
    return { label: 'Done ✓ — view on explorer', isDisabled: false, isDone: true }
  if (hasInitiatedMessage)
    return { label: 'Relaying…', isDisabled: true, isDone: false }
  return { label: 'Bridge', isDisabled: false, isDone: false }
}

interface ActionStateInput {
  isConnected: boolean
  isDeployed: boolean
  isCorrectChain: boolean
  isSwitching: boolean
  hasValidAmount: boolean
  hasValidRecipient: boolean
  needsApproval: boolean
  isApproving: boolean
  isApprovalConfirming: boolean
  isBridgePromptOpen: boolean
  isBridgeConfirming: boolean
  activeMessage?: BridgeMessage
  hasInitiatedMessage: boolean
}
