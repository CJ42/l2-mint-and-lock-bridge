import {
  getAddress,
  isAddress,
  isHex,
  type Address,
  type Hex,
} from 'viem'

export const PERSISTED_FLOW_VERSION = 1

export interface PersistedFlow {
  version: typeof PERSISTED_FLOW_VERSION
  address: Address
  directionKey: 'baseToArbitrum' | 'arbitrumToBase'
  amountInput: string
  recipientInput: string
  approveHash?: Hex
  bridgeHash?: Hex
  messageId?: Hex
}

export type FlowStorageBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const STORAGE_PREFIX = 'l2-bridge:flow:'

export function persistedFlowKey({ address }: { address: Address }): string {
  return `${STORAGE_PREFIX}${address.toLowerCase()}`
}

function resolveBackend({
  backend,
}: {
  backend?: FlowStorageBackend
}): FlowStorageBackend | undefined {
  if (backend) return backend
  if (typeof globalThis === 'undefined') return undefined
  try {
    const store = (globalThis as { localStorage?: FlowStorageBackend }).localStorage
    return store
  } catch {
    return undefined
  }
}

function isDirectionKey(
  value: unknown,
): value is PersistedFlow['directionKey'] {
  return value === 'baseToArbitrum' || value === 'arbitrumToBase'
}

function isValidAmountInput(value: string) {
  return /^\d*(\.\d{0,6})?$/.test(value) && value !== '' && value !== '.'
}

function isOptionalHex(value: unknown): value is Hex | undefined {
  if (value === undefined) return true
  return typeof value === 'string' && isHex(value)
}

export function readPersistedFlow({
  address,
  backend,
}: {
  address: Address
  backend?: FlowStorageBackend
}): PersistedFlow | undefined {
  const store = resolveBackend({ backend })
  if (!store) return undefined

  try {
    const raw = store.getItem(persistedFlowKey({ address }))
    if (!raw) return undefined

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined

    const record = parsed as Record<string, unknown>
    if (record.version !== PERSISTED_FLOW_VERSION) return undefined
    if (typeof record.address !== 'string' || !isAddress(record.address))
      return undefined
    if (getAddress(record.address) !== getAddress(address)) return undefined
    if (!isDirectionKey(record.directionKey)) return undefined
    if (typeof record.amountInput !== 'string') return undefined
    if (!isValidAmountInput(record.amountInput)) return undefined
    if (typeof record.recipientInput !== 'string') return undefined
    if (!isOptionalHex(record.approveHash)) return undefined
    if (!isOptionalHex(record.bridgeHash)) return undefined
    if (!isOptionalHex(record.messageId)) return undefined

    return {
      version: PERSISTED_FLOW_VERSION,
      address: getAddress(record.address),
      directionKey: record.directionKey,
      amountInput: record.amountInput,
      recipientInput: record.recipientInput,
      approveHash: record.approveHash,
      bridgeHash: record.bridgeHash,
      messageId: record.messageId,
    }
  } catch {
    return undefined
  }
}

export function writePersistedFlow({
  record,
  backend,
}: {
  record: PersistedFlow
  backend?: FlowStorageBackend
}): void {
  const store = resolveBackend({ backend })
  if (!store) return

  // Amount must stay a raw decimal string — JSON cannot represent bigint.
  try {
    store.setItem(persistedFlowKey({ address: record.address }), JSON.stringify(record))
  } catch {
    // Quota / private mode: degrade to non-persistent flow.
  }
}

export function clearPersistedFlow({
  address,
  backend,
}: {
  address: Address
  backend?: FlowStorageBackend
}): void {
  const store = resolveBackend({ backend })
  if (!store) return

  try {
    store.removeItem(persistedFlowKey({ address }))
  } catch {
    // Ignore storage failures.
  }
}
