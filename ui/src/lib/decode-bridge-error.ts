/**
 * The single, deliberately narrow, extensible error-mapping layer for the bridge UI.
 *
 * Every bridge revert — from a pre-flight `useSimulateContract` dry run or a submitted
 * `useWriteContract` call — flows through `decodeBridgeError` and comes back as one of the ten
 * `DecodedBridgeErrorKind` branches below, each carrying a plain-language sentence with the real
 * decoded evidence value baked in. Extending this module means appending one more decoder to the
 * ordered chain in `decoders`, never inventing a second, parallel decode path. The gas-shortfall
 * helper lives in this file on purpose (ERR-09, D-09) rather than in its own module — the whole
 * decode chain is meant to stay legible as a single file.
 */

import { toFunctionSelector, type Abi, type Hex } from 'viem'
import { BaseError, ContractFunctionRevertedError } from 'viem'
import { formatAbiItem } from 'viem/utils'

import {
  collateralTokenBridgeAbi,
  ierc20Abi,
  syntheticTokenBridgeAbi,
  wrappedTokenAbi,
} from './generated'

export type DecodedBridgeErrorKind =
  | 'bridge-custom-error'
  | 'unmapped-custom-error'
  | 'token-operation-failed'
  | 'insufficient-allowance'
  | 'insufficient-gas'
  | 'wallet-rejected'
  | 'out-of-gas'
  | 'panic'
  | 'revert-string'
  | 'unknown'

export interface DecodedBridgeError {
  kind: DecodedBridgeErrorKind
  message: string
  errorName?: string
  rawData?: Hex
}

export interface DecodeBridgeErrorInput {
  error: unknown
  chainId?: number
  gasEstimate?: { gas: bigint; feePerGas: bigint }
}

const RAW_DATA_HEX_LIMIT = 74 // '0x' + 4-byte selector (8 hex chars) + at most 64 further hex chars

/**
 * The merged, deduped error-fragment ABI every decoder below decodes against. Built once at
 * module scope from the four generated contract ABIs, in source order
 * `[collateralTokenBridgeAbi, syntheticTokenBridgeAbi, wrappedTokenAbi, ierc20Abi]` — first
 * occurrence of a given 4-byte selector wins, making that order the deterministic tie-break.
 */
export const bridgeErrorAbi: Abi = buildBridgeErrorAbi()

function buildBridgeErrorAbi(): Abi {
  const sourceAbis: Abi[] = [
    collateralTokenBridgeAbi,
    syntheticTokenBridgeAbi,
    wrappedTokenAbi,
    ierc20Abi,
  ]
  const seenSelectors = new Set<Hex>()
  const errorAbi: Abi[number][] = []

  for (const abi of sourceAbis) {
    for (const item of abi) {
      if (item.type !== 'error') continue

      const selector = toFunctionSelector(formatAbiItem(item))
      if (seenSelectors.has(selector)) continue

      seenSelectors.add(selector)
      errorAbi.push(item)
    }
  }

  return errorAbi
}

interface DecodeContext {
  error: unknown
  reverted?: ContractFunctionRevertedError
}

type Decoder = (context: DecodeContext) => DecodedBridgeError | undefined

/**
 * Ordered decode chain, most-specific first, generic fallback last. `decodeBridgeError` walks
 * this list and returns the first match — the terminal branch is total, so a value always comes
 * back and the function never throws.
 */
const decoders: Decoder[] = [decodeBridgeCustomError]

export function decodeBridgeError({
  error,
}: DecodeBridgeErrorInput): DecodedBridgeError {
  const context: DecodeContext = {
    error,
    reverted: findRevertedError(error),
  }

  for (const decoder of decoders) {
    const result = decoder(context)
    if (result) return result
  }

  return decodeUnknown(context)
}

function findRevertedError(
  error: unknown,
): ContractFunctionRevertedError | undefined {
  if (!(error instanceof BaseError)) return undefined

  const reverted = error.walk(
    (cause) => cause instanceof ContractFunctionRevertedError,
  )
  return reverted instanceof ContractFunctionRevertedError ? reverted : undefined
}

/**
 * The one bridge custom error this task implements. Plan 01-02 appends the remaining named
 * `errorName` branches to this same decoder; every other decoded error name falls through to the
 * generic `decodeUnknown` terminal branch until it is added here.
 */
function decodeBridgeCustomError({
  reverted,
}: DecodeContext): DecodedBridgeError | undefined {
  if (!reverted?.data) return undefined

  const { errorName, args } = reverted.data

  if (errorName === 'BridgeMessageAlreadyProcessed') {
    const messageId = args?.[0]
    return {
      kind: 'bridge-custom-error',
      errorName,
      message: `This transfer was already relayed (messageId ${messageId}).`,
    }
  }

  return undefined
}

/**
 * Terminal, total fallback branch. Always returns a value — never `undefined`, never a thrown
 * error — so `decodeBridgeError` is guaranteed to produce a `DecodedBridgeError` for any input,
 * including `undefined`, a plain `Error`, or a non-`Error` value.
 */
function decodeUnknown({ reverted }: DecodeContext): DecodedBridgeError {
  const rawData = normaliseRawData(reverted?.raw ?? (reverted?.signature as Hex | undefined))

  if (!rawData)
    return {
      kind: 'unknown',
      message: 'The transaction reverted, but no revert data was available to explain why.',
    }

  return {
    kind: 'unknown',
    message: `The transaction reverted with an error we don't recognise (${rawData}).`,
    rawData,
  }
}

function normaliseRawData(data: Hex | undefined): Hex | undefined {
  if (!data || data === '0x') return undefined

  const lower = data.toLowerCase() as Hex
  if (lower.length <= RAW_DATA_HEX_LIMIT) return lower

  return `${lower.slice(0, RAW_DATA_HEX_LIMIT)}...` as Hex
}
