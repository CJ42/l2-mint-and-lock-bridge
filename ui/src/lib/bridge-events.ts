import { getAbiItem } from 'viem'

import { collateralTokenBridgeAbi } from '@/lib/generated'

// Both bridge ABIs declare identical events; resolve by name from the collateral ABI so callers
// never depend on generated-array positions.
export const bridgeTxInitiatedEvent = getAbiItem({
  abi: collateralTokenBridgeAbi,
  name: 'BridgeTxInitiated',
})

export const bridgeFinalizedEvent = getAbiItem({
  abi: collateralTokenBridgeAbi,
  name: 'BridgeFinalized',
})
