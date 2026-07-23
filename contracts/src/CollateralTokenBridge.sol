// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import {BridgeBase} from "./BridgeBase.sol";

contract CollateralTokenBridge is BridgeBase {
    using SafeERC20 for IERC20;

    IERC20 public immutable TOKEN;
    uint256 public immutable DESTINATION_CHAIN_ID;

    constructor(address owner_, IERC20 token_, uint256 destinationChainId_) BridgeBase(owner_) {
        if (address(token_) == address(0)) revert InvalidToken();
        TOKEN = token_;
        DESTINATION_CHAIN_ID = destinationChainId_;
    }

    /// @notice Locks canonical TOKEN and emits a Base-to-Arbitrum bridge message.
    function lock(address recipient, uint256 amount) external whenNotPaused {
        _validateInitiation(recipient, amount);

        uint256 nonce = nonces[msg.sender]++;
        BridgeMessage memory message = BridgeMessage({
            originChainId: block.chainid,
            destinationChainId: DESTINATION_CHAIN_ID,
            token: address(TOKEN),
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            nonce: nonce
        });
        bytes32 id = messageId(message);

        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        emit BridgeInitiated(id, msg.sender, recipient, amount, nonce, block.chainid, DESTINATION_CHAIN_ID);
    }

    /// @notice Unlocks canonical TOKEN after a destination-chain burn.
    function unlock(BridgeMessage calldata message) external onlyRelayer whenNotPaused {
        bytes32 id = _consumeMessage(message);

        TOKEN.safeTransfer(message.recipient, message.amount);
        emit BridgeFinalized(id, message.recipient, message.amount);
    }
}
