'use client'

import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  useConfig,
  useReadContract,
  useSwitchChain,
} from 'wagmi'
import {
  getTransactionReceipt,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from 'wagmi/actions'

import {
  chains,
  directions,
  getExplorerUrl,
  type BridgeMessage,
} from '@/lib/bridge'
import { addresses, isBridgeDeployed } from '@/lib/config'
import { decodeBridgeError, type DecodedBridgeError } from '@/lib/decode-bridge-error'
import {
  deriveFlowState,
  type BridgeFlowState,
  type TransactionProgress,
} from '@/lib/derive-flow-state'
import {
  clearPersistedFlow,
  PERSISTED_FLOW_VERSION,
  readPersistedFlow,
  writePersistedFlow,
  type PersistedFlow,
} from '@/lib/flow-storage'
import {
  collateralTokenBridgeAbi,
  ierc20Abi,
  syntheticTokenBridgeAbi,
} from '@/lib/generated'

const bridgeAbiByDirection = {
  baseToArbitrum: collateralTokenBridgeAbi,
  arbitrumToBase: syntheticTokenBridgeAbi,
} as const

const idleProgress: TransactionProgress = {
  isPrompting: false,
  isConfirming: false,
  isConfirmed: false,
}

export interface UseBridgeFlowResult {
  flowState: BridgeFlowState
  directionKey: keyof typeof directions
  amountInput: string
  recipientInput: string
  recipientError: string | null
  originBalance?: bigint
  destinationBalance?: bigint
  messageId?: Hex
  explorerUrl?: string
  setAmountInput: (value: string) => void
  setRecipientInput: (value: string) => void
  setMaxAmount: () => void
  setSelfRecipient: () => void
  flipDirection: () => void
  submit: () => Promise<void>
}

export function useBridgeFlow({
  messages,
}: {
  messages: BridgeMessage[]
}): UseBridgeFlowResult {
  const config = useConfig()
  const { address, chainId, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain()

  const [directionKey, setDirectionKey] =
    useState<keyof typeof directions>('baseToArbitrum')
  const [amountInput, setAmountInputState] = useState('')
  const [recipientInput, setRecipientInputState] = useState('')
  const [approve, setApprove] = useState<TransactionProgress>(idleProgress)
  const [bridge, setBridge] = useState<TransactionProgress>(idleProgress)
  const [approveHash, setApproveHash] = useState<Hex>()
  const [bridgeHash, setBridgeHash] = useState<Hex>()
  const [messageId, setMessageId] = useState<Hex>()
  const [failure, setFailure] = useState<DecodedBridgeError>()
  const restoredAddressRef = useRef<Address | undefined>(undefined)
  const isRunningRef = useRef(false)

  const isBaseOrigin = directionKey === 'baseToArbitrum'
  const direction = directions[directionKey]
  const tokenAddress = isBaseOrigin ? addresses.baseUsdc : addresses.arbitrumWusdc
  const bridgeAddress = isBaseOrigin
    ? addresses.baseBridge
    : addresses.arbitrumBridge
  const amount = useMemo(() => parseAmount(amountInput), [amountInput])
  const { recipient, recipientError } = useMemo(
    () => parseRecipient(recipientInput),
    [recipientInput],
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

  const originBalance = isBaseOrigin ? baseBalance : arbitrumBalance
  const destinationBalance = isBaseOrigin ? arbitrumBalance : baseBalance
  const balance = originBalance ?? 0n

  const activeMessage = messages.find(
    (message) =>
      messageId && message.messageId.toLowerCase() === messageId.toLowerCase(),
  )
  const isRelayFinalized = activeMessage?.status === 'finalized'

  const flowState = deriveFlowState({
    isConnected,
    isDeployed: isBridgeDeployed,
    isCorrectChain: chainId === direction.originChainId,
    isSwitchingChain,
    hasValidAmount: Boolean(amount),
    hasValidRecipient: Boolean(recipient),
    approve,
    bridge,
    relay: {
      isInitiated: Boolean(messageId),
      isFinalized: Boolean(isRelayFinalized),
    },
    failure,
  })

  const explorerUrl = (() => {
    if (activeMessage?.destinationTransactionHash)
      return getExplorerUrl(
        activeMessage.destinationChainId,
        activeMessage.destinationTransactionHash,
      )
    if (bridgeHash) return getExplorerUrl(direction.originChainId, bridgeHash)
    return undefined
  })()

  useEffect(() => {
    if (!address) return
    setRecipientInputState((current) => current || address)
  }, [address])

  const runFlow = useCallback(async () => {
    if (!address || !tokenAddress || !bridgeAddress || !amount || !recipient)
      return
    if (isRunningRef.current) return

    const validationError = validateBridge({ amount, balance })
    if (validationError) {
      setFailure({ kind: 'unknown', message: validationError })
      return
    }

    isRunningRef.current = true
    setFailure(undefined)

    const persistSnapshot = {
      version: PERSISTED_FLOW_VERSION,
      address,
      directionKey,
      amountInput,
      recipientInput,
    } as const

    function persist(partial: Partial<PersistedFlow>) {
      writePersistedFlow({
        record: {
          ...persistSnapshot,
          ...partial,
        },
      })
    }

    try {
      // Always approve the exact amount — no allowance short-circuit.
      setApprove({ isPrompting: true, isConfirming: false, isConfirmed: false })
      let nextApproveHash: Hex
      try {
        nextApproveHash = await writeContract(config, {
          abi: ierc20Abi,
          address: tokenAddress,
          functionName: 'approve',
          args: [bridgeAddress, amount],
          chainId: direction.originChainId,
          account: address,
        })
      } catch (cause) {
        setApprove(idleProgress)
        setFailure(
          decodeBridgeError({ error: cause, chainId: direction.originChainId }),
        )
        clearPersistedFlow({ address })
        return
      }

      setApproveHash(nextApproveHash)
      setApprove({ isPrompting: false, isConfirming: true, isConfirmed: false })
      persist({ approveHash: nextApproveHash })

      try {
        await waitForTransactionReceipt(config, {
          hash: nextApproveHash,
          chainId: direction.originChainId,
        })
      } catch (cause) {
        setApprove({ isPrompting: false, isConfirming: false, isConfirmed: false })
        setFailure(
          decodeBridgeError({ error: cause, chainId: direction.originChainId }),
        )
        clearPersistedFlow({ address })
        return
      }

      setApprove({ isPrompting: false, isConfirming: false, isConfirmed: true })

      // Keep the button disabled during simulation.
      setBridge({ isPrompting: true, isConfirming: false, isConfirmed: false })

      try {
        await simulateContract(config, {
          abi: bridgeAbiByDirection[directionKey],
          address: bridgeAddress,
          functionName: 'bridgeTx',
          args: [recipient, amount],
          chainId: direction.originChainId,
          account: address,
        })
      } catch (cause) {
        setBridge(idleProgress)
        setFailure(
          decodeBridgeError({ error: cause, chainId: direction.originChainId }),
        )
        clearPersistedFlow({ address })
        return
      }

      let nextBridgeHash: Hex
      try {
        nextBridgeHash = await writeContract(config, {
          abi: bridgeAbiByDirection[directionKey],
          address: bridgeAddress,
          functionName: 'bridgeTx',
          args: [recipient, amount],
          chainId: direction.originChainId,
          account: address,
        })
      } catch (cause) {
        setBridge(idleProgress)
        setFailure(
          decodeBridgeError({ error: cause, chainId: direction.originChainId }),
        )
        clearPersistedFlow({ address })
        return
      }

      setBridgeHash(nextBridgeHash)
      setBridge({ isPrompting: false, isConfirming: true, isConfirmed: false })
      persist({
        approveHash: nextApproveHash,
        bridgeHash: nextBridgeHash,
      })

      let receipt: Awaited<ReturnType<typeof waitForTransactionReceipt>>
      try {
        receipt = await waitForTransactionReceipt(config, {
          hash: nextBridgeHash,
          chainId: direction.originChainId,
        })
      } catch (cause) {
        setBridge({ isPrompting: false, isConfirming: false, isConfirmed: false })
        setFailure(
          decodeBridgeError({ error: cause, chainId: direction.originChainId }),
        )
        clearPersistedFlow({ address })
        return
      }

      const initiatedLogs = parseEventLogs({
        abi: bridgeAbiByDirection[directionKey],
        eventName: 'BridgeTxInitiated',
        logs: receipt.logs,
      })
      const nextMessageId = initiatedLogs[0]?.args.messageId
      if (!nextMessageId) {
        setBridge({ isPrompting: false, isConfirming: false, isConfirmed: false })
        setFailure({
          kind: 'unknown',
          message:
            'Bridge transaction mined but no BridgeTxInitiated event was found in the receipt.',
        })
        clearPersistedFlow({ address })
        return
      }

      setMessageId(nextMessageId)
      setBridge({ isPrompting: false, isConfirming: false, isConfirmed: true })
      persist({
        approveHash: nextApproveHash,
        bridgeHash: nextBridgeHash,
        messageId: nextMessageId,
      })
    } finally {
      isRunningRef.current = false
    }
  }, [
    address,
    amount,
    amountInput,
    balance,
    bridgeAddress,
    config,
    direction.originChainId,
    directionKey,
    recipient,
    recipientInput,
    tokenAddress,
  ])

  function resetProgress() {
    setApprove(idleProgress)
    setBridge(idleProgress)
    setApproveHash(undefined)
    setBridgeHash(undefined)
    setMessageId(undefined)
    setFailure(undefined)
    if (address) clearPersistedFlow({ address })
  }

  function setAmountInput(value: string) {
    setAmountInputState(value)
  }

  function setRecipientInput(value: string) {
    setRecipientInputState(value)
  }

  function setMaxAmount() {
    setAmountInputState(formatUnits(balance, 6))
  }

  function setSelfRecipient() {
    if (address) setRecipientInputState(address)
  }

  function flipDirection() {
    setDirectionKey((current) =>
      current === 'baseToArbitrum' ? 'arbitrumToBase' : 'baseToArbitrum',
    )
    resetProgress()
  }

  async function submit() {
    if (!isConnected) {
      openConnectModal?.()
      return
    }

    if (chainId !== direction.originChainId) {
      await switchChainAsync({ chainId: direction.originChainId })
      return
    }

    if (flowState.phase === 'failed' || flowState.phase === 'done') {
      resetProgress()
      await Promise.resolve()
      await runFlow()
      return
    }

    if (flowState.phase === 'ready') await runFlow()
  }

  // Rehydrate once per connected address. Never opens a wallet prompt.
  useEffect(() => {
    if (!address) {
      restoredAddressRef.current = undefined
      return
    }
    if (restoredAddressRef.current === address) return
    restoredAddressRef.current = address

    let cancelled = false

    async function restore() {
      const record = readPersistedFlow({ address: address! })
      if (!record || cancelled) return

      setDirectionKey(record.directionKey)
      setAmountInputState(record.amountInput)
      setRecipientInputState(record.recipientInput)

      if (record.messageId) {
        setApprove({ isPrompting: false, isConfirming: false, isConfirmed: true })
        setBridge({ isPrompting: false, isConfirming: false, isConfirmed: true })
        setApproveHash(record.approveHash)
        setBridgeHash(record.bridgeHash)
        setMessageId(record.messageId)
        return
      }

      if (record.bridgeHash) {
        try {
          const receipt = await getTransactionReceipt(config, {
            hash: record.bridgeHash,
            chainId: directions[record.directionKey].originChainId,
          })
          if (cancelled) return
          if (receipt.status === 'reverted') {
            clearPersistedFlow({ address: address! })
            return
          }

          const initiatedLogs = parseEventLogs({
            abi: bridgeAbiByDirection[record.directionKey],
            eventName: 'BridgeTxInitiated',
            logs: receipt.logs,
          })
          const restoredMessageId = initiatedLogs[0]?.args.messageId
          if (!restoredMessageId) {
            clearPersistedFlow({ address: address! })
            return
          }

          setApprove({ isPrompting: false, isConfirming: false, isConfirmed: true })
          setBridge({ isPrompting: false, isConfirming: false, isConfirmed: true })
          setApproveHash(record.approveHash)
          setBridgeHash(record.bridgeHash)
          setMessageId(restoredMessageId)
          writePersistedFlow({
            record: { ...record, messageId: restoredMessageId },
          })
        } catch {
          if (!cancelled) clearPersistedFlow({ address: address! })
        }
        return
      }

      if (record.approveHash) {
        try {
          const receipt = await getTransactionReceipt(config, {
            hash: record.approveHash,
            chainId: directions[record.directionKey].originChainId,
          })
          if (cancelled) return
          if (receipt.status === 'reverted') {
            clearPersistedFlow({ address: address! })
            return
          }

          setApprove({ isPrompting: false, isConfirming: false, isConfirmed: true })
          setApproveHash(record.approveHash)
        } catch {
          if (!cancelled) clearPersistedFlow({ address: address! })
        }
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [address, config])

  useEffect(() => {
    if (!isRelayFinalized || !address) return
    clearPersistedFlow({ address })
  }, [address, isRelayFinalized])

  return {
    flowState,
    directionKey,
    amountInput,
    recipientInput,
    recipientError,
    originBalance,
    destinationBalance,
    messageId,
    explorerUrl,
    setAmountInput,
    setRecipientInput,
    setMaxAmount,
    setSelfRecipient,
    flipDirection,
    submit,
  }
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
