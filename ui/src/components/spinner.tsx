import styles from './spinner.module.css'

export interface SpinnerProps {
  mode: 'on-white' | 'on-blue'
}

export function Spinner({ mode }: SpinnerProps) {
  return (
    <span
      className={
        mode === 'on-blue' ? `${styles.spinner} ${styles.onBlue}` : styles.spinner
      }
      aria-hidden="true"
    />
  )
}
