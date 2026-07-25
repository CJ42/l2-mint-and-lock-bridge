import {
  createUseReadContract,
  createUseWriteContract,
  createUseSimulateContract,
  createUseWatchContractEvent,
} from 'wagmi/codegen'

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CollateralTokenBridge
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const collateralTokenBridgeAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'owner_', internalType: 'address', type: 'address' },
      { name: 'token_', internalType: 'contract IERC20', type: 'address' },
      { name: 'destinationChainId_', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DESTINATION_CHAIN_ID',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'TOKEN',
    outputs: [{ name: '', internalType: 'contract IERC20', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'recipient', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'lock',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'nonces',
    outputs: [{ name: 'nonce', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingOwner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'messageId_', internalType: 'bytes32', type: 'bytes32' }],
    name: 'processed',
    outputs: [{ name: 'isProcessed', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'relayer',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newRelayer', internalType: 'address', type: 'address' }],
    name: 'setRelayer',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'message',
        internalType: 'struct BridgeMessage',
        type: 'tuple',
        components: [
          { name: 'originChainId', internalType: 'uint256', type: 'uint256' },
          {
            name: 'destinationChainId',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'sender', internalType: 'address', type: 'address' },
          { name: 'recipient', internalType: 'address', type: 'address' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'nonce', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'unlock',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'messageId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'BridgeFinalized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'messageId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'nonce',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'originChainId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'destinationChainId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'BridgeInitiated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferStarted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'Paused',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousRelayer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newRelayer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RelayerUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'Unpaused',
  },
  {
    type: 'error',
    inputs: [{ name: 'messageId', internalType: 'bytes32', type: 'bytes32' }],
    name: 'BridgeMessageAlreadyProcessed',
  },
  { type: 'error', inputs: [], name: 'EnforcedPause' },
  { type: 'error', inputs: [], name: 'ExpectedPause' },
  {
    type: 'error',
    inputs: [
      { name: 'invalidRecipient', internalType: 'address', type: 'address' },
      { name: 'invalidAmount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InvalidBridgeTxInputs',
  },
  {
    type: 'error',
    inputs: [
      { name: 'expectedChainId', internalType: 'uint256', type: 'uint256' },
      { name: 'receivedChainId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InvalidDestinationChainId',
  },
  {
    type: 'error',
    inputs: [
      { name: 'invalidAddress', internalType: 'address', type: 'address' },
    ],
    name: 'NotRelayer',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  { type: 'error', inputs: [], name: 'RelayerCannotBeZeroAddress' },
  {
    type: 'error',
    inputs: [{ name: 'token', internalType: 'address', type: 'address' }],
    name: 'SafeERC20FailedOperation',
  },
  { type: 'error', inputs: [], name: 'TokenCannotBeZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IERC20
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const ierc20Abi = [
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SyntheticTokenBridge
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const syntheticTokenBridgeAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'owner_', internalType: 'address', type: 'address' },
      {
        name: 'wrappedToken_',
        internalType: 'contract WrappedToken',
        type: 'address',
      },
      { name: 'canonicalToken_', internalType: 'address', type: 'address' },
      { name: 'destinationChainId_', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'CANONICAL_TOKEN',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'DESTINATION_CHAIN_ID',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'recipient', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'burn',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'message',
        internalType: 'struct BridgeMessage',
        type: 'tuple',
        components: [
          { name: 'originChainId', internalType: 'uint256', type: 'uint256' },
          {
            name: 'destinationChainId',
            internalType: 'uint256',
            type: 'uint256',
          },
          { name: 'token', internalType: 'address', type: 'address' },
          { name: 'sender', internalType: 'address', type: 'address' },
          { name: 'recipient', internalType: 'address', type: 'address' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'nonce', internalType: 'uint256', type: 'uint256' },
        ],
      },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'nonces',
    outputs: [{ name: 'nonce', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pendingOwner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'messageId_', internalType: 'bytes32', type: 'bytes32' }],
    name: 'processed',
    outputs: [{ name: 'isProcessed', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'relayer',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newRelayer', internalType: 'address', type: 'address' }],
    name: 'setRelayer',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'wrappedToken',
    outputs: [
      { name: '', internalType: 'contract WrappedToken', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'messageId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'BridgeFinalized',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'messageId',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'sender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'recipient',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'nonce',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'originChainId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'destinationChainId',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'BridgeInitiated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferStarted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'Paused',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousRelayer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newRelayer',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'RelayerUpdated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'Unpaused',
  },
  {
    type: 'error',
    inputs: [{ name: 'messageId', internalType: 'bytes32', type: 'bytes32' }],
    name: 'BridgeMessageAlreadyProcessed',
  },
  { type: 'error', inputs: [], name: 'EnforcedPause' },
  { type: 'error', inputs: [], name: 'ExpectedPause' },
  {
    type: 'error',
    inputs: [
      { name: 'invalidRecipient', internalType: 'address', type: 'address' },
      { name: 'invalidAmount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InvalidBridgeTxInputs',
  },
  {
    type: 'error',
    inputs: [
      { name: 'expectedChainId', internalType: 'uint256', type: 'uint256' },
      { name: 'receivedChainId', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InvalidDestinationChainId',
  },
  {
    type: 'error',
    inputs: [
      { name: 'invalidAddress', internalType: 'address', type: 'address' },
    ],
    name: 'NotRelayer',
  },
  {
    type: 'error',
    inputs: [{ name: 'owner', internalType: 'address', type: 'address' }],
    name: 'OwnableInvalidOwner',
  },
  {
    type: 'error',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
  },
  { type: 'error', inputs: [], name: 'ReentrancyGuardReentrantCall' },
  { type: 'error', inputs: [], name: 'RelayerCannotBeZeroAddress' },
  { type: 'error', inputs: [], name: 'TokenCannotBeZeroAddress' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// WrappedToken
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const wrappedTokenAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'bridge_', internalType: 'address', type: 'address' },
      { name: 'tokenName_', internalType: 'string', type: 'string' },
      { name: 'tokenSymbol_', internalType: 'string', type: 'string' },
      { name: 'decimals_', internalType: 'uint8', type: 'uint8' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'BRIDGE',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'amount', internalType: 'uint256', type: 'uint256' }],
    name: 'burn',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'account', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'burnFrom',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', internalType: 'uint8', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'recipient', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'name',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', internalType: 'string', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
  },
  { type: 'error', inputs: [], name: 'BridgeCannotBeZeroAddress' },
  { type: 'error', inputs: [], name: 'BurningTokensDisallowedForUsers' },
  {
    type: 'error',
    inputs: [
      { name: 'invalidCaller', internalType: 'address', type: 'address' },
    ],
    name: 'CallerIsNotBridge',
  },
  {
    type: 'error',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'allowance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientAllowance',
  },
  {
    type: 'error',
    inputs: [
      { name: 'sender', internalType: 'address', type: 'address' },
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'ERC20InsufficientBalance',
  },
  {
    type: 'error',
    inputs: [{ name: 'approver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidApprover',
  },
  {
    type: 'error',
    inputs: [{ name: 'receiver', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidReceiver',
  },
  {
    type: 'error',
    inputs: [{ name: 'sender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSender',
  },
  {
    type: 'error',
    inputs: [{ name: 'spender', internalType: 'address', type: 'address' }],
    name: 'ERC20InvalidSpender',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__
 */
export const useReadCollateralTokenBridge = /*#__PURE__*/ createUseReadContract(
  { abi: collateralTokenBridgeAbi },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"DESTINATION_CHAIN_ID"`
 */
export const useReadCollateralTokenBridgeDestinationChainId =
  /*#__PURE__*/ createUseReadContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'DESTINATION_CHAIN_ID',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"TOKEN"`
 */
export const useReadCollateralTokenBridgeToken =
  /*#__PURE__*/ createUseReadContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'TOKEN',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"nonces"`
 */
export const useReadCollateralTokenBridgeNonces =
  /*#__PURE__*/ createUseReadContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'nonces',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"owner"`
 */
export const useReadCollateralTokenBridgeOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"paused"`
 */
export const useReadCollateralTokenBridgePaused =
  /*#__PURE__*/ createUseReadContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'paused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const useReadCollateralTokenBridgePendingOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'pendingOwner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"processed"`
 */
export const useReadCollateralTokenBridgeProcessed =
  /*#__PURE__*/ createUseReadContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'processed',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"relayer"`
 */
export const useReadCollateralTokenBridgeRelayer =
  /*#__PURE__*/ createUseReadContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'relayer',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__
 */
export const useWriteCollateralTokenBridge =
  /*#__PURE__*/ createUseWriteContract({ abi: collateralTokenBridgeAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useWriteCollateralTokenBridgeAcceptOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"lock"`
 */
export const useWriteCollateralTokenBridgeLock =
  /*#__PURE__*/ createUseWriteContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'lock',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"pause"`
 */
export const useWriteCollateralTokenBridgePause =
  /*#__PURE__*/ createUseWriteContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteCollateralTokenBridgeRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"setRelayer"`
 */
export const useWriteCollateralTokenBridgeSetRelayer =
  /*#__PURE__*/ createUseWriteContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'setRelayer',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteCollateralTokenBridgeTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"unlock"`
 */
export const useWriteCollateralTokenBridgeUnlock =
  /*#__PURE__*/ createUseWriteContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'unlock',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"unpause"`
 */
export const useWriteCollateralTokenBridgeUnpause =
  /*#__PURE__*/ createUseWriteContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__
 */
export const useSimulateCollateralTokenBridge =
  /*#__PURE__*/ createUseSimulateContract({ abi: collateralTokenBridgeAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useSimulateCollateralTokenBridgeAcceptOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"lock"`
 */
export const useSimulateCollateralTokenBridgeLock =
  /*#__PURE__*/ createUseSimulateContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'lock',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"pause"`
 */
export const useSimulateCollateralTokenBridgePause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateCollateralTokenBridgeRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"setRelayer"`
 */
export const useSimulateCollateralTokenBridgeSetRelayer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'setRelayer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateCollateralTokenBridgeTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"unlock"`
 */
export const useSimulateCollateralTokenBridgeUnlock =
  /*#__PURE__*/ createUseSimulateContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'unlock',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `functionName` set to `"unpause"`
 */
export const useSimulateCollateralTokenBridgeUnpause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: collateralTokenBridgeAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link collateralTokenBridgeAbi}__
 */
export const useWatchCollateralTokenBridgeEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: collateralTokenBridgeAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `eventName` set to `"BridgeFinalized"`
 */
export const useWatchCollateralTokenBridgeBridgeFinalizedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: collateralTokenBridgeAbi,
    eventName: 'BridgeFinalized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `eventName` set to `"BridgeInitiated"`
 */
export const useWatchCollateralTokenBridgeBridgeInitiatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: collateralTokenBridgeAbi,
    eventName: 'BridgeInitiated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const useWatchCollateralTokenBridgeOwnershipTransferStartedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: collateralTokenBridgeAbi,
    eventName: 'OwnershipTransferStarted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchCollateralTokenBridgeOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: collateralTokenBridgeAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `eventName` set to `"Paused"`
 */
export const useWatchCollateralTokenBridgePausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: collateralTokenBridgeAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `eventName` set to `"RelayerUpdated"`
 */
export const useWatchCollateralTokenBridgeRelayerUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: collateralTokenBridgeAbi,
    eventName: 'RelayerUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link collateralTokenBridgeAbi}__ and `eventName` set to `"Unpaused"`
 */
export const useWatchCollateralTokenBridgeUnpausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: collateralTokenBridgeAbi,
    eventName: 'Unpaused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ierc20Abi}__
 */
export const useReadIerc20 = /*#__PURE__*/ createUseReadContract({
  abi: ierc20Abi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"allowance"`
 */
export const useReadIerc20Allowance = /*#__PURE__*/ createUseReadContract({
  abi: ierc20Abi,
  functionName: 'allowance',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadIerc20BalanceOf = /*#__PURE__*/ createUseReadContract({
  abi: ierc20Abi,
  functionName: 'balanceOf',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadIerc20TotalSupply = /*#__PURE__*/ createUseReadContract({
  abi: ierc20Abi,
  functionName: 'totalSupply',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link ierc20Abi}__
 */
export const useWriteIerc20 = /*#__PURE__*/ createUseWriteContract({
  abi: ierc20Abi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"approve"`
 */
export const useWriteIerc20Approve = /*#__PURE__*/ createUseWriteContract({
  abi: ierc20Abi,
  functionName: 'approve',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"transfer"`
 */
export const useWriteIerc20Transfer = /*#__PURE__*/ createUseWriteContract({
  abi: ierc20Abi,
  functionName: 'transfer',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteIerc20TransferFrom = /*#__PURE__*/ createUseWriteContract({
  abi: ierc20Abi,
  functionName: 'transferFrom',
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link ierc20Abi}__
 */
export const useSimulateIerc20 = /*#__PURE__*/ createUseSimulateContract({
  abi: ierc20Abi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"approve"`
 */
export const useSimulateIerc20Approve = /*#__PURE__*/ createUseSimulateContract(
  { abi: ierc20Abi, functionName: 'approve' },
)

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateIerc20Transfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: ierc20Abi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link ierc20Abi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateIerc20TransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: ierc20Abi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link ierc20Abi}__
 */
export const useWatchIerc20Event = /*#__PURE__*/ createUseWatchContractEvent({
  abi: ierc20Abi,
})

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link ierc20Abi}__ and `eventName` set to `"Approval"`
 */
export const useWatchIerc20ApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: ierc20Abi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link ierc20Abi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchIerc20TransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: ierc20Abi,
    eventName: 'Transfer',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__
 */
export const useReadSyntheticTokenBridge = /*#__PURE__*/ createUseReadContract({
  abi: syntheticTokenBridgeAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"CANONICAL_TOKEN"`
 */
export const useReadSyntheticTokenBridgeCanonicalToken =
  /*#__PURE__*/ createUseReadContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'CANONICAL_TOKEN',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"DESTINATION_CHAIN_ID"`
 */
export const useReadSyntheticTokenBridgeDestinationChainId =
  /*#__PURE__*/ createUseReadContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'DESTINATION_CHAIN_ID',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"nonces"`
 */
export const useReadSyntheticTokenBridgeNonces =
  /*#__PURE__*/ createUseReadContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'nonces',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"owner"`
 */
export const useReadSyntheticTokenBridgeOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'owner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"paused"`
 */
export const useReadSyntheticTokenBridgePaused =
  /*#__PURE__*/ createUseReadContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'paused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const useReadSyntheticTokenBridgePendingOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'pendingOwner',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"processed"`
 */
export const useReadSyntheticTokenBridgeProcessed =
  /*#__PURE__*/ createUseReadContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'processed',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"relayer"`
 */
export const useReadSyntheticTokenBridgeRelayer =
  /*#__PURE__*/ createUseReadContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'relayer',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"wrappedToken"`
 */
export const useReadSyntheticTokenBridgeWrappedToken =
  /*#__PURE__*/ createUseReadContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'wrappedToken',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__
 */
export const useWriteSyntheticTokenBridge =
  /*#__PURE__*/ createUseWriteContract({ abi: syntheticTokenBridgeAbi })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useWriteSyntheticTokenBridgeAcceptOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"burn"`
 */
export const useWriteSyntheticTokenBridgeBurn =
  /*#__PURE__*/ createUseWriteContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'burn',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"mint"`
 */
export const useWriteSyntheticTokenBridgeMint =
  /*#__PURE__*/ createUseWriteContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'mint',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"pause"`
 */
export const useWriteSyntheticTokenBridgePause =
  /*#__PURE__*/ createUseWriteContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteSyntheticTokenBridgeRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"setRelayer"`
 */
export const useWriteSyntheticTokenBridgeSetRelayer =
  /*#__PURE__*/ createUseWriteContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'setRelayer',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteSyntheticTokenBridgeTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"unpause"`
 */
export const useWriteSyntheticTokenBridgeUnpause =
  /*#__PURE__*/ createUseWriteContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__
 */
export const useSimulateSyntheticTokenBridge =
  /*#__PURE__*/ createUseSimulateContract({ abi: syntheticTokenBridgeAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useSimulateSyntheticTokenBridgeAcceptOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'acceptOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"burn"`
 */
export const useSimulateSyntheticTokenBridgeBurn =
  /*#__PURE__*/ createUseSimulateContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'burn',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"mint"`
 */
export const useSimulateSyntheticTokenBridgeMint =
  /*#__PURE__*/ createUseSimulateContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'mint',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"pause"`
 */
export const useSimulateSyntheticTokenBridgePause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'pause',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateSyntheticTokenBridgeRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'renounceOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"setRelayer"`
 */
export const useSimulateSyntheticTokenBridgeSetRelayer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'setRelayer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateSyntheticTokenBridgeTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'transferOwnership',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `functionName` set to `"unpause"`
 */
export const useSimulateSyntheticTokenBridgeUnpause =
  /*#__PURE__*/ createUseSimulateContract({
    abi: syntheticTokenBridgeAbi,
    functionName: 'unpause',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__
 */
export const useWatchSyntheticTokenBridgeEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: syntheticTokenBridgeAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `eventName` set to `"BridgeFinalized"`
 */
export const useWatchSyntheticTokenBridgeBridgeFinalizedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: syntheticTokenBridgeAbi,
    eventName: 'BridgeFinalized',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `eventName` set to `"BridgeInitiated"`
 */
export const useWatchSyntheticTokenBridgeBridgeInitiatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: syntheticTokenBridgeAbi,
    eventName: 'BridgeInitiated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const useWatchSyntheticTokenBridgeOwnershipTransferStartedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: syntheticTokenBridgeAbi,
    eventName: 'OwnershipTransferStarted',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchSyntheticTokenBridgeOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: syntheticTokenBridgeAbi,
    eventName: 'OwnershipTransferred',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `eventName` set to `"Paused"`
 */
export const useWatchSyntheticTokenBridgePausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: syntheticTokenBridgeAbi,
    eventName: 'Paused',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `eventName` set to `"RelayerUpdated"`
 */
export const useWatchSyntheticTokenBridgeRelayerUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: syntheticTokenBridgeAbi,
    eventName: 'RelayerUpdated',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link syntheticTokenBridgeAbi}__ and `eventName` set to `"Unpaused"`
 */
export const useWatchSyntheticTokenBridgeUnpausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: syntheticTokenBridgeAbi,
    eventName: 'Unpaused',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wrappedTokenAbi}__
 */
export const useReadWrappedToken = /*#__PURE__*/ createUseReadContract({
  abi: wrappedTokenAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"BRIDGE"`
 */
export const useReadWrappedTokenBridge = /*#__PURE__*/ createUseReadContract({
  abi: wrappedTokenAbi,
  functionName: 'BRIDGE',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadWrappedTokenAllowance = /*#__PURE__*/ createUseReadContract(
  { abi: wrappedTokenAbi, functionName: 'allowance' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadWrappedTokenBalanceOf = /*#__PURE__*/ createUseReadContract(
  { abi: wrappedTokenAbi, functionName: 'balanceOf' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadWrappedTokenDecimals = /*#__PURE__*/ createUseReadContract({
  abi: wrappedTokenAbi,
  functionName: 'decimals',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"name"`
 */
export const useReadWrappedTokenName = /*#__PURE__*/ createUseReadContract({
  abi: wrappedTokenAbi,
  functionName: 'name',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadWrappedTokenSymbol = /*#__PURE__*/ createUseReadContract({
  abi: wrappedTokenAbi,
  functionName: 'symbol',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadWrappedTokenTotalSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: wrappedTokenAbi,
    functionName: 'totalSupply',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wrappedTokenAbi}__
 */
export const useWriteWrappedToken = /*#__PURE__*/ createUseWriteContract({
  abi: wrappedTokenAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteWrappedTokenApprove = /*#__PURE__*/ createUseWriteContract(
  { abi: wrappedTokenAbi, functionName: 'approve' },
)

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"burn"`
 */
export const useWriteWrappedTokenBurn = /*#__PURE__*/ createUseWriteContract({
  abi: wrappedTokenAbi,
  functionName: 'burn',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"burnFrom"`
 */
export const useWriteWrappedTokenBurnFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: wrappedTokenAbi,
    functionName: 'burnFrom',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"mint"`
 */
export const useWriteWrappedTokenMint = /*#__PURE__*/ createUseWriteContract({
  abi: wrappedTokenAbi,
  functionName: 'mint',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteWrappedTokenTransfer =
  /*#__PURE__*/ createUseWriteContract({
    abi: wrappedTokenAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteWrappedTokenTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: wrappedTokenAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wrappedTokenAbi}__
 */
export const useSimulateWrappedToken = /*#__PURE__*/ createUseSimulateContract({
  abi: wrappedTokenAbi,
})

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateWrappedTokenApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wrappedTokenAbi,
    functionName: 'approve',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"burn"`
 */
export const useSimulateWrappedTokenBurn =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wrappedTokenAbi,
    functionName: 'burn',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"burnFrom"`
 */
export const useSimulateWrappedTokenBurnFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wrappedTokenAbi,
    functionName: 'burnFrom',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"mint"`
 */
export const useSimulateWrappedTokenMint =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wrappedTokenAbi,
    functionName: 'mint',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateWrappedTokenTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wrappedTokenAbi,
    functionName: 'transfer',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link wrappedTokenAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateWrappedTokenTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: wrappedTokenAbi,
    functionName: 'transferFrom',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wrappedTokenAbi}__
 */
export const useWatchWrappedTokenEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: wrappedTokenAbi })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wrappedTokenAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchWrappedTokenApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wrappedTokenAbi,
    eventName: 'Approval',
  })

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link wrappedTokenAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchWrappedTokenTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: wrappedTokenAbi,
    eventName: 'Transfer',
  })
