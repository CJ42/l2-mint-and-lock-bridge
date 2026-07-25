import type { Hex } from 'viem'

import {
  formatTokenAmount,
  getAge,
  getDirectionLabel,
  getExplorerUrl,
  truncateHash,
  type BridgeMessage,
} from '@/lib/bridge'

import styles from './message-explorer.module.css'

interface MessageExplorerProps {
  messages: BridgeMessage[]
  activeMessageId?: Hex
  isLoading: boolean
  error: string | null
}

export function MessageExplorer({
  messages,
  activeMessageId,
  isLoading,
  error,
}: MessageExplorerProps) {
  return (
    <section className={styles.explorer} aria-labelledby="messages-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Live event index</p>
          <h2 id="messages-heading">Message explorer</h2>
        </div>
        <div className={styles.live}>
          <span />
          Live
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Message</th>
              <th>Direction</th>
              <th>Amount</th>
              <th>Recipient</th>
              <th>Status</th>
              <th>Age</th>
              <th>Transactions</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((message) => (
              <MessageRow
                key={message.messageId}
                message={message}
                isActive={message.messageId === activeMessageId}
              />
            ))}
          </tbody>
        </table>

        {!messages.length && (
          <div className={styles.empty}>
            {isLoading ? 'Scanning both chains…' : 'No bridge messages found.'}
          </div>
        )}
      </div>

      {error && <p className={styles.error}>Scan warning: {error}</p>}
      <p className={styles.note}>
        This browser scans roughly 50,000 blocks on both chains in 2,000-block
        chunks. It needs no indexer, but production traffic should use an
        indexed API.
      </p>
    </section>
  )
}

function MessageRow({
  message,
  isActive,
}: {
  message: BridgeMessage
  isActive: boolean
}) {
  const isDelayed =
    message.status === 'pending' &&
    Math.floor(Date.now() / 1000) - message.timestamp > 120

  return (
    <tr className={isActive ? styles.active : undefined}>
      <td className={styles.hash} title={message.messageId}>
        {truncateHash(message.messageId, 8, 6)}
      </td>
      <td>{getDirectionLabel(message.originChainId)}</td>
      <td>{formatTokenAmount(message.amount)}</td>
      <td className={styles.hash} title={message.recipient}>
        {truncateHash(message.recipient)}
      </td>
      <td>
        <span
          className={
            message.status === 'finalized'
              ? styles.finalized
              : styles.pending
          }
        >
          {message.status === 'finalized'
            ? 'Finalized'
            : isDelayed
              ? 'Pending — relaying'
              : 'Pending'}
        </span>
      </td>
      <td>{getAge(message.timestamp)}</td>
      <td className={styles.links}>
        <a
          href={getExplorerUrl(
            message.originChainId,
            message.originTransactionHash,
          )}
          target="_blank"
          rel="noreferrer"
        >
          Origin ↗
        </a>
        {message.destinationTransactionHash ? (
          <a
            href={getExplorerUrl(
              message.destinationChainId,
              message.destinationTransactionHash,
            )}
            target="_blank"
            rel="noreferrer"
          >
            Destination ↗
          </a>
        ) : (
          <span>Destination —</span>
        )}
      </td>
    </tr>
  )
}
