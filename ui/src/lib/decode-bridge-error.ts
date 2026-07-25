/**
 * The single, deliberately narrow, extensible error-mapping layer for the bridge UI.
 *
 * Every bridge revert — from a pre-flight `useSimulateContract` dry run or a submitted
 * `useWriteContract` call — flows through `decodeBridgeError` and comes back as one of the ten
 * `DecodedBridgeErrorKind` branches below, each carrying a plain-language sentence with the real
 * decoded evidence value baked in. `kind` is the primary, load-bearing field — `message` is a
 * rendering of it, not the other way around (see 01-01-PLAN.md's `<assumption_delta_decision>`).
 *
 * Extending this module means appending one more decoder function to the ordered `decoders` array
 * below and adding its `kind` to `DecodedBridgeErrorKind`, never inventing a second, parallel
 * decode path — the exhaustiveness invariant test in `decode-bridge-error.test.ts` is the guard
 * that keeps every declared kind reachable and collision-free. The gas-shortfall helper
 * (`computeGasShortfall` and its dependencies) lives in this file on purpose (ERR-09, D-09)
 * rather than in its own module — the whole decode chain is meant to stay legible as a single file.
 *
 * The decode chain's ORDER is load-bearing, not incidental. Two constraints are not obvious from
 * reading a single decoder in isolation, so they're stated here once:
 * - `decodeWalletRejection` must run FIRST, because a wallet rejection is not an on-chain failure
 *   and must never be misclassified as one.
 * - `decodeEmptyRevertData` must run before every branch that reads decoded revert data, because
 *   zero-length revert data cannot be decoded at all — viem's `decodeErrorResult` throws on it.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  formatEther,
  parseGwei,
  size,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from 'viem'
import { formatAbiItem } from 'viem/utils'

import {
  collateralTokenBridgeAbi,
  ierc20Abi,
  syntheticTokenBridgeAbi,
  wrappedTokenAbi,
} from './generated'
import { chains, formatTokenAmount } from './bridge'

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
  chainId?: number
  gasEstimate?: { gas: bigint; feePerGas: bigint }
}

type Decoder = (context: DecodeContext) => DecodedBridgeError | undefined

/**
 * Ordered decode chain, most-specific first, generic fallback last. `decodeBridgeError` walks
 * this list and returns the first match — the terminal branch is total, so a value always comes
 * back and the function never throws.
 *
 * Order is load-bearing:
 * - `decodeWalletRejection` is FIRST — a wallet rejection is not an on-chain failure and must
 *   never be misclassified as one.
 * - `decodeEmptyRevertData` precedes every branch that reads decoded revert data — zero-length
 *   revert data cannot be decoded at all (`decodeErrorResult` throws on it), so this must run
 *   before `Panic`/`Error`/the custom-error tiering, not after.
 * - `Panic`/`Error` (viem appends both fragments to every ABI automatically — they are not
 *   bridge errors) must be classified before the Tier-1/Tier-2 custom-error tiering.
 * - The Tier-1 named branch must win over the Tier-2 catch-all.
 */
const decoders: Decoder[] = [
  decodeWalletRejection,
  decodeEmptyRevertData,
  decodeInsufficientGas,
  decodePanic,
  decodeRevertString,
  decodeBridgeCustomError,
  decodeUnmappedCustomError,
]

export function decodeBridgeError({
  error,
  chainId,
  gasEstimate,
}: DecodeBridgeErrorInput): DecodedBridgeError {
  const context: DecodeContext = {
    error,
    reverted: findRevertedError(error),
    chainId,
    gasEstimate,
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
 * Walks an error's `.cause` chain generically (not gated on `instanceof BaseError`, since a
 * wallet provider or wrapper library may attach a plain `.cause` without extending viem's class),
 * collecting every level including the error itself, so a predicate can be tested against each.
 */
function walkChain(error: unknown): unknown[] {
  const chain: unknown[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current !== undefined && current !== null && !seen.has(current)) {
    chain.push(current)
    seen.add(current)
    current =
      typeof current === 'object' && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : undefined
  }

  return chain
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
 * Wallet rejection — ERR-05. Placed FIRST in the chain: a rejection is not an on-chain failure
 * and must never be misclassified as one. Primary signal is viem's typed `UserRejectedRequestError`
 * (EIP-1193 code 4001). The numeric-code check is a deliberately narrow secondary, kept last
 * within this decoder and documented here: some wallet providers wrap or strip viem's typed class
 * before it reaches the app, so the EIP-1193 `code` alone is checked as a fallback signal — this
 * is the one exception to STACK.md's "typed classes are strictly better" rule, and its real-world
 * coverage against every wallet provider is unverified (flagged in the plan as an unresolved edge).
 */
function decodeWalletRejection({ error }: DecodeContext): DecodedBridgeError | undefined {
  const chain = walkChain(error)

  const isRejected = chain.some(
    (value) =>
      value instanceof UserRejectedRequestError ||
      (typeof value === 'object' &&
        value !== null &&
        'code' in value &&
        (value as { code?: unknown }).code === 4001),
  )
  if (!isRejected) return undefined

  return {
    kind: 'wallet-rejected',
    message: 'You rejected the request in your wallet.',
  }
}

/**
 * Empty revert data — ERR-06. Precedes every branch that reads decoded data: zero-length revert
 * data cannot be decoded at all (`decodeErrorResult` throws `AbiDecodingZeroDataError` on it), and
 * in practice this means the transaction ran out of gas before it could produce a reason.
 * Zero-byte-length is detected with viem's `size` semantics (after lowercasing) rather than a
 * literal string comparison, so `undefined`, `'0x'` and `'0X'` all classify identically.
 */
function decodeEmptyRevertData({ reverted }: DecodeContext): DecodedBridgeError | undefined {
  if (!reverted) return undefined
  if (reverted.data) return undefined // decoded data exists — a more specific decoder handles it

  if (hexByteLength(reverted.raw) > 0) return undefined // real, if unrecognised, revert data exists

  return {
    kind: 'out-of-gas',
    message:
      'The transaction reverted without returning any data, which in practice usually means it ran out of gas before it could produce a reason. Try increasing the gas limit and retrying.',
  }
}

function hexByteLength(value: Hex | undefined): number {
  if (!value) return 0
  return size(value.toLowerCase() as Hex)
}

/**
 * Faucet metadata by numeric chain id only (D-08) — never by comparing chain-name strings. These
 * are Alchemy testnet faucets: 0.1 ETH/day, no signup required to claim, though they do check for
 * some existing mainnet history on the requesting address to deter abuse — worth revisiting if
 * that policy changes and the links need swapping.
 */
const GAS_FAUCETS: Record<number, { chainName: string; faucetUrl: string }> = {
  84532: {
    // Base Sepolia — matches `chains.base.id` in ./bridge
    chainName: chains.base.name,
    faucetUrl: 'https://www.alchemy.com/faucets/base-sepolia',
  },
  421614: {
    // Arbitrum Sepolia — matches `chains.arbitrum.id` in ./bridge
    chainName: chains.arbitrum.name,
    faucetUrl: 'https://www.alchemy.com/faucets/arbitrum-sepolia',
  },
}

const DEFAULT_GAS_SHORTFALL_ETH = '0.0004'

/**
 * Recovers `{ gas, feePerGas }` from the walked cause chain's `metaMessages` — the secondary,
 * degraded source (D-07). Both `EstimateGasExecutionError` and `CallExecutionError` emit a
 * `prettyPrint` block (`'Estimate Gas Arguments:'`/`'Raw Call Arguments:'`) whose lines are two
 * leading spaces, the key, a colon, padding, then the value. A missing or unparseable line is
 * treated as this source failing — never as a zero.
 */
function extractGasArgsFromChain(
  error: unknown,
): { gas: bigint; feePerGas: bigint } | undefined {
  for (const level of walkChain(error)) {
    if (!(level instanceof BaseError) || !level.metaMessages) continue

    const parsed = parseGasArgsBlock(level.metaMessages)
    if (parsed) return parsed
  }
  return undefined
}

function parseGasArgsBlock(
  metaMessages: string[],
): { gas: bigint; feePerGas: bigint } | undefined {
  const headingIndex = metaMessages.findIndex(
    (line) => line === 'Estimate Gas Arguments:' || line === 'Raw Call Arguments:',
  )
  if (headingIndex === -1) return undefined

  const block = metaMessages[headingIndex + 1]
  if (typeof block !== 'string') return undefined

  let gas: bigint | undefined
  let maxFeePerGasGwei: string | undefined
  let gasPriceGwei: string | undefined

  for (const line of block.split('\n')) {
    const match = line.match(/^\s*([a-zA-Z]+):\s+(.+)$/)
    if (!match) continue

    const key = match[1]
    const value = match[2]?.trim()
    if (!value) continue

    if (key === 'gas') {
      try {
        const parsedGas = BigInt(value)
        if (parsedGas > 0n) gas = parsedGas
      } catch {
        // unparseable gas line — this source fails, never treated as zero
      }
    } else if (key === 'maxFeePerGas') {
      maxFeePerGasGwei = value.replace(/\s*gwei$/, '')
    } else if (key === 'gasPrice' && maxFeePerGasGwei === undefined) {
      gasPriceGwei = value.replace(/\s*gwei$/, '')
    }
  }

  const feeGwei = maxFeePerGasGwei ?? gasPriceGwei
  if (gas === undefined || feeGwei === undefined) return undefined

  try {
    const feePerGas = parseGwei(feeGwei)
    if (feePerGas <= 0n) return undefined
    return { gas, feePerGas }
  } catch {
    return undefined
  }
}

/**
 * Renders a wei amount as an ETH string via `formatEther`, then rounds UP to 4 decimal places so
 * the quoted amount is never below what the transaction actually needs. Rounding is done on the
 * decimal string in bigint arithmetic rather than `Number`, to avoid floating-point imprecision.
 */
function ceilToFourDecimalsEth(wei: bigint): string {
  const [wholePart, fractionPart = ''] = formatEther(wei).split('.')
  const paddedFraction = fractionPart.padEnd(5, '0')
  const keep = paddedFraction.slice(0, 4)
  const remainder = paddedFraction.slice(4)

  if (!/[1-9]/.test(remainder)) return `${wholePart}.${keep}`

  const roundedUp = BigInt(wholePart) * 10_000n + BigInt(keep) + 1n
  const wholeDigits = roundedUp / 10_000n
  const fractionDigits = (roundedUp % 10_000n).toString().padStart(4, '0')
  return `${wholeDigits}.${fractionDigits}`
}

/**
 * The gas-shortfall computation (D-07, D-09) — kept in this module on purpose, following the
 * `getRetryDelayMs`-style shape from `relayer/src/submitter.ts`: a standalone top-level function,
 * called inline. Resolves from three ordered sources and reports whether the figure was genuinely
 * computed or is the fixed default, so the caller can word the sentence accordingly (the
 * `must_haves.prohibitions` entry on this plan forbids presenting a default as a measurement).
 */
function computeGasShortfall({
  gasEstimate,
  error,
}: {
  gasEstimate?: { gas: bigint; feePerGas: bigint }
  error: unknown
}): { amount: string; isComputed: boolean } {
  const explicit =
    gasEstimate && gasEstimate.gas > 0n && gasEstimate.feePerGas > 0n ? gasEstimate : undefined
  const recovered = explicit ? undefined : extractGasArgsFromChain(error)
  const source = explicit ?? recovered

  if (!source) return { amount: DEFAULT_GAS_SHORTFALL_ETH, isComputed: false }

  const weiCost = source.gas * source.feePerGas
  return { amount: ceilToFourDecimalsEth(weiCost), isComputed: true }
}

/**
 * Insufficient native gas — ERR-02, D-07, D-08. `InsufficientFundsError` never carries gas/fee
 * fields itself (confirmed against the installed viem source — see the plan's
 * `planner_flagged_decisions`); it only classifies the failure. The real figure comes from
 * `computeGasShortfall`'s three ordered sources.
 */
function decodeInsufficientGas({
  error,
  chainId,
  gasEstimate,
}: DecodeContext): DecodedBridgeError | undefined {
  const insufficientFunds = walkChain(error).find(
    (value): value is InsufficientFundsError => value instanceof InsufficientFundsError,
  )
  if (!insufficientFunds) return undefined

  const { amount, isComputed } = computeGasShortfall({ gasEstimate, error })
  const faucet = chainId !== undefined ? GAS_FAUCETS[chainId] : undefined

  const chainClause = faucet ? ` on ${faucet.chainName}` : ''
  const faucetClause = faucet ? ` — here's the faucet: ${faucet.faucetUrl}` : ''

  const message = isComputed
    ? `You need ~${amount} ETH${chainClause} for gas${faucetClause}.`
    : `You'll typically need around ${amount} ETH${chainClause} for gas${faucetClause}.`

  return { kind: 'insufficient-gas', message }
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
