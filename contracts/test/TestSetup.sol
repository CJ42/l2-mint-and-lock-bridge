// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

import {BridgeBase} from "../src/BridgeBase.sol";
import {CollateralTokenBridge} from "../src/CollateralTokenBridge.sol";
import {SyntheticTokenBridge} from "../src/SyntheticTokenBridge.sol";
import {WrappedUSDC} from "../src/WrappedUSDC.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

abstract contract TestSetup is Test {
    uint256 internal constant BASE_CHAIN_ID = 84_532;
    uint256 internal constant ARBITRUM_CHAIN_ID = 421_614;
    uint256 internal constant AMOUNT = 10e6;

    address internal relayer = makeAddr("relayer");
    address internal user = makeAddr("user");
    address internal recipient = makeAddr("recipient");

    MockUSDC internal usdc;
    WrappedUSDC internal wusdc;
    CollateralTokenBridge internal collateralBridge;
    SyntheticTokenBridge internal syntheticBridge;

    function setUp() public virtual {
        usdc = new MockUSDC();

        uint64 currentNonce = vm.getNonce(address(this));
        address predictedSyntheticBridge = vm.computeCreateAddress(address(this), uint256(currentNonce) + 1);
        wusdc = new WrappedUSDC(predictedSyntheticBridge);
        syntheticBridge = new SyntheticTokenBridge(wusdc, address(usdc), BASE_CHAIN_ID);
        assertEq(address(syntheticBridge), predictedSyntheticBridge);

        collateralBridge = new CollateralTokenBridge(usdc, ARBITRUM_CHAIN_ID);
        collateralBridge.setRelayer(relayer);
        syntheticBridge.setRelayer(relayer);

        usdc.mint(user, 100e6);
        usdc.mint(address(collateralBridge), 100e6);
    }

    function baseToArbitrumMessage(uint256 nonce) internal view returns (BridgeBase.BridgeMessage memory) {
        return BridgeBase.BridgeMessage({
            originChainId: BASE_CHAIN_ID,
            destinationChainId: ARBITRUM_CHAIN_ID,
            token: address(usdc),
            sender: user,
            recipient: recipient,
            amount: AMOUNT,
            nonce: nonce
        });
    }

    function arbitrumToBaseMessage(uint256 nonce) internal view returns (BridgeBase.BridgeMessage memory) {
        return BridgeBase.BridgeMessage({
            originChainId: ARBITRUM_CHAIN_ID,
            destinationChainId: BASE_CHAIN_ID,
            token: address(usdc),
            sender: user,
            recipient: recipient,
            amount: AMOUNT,
            nonce: nonce
        });
    }
}
