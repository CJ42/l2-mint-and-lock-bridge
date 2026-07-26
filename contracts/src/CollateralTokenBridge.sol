// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

// globals
import "./Errors.sol" as Errors;
import "./Types.sol" as Types;
import "./BridgeLib.sol" as BridgeLib;

// interfaces
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

// modules
import {BridgeBase} from "./BridgeBase.sol";
import {ReentrancyGuardTransient} from "openzeppelin-contracts/contracts/utils/ReentrancyGuardTransient.sol";

// libraries
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

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
//             []    ==============================     []
//             []    | L2 Collateral Token Bridge |     []
//             []    ==============================     []
//
contract CollateralTokenBridge is BridgeBase, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    IERC20 public immutable TOKEN;
    uint256 public immutable DESTINATION_CHAIN_ID;

    constructor(
        address owner_,
        IERC20 token_,
        uint256 destinationChainId_
    ) BridgeBase(owner_) {
        require(
            address(token_) != address(0),
            Errors.TokenCannotBeZeroAddress()
        );
        TOKEN = token_;
        DESTINATION_CHAIN_ID = destinationChainId_;
    }

    /// @notice Locks canonical TOKEN and emits a bridge message.
    function bridgeTx(
        address recipient,
        uint256 amount
    ) external whenNotPaused nonReentrant {
        _validateInputs(recipient, amount);

        uint256 nonce = nonces[msg.sender]++;
        Types.BridgeMessage memory message = Types.BridgeMessage({
            originChainId: block.chainid,
            destinationChainId: DESTINATION_CHAIN_ID,
            token: address(TOKEN),
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            nonce: nonce
        });
        bytes32 messageId = message.computeBridgeMessageId();

        // events are state changing operations and must be emitted before any external calls
        emit BridgeTxInitiated({
            messageId: messageId,
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            nonce: nonce,
            originChainId: block.chainid,
            destinationChainId: DESTINATION_CHAIN_ID
        });

        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Finalizes a bridge transaction by unlocking canonical TOKEN.
    function finalizeBridgeTx(
        Types.BridgeMessage calldata message
    ) external onlyRelayer whenNotPaused nonReentrant {
        bytes32 messageId = _consumeMessage(message);

        emit BridgeTxFinalized(messageId, message.recipient, message.amount);
        TOKEN.safeTransfer(message.recipient, message.amount);
    }
}
