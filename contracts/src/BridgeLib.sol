// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

// globals
import "./Types.sol" as Types;

/// @notice Computes the canonical identifier for a bridge message.
function computeBridgeMessageId(
    Types.BridgeMessage memory message
) pure returns (bytes32) {
    return
        keccak256(
            abi.encode(
                message.originChainId,
                message.destinationChainId,
                message.token,
                message.sender,
                message.recipient,
                message.amount,
                message.nonce
            )
        );
}
