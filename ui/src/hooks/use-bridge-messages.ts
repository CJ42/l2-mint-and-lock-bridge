'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
} from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'

import type { BridgeMessage } from '@/lib/bridge'
import { bridgeFinalizedEvent, bridgeTxInitiatedEvent } from '@/lib/bridge-events'
import { addresses, scanConfiguration } from '@/lib/config'
import { baseLiveClient, arbitrumLiveClient } from '@/lib/live-clients'

const blockTimestampCache = new Map<string, number>()

interface InitiatedEvent {
  messageId: Hex
  sender: Address
  recipient: Address
  amount: bigint
  nonce: bigint
  originChainId: number
  destinationChainId: number
  transactionHash: Hex
  blockNumber: bigint
}

interface FinalizedEvent {
  messageId: Hex
  transactionHash: Hex
  chainId: number
}

interface ChainEvents {
  initiated: InitiatedEvent[]
  finalized: FinalizedEvent[]
}

interface UseBridgeMessagesResult {
  messages: BridgeMessage[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

async function readBlockTimestamp<
  TTransport extends Transport,
  TChain extends Chain,
>({
  client,
  chainId,
  blockNumber,
}: {
  client: PublicClient<TTransport, TChain>
  chainId: number
  blockNumber: bigint
}) {
  const cacheKey = `${chainId}:${blockNumber}`
  const cachedTimestamp = blockTimestampCache.get(cacheKey)
  if (cachedTimestamp) return cachedTimestamp

  const block = await client.getBlock({ blockNumber })
  const timestamp = Number(block.timestamp)
  blockTimestampCache.set(cacheKey, timestamp)
  return timestamp
}

async function scanChain<TTransport extends Transport, TChain extends Chain>({
  client,
  bridgeAddress,
  chainId,
}: {
  client: PublicClient<TTransport, TChain>
  bridgeAddress: Address | undefined
  chainId: number
}): Promise<ChainEvents> {
  if (!bridgeAddress) return { initiated: [], finalized: [] }

  const latestBlock = await client.getBlockNumber()
  const fromBlock =
    latestBlock >= scanConfiguration.blockWindow
      ? latestBlock - scanConfiguration.blockWindow + 1n
      : 0n
  const initiated: InitiatedEvent[] = []
  const finalized: FinalizedEvent[] = []

  for (
    let chunkStart = fromBlock;
    chunkStart <= latestBlock;
    chunkStart += scanConfiguration.chunkSize
  ) {
    const chunkEnd =
      chunkStart + scanConfiguration.chunkSize - 1n > latestBlock
        ? latestBlock
        : chunkStart + scanConfiguration.chunkSize - 1n
    const [initiatedLogs, finalizedLogs] = await Promise.all([
      client.getLogs({
        address: bridgeAddress,
        event: bridgeTxInitiatedEvent,
        fromBlock: chunkStart,
        toBlock: chunkEnd,
        strict: true,
      }),
      client.getLogs({
        address: bridgeAddress,
        event: bridgeFinalizedEvent,
        fromBlock: chunkStart,
        toBlock: chunkEnd,
        strict: true,
      }),
    ])

    initiated.push(
      ...initiatedLogs.map((log) => ({
        messageId: log.args.messageId,
        sender: log.args.sender,
        recipient: log.args.recipient,
        amount: log.args.amount,
        nonce: log.args.nonce,
        originChainId: Number(log.args.originChainId),
        destinationChainId: Number(log.args.destinationChainId),
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
      })),
    )
    finalized.push(
      ...finalizedLogs.map((log) => ({
        messageId: log.args.messageId,
        transactionHash: log.transactionHash,
        chainId,
      })),
    )
  }

  return { initiated, finalized }
}

async function fetchMessages() {
  const [baseEvents, arbitrumEvents] = await Promise.all([
    scanChain({
      client: baseLiveClient,
      bridgeAddress: addresses.baseBridge,
      chainId: baseSepolia.id,
    }),
    scanChain({
      client: arbitrumLiveClient,
      bridgeAddress: addresses.arbitrumBridge,
      chainId: arbitrumSepolia.id,
    }),
  ])
  const finalizedById = new Map(
    [...baseEvents.finalized, ...arbitrumEvents.finalized].map((event) => [
      event.messageId.toLowerCase(),
      event,
    ]),
  )
  const initiatedEvents = [...baseEvents.initiated, ...arbitrumEvents.initiated]

  const messages = await Promise.all(
    initiatedEvents.map(async (event): Promise<BridgeMessage> => {
      const finalized = finalizedById.get(event.messageId.toLowerCase())
      const timestamp =
        event.originChainId === baseSepolia.id
          ? await readBlockTimestamp({
              client: baseLiveClient,
              chainId: event.originChainId,
              blockNumber: event.blockNumber,
            })
          : await readBlockTimestamp({
              client: arbitrumLiveClient,
              chainId: event.originChainId,
              blockNumber: event.blockNumber,
            })

      return {
        ...event,
        originTransactionHash: event.transactionHash,
        destinationTransactionHash: finalized?.transactionHash,
        timestamp,
        status: finalized ? 'finalized' : 'pending',
      }
    }),
  )

  return messages.sort((left, right) => {
    if (left.blockNumber === right.blockNumber) return 0
    return left.blockNumber > right.blockNumber ? -1 : 1
  })
}

function watchChainEvents({
  client,
  bridgeAddress,
  onUpdate,
}: {
  client: typeof baseLiveClient | typeof arbitrumLiveClient
  bridgeAddress: Address | undefined
  onUpdate: () => void
}) {
  if (!bridgeAddress) return () => {}

  const unwatchInitiated = client.watchContractEvent({
    address: bridgeAddress,
    abi: [bridgeTxInitiatedEvent],
    eventName: 'BridgeTxInitiated',
    onLogs: () => onUpdate(),
    onError: () => onUpdate(),
  })
  const unwatchFinalized = client.watchContractEvent({
    address: bridgeAddress,
    abi: [bridgeFinalizedEvent],
    eventName: 'BridgeFinalized',
    onLogs: () => onUpdate(),
    onError: () => onUpdate(),
  })

  return () => {
    unwatchInitiated()
    unwatchFinalized()
  }
}

export function useBridgeMessages(): UseBridgeMessagesResult {
  const [messages, setMessages] = useState<BridgeMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isFetchingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (isFetchingRef.current) return

    isFetchingRef.current = true
    try {
      setMessages(await fetchMessages())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to scan events')
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()

    const stopBase = watchChainEvents({
      client: baseLiveClient,
      bridgeAddress: addresses.baseBridge,
      onUpdate: () => void refresh(),
    })
    const stopArbitrum = watchChainEvents({
      client: arbitrumLiveClient,
      bridgeAddress: addresses.arbitrumBridge,
      onUpdate: () => void refresh(),
    })

    // Safety net for silent WebSocket death or subscription gaps.
    const interval = window.setInterval(
      () => void refresh(),
      scanConfiguration.pollingInterval,
    )

    return () => {
      stopBase()
      stopArbitrum()
      window.clearInterval(interval)
    }
  }, [refresh])

  return { messages, isLoading, error, refresh }
}
