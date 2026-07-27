import { getAbiItem } from 'viem'

import { collateralTokenBridgeAbi } from '@/lib/generated'

export const bridgeTxInitiatedEvent = getAbiItem({
  abi: collateralTokenBridgeAbi,
  name: 'BridgeTxInitiated',
})

export const bridgeFinalizedEvent = getAbiItem({
  abi: collateralTokenBridgeAbi,
  name: 'BridgeTxFinalized',
})
