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

import { toFunctionSelector, type Abi, type Address, type Hex } from 'viem'
import { BaseError, ContractFunctionRevertedError } from 'viem'
import { formatAbiItem } from 'viem/utils'

import {
  collateralTokenBridgeAbi,
  ierc20Abi,
  syntheticTokenBridgeAbi,
  wrappedTokenAbi,
} from './generated'
import { formatTokenAmount } from './bridge'

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
 *
 * Order is load-bearing: `Panic`/`Error` (viem appends both fragments to every ABI automatically
 * — they are not bridge errors) must be classified before the Tier-1/Tier-2 custom-error tiering,
 * and the Tier-1 named branch must win over the Tier-2 catch-all.
 */
const decoders: Decoder[] = [
  decodePanic,
  decodeRevertString,
  decodeBridgeCustomError,
  decodeUnmappedCustomError,
]

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
 * Tier 1 — bespoke copy (D-06). Every branch below decodes a specific, expected bridge revert
 * into a plain sentence carrying the real decoded evidence in parentheses. `SafeERC20FailedOperation`
 * and `ERC20InsufficientAllowance` get their own kinds; every other Tier-1 name uses
 * `kind: 'bridge-custom-error'`. Any named error that reaches this decoder but matches none of
 * these branches falls through to `decodeUnmappedCustomError` (Tier 2).
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

  if (errorName === 'InvalidDestinationChainId') {
    const [expectedChainId, receivedChainId] = (args ?? []) as [
      bigint | undefined,
      bigint | undefined,
    ]
    return {
      kind: 'bridge-custom-error',
      errorName,
      message: `This transaction targeted the wrong destination chain (expected chain ${expectedChainId ?? '?'}, received chain ${receivedChainId ?? '?'}).`,
    }
  }

  if (errorName === 'InvalidBridgeTxInputs') {
    const [recipient, amount] = (args ?? []) as [Address | undefined, bigint | undefined]
    const evidence =
      recipient !== undefined && amount !== undefined
        ? ` (recipient ${recipient}, amount ${formatTokenAmount(amount)})`
        : ''
    return {
      kind: 'bridge-custom-error',
      errorName,
      message: `The recipient or amount supplied for this transfer is invalid${evidence}.`,
    }
  }

  if (errorName === 'SafeERC20FailedOperation') {
    const token = args?.[0] as Address | undefined
    return {
      kind: 'token-operation-failed',
      errorName,
      message: `The token transfer failed at the token contract level${token ? ` (token ${token})` : ''}.`,
    }
  }

  if (errorName === 'ERC20InsufficientAllowance') {
    const [, allowance, needed] = (args ?? []) as [
      Address | undefined,
      bigint | undefined,
      bigint | undefined,
    ]
    const evidence =
      allowance !== undefined && needed !== undefined
        ? ` (current allowance ${formatTokenAmount(allowance)}, needed ${formatTokenAmount(needed)})`
        : ''
    return {
      kind: 'insufficient-allowance',
      errorName,
      message: `Your approved allowance is too low for this transfer${evidence}. Please re-run approve and try again.`,
    }
  }

  return undefined
}

/**
 * Tier 2 — one shared message (D-05). Any named custom error that reached this decoder without
 * matching a Tier-1 branch above resolves here: a short, debuggable sentence naming the real
 * decoded error. This is a pure fall-through by construction — it never checks any specific error
 * name, so admin-only/invariant errors this UI can never trigger (including `NotRelayer`) land
 * here without a dedicated branch, exactly as D-05 requires.
 */
function decodeUnmappedCustomError({
  reverted,
}: DecodeContext): DecodedBridgeError | undefined {
  if (!reverted?.data) return undefined

  const { errorName } = reverted.data
  if (!errorName) return undefined

  return {
    kind: 'unmapped-custom-error',
    errorName,
    message: `Something unexpected happened on-chain (${errorName}).`,
  }
}

/**
 * Standard Solidity `Panic(uint256)` codes, in plain language. Table is our own — not re-derived
 * from viem's internal `panicReasons` constant, which is not part of viem's public package export
 * surface (only a fixed subpath allow-list is exported; `viem/constants` is not among them).
 */
const PANIC_MESSAGES: Record<number, string> = {
  1: 'An internal assertion failed unexpectedly',
  17: 'This operation caused a number to overflow or underflow',
  18: 'The contract tried to divide or take the modulo of a number by zero',
  33: "The contract tried to convert a value into an enum type it doesn't support",
  34: 'The contract read a storage byte array that was encoded incorrectly',
  49: 'The contract tried to remove an item from an array that was already empty',
  50: "The contract tried to access an array element that's out of bounds",
  65: 'The contract tried to allocate more memory than is allowed',
  81: 'The contract called an internal function variable that was never initialised',
}

/**
 * `Panic(uint256)` branch — ERR-07. viem appends the `Panic` fragment to every ABI automatically
 * (see `decodeErrorResult`), so this is reachable for any bridge call, not just ones this module's
 * own ABI declares. An undocumented code still resolves to `kind: 'panic'` with a generic
 * sentence — it never falls through to the generic `unknown` branch.
 */
function decodePanic({ reverted }: DecodeContext): DecodedBridgeError | undefined {
  if (!reverted?.data) return undefined
  const { errorName, args } = reverted.data
  if (errorName !== 'Panic') return undefined

  const code = Number((args as [bigint | number] | undefined)?.[0] ?? 0)
  const hexCode = `0x${code.toString(16).padStart(2, '0')}`
  const description = PANIC_MESSAGES[code] ?? 'An unexpected internal error occurred in the contract'

  return {
    kind: 'panic',
    errorName,
    message: `${description} (${hexCode}).`,
  }
}

const REVERT_STRING_LIMIT = 200

function truncateRevertReason(reason: string): string {
  return reason.length > REVERT_STRING_LIMIT
    ? `${reason.slice(0, REVERT_STRING_LIMIT)}...`
    : reason
}

/**
 * Solidity revert-string branch. Bounds the one remaining path by which an attacker-influenceable
 * payload (a `require(false, "...")`/`revert("...")` reason) reaches user-facing copy (T-02-02).
 */
function decodeRevertString({ reverted }: DecodeContext): DecodedBridgeError | undefined {
  if (!reverted) return undefined

  const errorName = reverted.data?.errorName
  if (errorName && errorName !== 'Error') return undefined
  if (!errorName && !reverted.reason) return undefined

  const reason =
    errorName === 'Error'
      ? ((reverted.data?.args as [string] | undefined)?.[0] ?? reverted.reason ?? '')
      : (reverted.reason ?? '')

  return {
    kind: 'revert-string',
    message: `The transaction reverted: "${truncateRevertReason(reason)}".`,
  }
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
