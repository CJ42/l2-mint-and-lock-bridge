// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

import {BridgeBase} from "../src/BridgeBase.sol";
import {TestSetup} from "./TestSetup.sol";

contract BridgeUnitTest is TestSetup {
    event BridgeInitiated(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 nonce,
        uint256 originChainId,
        uint256 destinationChainId
    );
    event BridgeFinalized(
        bytes32 indexed messageId,
        address indexed recipient,
        uint256 amount
    );

    function testMessageIdSeparatesChainPairs() public view {
        BridgeBase.BridgeMessage memory first = baseToArbitrumMessage(0);
        BridgeBase.BridgeMessage memory second = baseToArbitrumMessage(0);
        second.originChainId = ARBITRUM_CHAIN_ID;
        second.destinationChainId = BASE_CHAIN_ID;

        assertNotEq(
            collateralBridge.messageId(first),
            collateralBridge.messageId(second)
        );
    }

    function testMessageIdSeparatesNonces() public view {
        BridgeBase.BridgeMessage memory first = baseToArbitrumMessage(0);
        BridgeBase.BridgeMessage memory second = baseToArbitrumMessage(0);
        second.nonce = 1;

        assertNotEq(
            collateralBridge.messageId(first),
            collateralBridge.messageId(second)
        );
    }

    function testMessageIdUsesCanonicalAbiEncoding() public view {
        BridgeBase.BridgeMessage memory message = baseToArbitrumMessage(7);
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

        assertEq(collateralBridge.messageId(message), expected);
    }

    function testLockPullsUsdcIncrementsNonceAndEmitsExactMessage() public {
        vm.chainId(BASE_CHAIN_ID);
        vm.startPrank(user);
        usdc.approve(address(collateralBridge), AMOUNT);

        BridgeBase.BridgeMessage memory message = baseToArbitrumMessage(0);
        bytes32 id = collateralBridge.messageId(message);
        vm.expectEmit(true, true, true, true);
        emit BridgeInitiated(
            id,
            user,
            recipient,
            AMOUNT,
            0,
            BASE_CHAIN_ID,
            ARBITRUM_CHAIN_ID
        );
        collateralBridge.lock(recipient, AMOUNT);
        vm.stopPrank();

        assertEq(collateralBridge.nonces(user), 1);
        assertEq(usdc.balanceOf(address(collateralBridge)), 110e6);
        assertEq(usdc.balanceOf(user), 90e6);
    }

    function testMintAndBurnRoundTrip() public {
        vm.chainId(ARBITRUM_CHAIN_ID);
        BridgeBase.BridgeMessage memory message = baseToArbitrumMessage(0);
        bytes32 id = syntheticBridge.messageId(message);

        vm.expectEmit(true, true, false, true);
        emit BridgeFinalized(id, recipient, AMOUNT);
        vm.prank(relayer);
        syntheticBridge.mint(message);
        assertEq(wusdc.balanceOf(recipient), AMOUNT);

        vm.startPrank(recipient);
        wusdc.approve(address(syntheticBridge), AMOUNT);
        BridgeBase.BridgeMessage memory burnMessage = BridgeBase.BridgeMessage({
            originChainId: ARBITRUM_CHAIN_ID,
            destinationChainId: BASE_CHAIN_ID,
            token: address(usdc),
            sender: recipient,
            recipient: user,
            amount: AMOUNT,
            nonce: 0
        });
        bytes32 burnId = syntheticBridge.messageId(burnMessage);
        vm.expectEmit(true, true, true, true);
        emit BridgeInitiated(
            burnId,
            recipient,
            user,
            AMOUNT,
            0,
            ARBITRUM_CHAIN_ID,
            BASE_CHAIN_ID
        );
        syntheticBridge.burn(user, AMOUNT);
        vm.stopPrank();

        assertEq(wusdc.totalSupply(), 0);
        assertEq(syntheticBridge.nonces(recipient), 1);
    }

    function testUnlockTransfersCollateral() public {
        vm.chainId(BASE_CHAIN_ID);
        BridgeBase.BridgeMessage memory message = arbitrumToBaseMessage(0);

        vm.prank(relayer);
        collateralBridge.unlock(message);

        assertEq(usdc.balanceOf(recipient), AMOUNT);
    }

    function testOnlyRelayerCanFinalize() public {
        vm.chainId(ARBITRUM_CHAIN_ID);
        vm.expectRevert(BridgeBase.NotRelayer.selector);
        syntheticBridge.mint(baseToArbitrumMessage(0));
    }

    function testPauseGatesEveryEntrypoint() public {
        vm.prank(bridgeAdmin);
        collateralBridge.pause();
        vm.chainId(BASE_CHAIN_ID);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(user);
        collateralBridge.lock(recipient, AMOUNT);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(relayer);
        collateralBridge.unlock(arbitrumToBaseMessage(0));

        vm.prank(bridgeAdmin);
        syntheticBridge.pause();
        vm.chainId(ARBITRUM_CHAIN_ID);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(user);
        syntheticBridge.burn(recipient, AMOUNT);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(relayer);
        syntheticBridge.mint(baseToArbitrumMessage(0));
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
        vm.expectRevert(BridgeBase.InvalidAmount.selector);
        collateralBridge.lock(recipient, 0);
        vm.expectRevert(BridgeBase.InvalidRecipient.selector);
        collateralBridge.lock(address(0), AMOUNT);
        vm.stopPrank();
    }
}
