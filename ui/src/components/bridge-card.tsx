'use client'

import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useEffect, useMemo, useState } from 'react'
import {
  formatUnits,
  isAddress,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'

import { bridgeAbi, erc20Abi } from '@/lib/abis'
import {
  directions,
  formatTokenAmount,
  getExplorerUrl,
  type BridgeMessage,
} from '@/lib/bridge'
import { addresses, isBridgeDeployed } from '@/lib/config'

import styles from './bridge-card.module.css'

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
  const [isAdvanced, setIsAdvanced] = useState(false)
  const [recipientInput, setRecipientInput] = useState('')
  const [approveHash, setApproveHash] = useState<Hex>()
  const [bridgeHash, setBridgeHash] = useState<Hex>()
  const [formError, setFormError] = useState<string | null>(null)
  const { address, chainId, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const approveWrite = useWriteContract()
  const bridgeWrite = useWriteContract()
  const direction = directions[directionKey]
  const tokenAddress =
    directionKey === 'baseToArbitrum'
      ? addresses.baseUsdc
      : addresses.arbitrumWusdc
  const bridgeAddress =
    directionKey === 'baseToArbitrum'
      ? addresses.baseBridge
      : addresses.arbitrumBridge
  const recipient = isAdvanced ? recipientInput : address
  const amount = useMemo(() => parseAmount(amountInput), [amountInput])
  const activeMessage = messages.find(
    (message) => message.messageId === activeMessageId,
  )

  const { data: balanceData } = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: direction.originChainId,
    query: { enabled: Boolean(tokenAddress && address) },
  })
  const {
    data: allowanceData,
    refetch: refetchAllowance,
  } = useReadContract({
    abi: erc20Abi,
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

  const balance = balanceData ?? 0n
  const allowance = allowanceData ?? 0n
  const needsApproval = Boolean(amount && amount > allowance)

  useEffect(() => {
    if (!approveReceipt.isSuccess) return
    void refetchAllowance()
  }, [approveReceipt.isSuccess, refetchAllowance])

  useEffect(() => {
    if (!bridgeReceipt.data) return

    const initiatedLogs = parseEventLogs({
      abi: bridgeAbi,
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
        abi: erc20Abi,
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
    if (!isAddress(recipient)) {
      setFormError('Enter a valid recipient address.')
      return
    }

    const validationError = validateBridge({
      amount,
      balance,
      recipient,
    })
    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    onActiveMessageChange(undefined)
    try {
      const hash = await bridgeWrite.writeContractAsync({
        abi: bridgeAbi,
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
    hasValidRecipient: Boolean(recipient && isAddress(recipient)),
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
        <div>
          <p className={styles.eyebrow}>Testnet bridge</p>
          <h1 id="bridge-heading">Move stablecoins</h1>
        </div>
        <span className={styles.version}>v0 demo</span>
      </div>

      {!isBridgeDeployed && (
        <div className={styles.notice}>
          Contracts are not deployed. Add public addresses to enable writes.
        </div>
      )}

      <div className={styles.direction}>
        <div>
          <span>From</span>
          <strong>{direction.originName}</strong>
        </div>
        <button type="button" onClick={flipDirection} aria-label="Swap direction">
          ⇅
        </button>
        <div className={styles.destination}>
          <span>To</span>
          <strong>{direction.destinationName}</strong>
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>
          <label htmlFor="amount">Amount</label>
          <span>
            Balance: {formatTokenAmount(balance)} {direction.tokenSymbol}
          </span>
        </div>
        <div className={styles.amountInput}>
          <input
            id="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amountInput}
            onChange={(event) => {
              setAmountInput(event.target.value)
              setFormError(null)
            }}
          />
          <span>{direction.tokenSymbol}</span>
          <button type="button" onClick={setMaxAmount}>
            Max
          </button>
        </div>
      </div>

      <button
        type="button"
        className={styles.advancedToggle}
        onClick={() => setIsAdvanced((current) => !current)}
        aria-expanded={isAdvanced}
      >
        <span>{isAdvanced ? '−' : '+'}</span> Advanced recipient
      </button>

      {isAdvanced && (
        <div className={styles.field}>
          <label htmlFor="recipient">Recipient</label>
          <input
            id="recipient"
            className={styles.recipientInput}
            placeholder="0x…"
            value={recipientInput}
            onChange={(event) => {
              setRecipientInput(event.target.value)
              setFormError(null)
            }}
          />
        </div>
      )}

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

      <p className={styles.footer}>
        6-decimal amounts · 5 confirmation relay target · testnets only
      </p>
    </section>
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

function validateBridge({
  amount,
  balance,
  recipient,
}: {
  amount: bigint
  balance: bigint
  recipient: string
}) {
  if (!isAddress(recipient)) return 'Enter a valid recipient address.'
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
