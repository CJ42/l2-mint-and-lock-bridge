// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract WrappedToken is ERC20 {
    error NotBridge();
    error InvalidBridge();

    address public immutable BRIDGE;

    uint8 private immutable _DECIMALS;

    constructor(
        address bridge_,
        string memory tokenName_,
        string memory tokenSymbol_,
        uint8 decimals_
    ) ERC20(tokenName_, tokenSymbol_) {
        require(bridge_ != address(0), InvalidBridge());
        BRIDGE = bridge_;
        _DECIMALS = decimals_;
    }

    modifier onlyBridge() {
        require(msg.sender == BRIDGE, NotBridge());
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
    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }
}
