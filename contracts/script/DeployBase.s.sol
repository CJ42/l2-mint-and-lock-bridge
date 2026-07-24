// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {CollateralTokenBridge} from "../src/CollateralTokenBridge.sol";

contract DeployBase is Script {
    address internal constant BASE_SEPOLIA_USDC =
        0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint256 internal constant ARBITRUM_SEPOLIA_CHAIN_ID = 421_614;

    function run() external returns (CollateralTokenBridge bridge) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address relayer = vm.envAddress("RELAYER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        bridge = new CollateralTokenBridge(
            deployer,
            IERC20(BASE_SEPOLIA_USDC),
            ARBITRUM_SEPOLIA_CHAIN_ID
        );
        bridge.setRelayer(relayer);
        vm.stopBroadcast();
    }
}
