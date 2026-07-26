// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

// globals
import "./Errors.sol" as Errors;
import "./Types.sol" as Types;
import "./BridgeLib.sol" as BridgeLib;

// modules
import {BridgeBase} from "./BridgeBase.sol";
import {WrappedToken} from "./WrappedToken.sol";
import {ReentrancyGuardTransient} from "openzeppelin-contracts/contracts/utils/ReentrancyGuardTransient.sol";

// libraries
using {BridgeLib.computeBridgeMessageId} for Types.BridgeMessage;

//             ..                                       ..
//             []                                       []
//           .:[]:_                                   ,:[]:.
//         .: :[]: :-.                             ,-: :[]: :.
//       .: : :[]: : :`._                       ,.': : :[]: : :.
//     .: : : :[]: : : : :-._               _,-: : : : :[]: : : :.
// _..: : : : :[]: : : : : : :-._________.-: : : : : : :[]: : : : :-._
// _:_:_:_:_:_:[]:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:[]:_:_:_:_:_:_
// !!!!!!!!!!!![]!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!![]!!!!!!!!!!!!!
// ^^^^^^^^^^^^[]^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^[]^^^^^^^^^^^^^
//             []     =============================     []
//             []     | L2 Synthetic Token Bridge |     []
//             []     =============================     []
//
contract SyntheticTokenBridge is BridgeBase, ReentrancyGuardTransient {
    WrappedToken public immutable wrappedToken;
    address public immutable CANONICAL_TOKEN;
    uint256 public immutable DESTINATION_CHAIN_ID;

    constructor(
        address owner_,
        WrappedToken wrappedToken_,
        address canonicalToken_,
        uint256 destinationChainId_
    ) BridgeBase(owner_) {
        require(
            address(wrappedToken_) != address(0) &&
                canonicalToken_ != address(0),
            Errors.TokenCannotBeZeroAddress()
        );
        wrappedToken = wrappedToken_;
        CANONICAL_TOKEN = canonicalToken_;
        DESTINATION_CHAIN_ID = destinationChainId_;
    }

    /// @notice Finalizes a bridge transaction by minting wrapped USDC.
    function finalizeBridgeTx(
        Types.BridgeMessage calldata message
    ) external onlyRelayer whenNotPaused nonReentrant {
        bytes32 id = _consumeMessage(message);

        wrappedToken.mint(message.recipient, message.amount);
        emit BridgeTxFinalized(id, message.recipient, message.amount);
    }

    /// @notice Burns approved wrapped USDC and emits an Arbitrum-to-Base bridge message.
    function bridgeTx(
        address recipient,
        uint256 amount
    ) external whenNotPaused nonReentrant {
        _validateInputs(recipient, amount);

        uint256 nonce = nonces[msg.sender]++;
        Types.BridgeMessage memory message = Types.BridgeMessage({
            originChainId: block.chainid,
            destinationChainId: DESTINATION_CHAIN_ID,
            token: CANONICAL_TOKEN,
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            nonce: nonce
        });
        bytes32 messageId = message.computeBridgeMessageId();

        emit BridgeTxInitiated({
            messageId: messageId,
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            nonce: nonce,
            originChainId: block.chainid,
            destinationChainId: DESTINATION_CHAIN_ID
        });

        wrappedToken.burnFrom(msg.sender, amount);
    }
}
