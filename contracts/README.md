# Bridge contracts

Foundry contracts for locking Circle testnet USDC on Base Sepolia and minting 6-decimal wrapped USDC on Arbitrum Sepolia.

```bash
forge build
forge test
forge fmt --check
```

Deployment scripts read `DEPLOYER_PRIVATE_KEY` and `RELAYER_ADDRESS`:

```bash
forge script script/DeployArb.s.sol:DeployArb --rpc-url arbitrum_sepolia --broadcast
forge script script/DeployBase.s.sol:DeployBase --rpc-url base_sepolia --broadcast
```

Deploy Arbitrum first. Record the resulting addresses and deployment blocks in the repository root `addresses.json`.
