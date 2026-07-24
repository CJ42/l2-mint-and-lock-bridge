// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BridgeBase} from "../src/BridgeBase.sol";
import {TestSetup} from "./TestSetup.sol";

import "../src/Errors.sol" as Errors;

contract ReplayTest is TestSetup {
    function testMintRejectsReplay() public {
        vm.chainId(ARBITRUM_CHAIN_ID);
        BridgeBase.BridgeMessage memory message = baseToArbitrumMessage(0);
        bytes32 id = syntheticBridge.messageId(message);

        vm.prank(relayer);
        syntheticBridge.mint(message);

        assertTrue(syntheticBridge.processed(id));
        vm.expectRevert(BridgeBase.MessageAlreadyProcessed.selector);
        vm.prank(relayer);
        syntheticBridge.mint(message);
    }

    function testUnlockRejectsReplay() public {
        vm.chainId(BASE_CHAIN_ID);
        BridgeBase.BridgeMessage memory message = arbitrumToBaseMessage(0);

        vm.prank(relayer);
        collateralBridge.unlock(message);

        vm.expectRevert(BridgeBase.MessageAlreadyProcessed.selector);
        vm.prank(relayer);
        collateralBridge.unlock(message);
    }

    function testMintRejectsWrongDestination() public {
        vm.chainId(BASE_CHAIN_ID);

        vm.expectRevert(
            abi.encodeWithSelector(Errors.InvalidDestinationChainId.selector, BASE_CHAIN_ID, ARBITRUM_CHAIN_ID)
        );
        vm.prank(relayer);
        syntheticBridge.mint(baseToArbitrumMessage(0));
    }

    function testUnlockRejectsWrongDestination() public {
        vm.chainId(ARBITRUM_CHAIN_ID);

        vm.expectRevert(
            abi.encodeWithSelector(Errors.InvalidDestinationChainId.selector, ARBITRUM_CHAIN_ID, BASE_CHAIN_ID)
        );
        vm.prank(relayer);
        collateralBridge.unlock(arbitrumToBaseMessage(0));
    }
}
