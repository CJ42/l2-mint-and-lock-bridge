// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

error NotRelayer(address invalidAddress);

error InvalidBridgeTxInputs(address invalidRecipient, uint256 invalidAmount);

error BridgeMessageAlreadyProcessed(bytes32 messageId);

error InvalidDestinationChainId(
    uint256 expectedChainId,
    uint256 receivedChainId
);

error RelayerCannotBeZeroAddress();

error TokenCannotBeZeroAddress();
