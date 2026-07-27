# L2 Mint-and-Lock Bridge

A bidirectional bridge for Circle testnet USDC between Base Sepolia and Arbitrum Sepolia.

![Bridge UI cover image](./screenshot.png)

<!--
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
``` -->

## Architecture Overview

![Bridge flow and architecture](./architecture.png)

## Chains, tokens and contracts

### 🟦 Base Sepolia (chain ID: 84532)

| Contract                | Address                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Circle testnet USDC     | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |
| `CollateralTokenBridge` | [`0x9C5DB618c29e99e71BC6aD10c4Cc3c5544a31921`](https://sepolia.basescan.org/address/0x9C5DB618c29e99e71BC6aD10c4Cc3c5544a31921) |

### ⬜️ Arbitrum Sepolia (chain ID: 421614)

| Contract               | Address                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SyntheticTokenBridge` | [`0x3096e98a82dd7a1adfaa71d0def8f7cfd3d43ea0`](https://sepolia.arbiscan.io/address/0x3096e98a82dd7a1adfaa71d0def8f7cfd3d43ea0) |
| Wrapped USDC (`wUSDC`) | [`0x4fd6979AfE5C83653ef1d4ffd0581A491a53DEF0`](https://sepolia.arbiscan.io/address/0x4fd6979AfE5C83653ef1d4ffd0581A491a53DEF0) |

This L2 Bridge showcases bridging testnet USDC, a real asset and a real ERC20 approval + `transferFrom`.

Base Sepolia USDC is locked as collateral and an equivalent 6-decimal `wUSDC` is minted on Arbitrum Sepolia.
Bridging back involves burning `wUSDC` on Arbitrum Sepolia before unlocking the original USDC on Base Sepolia.

## How it works? Flow

The core invariant of the bridge is that USDC locked in the `CollateralTokenBridge` contract on Base Sepolia **MUST always be greater than or equal to the total supply of `wUSDC`** on Arbitrum Sepolia. (we factor the case if a user transfer arbitrarily with `CollateralTokenBridge` contract address as `recipient`).

### Bridging: Base ➡ Arbitrum

1. The user give as allowance to the `CollateralTokenBridge` the amount it wants to bridge. This is done by calling `approve(...)` on the USDC token contract.
2. The user calls `bridgeTx(...)` on the `CollateralTokenBridge` contract. Under the hood, the bridge calls `transferFrom` to take the user's tokens and lock them in the smart contract.
3. When `bridgeTx(...)` is called, it emits a `BridgeTxInitiated` event that the relayer listens to on the source chain (`Base`).
4. The relayer waits five confirmations, validates the event's message ID, and calls `finalizeBridgeTx(...)` on the `SyntheticTokenBridge` contract on the destination chain.
5. `SyntheticTokenBridge` marks the message processed and mints the same amount of `wUSDC`.

### Bridging back: Base ⬅ Arbitrum

The reverse path performs the same steps as above, with the following differences:

- at step 2, the user calls `bridgeTx(...)` on the `SyntheticTokenBridge` contract, which burns the `wUSDC` via `burnFrom(...)`.
- at step 4, the relayer completes the return path by calling `finalizeBridgeTx(...)` on the `CollateralTokenBridge`.
- at step 5, the `CollateralTokenBridge` marks the message processed and unlock the same amount of USDC.

### Bridge message ID format

Every message ID of a bridge transaction is the keccak256 hash of the following properties.

```javascript
keccak256(
  abi.encode(
    originChainId,
    destinationChainId,
    tokenAddress,
    sender,
    recipient,
    amount,
    senderNonce,
  ),
);
```

## Security, Trust model and tradeoffs

### Smart Contracts

- Chain ID in the message ID prevents cross-chain replay.
- nonces enable to prevent replay a bridge message twice.
- destination-side `processed` mapping prevents duplicate finalization (if multiple relayers are running and the same bridge message ID is picked by two different relayers)

The bridge contracts inherit `Ownable2Step` and `Pausable`, which allows a circuit breaker if the bridge or relayer is compromised.

The bridge contract use the `SafeERC20` library to ensure the bridge always integrate ERC20 compliant tokens that return `true` when the `transferFrom` function is called, and reject non-standard tokens. The `SafeERC20` library allows `transferFrom` calls that do not return any data (like USDT), but if data is returned, it must be a `true` boolean.

### Relayer

Decided to use the trusted relayer model for simplicity. The bridge intentionally trusts one relayer EOA via the `onlyRelayer` modifier in the smart contract.

The relayer only reads blocks five confirmations behind the origin head, which protects against shallow testnet reorgs. Production should use finalized L1 batch status, or more confirmations.

## What was cut and why

| Cut                                       | Why                                                                                                                                                                                                                | Production direction                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Trusted Relayer                        | Time; the single-relayer trust model is explicit. I was considering using a zk-proof that could be generated by anyone, but would require adding a Circuit in Solidity on the bridge contract to verify the SNARK. | Relayer private key should run on a TEE + some economic mechanisms with slashing should be put in place.                                                                                              |
| ✅ Real-USDC Mainnet fork tests           | Unit tests and live smoke testing cover the initial path                                                                                                                                                           | Base Sepolia fork test against deployed USDC bytecode                                                                                                                                                 |
| ✅ Fees / destination gas payment         | Requires more complex smart contracts implementation and gas oracles                                                                                                                                               | Enforce user to pay for the destination gas with off-chain quotes via oracles and relayer withdrawals so they can reimburse the gas paid for relaying the bridge transaction on the destination chain |
| ✅ Multiple destination chain for a token | Requires a rebalancer and increase complexity of managing                                                                                                                                                          | Asset gateway registry and routers. Allowing to rebalance                                                                                                                                             |
| ✅ L2 Bridge Finalization                 | Time                                                                                                                                                                                                               |                                                                                                                                                                                                       |
| Failed-finalization recovery              | This is the most security-sensitive bridge path                                                                                                                                                                    | Attested-failure refunds or a carefully designed timeout reclaim                                                                                                                                      |
| Rate limits and caps                      | Low value on a public testnet demo                                                                                                                                                                                 | Per-message and per-block limits                                                                                                                                                                      |

## What I would improve with more time?

### UI

- I would improve the UI with a better transaction handling. For instance for stuck transactions, either canceling them (with 0 value transfer to self), or re-submitting a transaction with `maxFeePerGas` and `maxPriorityFeePerGas`.
- I would improve input validations and test more if I enter random inputs.

### Relayer

- I would have ran the relayer in a TEE like Chainlink CRE for better security. This way, the private key of the relayer would be stored in a safer docker container.
- I would have refactored the codebase to use a live websocket connection to listen and monitor for events, over using http and regularly polling the logs for a range of blocks via viem `viemPubliClient.getLogs(...)`.
- **(more future advanced improvement)** I would have changed completely the economic architecture behind the relayers operating on the bridge. For instance, make any relayer that register stake some tokens, implementing slashing mechanisms if a relayer behaves badly. I would have leveraged something like Eigenlayer AVS to implement such staking and slashing mechanisms.

### Smart Contracts

- I would have made the contracts are proxies, so that deploying new contracts for new bridge routes is cheaper (just deploying the bridge implementation contracts once, similar to Hyperlane).
- Currently, the relayer pays entirely for the gas on the destination chain. I would have implemented a feature similar to Hyperlane **Interchain Gas Payment**, where the user sends native tokens alongside the bridge transaction, that the relayer can then retrieve to reimburse the gas cost it had to pay for sending the final bridge transaction on the destination chain.
- I would have also considered implementing a mechanism where the user can send an additional _"tip for the relayer"_ (a small amount of native tokens) so that the relayer is incentivized to pick the bridge transaction first.
- **(more future advanced improvement)** I would have not hardcoded the `DESTINATION_CHAIN_ID` in the bridge smart contracts. Instead, I would have allowed to pass the destination chain ID as a parameter to `bridgeTx(...)`. The bridge admin would be allowed to add new destination chain to bridge to through a function `addDestinationChain(...)`

The next priorities:

- signature verification
- gas fees
- safe stuck-fund recovery
- rate limits
- finalized L1 confirmation
- a durable indexed message API
- and a gateway registry for additional assets and chains

## AI usage

I have leveraged AI in the following ways:

- **Custom GitHub Copilot AI review instructions**: Created a file [`.github/copilot_instructions.md`](./.github/copilot-instructions.md) with the instructions of the assignement + some additional points I consider important for this task (_e.g: show how the transaction state evolves over time, simulate before sending transactions, smart contract security patterns like CEI_). This way on each PR I made t the GitHub repository, I would request an AI review from GitHub Copilot and ensure Copilot would review code changes and focus on the specific important points I had listed.
- **Cursor Plan + Build mode with formal specs:** I created an initial [`SPECIFICATIONS.md`](./SPECIFICATIONS.md) file with additional notes and some additions from AI. I then gave this document to Claude Fable 5 in Cursor, used the Plan Mode first, and then the build mode second to bootstrap and build the initial implementation.
- **Claude Code + GSD Prompt engineering tool:** I used Claude Code + a tool called `gsd` to iterate and improve the UI tx flow (created the stepper this way, and listen for transaction state and receipts). GSD Core is a context-engineering and spec-driven development framework that drives AI coding agents (like Claude Code or Codex) through disciplined phase loops.

Architecture and tradeoffs were decided up front in `SPECIFICATIONS.md`. AI implemented that written design, while the security-sensitive message identity, nonce, replay, and trust assumptions remained fixed by the specification.
