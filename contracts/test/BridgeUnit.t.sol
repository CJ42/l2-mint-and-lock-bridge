// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// globals
import "../src/Types.sol" as Types;
import "../src/Errors.sol" as Errors;
import "../src/BridgeLib.sol" as BridgeLib;

using {BridgeLib.computeBridgeMessageId} for Types.BridgeMessage;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

import {IBridge} from "../src/IBridge.sol";
import {BridgeBase} from "../src/BridgeBase.sol";
import {TestSetup} from "./TestSetup.sol";

contract BridgeUnitTest is TestSetup {
    function testComputeBridgeMessageIdSeparatesChainPairs() public view {
        Types.BridgeMessage memory firstMessage = baseToArbitrumMessage(0);
        Types.BridgeMessage memory secondMessage = baseToArbitrumMessage(0);
        secondMessage.originChainId = ARBITRUM_CHAIN_ID;
        secondMessage.destinationChainId = BASE_CHAIN_ID;

        assertNotEq(
            firstMessage.computeBridgeMessageId(),
            secondMessage.computeBridgeMessageId()
        );
    }

    function testComputeBridgeMessageIdSeparatesNonces() public view {
        Types.BridgeMessage memory firstMessage = baseToArbitrumMessage(0);
        Types.BridgeMessage memory secondMessage = baseToArbitrumMessage(0);
        secondMessage.nonce = 1;

        assertNotEq(
            firstMessage.computeBridgeMessageId(),
            secondMessage.computeBridgeMessageId()
        );
    }

    function testComputeBridgeMessageIdUsesCanonicalAbiEncoding() public view {
        Types.BridgeMessage memory message = baseToArbitrumMessage(7);
        bytes32 expected = keccak256(
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

        assertEq(message.computeBridgeMessageId(), expected);
    }

    function testBridgeTxPullsUsdcIncrementsNonceAndEmitsExactMessage() public {
        vm.chainId(BASE_CHAIN_ID);
        vm.startPrank(user);
        usdc.approve(address(collateralBridge), AMOUNT);

        Types.BridgeMessage memory message = baseToArbitrumMessage(0);
        bytes32 id = message.computeBridgeMessageId();
        vm.expectEmit(true, true, true, true);
        emit IBridge.BridgeTxInitiated(
            id,
            user,
            recipient,
            AMOUNT,
            0,
            BASE_CHAIN_ID,
            ARBITRUM_CHAIN_ID
        );
        collateralBridge.bridgeTx(recipient, AMOUNT);
        vm.stopPrank();

        assertEq(collateralBridge.nonces(user), 1);
        assertEq(usdc.balanceOf(address(collateralBridge)), 110e6);
        assertEq(usdc.balanceOf(user), 90e6);
    }

    function testFinalizeAndBridgeTxRoundTrip() public {
        vm.chainId(ARBITRUM_CHAIN_ID);
        Types.BridgeMessage memory message = baseToArbitrumMessage(0);
        bytes32 id = message.computeBridgeMessageId();

        vm.expectEmit(true, true, false, true);
        emit IBridge.BridgeTxFinalized(id, recipient, AMOUNT);
        vm.prank(relayer);
        syntheticBridge.finalizeBridgeTx(message);
        assertEq(wusdc.balanceOf(recipient), AMOUNT);

        vm.startPrank(recipient);
        wusdc.approve(address(syntheticBridge), AMOUNT);
        Types.BridgeMessage memory burnMessage = Types.BridgeMessage({
            originChainId: ARBITRUM_CHAIN_ID,
            destinationChainId: BASE_CHAIN_ID,
            token: address(usdc),
            sender: recipient,
            recipient: user,
            amount: AMOUNT,
            nonce: 0
        });
        bytes32 burnId = burnMessage.computeBridgeMessageId();
        vm.expectEmit(true, true, true, true);
        emit IBridge.BridgeTxInitiated(
            burnId,
            recipient,
            user,
            AMOUNT,
            0,
            ARBITRUM_CHAIN_ID,
            BASE_CHAIN_ID
        );
        syntheticBridge.bridgeTx(user, AMOUNT);
        vm.stopPrank();

        assertEq(wusdc.totalSupply(), 0);
        assertEq(syntheticBridge.nonces(recipient), 1);
    }

    function testFinalizeBridgeTxUnlocksAndTransfersCollateral() public {
        vm.chainId(BASE_CHAIN_ID);
        Types.BridgeMessage memory message = arbitrumToBaseMessage(0);

        vm.prank(relayer);
        collateralBridge.finalizeBridgeTx(message);

        assertEq(usdc.balanceOf(recipient), AMOUNT);
    }

    function testOnlyRelayerCanFinalize(address notRelayer) public {
        vm.assume(notRelayer != relayer);

        vm.chainId(ARBITRUM_CHAIN_ID);
        vm.expectRevert(
            abi.encodeWithSelector(Errors.NotRelayer.selector, notRelayer)
        );
        vm.prank(notRelayer);
        syntheticBridge.finalizeBridgeTx(baseToArbitrumMessage(0));
    }

    function testPauseGatesEveryEntrypoint() public {
        vm.prank(bridgeAdmin);
        collateralBridge.pause();
        vm.chainId(BASE_CHAIN_ID);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(user);
        collateralBridge.bridgeTx(recipient, AMOUNT);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(relayer);
        collateralBridge.finalizeBridgeTx(arbitrumToBaseMessage(0));

        vm.prank(bridgeAdmin);
        syntheticBridge.pause();
        vm.chainId(ARBITRUM_CHAIN_ID);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(user);
        syntheticBridge.bridgeTx(recipient, AMOUNT);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(relayer);
        syntheticBridge.finalizeBridgeTx(baseToArbitrumMessage(0));
    }

    function testRelayerRotationAndOwnershipHandover() public {
        vm.prank(bridgeAdmin);
        address nextOwner = makeAddr("nextOwner");
        address nextRelayer = makeAddr("nextRelayer");

        collateralBridge.transferOwnership(nextOwner);
        vm.prank(nextOwner);
        collateralBridge.acceptOwnership();
        vm.prank(nextOwner);
        collateralBridge.setRelayer(nextRelayer);

        assertEq(collateralBridge.owner(), nextOwner);
        assertEq(collateralBridge.relayer(), nextRelayer);

        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                address(this)
            )
        );
        collateralBridge.pause();
    }

    function testRejectsInvalidInitiationInputs() public {
        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidBridgeTxInputs.selector,
                recipient,
                0
            )
        );
        collateralBridge.bridgeTx(recipient, 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidBridgeTxInputs.selector,
                address(0),
                AMOUNT
            )
        );
        collateralBridge.bridgeTx(address(0), AMOUNT);
        vm.stopPrank();
    }
}
