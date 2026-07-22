// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import {BridgeBase} from "./BridgeBase.sol";

contract CollateralTokenBridge is BridgeBase {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    uint256 public immutable destinationChainId;

    constructor(IERC20 usdc_, uint256 destinationChainId_) {
        if (address(usdc_) == address(0)) revert InvalidToken();
        usdc = usdc_;
        destinationChainId = destinationChainId_;
    }

    /// @notice Locks canonical USDC and emits a Base-to-Arbitrum bridge message.
    function lock(address recipient, uint256 amount) external whenNotPaused {
        _validateInitiation(recipient, amount);

        uint256 nonce = nonces[msg.sender]++;
        BridgeMessage memory message = BridgeMessage({
            originChainId: block.chainid,
            destinationChainId: destinationChainId,
            token: address(usdc),
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            nonce: nonce
        });
        bytes32 id = messageId(message);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit BridgeInitiated(id, msg.sender, recipient, amount, nonce, block.chainid, destinationChainId);
    }

    /// @notice Unlocks canonical USDC after a destination-chain burn.
    function unlock(BridgeMessage calldata message) external onlyRelayer whenNotPaused {
        bytes32 id = _consumeMessage(message);

        usdc.safeTransfer(message.recipient, message.amount);
        emit BridgeFinalized(id, message.recipient, message.amount);
    }
}
