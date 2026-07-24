// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

struct BridgeMessage {
    uint256 originChainId;
    uint256 destinationChainId;
    address token;
    address sender;
    address recipient;
    uint256 amount;
    uint256 nonce;
}
