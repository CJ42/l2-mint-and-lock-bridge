import type { ChainKey } from "./config";
import type { Log } from "./logger";
import type { BridgeTxInitiatedLog } from "./message";
import type { StateStore } from "./state";

import { getErrorMessage } from "./helper";

export interface WatcherClient {
  getBlockNumber: () => Promise<bigint>;
  getInitiatedLogs: ({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) => Promise<readonly BridgeTxInitiatedLog[]>;
}

export interface WatcherOptions {
  chain: ChainKey;
  client: WatcherClient;
  confirmations: bigint;
  pollIntervalMs: number;
  state: StateStore;
  onLog: (log: BridgeTxInitiatedLog) => void;
  log: Log;
  signal?: AbortSignal;
}

export async function pollWatcher({
  chain,
  client,
  confirmations,
  state,
  onLog,
  log,
}: Omit<WatcherOptions, "pollIntervalMs" | "signal">): Promise<void> {
  const latestBlock = await client.getBlockNumber();
  if (latestBlock < confirmations) return;

  const safeHead = latestBlock - confirmations;
  let fromBlock = state.getCheckpoint({ chain }) + 1n;
  if (fromBlock > safeHead) return;

  while (fromBlock <= safeHead) {
    const toBlock = minBigInt({
      left: fromBlock + maxBlockRange - 1n,
      right: safeHead,
    });
    const logs = await client.getInitiatedLogs({ fromBlock, toBlock });

    for (const initiatedLog of logs) {
      try {
        onLog(initiatedLog);
      } catch (error) {
        log({
          chain,
          status: "log-rejected",
          message: `messageId=${initiatedLog.args.messageId ?? "unknown"} ${getErrorMessage({ error })}`,
        });
      }
    }

    await state.setCheckpoint({ chain, blockNumber: toBlock });
    log({
      chain,
      status: "checkpoint-updated",
      message: `Blocks ${fromBlock}-${toBlock}, ${logs.length} event(s) found`,
    });
    fromBlock = toBlock + 1n;
  }
}

export async function runWatcher(options: WatcherOptions): Promise<void> {
  const { chain, pollIntervalMs, signal, log } = options;
  log({
    chain,
    status: "watcher-started",
    message: "Watching for bridge events",
  });

  while (!signal?.aborted) {
    try {
      await pollWatcher(options);
    } catch (error) {
      log({
        chain,
        status: "poll-failed",
        message: getErrorMessage({ error }),
      });
    }

    await sleep(
      signal
        ? { milliseconds: pollIntervalMs, signal }
        : { milliseconds: pollIntervalMs },
    );
  }

  log({
    chain,
    status: "watcher-stopped",
    message: "Stopped watching for bridge events",
  });
}

export async function sleep({
  milliseconds,
  signal,
}: {
  milliseconds: number;
  signal?: AbortSignal;
}): Promise<void> {
  if (signal?.aborted) return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function minBigInt({ left, right }: { left: bigint; right: bigint }): bigint {
  return left < right ? left : right;
}

export const maxBlockRange = 2_000n;
