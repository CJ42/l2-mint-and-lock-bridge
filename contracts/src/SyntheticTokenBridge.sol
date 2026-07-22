// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BridgeBase} from "./BridgeBase.sol";
import {WrappedUSDC} from "./WrappedUSDC.sol";

contract SyntheticTokenBridge is BridgeBase {
    WrappedUSDC public immutable wusdc;
    address public immutable canonicalToken;
    uint256 public immutable destinationChainId;

    constructor(WrappedUSDC wusdc_, address canonicalToken_, uint256 destinationChainId_) {
        if (address(wusdc_) == address(0) || canonicalToken_ == address(0)) revert InvalidToken();
        wusdc = wusdc_;
        canonicalToken = canonicalToken_;
        destinationChainId = destinationChainId_;
    }

    /// @notice Mints wrapped USDC after a canonical USDC lock.
    function mint(BridgeMessage calldata message) external onlyRelayer whenNotPaused {
        bytes32 id = _consumeMessage(message);

        wusdc.mint(message.recipient, message.amount);
        emit BridgeFinalized(id, message.recipient, message.amount);
    }

    /// @notice Burns approved wrapped USDC and emits an Arbitrum-to-Base bridge message.
    function burn(address recipient, uint256 amount) external whenNotPaused {
        _validateInitiation(recipient, amount);

        uint256 nonce = nonces[msg.sender]++;
        BridgeMessage memory message = BridgeMessage({
            originChainId: block.chainid,
            destinationChainId: destinationChainId,
            token: canonicalToken,
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            nonce: nonce
        });
        bytes32 id = messageId(message);

        wusdc.burnFrom(msg.sender, amount);
        emit BridgeInitiated(id, msg.sender, recipient, amount, nonce, block.chainid, destinationChainId);
    }
}
