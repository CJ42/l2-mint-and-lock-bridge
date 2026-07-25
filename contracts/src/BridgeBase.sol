// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

// globals
import "./Types.sol" as Types;
import "./Errors.sol" as Errors;
import "./BridgeLib.sol" as BridgeLib;

// interfaces
import {IBridge} from "./IBridge.sol";

// modules
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Ownable2Step} from "openzeppelin-contracts/contracts/access/Ownable2Step.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

using {BridgeLib.computeBridgeMessageId} for Types.BridgeMessage;

abstract contract BridgeBase is IBridge, Ownable2Step, Pausable {
    address public relayer;
    mapping(address sender => uint256 nonce) public nonces;
    mapping(bytes32 messageId_ => bool isProcessed) public processed;

    constructor(address owner_) Ownable(owner_) {}

    modifier onlyRelayer() {
        require(msg.sender == relayer, Errors.NotRelayer({invalidAddress: msg.sender}));
        _;
    }

    /// @notice Updates the trusted relayer account.
    function setRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), Errors.RelayerCannotBeZeroAddress());

        address previousRelayer = relayer;
        relayer = newRelayer;
        emit RelayerUpdated(previousRelayer, newRelayer);
    }

    /// @notice Pauses user and relayer state-changing entrypoints.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes user and relayer state-changing entrypoints.
    function unpause() external onlyOwner {
        _unpause();
    }

    function _validateInputs(address recipient, uint256 amount) internal pure {
        require(
            recipient != address(0) && amount != 0,
            Errors.InvalidBridgeTxInputs({invalidRecipient: recipient, invalidAmount: amount})
        );
    }

    function _consumeMessage(Types.BridgeMessage calldata message) internal returns (bytes32 messageId) {
        require(
            message.destinationChainId == block.chainid,
            Errors.InvalidDestinationChainId({
                expectedChainId: block.chainid, receivedChainId: message.destinationChainId
            })
        );

        messageId = message.computeBridgeMessageId();
        require(!processed[messageId], Errors.BridgeMessageAlreadyProcessed(messageId));

        // TODO(signature-verification): Production finalization would verify an EIP-712
        // signature over id against a rotatable relayer key set or n-of-m attestation.
        // The current trust model authenticates only msg.sender through onlyRelayer.
        processed[messageId] = true;
    }
}
