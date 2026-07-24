// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

/// @dev Throws when the caller is not the designated relayer.
/// @param invalidAddress The address that attempted the unauthorized relayer operation.
error NotRelayer(address invalidAddress);

/// @dev Throws when invalid recipient or amount is supplied to bridge transaction.
/// @param invalidRecipient The supplied recipient address.
/// @param invalidAmount The supplied transfer amount.
error InvalidBridgeTxInputs(address invalidRecipient, uint256 invalidAmount);

/// @dev Throws when a bridge message with an already processed messageId is submitted again.
/// @param messageId The ID of the message already processed.
error BridgeMessageAlreadyProcessed(bytes32 messageId);

/// @dev Throws when the provided destination chain ID does not match the expected chain ID.
/// @param expectedChainId The correct/expected chain id.
/// @param receivedChainId The chain id actually received.
error InvalidDestinationChainId(
    uint256 expectedChainId,
    uint256 receivedChainId
);

/// @dev Throws if someone attempts to set the relayer to the zero address.
error RelayerCannotBeZeroAddress();

/// @dev Throws if someone attempts to set the ERC20 token address to zero.
error TokenCannotBeZeroAddress();

/// @dev Throws when a non-bridge contract attempts to call a bridge-restricted function.
/// @param invalidCaller The address that attempted the unauthorized call.
error CallerIsNotBridge(address invalidCaller);

/// @dev Throws if someone attempts to set the bridge contract address to zero.
error BridgeCannotBeZeroAddress();

/// @dev Throws when users attempt to burn tokens directly, which is not allowed.
error BurningTokensDisallowedForUsers();
