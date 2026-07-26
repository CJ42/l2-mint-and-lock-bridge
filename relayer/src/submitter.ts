import type { Direction } from "./config";
import type { Log } from "./logger";
import { computeBridgeMessageId, type BridgeMessage } from "./message";
import { sleep } from "./watcher";
import { bridgeAbi } from "./abi";
import type { Account, Address, Chain, Client, Hex, Transport } from "viem";
import {
  readContract,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "viem/actions";

import { getErrorMessage } from "./helper";

export interface Submission {
  message: BridgeMessage;
  messageId: Hex;
}

export interface SubmitterActions {
  isProcessed: ({ messageId }: { messageId: Hex }) => Promise<boolean>;
  simulate: ({ message }: { message: BridgeMessage }) => Promise<unknown>;
  write: ({ request }: { request: unknown }) => Promise<Hex>;
  wait: ({ txHash }: { txHash: Hex }) => Promise<"success" | "reverted">;
}

export interface Submitter {
  enqueue: (submission: Submission) => void;
  onIdle: () => Promise<void>;
}

export function createSubmitter({
  direction,
  client,
  bridgeAddress,
  log,
  wait = sleep,
}: {
  direction: Direction;
  client: Client<Transport, Chain, Account>;
  bridgeAddress: Address;
  log: Log;
  wait?: typeof sleep;
}): Submitter {
  const actions: SubmitterActions = {
    isProcessed: ({ messageId }) =>
      readContract(client, {
        address: bridgeAddress,
        abi: bridgeAbi,
        functionName: "processed",
        args: [messageId],
      }),
    simulate: async ({ message }) => {
      const simulation = await simulateContract(client, {
        account: client.account,
        address: bridgeAddress,
        abi: bridgeAbi,
        functionName: "finalizeBridgeTx",
        args: [message],
      });
      return simulation.request;
    },
    write: ({ request }) => writeContract(client, request as never),
    wait: async ({ txHash }) =>
      (await waitForTransactionReceipt(client, { hash: txHash })).status,
  };
  return createSubmitterWithActions({ direction, actions, log, wait });
}

export function createSubmitterWithActions({
  direction,
  actions,
  log,
  wait = sleep,
}: {
  direction: Direction;
  actions: SubmitterActions;
  log: Log;
  wait?: typeof sleep;
}): Submitter {
  let queueTail = Promise.resolve();

  function enqueue(submission: Submission): void {
    logTransition({ log, direction, submission, status: "enqueued" });
    queueTail = queueTail
      .then(() => submitMessage({ direction, submission, actions, log, wait }))
      .catch(() => undefined);
  }

  async function onIdle(): Promise<void> {
    await queueTail;
  }

  return { enqueue, onIdle };
}

export async function submitMessage({
  direction,
  submission,
  actions,
  log,
  wait = sleep,
}: {
  direction: Direction;
  submission: Submission;
  actions: SubmitterActions;
  log: Log;
  wait?: typeof sleep;
}): Promise<void> {
  const computedMessageId = computeBridgeMessageId({
    message: submission.message,
  });
  if (computedMessageId.toLowerCase() !== submission.messageId.toLowerCase())
    throw new Error(
      `Refusing submission with invalid messageId: ${submission.messageId}`,
    );

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      logTransition({
        log,
        direction,
        submission,
        status: "checking-processed",
        attempt,
      });
      if (await actions.isProcessed({ messageId: submission.messageId })) {
        logTransition({
          log,
          direction,
          submission,
          status: "skipped-processed",
          attempt,
        });
        return;
      }

      logTransition({
        log,
        direction,
        submission,
        status: "simulating",
        attempt,
      });
      const request = await actions.simulate({ message: submission.message });

      // TODO(fees): Production bridgeTx() would be payable against an on-chain fee floor
      // quoted by the relayer, which could withdraw accumulated destination gas fees.
      const txHash = await actions.write({ request });
      logTransition({
        log,
        direction,
        submission,
        status: "submitted",
        attempt,
        txHash,
      });

      const receiptStatus = await actions.wait({ txHash });
      if (receiptStatus === "reverted")
        throw new Error(`Transaction reverted: ${txHash}`);

      logTransition({
        log,
        direction,
        submission,
        status: "finalized",
        attempt,
        txHash,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;

      const retryDelayMs = getRetryDelayMs({ attempt });
      logTransition({
        log,
        direction,
        submission,
        status: "retrying",
        attempt,
        retryDelayMs,
        error: getErrorMessage({ error }),
      });
      await wait({ milliseconds: retryDelayMs });
    }
  }

  logTransition({
    log,
    direction,
    submission,
    status: "failed",
    attempt: maxAttempts,
    error: getErrorMessage({ error: lastError }),
  });
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function getRetryDelayMs({ attempt }: { attempt: number }): number {
  return Math.min(initialRetryDelayMs * 2 ** (attempt - 1), maxRetryDelayMs);
}

function logTransition({
  log,
  direction,
  submission,
  status,
  ...details
}: {
  log: Log;
  direction: Direction;
  submission: Submission;
  status: string;
  [key: string]: unknown;
}): void {
  const message = [
    `messageId=${submission.messageId}`,
    ...Object.entries(details).map(([key, value]) => `${key}=${String(value)}`),
  ].join(" ");

  log({
    chain: directionLabels[direction],
    status,
    message,
  });
}

export const maxAttempts = 8;
export const initialRetryDelayMs = 1_000;
export const maxRetryDelayMs = 60_000;

const directionLabels: Record<Direction, string> = {
  "base-to-arbitrum": "Base → Arbitrum",
  "arbitrum-to-base": "Arbitrum → Base",
};
