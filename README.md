# L2 Mint-and-Lock Bridge

A bidirectional bridge for Circle testnet USDC between Base Sepolia and Arbitrum Sepolia. Base USDC is locked as collateral and an equivalent 6-decimal `wUSDC` is minted on Arbitrum; returning burns `wUSDC` before releasing the original USDC.

```
                                         
            ..                                       ..
            []                                       []
          .:[]:_                                   ,:[]:.
        .: :[]: :-.                             ,-: :[]: :.
      .: : :[]: : :`._                       ,.': : :[]: : :.
    .: : : :[]: : : : :-._               _,-: : : : :[]: : : :.
_..: : : : :[]: : : : : : :-._________.-: : : : : : :[]: : : : :-._
_:_:_:_:_:_:[]:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:_:[]:_:_:_:_:_:_
!!!!!!!!!!!![]!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!![]!!!!!!!!!!!!!
^^^^^^^^^^^^[]^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^[]^^^^^^^^^^^^^
            []       =========================       []
            []       | L2 ERC20 Token Bridge |       []
            []       =========================       []
```

```text
Base Sepolia                                      Arbitrum Sepolia
user → CollateralTokenBridge → BridgeInitiated
                                  │
                         trusted relayer
                                  │
                                  └→ SyntheticTokenBridge → wUSDC

user ← CollateralTokenBridge ← trusted relayer ← BridgeInitiated ← burn wUSDC
```

## Chains and token

| Network | Chain ID | Asset | Contract |
| --- | ---: | --- | --- |
| Base Sepolia | 84532 | Circle testnet USDC | [`0x036C…CF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |
| Arbitrum Sepolia | 421614 | Wrapped USDC (`wUSDC`) | Set after deployment in `addresses.json` |

These public L2 testnets have dependable RPCs and faucets. Using Circle's deployed USDC exercises a real ERC-20 approval and `transferFrom` path instead of hiding integration risk behind a mock.

## How it works

Base to Arbitrum:

1. The user approves USDC and calls `lock`.
2. `CollateralTokenBridge` transfers USDC into collateral and emits `BridgeInitiated`.
3. The relayer waits five confirmations, validates the event's message ID, and calls `mint`.
4. `SyntheticTokenBridge` marks the message processed and mints the same amount of `wUSDC`.

The reverse path approves and burns `wUSDC`, then the relayer calls `unlock` on Base.

Every message hashes the origin chain ID, destination chain ID, canonical token, sender, recipient, amount, and per-sender nonce with `abi.encode`. Chain IDs prevent cross-chain replay, nonces distinguish repeated transfers, and a destination-side `processed` mapping prevents duplicate finalization.

> Outside in-flight messages, USDC locked in `CollateralTokenBridge` is greater than or equal to the total supply of `wUSDC`. Equality holds when no messages are in flight.

## Trust model and tradeoffs

The bridge intentionally trusts one relayer EOA. `onlyRelayer` authorization is simple and explicit, but compromise or censorship of that key can mint invalid claims or stop delivery. A production bridge would verify EIP-712 message attestations from a rotatable n-of-m signer set.

The relayer only reads blocks five confirmations behind the origin head, which protects against shallow testnet reorgs. Production would use finalized L1 batch status. Per-sender nonces avoid global ordering, while `Ownable2Step` and `Pausable` provide a legible circuit breaker.

The UI indexes recent logs directly. This removes backend infrastructure for the demo, but repeated 50,000-block scans do not scale.

## What was cut and why

| Cut | Why | Production direction |
| --- | --- | --- |
| Relayer signature verification | Time; the single-relayer trust model is explicit | EIP-712, n-of-m attestations, key rotation |
| Fees / destination gas payment | It changes contracts, relayer, and UI together | Enforced fee floor with off-chain quotes and relayer withdrawals |
| Failed-finalization recovery | This is the most security-sensitive bridge path | Attested-failure refunds or a carefully designed timeout reclaim |
| Rate limits and caps | Low value on a public testnet demo | Per-message and per-block limits |
| Rebalancing / third chain | Requires a liquidity model | Asset gateway registry and routers |
| Dedicated indexer | Zero-infrastructure UI is sufficient here | Relayer ledger API or production indexer |
| Real-USDC fork tests | Unit tests and live smoke testing cover the initial path | Base Sepolia fork test against deployed USDC bytecode |

## Running locally

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

## Deployment addresses

Deployment-specific values and starting blocks live in `addresses.json`. Blank bridge values mean the project has not yet been deployed; the UI remains read-only and the relayer rejects startup until they are populated.

## Further improvements

The next priorities are signature verification, gas fees, safe stuck-fund recovery, rate limits, finalized L1 confirmation, a durable indexed message API, and a gateway registry for additional assets and chains.

## AI usage

Architecture and tradeoffs were decided up front in `SPECIFICATIONS.md`. AI implemented that written design, while the security-sensitive message identity, nonce, replay, and trust assumptions remained fixed by the specification.