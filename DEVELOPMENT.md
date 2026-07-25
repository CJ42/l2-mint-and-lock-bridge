## Deployment - Running locally

Requirements: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh/).

1. Populate the address of the deployer and the configured relayer in the `contract/.env` file:

```bash
cp contracts/.env.example contract/.env
```

```
DEPLOYER_PRIVATE_KEY=
RELAYER_ADDRESS=
```

```bash
source contracts/.env
```

2. Deploy the bridge contract addresses on Arbitrum first, then Base:

```bash
cd contracts
forge script script/DeployArb.s.sol:DeployArb --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" --broadcast
forge script script/DeployBase.s.sol:DeployBase --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast
```

3. Populate the `.env` file of the relayer with the newly deployed smart contract addresses, deployed blocks, and the relayer EOA private key

> **Note:** The relayer EOA must have test ETH on both chains. 

```bash
cp relayer/.env.example relayer/.env
```

```
BASE_BRIDGE_ADDRESS=0x330802C5F681f1cf46FE32bb3999F14E47DAbfC5
ARBITRUM_BRIDGE_ADDRESS=0x796b1fdcDE61280EF51B94f5a68132941856ec0c
BASE_DEPLOY_BLOCK=44536936
ARBITRUM_DEPLOY_BLOCK=1000000
```

```bash
source relayer/.env
```

4. finally populate the `ui/.env.local` file

```
NEXT_TELEMETRY_DISABLED=1

NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

NEXT_PUBLIC_BASE_BRIDGE_ADDRESS=
NEXT_PUBLIC_BASE_USDC_ADDRESS=
NEXT_PUBLIC_ARBITRUM_BRIDGE_ADDRESS=
NEXT_PUBLIC_ARBITRUM_WUSDC_ADDRESS=
```

5. Populate both bridge addresses, the wrapped token address, and deployment blocks in `addresses.json`.

6. Build the projects.

```bash
bun install
bun run build
```

To test bridging USDC from Base, Base USDC is available from [Circle's faucet](https://faucet.circle.com).