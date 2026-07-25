import { getAbiItem } from 'viem'

import { collateralTokenBridgeAbi } from '@/lib/generated'

// Both bridge ABIs declare identical events; resolve by name from the collateral ABI so callers
// never depend on generated-array positions.
export const bridgeInitiatedEvent = getAbiItem({
  abi: collateralTokenBridgeAbi,
  name: 'BridgeInitiated',
})

export const bridgeFinalizedEvent = getAbiItem({
  abi: collateralTokenBridgeAbi,
  name: 'BridgeFinalized',
})
