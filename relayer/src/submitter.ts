import type { Direction } from "./config"
import type { Log } from "./logger"
import { hashBridgeMessage, type BridgeMessage } from "./message"
import { sleep } from "./watcher"
import type { Hex } from "viem"

export interface Submission {
  message: BridgeMessage
  messageId: Hex
}

export interface SubmitterActions {
  isProcessed: ({ messageId }: { messageId: Hex }) => Promise<boolean>
  simulate: ({ message }: { message: BridgeMessage }) => Promise<unknown>
  write: ({ request }: { request: unknown }) => Promise<Hex>
  wait: ({ txHash }: { txHash: Hex }) => Promise<"success" | "reverted">
}

export interface Submitter {
  enqueue: (submission: Submission) => void
  onIdle: () => Promise<void>
}

export function createSubmitter({
  direction,
  actions,
  log,
  wait = sleep,
}: {
  direction: Direction
  actions: SubmitterActions
  log: Log
  wait?: typeof sleep
}): Submitter {
  let queueTail = Promise.resolve()

  function enqueue(submission: Submission): void {
    logTransition({ log, direction, submission, status: "enqueued" })
    queueTail = queueTail
      .then(() => submitMessage({ direction, submission, actions, log, wait }))
      .catch(() => undefined)
  }

  async function onIdle(): Promise<void> {
    await queueTail
  }

  return { enqueue, onIdle }
}

export async function submitMessage({
  direction,
  submission,
  actions,
  log,
  wait = sleep,
}: {
  direction: Direction
  submission: Submission
  actions: SubmitterActions
  log: Log
  wait?: typeof sleep
}): Promise<void> {
  const computedMessageId = hashBridgeMessage({ message: submission.message })
  if (computedMessageId.toLowerCase() !== submission.messageId.toLowerCase())
    throw new Error(`Refusing submission with invalid messageId: ${submission.messageId}`)

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      logTransition({ log, direction, submission, status: "checking-processed", attempt })
      if (await actions.isProcessed({ messageId: submission.messageId })) {
        logTransition({ log, direction, submission, status: "skipped-processed", attempt })
        return
      }

      logTransition({ log, direction, submission, status: "simulating", attempt })
      const request = await actions.simulate({ message: submission.message })

      // TODO(fees): Production bridgeTx() would be payable against an on-chain fee floor
      // quoted by the relayer, which could withdraw accumulated destination gas fees.
      const txHash = await actions.write({ request })
      logTransition({ log, direction, submission, status: "submitted", attempt, txHash })

      const receiptStatus = await actions.wait({ txHash })
      if (receiptStatus === "reverted") throw new Error(`Transaction reverted: ${txHash}`)

      logTransition({ log, direction, submission, status: "finalized", attempt, txHash })
      return
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts) break

      const retryDelayMs = getRetryDelayMs({ attempt })
      logTransition({
        log,
        direction,
        submission,
        status: "retrying",
        attempt,
        retryDelayMs,
        error: getErrorMessage({ error }),
      })
      await wait({ milliseconds: retryDelayMs })
    }
  }

  logTransition({
    log,
    direction,
    submission,
    status: "failed",
    attempt: maxAttempts,
    error: getErrorMessage({ error: lastError }),
  })
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function getRetryDelayMs({ attempt }: { attempt: number }): number {
  return Math.min(initialRetryDelayMs * 2 ** (attempt - 1), maxRetryDelayMs)
}

function logTransition({
  log,
  direction,
  submission,
  status,
  ...details
}: {
  log: Log
  direction: Direction
  submission: Submission
  status: string
  [key: string]: unknown
}): void {
  log({
    messageId: submission.messageId,
    direction,
    status,
    ...details,
  })
}

function getErrorMessage({ error }: { error: unknown }): string {
  return error instanceof Error ? error.message : String(error)
}

export const maxAttempts = 8
export const initialRetryDelayMs = 1_000
export const maxRetryDelayMs = 60_000
