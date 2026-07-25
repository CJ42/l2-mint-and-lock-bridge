export interface SmokeResult {
  chain: 'baseSepolia' | 'arbitrumSepolia'
  provider: 'publicnode' | 'drpc'
  url: string
  status: 'pass' | 'fail'
  reason?: string
  subscriptionId?: string
  notificationLatencyMs?: number
}

interface WsCandidate {
  chain: SmokeResult['chain']
  provider: SmokeResult['provider']
  url: string
}

interface LogEntry {
  status: string
  [key: string]: unknown
}

interface JsonRpcPayload {
  id?: unknown
  result?: unknown
  error?: { message?: unknown }
  method?: unknown
  params?: { subscription?: unknown }
}

export const wsCandidates = [
  {
    chain: 'baseSepolia',
    provider: 'publicnode',
    url: 'wss://base-sepolia-rpc.publicnode.com',
  },
  {
    chain: 'baseSepolia',
    provider: 'drpc',
    url: 'wss://base-sepolia.drpc.org',
  },
  {
    chain: 'arbitrumSepolia',
    provider: 'publicnode',
    url: 'wss://arbitrum-sepolia-rpc.publicnode.com',
  },
  {
    chain: 'arbitrumSepolia',
    provider: 'drpc',
    url: 'wss://arbitrum-sepolia.drpc.org',
  },
] as const satisfies readonly WsCandidate[]

export function smokeTestWs({
  chain,
  provider,
  url,
  timeoutMs = 10_000,
}: WsCandidate & { timeoutMs?: number }): Promise<SmokeResult> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url)
    const startedAt = Date.now()
    let subscriptionId: string | undefined
    let isSettled = false

    function settle(result: SmokeResult): void {
      if (isSettled) return
      isSettled = true
      clearTimeout(timer)
      socket.close()
      resolve(result)
    }

    const timer = setTimeout(
      () =>
        settle({
          chain,
          provider,
          url,
          status: 'fail',
          reason: 'timeout waiting for eth_subscription notification',
          subscriptionId,
        }),
      timeoutMs,
    )

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_subscribe',
          params: ['newHeads'],
        }),
      )
    })

    socket.addEventListener('message', (event) => {
      let payload: JsonRpcPayload

      try {
        payload = JSON.parse(String(event.data)) as JsonRpcPayload
      } catch {
        return
      }

      if (payload.id === 1 && typeof payload.result === 'string') {
        subscriptionId = payload.result
        return
      }

      if (payload.id === 1 && payload.error) {
        const reason =
          typeof payload.error.message === 'string'
            ? payload.error.message
            : 'eth_subscribe returned an error'
        settle({ chain, provider, url, status: 'fail', reason })
        return
      }

      if (
        payload.method !== 'eth_subscription' ||
        typeof payload.params?.subscription !== 'string' ||
        payload.params.subscription !== subscriptionId
      )
        return

      settle({
        chain,
        provider,
        url,
        status: 'pass',
        subscriptionId,
        notificationLatencyMs: Date.now() - startedAt,
      })
    })

    socket.addEventListener('error', () => {
      settle({
        chain,
        provider,
        url,
        status: 'fail',
        reason: 'socket error before eth_subscription notification',
        subscriptionId,
      })
    })

    socket.addEventListener('close', () => {
      if (isSettled) return
      settle({
        chain,
        provider,
        url,
        status: 'fail',
        reason: 'socket closed before eth_subscription notification',
        subscriptionId,
      })
    })
  })
}

export async function main(): Promise<void> {
  const results = await Promise.all(wsCandidates.map(smokeTestWs))

  for (const result of results) logJson(result)

  const winners = {
    baseSepolia:
      results.find(
        ({ chain, status }) => chain === 'baseSepolia' && status === 'pass',
      )?.provider ?? null,
    arbitrumSepolia:
      results.find(
        ({ chain, status }) => chain === 'arbitrumSepolia' && status === 'pass',
      )?.provider ?? null,
  }

  logJson({
    status: results.length === wsCandidates.length ? 'summary' : 'harness_fail',
    winners,
  })
  process.exit(results.length === wsCandidates.length ? 0 : 2)
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
    logJson({ status: 'harness_fail', reason: getErrorMessage({ error }) })
    process.exit(2)
  })
