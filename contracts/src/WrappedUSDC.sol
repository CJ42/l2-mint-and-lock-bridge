// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract WrappedUSDC is ERC20 {
    error NotBridge();
    error InvalidBridge();

    address public immutable bridge;

    constructor(address bridge_) ERC20("Wrapped USDC", "wUSDC") {
        if (bridge_ == address(0)) revert InvalidBridge();
        bridge = bridge_;
    }

    modifier onlyBridge() {
        if (msg.sender != bridge) revert NotBridge();
        _;
    }

    /// @notice Mints wrapped USDC after a collateral lock is finalized.
    function mint(address recipient, uint256 amount) external onlyBridge {
        _mint(recipient, amount);
    }

    /// @notice Burns approved wrapped USDC during a return bridge initiation.
    function burnFrom(address account, uint256 amount) external onlyBridge {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }

    /// @notice Mirrors canonical USDC precision.
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
