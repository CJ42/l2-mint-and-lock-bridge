// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BridgeBase} from "./BridgeBase.sol";
import {WrappedToken} from "./WrappedToken.sol";

contract SyntheticTokenBridge is BridgeBase {
    WrappedToken public immutable wrappedToken;
    address public immutable CANONICAL_TOKEN;
    uint256 public immutable DESTINATION_CHAIN_ID;

    constructor(WrappedToken wrappedToken_, address canonicalToken_, uint256 destinationChainId_) {
        if (address(wrappedToken_) == address(0) || canonicalToken_ == address(0)) revert InvalidToken();
        wrappedToken = wrappedToken_;
        CANONICAL_TOKEN = canonicalToken_;
        DESTINATION_CHAIN_ID = destinationChainId_;
    }x

    /// @notice Mints wrapped USDC after a canonical USDC lock.
    function mint(BridgeMessage calldata message) external onlyRelayer whenNotPaused {
        bytes32 id = _consumeMessage(message);

        wrappedToken.mint(message.recipient, message.amount);
        emit BridgeFinalized(id, message.recipient, message.amount);
    }

    /// @notice Burns approved wrapped USDC and emits an Arbitrum-to-Base bridge message.
    function burn(address recipient, uint256 amount) external whenNotPaused {
        _validateInitiation(recipient, amount);

        uint256 nonce = nonces[msg.sender]++;
        BridgeMessage memory message = BridgeMessage({
            originChainId: block.chainid,
            destinationChainId: DESTINATION_CHAIN_ID,
            token: CANONICAL_TOKEN,
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            nonce: nonce
        });
        bytes32 id = messageId(message);

        wrappedToken.burnFrom(msg.sender, amount);
        emit BridgeInitiated(id, msg.sender, recipient, amount, nonce, block.chainid, destinationChainId);
    }
}
