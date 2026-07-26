// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

interface IBridge {
    event BridgeTxInitiated(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 nonce,
        uint256 originChainId,
        uint256 destinationChainId
    );
    event BridgeTxFinalized(
        bytes32 indexed messageId,
        address indexed recipient,
        uint256 amount
    );
    event RelayerUpdated(
        address indexed previousRelayer,
        address indexed newRelayer
    );
}
