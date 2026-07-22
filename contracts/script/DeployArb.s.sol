// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {SyntheticTokenBridge} from "../src/SyntheticTokenBridge.sol";
import {WrappedToken} from "../src/WrappedToken.sol";

contract DeployArb is Script {
    error UnexpectedBridgeAddress();

    address internal constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    address bridgeAdmin = makeAddr("Bridge Admin");

    function run() external returns (WrappedToken token, SyntheticTokenBridge bridge) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address relayer = vm.envAddress("RELAYER_ADDRESS");

        uint64 nonce = vm.getNonce(deployer);
        address predictedBridge = vm.computeCreateAddress(deployer, uint256(nonce) + 1);

        vm.startBroadcast(deployerPrivateKey);
        token = new WrappedToken(predictedBridge, "Wrapped USDC", "wUSDC", 6);
        bridge = new SyntheticTokenBridge(deployer, token, BASE_SEPOLIA_USDC, BASE_SEPOLIA_CHAIN_ID);
        bridge.setRelayer(relayer);
        vm.stopBroadcast();

        if (address(bridge) != predictedBridge) {
            revert UnexpectedBridgeAddress();
        }
    }
}
