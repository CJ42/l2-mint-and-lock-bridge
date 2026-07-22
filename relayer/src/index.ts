import {
  createPublicClient,
  createWalletClient,
  http,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { bridgeAbi, bridgeInitiatedEvent } from "./abi"
import {
  canonicalUsdcAddress,
  chains,
  loadConfig,
  type Direction,
  type RelayerConfig,
} from "./config"
import { logJson } from "./logger"
import { reconstructMessage, type BridgeInitiatedLog } from "./message"
import { createStateStore } from "./state"
import { createSubmitter, type Submission } from "./submitter"
import { runWatcher } from "./watcher"

export async function main(): Promise<void> {
  const config = loadConfig()
  const account = privateKeyToAccount(config.relayerPrivateKey)
  const abortController = new AbortController()
  registerShutdown({ abortController })

  const basePublicClient = createPublicClient({
    chain: chains.baseSepolia,
    transport: http(config.rpcUrls.baseSepolia),
  })
  const arbitrumPublicClient = createPublicClient({
    chain: chains.arbitrumSepolia,
    transport: http(config.rpcUrls.arbitrumSepolia),
  })
  const baseWalletClient = createWalletClient({
    account,
    chain: chains.baseSepolia,
    transport: http(config.rpcUrls.baseSepolia),
  })
  const arbitrumWalletClient = createWalletClient({
    account,
    chain: chains.arbitrumSepolia,
    transport: http(config.rpcUrls.arbitrumSepolia),
  })
  const state = await createStateStore({
    path: config.stateFile,
    deployBlocks: config.deployBlocks,
  })

  const baseToArbitrum = createSubmitter({
    direction: "base-to-arbitrum",
    actions: {
      isProcessed: ({ messageId }) =>
        arbitrumPublicClient.readContract({
          address: config.bridgeAddresses.arbitrumSepolia,
          abi: bridgeAbi,
          functionName: "processed",
          args: [messageId],
        }),
      simulate: async ({ message }) => {
        const simulation = await arbitrumPublicClient.simulateContract({
          account,
          address: config.bridgeAddresses.arbitrumSepolia,
          abi: bridgeAbi,
          functionName: "mint",
          args: [message],
        })
        return simulation.request
      },
      write: ({ request }) => arbitrumWalletClient.writeContract(request as never),
      wait: async ({ txHash }) =>
        (await arbitrumPublicClient.waitForTransactionReceipt({ hash: txHash })).status,
    },
    log: logJson,
  })
  const arbitrumToBase = createSubmitter({
    direction: "arbitrum-to-base",
    actions: {
      isProcessed: ({ messageId }) =>
        basePublicClient.readContract({
          address: config.bridgeAddresses.baseSepolia,
          abi: bridgeAbi,
          functionName: "processed",
          args: [messageId],
        }),
      simulate: async ({ message }) => {
        const simulation = await basePublicClient.simulateContract({
          account,
          address: config.bridgeAddresses.baseSepolia,
          abi: bridgeAbi,
          functionName: "unlock",
          args: [message],
        })
        return simulation.request
      },
      write: ({ request }) => baseWalletClient.writeContract(request as never),
      wait: async ({ txHash }) =>
        (await basePublicClient.waitForTransactionReceipt({ hash: txHash })).status,
    },
    log: logJson,
  })

  logJson({
    status: "relayer-started",
    relayer: account.address,
    confirmations: config.confirmations,
    pollIntervalMs: config.pollIntervalMs,
  })

  await Promise.all([
    runWatcher({
      chain: "baseSepolia",
      client: {
        getBlockNumber: () => basePublicClient.getBlockNumber(),
        getInitiatedLogs: async ({ fromBlock, toBlock }) => {
          const logs = await basePublicClient.getLogs({
            address: config.bridgeAddresses.baseSepolia,
            event: bridgeInitiatedEvent,
            fromBlock,
            toBlock,
            strict: true,
          })
          return logs as unknown as readonly BridgeInitiatedLog[]
        },
      },
      confirmations: config.confirmations,
      pollIntervalMs: config.pollIntervalMs,
      state,
      onLog: createLogHandler({
        config,
        direction: "base-to-arbitrum",
        enqueue: baseToArbitrum.enqueue,
      }),
      log: logJson,
      signal: abortController.signal,
    }),
    runWatcher({
      chain: "arbitrumSepolia",
      client: {
        getBlockNumber: () => arbitrumPublicClient.getBlockNumber(),
        getInitiatedLogs: async ({ fromBlock, toBlock }) => {
          const logs = await arbitrumPublicClient.getLogs({
            address: config.bridgeAddresses.arbitrumSepolia,
            event: bridgeInitiatedEvent,
            fromBlock,
            toBlock,
            strict: true,
          })
          return logs as unknown as readonly BridgeInitiatedLog[]
        },
      },
      confirmations: config.confirmations,
      pollIntervalMs: config.pollIntervalMs,
      state,
      onLog: createLogHandler({
        config,
        direction: "arbitrum-to-base",
        enqueue: arbitrumToBase.enqueue,
      }),
      log: logJson,
      signal: abortController.signal,
    }),
  ])

  await Promise.all([baseToArbitrum.onIdle(), arbitrumToBase.onIdle()])
  logJson({ status: "relayer-stopped" })
}

function createLogHandler({
  config,
  direction,
  enqueue,
}: {
  config: RelayerConfig
  direction: Direction
  enqueue: (submission: Submission) => void
}): (log: BridgeInitiatedLog) => void {
  const expectedOriginChainId =
    direction === "base-to-arbitrum"
      ? BigInt(chains.baseSepolia.id)
      : BigInt(chains.arbitrumSepolia.id)
  const expectedDestinationChainId =
    direction === "base-to-arbitrum"
      ? BigInt(chains.arbitrumSepolia.id)
      : BigInt(chains.baseSepolia.id)

  return function handleLog(log: BridgeInitiatedLog): void {
    const expectedSourceAddress =
      direction === "base-to-arbitrum"
        ? config.bridgeAddresses.baseSepolia
        : config.bridgeAddresses.arbitrumSepolia
    if (log.address.toLowerCase() !== expectedSourceAddress.toLowerCase())
      throw new Error(`Unexpected source bridge address: ${log.address}`)

    const submission = reconstructMessage({ log, canonicalToken: canonicalUsdcAddress })
    if (submission.message.originChainId !== expectedOriginChainId)
      throw new Error(`Unexpected origin chain for ${submission.messageId}`)
    if (submission.message.destinationChainId !== expectedDestinationChainId)
      throw new Error(`Unexpected destination chain for ${submission.messageId}`)

    enqueue(submission)
  }
}

function registerShutdown({ abortController }: { abortController: AbortController }): void {
  function shutdown(signal: string): void {
    logJson({ status: "shutdown-requested", signal })
    abortController.abort()
  }

  process.once("SIGINT", () => shutdown("SIGINT"))
  process.once("SIGTERM", () => shutdown("SIGTERM"))
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    logJson({
      status: "fatal",
      error: error instanceof Error ? error.message : String(error),
    })
    process.exitCode = 1
  })
}
