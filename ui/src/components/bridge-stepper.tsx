import type { BridgeFlowState, BridgeStepStatus } from '@/lib/derive-flow-state'

import { Spinner } from './spinner'
import styles from './bridge-stepper.module.css'

const stepCopy = {
  approve: 'Bridge approved',
  submit: 'Bridge tx submitted',
  relay: 'Bridge tx relayed',
} as const

const statusCaption: Partial<Record<BridgeStepStatus, string>> = {
  pending: 'Your transaction is being submitted to the network…',
  processing: 'Your transaction has been picked up and is being processed…',
  confirmed: 'Your transaction has completed successfully!',
}

interface BridgeStepperProps {
  flowState: BridgeFlowState
}

export function BridgeStepper({ flowState }: BridgeStepperProps) {
  return (
    <ol className={styles.stepper} aria-label="Bridge progress">
      {flowState.steps.map((step, index) => {
        const caption = statusCaption[step.status]
        const isActive =
          step.status === 'pending' || step.status === 'processing'
        const isConfirmed = step.status === 'confirmed'

        return (
          <li
            key={step.id}
            className={
              isConfirmed
                ? `${styles.step} ${styles.confirmed}`
                : isActive
                  ? `${styles.step} ${styles.active}`
                  : styles.step
            }
          >
            <span className={styles.marker}>
              {isConfirmed ? (
                <CheckIcon />
              ) : isActive ? (
                <Spinner mode="on-white" />
              ) : (
                <span className={styles.index}>{index + 1}</span>
              )}
            </span>
            <div className={styles.copy}>
              <span className={styles.title}>{stepCopy[step.id]}</span>
              {caption && <span className={styles.caption}>{caption}</span>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.5 8.25 6.5 11.25 12.5 4.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
