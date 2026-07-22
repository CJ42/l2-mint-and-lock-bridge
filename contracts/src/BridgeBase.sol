// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Ownable2Step} from "openzeppelin-contracts/contracts/access/Ownable2Step.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

abstract contract BridgeBase is Ownable2Step, Pausable {
    struct BridgeMessage {
        uint256 originChainId;
        uint256 destinationChainId;
        address token;
        address sender;
        address recipient;
        uint256 amount;
        uint256 nonce;
    }

    error InvalidRelayer();
    error NotRelayer();
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidToken();
    error InvalidDestinationChain();
    error MessageAlreadyProcessed();

    event BridgeInitiated(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 nonce,
        uint256 originChainId,
        uint256 destinationChainId
    );
    event BridgeFinalized(bytes32 indexed messageId, address indexed recipient, uint256 amount);
    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);

    address public relayer;
    mapping(address sender => uint256 nonce) public nonces;
    mapping(bytes32 messageId_ => bool isProcessed) public processed;

    constructor() Ownable(msg.sender) {}

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    /// @notice Computes the canonical identifier for a bridge message.
    function messageId(BridgeMessage memory message) public pure returns (bytes32) {
        return keccak256(
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

    /// @notice Updates the trusted relayer account.
    function setRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert InvalidRelayer();

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

    function _validateInitiation(address recipient, uint256 amount) internal pure {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
    }

    function _consumeMessage(BridgeMessage calldata message) internal returns (bytes32 id) {
        if (message.destinationChainId != block.chainid) revert InvalidDestinationChain();

        id = messageId(message);
        if (processed[id]) revert MessageAlreadyProcessed();

        // TODO(signature-verification): Production finalization would verify an EIP-712
        // signature over id against a rotatable relayer key set or n-of-m attestation.
        // The current trust model authenticates only msg.sender through onlyRelayer.
        processed[id] = true;
    }
}
