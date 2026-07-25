// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

// globals
import "./Errors.sol" as Errors;

// modules
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @dev The function `burnFrom` inherited from `ERC20Burnable` should be used by the bridge to burn the approved tokens when bridging.
contract WrappedToken is ERC20, ERC20Burnable {
    address public immutable BRIDGE;
    uint8 internal immutable _DECIMALS;

    constructor(
        address bridge_,
        string memory tokenName_,
        string memory tokenSymbol_,
        uint8 decimals_
    ) ERC20(tokenName_, tokenSymbol_) {
        require(bridge_ != address(0), Errors.BridgeCannotBeZeroAddress());
        BRIDGE = bridge_;
        _DECIMALS = decimals_;
    }

    modifier onlyBridge() {
        _checkCallerIsBridge();
        _;
    }

    /// @notice Mints wrapped tokens after a collateral lock is finalized.
    function mint(address recipient, uint256 amount) external onlyBridge {
        _mint(recipient, amount);
    }

    /// @dev Disable the single burn functions so to always ensure invariant locked collateral tokens on chains equal
    /// number of synthetic tokens on this current chain where the WrappedToken is deployed.
    function burn(uint256 /* amount */) public override {
        revert Errors.BurningTokensDisallowedForUsers();
    }

    /// @dev Overriden function to only allow the linked bridge contract to burn tokens.
    function burnFrom(
        address account,
        uint256 amount
    ) public override onlyBridge {
        super.burnFrom(account, amount);
    }

    /// @notice Mirrors canonical token precision when the wrapped token was deployed and configured
    /// (e.g: USDC has 6 decimals, WBTC has 8 decimals, etc...).
    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }

    /// @dev Throws if the caller is not the linked bridge contract.
    function _checkCallerIsBridge() internal view {
        require(
            msg.sender == BRIDGE,
            Errors.CallerIsNotBridge({invalidCaller: msg.sender})
        );
    }
}
