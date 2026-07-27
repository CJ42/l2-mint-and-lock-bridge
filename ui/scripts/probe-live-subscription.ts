import type { Address } from 'viem'
import { arbitrumSepolia, baseSepolia } from 'viem/chains'

import { bridgeFinalizedEvent } from '@/lib/bridge-events'
import { addresses, scanConfiguration } from '@/lib/config'
import { getLiveClient, isWebSocketEnabled } from '@/lib/live-clients'

interface LogEntry {
  status: string
  [key: string]: unknown
}

interface ChainProbe {
  chain: 'baseSepolia' | 'arbitrumSepolia'
  chainId: number
  bridgeAddress?: Address
}

interface SocketTransportValue {
  getSocket(): Promise<WebSocket>
}

const chains: readonly ChainProbe[] = [
  {
    chain: 'baseSepolia',
    chainId: baseSepolia.id,
    bridgeAddress: addresses.baseBridge,
  },
  {
    chain: 'arbitrumSepolia',
    chainId: arbitrumSepolia.id,
    bridgeAddress: addresses.arbitrumBridge,
  },
]

export async function main(): Promise<void> {
  const results = await Promise.all(chains.map(probeChain))
  const configuredCount = results.filter(({ isConfigured }) => isConfigured).length

  if (configuredCount === 0) {
    logJson({ status: 'no_chain_has_verified_wss' })
    process.exit(0)
  }

  process.exit(results.every(({ didPass }) => didPass) ? 0 : 1)
}

export async function probeChain({
  chain,
  chainId,
  bridgeAddress,
}: ChainProbe): Promise<{ isConfigured: boolean; didPass: boolean }> {
  if (!isWebSocketEnabled({ chainId })) {
    logJson({ status: 'ws_not_configured', chain, chainId })
    return { isConfigured: false, didPass: true }
  }

  const client = getLiveClient({ chainId })
  const firstTransport = client.transport.transports[0]
  const transportType = firstTransport?.config.type
  let didPass = transportType === 'webSocket'

  logJson({
    status: didPass ? 'pass' : 'fail',
    check: 'transport_index_0',
    chain,
    chainId,
    transportType,
  })

  if (!firstTransport || !hasSocketAccessor(firstTransport.value)) {
    logJson({
      status: 'fail',
      check: 'socket_accessor',
      chain,
      chainId,
      reason: 'fallback index 0 does not expose getSocket()',
    })
    return { isConfigured: true, didPass: false }
  }

  const heartbeatResult = await receiveHeartbeat({ client, chain, chainId })
  didPass = heartbeatResult && didPass

  const contractResult = bridgeAddress
    ? await probeContractSubscription({
        client,
        chain,
        chainId,
        bridgeAddress,
        socketTransport: firstTransport.value,
      })
    : await reportUndeployedBridge({
        chain,
        chainId,
        socketTransport: firstTransport.value,
      })
  didPass = contractResult && didPass

  const logsResult = await probeLogRange({
    client,
    chain,
    chainId,
    bridgeAddress,
  })
  didPass = logsResult && didPass

  return { isConfigured: true, didPass }
}

async function receiveHeartbeat({
  client,
  chain,
  chainId,
}: {
  client: ReturnType<typeof getLiveClient>
  chain: ChainProbe['chain']
  chainId: number
}): Promise<boolean> {
  let unwatch = () => {}

  try {
    const blockNumber = await new Promise<bigint>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('timeout waiting for live heartbeat block')),
        15_000,
      )

      unwatch = client.watchBlocks({
        onBlock(block) {
          clearTimeout(timer)
          resolve(block.number)
        },
        onError(error) {
          clearTimeout(timer)
          reject(error)
        },
      })
    })

    logJson({
      status: 'pass',
      check: 'heartbeat_block',
      chain,
      chainId,
      blockNumber,
    })
    return true
  } catch (error) {
    logJson({
      status: 'fail',
      check: 'heartbeat_block',
      chain,
      chainId,
      reason: getErrorMessage({ error }),
    })
    return false
  } finally {
    unwatch()
  }
}

async function probeContractSubscription({
  client,
  chain,
  chainId,
  bridgeAddress,
  socketTransport,
}: {
  client: ReturnType<typeof getLiveClient>
  chain: ChainProbe['chain']
  chainId: number
  bridgeAddress: Address
  socketTransport: SocketTransportValue
}): Promise<boolean> {
  let subscriptionError: unknown
  const unwatch = client.watchContractEvent({
    address: bridgeAddress,
    abi: [bridgeFinalizedEvent],
    eventName: 'BridgeTxFinalized',
    onLogs() {},
    onError(error) {
      subscriptionError = error
    },
  })

  try {
    await wait({ durationMs: 750 })
    const socket = await socketTransport.getSocket()
    const isOpen = socket.readyState === WebSocket.OPEN
    const didPass = !subscriptionError && isOpen

    logJson({
      status: didPass ? 'pass' : 'fail',
      check: 'bridge_finalized_subscription',
      chain,
      chainId,
      socketReadyState: socket.readyState,
      expectedSocketReadyState: WebSocket.OPEN,
      reason: subscriptionError
        ? getErrorMessage({ error: subscriptionError })
        : isOpen
          ? undefined
          : 'socket is not open',
    })
    return didPass
  } finally {
    unwatch()
  }
}

async function reportUndeployedBridge({
  chain,
  chainId,
  socketTransport,
}: {
  chain: ChainProbe['chain']
  chainId: number
  socketTransport: SocketTransportValue
}): Promise<boolean> {
  const socket = await socketTransport.getSocket()
  const didPass = socket.readyState === WebSocket.OPEN

  logJson({
    status: 'bridge_not_deployed',
    check: 'bridge_finalized_subscription',
    chain,
    chainId,
    socketReadyState: socket.readyState,
    transportPass: didPass,
  })
  return didPass
}

async function probeLogRange({
  client,
  chain,
  chainId,
  bridgeAddress,
}: {
  client: ReturnType<typeof getLiveClient>
  chain: ChainProbe['chain']
  chainId: number
  bridgeAddress?: Address
}): Promise<boolean> {
  if (!bridgeAddress) {
    logJson({
      status: 'bridge_not_deployed',
      check: 'get_logs_chunk',
      chain,
      chainId,
    })
    return true
  }

  try {
    const toBlock = await client.getBlockNumber()
    const fromBlock =
      toBlock >= scanConfiguration.chunkSize
        ? toBlock - scanConfiguration.chunkSize + 1n
        : 0n
    const logs = await client.getLogs({
      address: bridgeAddress,
      event: bridgeFinalizedEvent,
      fromBlock,
      toBlock,
      strict: true,
    })

    logJson({
      status: 'pass',
      check: 'get_logs_chunk',
      chain,
      chainId,
      fromBlock,
      toBlock,
      blockCount: toBlock - fromBlock + 1n,
      logCount: logs.length,
    })
    return true
  } catch (error) {
    logJson({
      status: 'fail',
      check: 'get_logs_chunk',
      chain,
      chainId,
      requestedBlockCount: scanConfiguration.chunkSize,
      reason: getErrorMessage({ error }),
    })
    return false
  }
}

function hasSocketAccessor(value: unknown): value is SocketTransportValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getSocket' in value &&
    typeof value.getSocket === 'function'
  )
}

function wait({ durationMs }: { durationMs: number }): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function logJson(entry: LogEntry): void {
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        ...entry,
      },
      (_, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
    ),
  )
}

function getErrorMessage({ error }: { error: unknown }): string {
  return error instanceof Error ? error.message : String(error)
}

if (import.meta.main)
  void main().catch((error) => {
    logJson({ status: 'fail', check: 'probe_harness', reason: getErrorMessage({ error }) })
    process.exit(1)
  })
