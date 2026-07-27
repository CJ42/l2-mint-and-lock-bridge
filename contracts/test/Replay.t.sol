// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// globals
import "../src/Errors.sol" as Errors;
import "../src/Types.sol" as Types;
import "../src/BridgeLib.sol" as BridgeLib;

import {TestSetup} from "./TestSetup.sol";

using {BridgeLib.computeBridgeMessageId} for Types.BridgeMessage;

contract ReplayTest is TestSetup {
    function testFinalizeBridgeTxRejectsReplayOnSyntheticBridge() public {
        vm.chainId(ARBITRUM_CHAIN_ID);
        Types.BridgeMessage memory message = baseToArbitrumMessage(0);
        bytes32 id = message.computeBridgeMessageId();

        vm.prank(relayer);
        syntheticBridge.finalizeBridgeTx(message);

        assertTrue(syntheticBridge.processed(id));
        vm.expectRevert(abi.encodeWithSelector(Errors.BridgeMessageAlreadyProcessed.selector, id));
        vm.prank(relayer);
        syntheticBridge.finalizeBridgeTx(message);
    }

    function testFinalizeBridgeTxRejectsReplayOnCollateralBridge() public {
        vm.chainId(BASE_CHAIN_ID);
        Types.BridgeMessage memory message = arbitrumToBaseMessage(0);

        vm.prank(relayer);
        collateralBridge.finalizeBridgeTx(message);

        vm.expectRevert(
            abi.encodeWithSelector(Errors.BridgeMessageAlreadyProcessed.selector, message.computeBridgeMessageId())
        );
        vm.prank(relayer);
        collateralBridge.finalizeBridgeTx(message);
    }

    function testSyntheticFinalizeBridgeTxRejectsWrongDestination() public {
        vm.chainId(BASE_CHAIN_ID);

        vm.expectRevert(
            abi.encodeWithSelector(Errors.InvalidDestinationChainId.selector, BASE_CHAIN_ID, ARBITRUM_CHAIN_ID)
        );
        vm.prank(relayer);
        syntheticBridge.finalizeBridgeTx(baseToArbitrumMessage(0));
    }

    function testCollateralFinalizeBridgeTxRejectsWrongDestination() public {
        vm.chainId(ARBITRUM_CHAIN_ID);

        vm.expectRevert(
            abi.encodeWithSelector(Errors.InvalidDestinationChainId.selector, ARBITRUM_CHAIN_ID, BASE_CHAIN_ID)
        );
        vm.prank(relayer);
        collateralBridge.finalizeBridgeTx(arbitrumToBaseMessage(0));
    }
}
