import { createWalletClient, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { bridgeTxInitiatedEvent } from "./abi";
import {
  canonicalUsdcAddress,
  chains,
  loadConfig,
  loadRelayerPrivateKey,
  type Direction,
  type RelayerConfig,
} from "./config";
import { logTerminal } from "./logger";
import { reconstructMessage, type BridgeTxInitiatedLog } from "./message";
import { createStateStore } from "./state";
import { createSubmitter, type Submission } from "./submitter";
import { runWatcher } from "./watcher";

const BASE_SEPOLIA_CHAIN_ID = BigInt(chains.baseSepolia.id);
const ARBITRUM_SEPOLIA_CHAIN_ID = BigInt(chains.arbitrumSepolia.id);

export async function main(): Promise<void> {
  const config = loadConfig();
  const account = privateKeyToAccount(loadRelayerPrivateKey());

  const abortController = new AbortController();
  registerShutdown({ abortController });

  // extend viem client with public actions to avoid having to handle two clients per chain
  // (one public client + one wallet client)
  // https://viem.sh/docs/clients/wallet#optional-extend-with-public-actions
  const baseClient = createWalletClient({
    account,
    chain: chains.baseSepolia,
    transport: config.rpcTransports.baseSepolia,
  }).extend(publicActions);

  const arbitrumClient = createWalletClient({
    account,
    chain: chains.arbitrumSepolia,
    transport: config.rpcTransports.arbitrumSepolia,
  }).extend(publicActions);

  const state = await createStateStore({
    path: config.stateFile,
    deployBlocks: config.deployBlocks,
  });

  console.log("🟢 Relayer starting with following configurations:");
  console.table([
    {
      relayer: account.address,
      confirmations: config.confirmations,
      pollIntervalMs: config.pollIntervalMs,
    },
  ]);

  const baseToArbitrum = createSubmitter({
    direction: "base-to-arbitrum",
    client: arbitrumClient,
    bridgeAddress: config.bridgeAddresses.arbitrumSepolia,
    log: logTerminal,
  });

  const arbitrumToBase = createSubmitter({
    direction: "arbitrum-to-base",
    client: baseClient,
    bridgeAddress: config.bridgeAddresses.baseSepolia,
    log: logTerminal,
  });

  await Promise.all([
    runWatcher({
      chain: "baseSepolia",
      client: {
        getBlockNumber: () => baseClient.getBlockNumber(),
        getInitiatedLogs: async ({ fromBlock, toBlock }) => {
          const logs = await baseClient.getLogs({
            address: config.bridgeAddresses.baseSepolia,
            event: bridgeTxInitiatedEvent,
            fromBlock,
            toBlock,
            strict: true,
          });
          return logs as unknown as readonly BridgeTxInitiatedLog[];
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
      log: logTerminal,
      signal: abortController.signal,
    }),
    runWatcher({
      chain: "arbitrumSepolia",
      client: {
        getBlockNumber: () => arbitrumClient.getBlockNumber(),
        getInitiatedLogs: async ({ fromBlock, toBlock }) => {
          const logs = await arbitrumClient.getLogs({
            address: config.bridgeAddresses.arbitrumSepolia,
            event: bridgeTxInitiatedEvent,
            fromBlock,
            toBlock,
            strict: true,
          });
          return logs as unknown as readonly BridgeTxInitiatedLog[];
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
      log: logTerminal,
      signal: abortController.signal,
    }),
  ]);

  await Promise.all([baseToArbitrum.onIdle(), arbitrumToBase.onIdle()]);
  logTerminal({ status: "relayer-stopped", message: "Relayer stopped" });
}

function createLogHandler({
  config,
  direction,
  enqueue,
}: {
  config: RelayerConfig;
  direction: Direction;
  enqueue: (submission: Submission) => void;
}): (log: BridgeTxInitiatedLog) => void {
  const expectedOriginChainId =
    direction === "base-to-arbitrum"
      ? BASE_SEPOLIA_CHAIN_ID
      : ARBITRUM_SEPOLIA_CHAIN_ID;

  const expectedDestinationChainId =
    direction === "base-to-arbitrum"
      ? BASE_SEPOLIA_CHAIN_ID
      : ARBITRUM_SEPOLIA_CHAIN_ID;

  return function handleLog(log: BridgeTxInitiatedLog): void {
    const expectedSourceAddress =
      direction === "base-to-arbitrum"
        ? config.bridgeAddresses.baseSepolia
        : config.bridgeAddresses.arbitrumSepolia;

    if (log.address.toLowerCase() !== expectedSourceAddress.toLowerCase()) {
      throw new Error(`Unexpected source bridge address: ${log.address}`);
    }

    const submission = reconstructMessage({
      log,
      canonicalToken: canonicalUsdcAddress,
    });

    const { originChainId, destinationChainId } = submission.message;

    if (originChainId !== expectedOriginChainId) {
      throw new Error(`Unexpected origin chain for ${submission.messageId}`);
    }

    if (destinationChainId !== expectedDestinationChainId) {
      throw new Error(
        `Unexpected destination chain for ${submission.messageId}`,
      );
    }

    enqueue(submission);
  };
}

function registerShutdown({
  abortController,
}: {
  abortController: AbortController;
}): void {
  function shutdown(signal: string): void {
    logTerminal({
      status: "shutdown-requested",
      message: `Received ${signal}; waiting for queued submissions`,
    });
    abortController.abort();
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("❌ Error when running relayer: ", errorMessage);
  process.exitCode = 1;
});
