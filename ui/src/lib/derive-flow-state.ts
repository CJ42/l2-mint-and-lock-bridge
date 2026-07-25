import type { DecodedBridgeError } from './decode-bridge-error'

export type BridgeStepId = 'approve' | 'submit' | 'relay'

export type BridgeStepStatus = 'idle' | 'pending' | 'processing' | 'confirmed'

export interface BridgeStep {
  id: BridgeStepId
  status: BridgeStepStatus
}

export type BridgeSteps = readonly [BridgeStep, BridgeStep, BridgeStep]

export type BridgeBlockedReason =
  | 'disconnected'
  | 'undeployed'
  | 'wrong-chain'
  | 'switching-chain'
  | 'invalid-amount'
  | 'invalid-recipient'

export type BridgeFlowState =
  | { phase: 'blocked'; reason: BridgeBlockedReason; steps: BridgeSteps }
  | { phase: 'ready'; steps: BridgeSteps }
  | { phase: 'approving'; steps: BridgeSteps }
  | { phase: 'submitting'; steps: BridgeSteps }
  | { phase: 'relaying'; steps: BridgeSteps }
  | { phase: 'done'; steps: BridgeSteps }
  | {
      phase: 'failed'
      failure: DecodedBridgeError
      failedStep: BridgeStepId
      steps: BridgeSteps
    }

/**
 * Maps directly to wagmi's transaction hooks:
 * - `isPrompting` ← `useWriteContract().isPending`, from the open wallet prompt through node
 *   acceptance.
 * - `isConfirming` ← `useWaitForTransactionReceipt().isFetching`, including receipt polling.
 * - `isConfirmed` ← `useWaitForTransactionReceipt().isSuccess`, meaning mined on the origin
 *   chain only, not relayed to the destination.
 */
export interface TransactionProgress {
  isPrompting: boolean
  isConfirming: boolean
  isConfirmed: boolean
}

/**
 * Relay progress comes from bridge events keyed by message id: initiation is observed on the
 * origin chain and finalization is observed on the destination chain.
 */
export interface RelayProgress {
  isInitiated: boolean
  isFinalized: boolean
}

export interface DeriveFlowStateInput {
  isConnected: boolean
  isDeployed: boolean
  isCorrectChain: boolean
  isSwitchingChain: boolean
  hasValidAmount: boolean
  hasValidRecipient: boolean
  approve: TransactionProgress
  bridge: TransactionProgress
  relay: RelayProgress
  failure?: DecodedBridgeError
}

export function deriveFlowState({
  isConnected,
  isDeployed,
  isCorrectChain,
  isSwitchingChain,
  hasValidAmount,
  hasValidRecipient,
  approve,
  bridge,
  relay,
  failure,
}: DeriveFlowStateInput): BridgeFlowState {
  const steps = deriveSteps({ approve, bridge, relay })

  if (failure)
    return {
      phase: 'failed',
      failure,
      failedStep: deriveFailedStep({ approve, relay }),
      steps: collapseInFlightSteps({ steps }),
    }

  if (!isConnected) return { phase: 'blocked', reason: 'disconnected', steps }
  if (!isDeployed) return { phase: 'blocked', reason: 'undeployed', steps }
  if (!isCorrectChain)
    return {
      phase: 'blocked',
      reason: isSwitchingChain ? 'switching-chain' : 'wrong-chain',
      steps,
    }
  if (!hasValidAmount) return { phase: 'blocked', reason: 'invalid-amount', steps }
  if (!hasValidRecipient) return { phase: 'blocked', reason: 'invalid-recipient', steps }
  if (relay.isFinalized) return { phase: 'done', steps }
  if (relay.isInitiated) return { phase: 'relaying', steps }
  if (bridge.isPrompting || bridge.isConfirming) return { phase: 'submitting', steps }
  if (approve.isPrompting || approve.isConfirming) return { phase: 'approving', steps }

  return { phase: 'ready', steps }
}

function deriveSteps({
  approve,
  bridge,
  relay,
}: {
  approve: TransactionProgress
  bridge: TransactionProgress
  relay: RelayProgress
}): BridgeSteps {
  return [
    { id: 'approve', status: deriveTransactionStatus({ progress: approve }) },
    { id: 'submit', status: deriveTransactionStatus({ progress: bridge }) },
    {
      id: 'relay',
      // Relay is event-driven and never opens a wallet prompt, so it has no `pending` state.
      status: relay.isFinalized ? 'confirmed' : relay.isInitiated ? 'processing' : 'idle',
    },
  ]
}

function deriveTransactionStatus({
  progress,
}: {
  progress: TransactionProgress
}): BridgeStepStatus {
  if (progress.isConfirmed) return 'confirmed'
  if (progress.isPrompting) return 'pending'
  if (progress.isConfirming) return 'processing'
  return 'idle'
}

function collapseInFlightSteps({ steps }: { steps: BridgeSteps }): BridgeSteps {
  return [
    collapseInFlightStep({ step: steps[0] }),
    collapseInFlightStep({ step: steps[1] }),
    collapseInFlightStep({ step: steps[2] }),
  ]
}

function collapseInFlightStep({ step }: { step: BridgeStep }): BridgeStep {
  if (step.status !== 'pending' && step.status !== 'processing') return { ...step }
  return { ...step, status: 'idle' }
}

function deriveFailedStep({
  approve,
  relay,
}: {
  approve: TransactionProgress
  relay: RelayProgress
}): BridgeStepId {
  if (relay.isInitiated && !relay.isFinalized) return 'relay'
  if (approve.isConfirmed) return 'submit'
  return 'approve'
}
