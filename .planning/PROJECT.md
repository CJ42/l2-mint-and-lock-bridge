# L2 Mint & Lock Bridge — Transaction Flow UX

## What This Is

A two-way token bridge between Base Sepolia and Arbitrum Sepolia (canonical USDC locked on
origin, synthetic wUSDC minted on destination) with an off-chain Bun relayer and a Next.js
web UI. This milestone rebuilds the **transaction flow experience** in that UI so a user
always knows the exact state of their bridge transaction — from approval, through submission,
through relay to the destination chain — and gets a readable, evidence-backed explanation
whenever something fails.

## Core Value

The user is never left guessing: at every moment the UI shows exactly which state their
bridge transaction is in, and when it fails it says why in plain language backed by the
actual on-chain error.

## Requirements

### Validated

<!-- Inferred from the existing codebase (see .planning/codebase/). Shipped and relied upon. -->

- ✓ Two-way bridge: `lock()`/`unlock()` on Base Sepolia, `burn()`/`mint()` on Arbitrum Sepolia — existing
- ✓ Replay protection via per-sender `nonces` and `processed[messageId]` mapping — existing
- ✓ Evidence-carrying custom errors in `contracts/src/Errors.sol` (`NotRelayer(address)`,
  `BridgeMessageAlreadyProcessed(bytes32)`, `InvalidDestinationChainId(uint256,uint256)`,
  `InvalidBridgeTxInputs(address,uint256)`) — existing
- ✓ Bun + viem relayer: event watcher with confirmation buffer, serialized submitter queue,
  retry with exponential backoff, checkpointed `state.json`, structured JSON logging — existing
- ✓ Next.js UI: RainbowKit wallet connection, direction flip, amount/recipient inputs with
  validation, balance + allowance reads, message explorer — existing
- ✓ Bridge message list derived from on-chain `BridgeTxInitiated`/`BridgeFinalized` logs — existing
  (to be replaced by live subscriptions in this milestone)
- ✓ RPC endpoint failover via viem `fallback()` transports — existing

### Active

<!-- This milestone. Hypotheses until shipped and validated. -->

- [ ] Three-step stepper — *Bridge Approved → Bridge tx submitted → Bridge tx relayed* —
      rendered on the left, below the "L2 Bridge" title and explanations
- [ ] Per-step visual state: blue spinner while pending, green checkmark when confirmed
- [ ] Per-step status text driven by real tx state:
      pending → "Your transaction is being submitted to the network…";
      processing → "Your transaction has been picked up and is being processed…";
      confirmed → "Your transaction has completed successfully!"
- [ ] Action button whose label, variant, icon and disabled state are driven by the same
      transaction state machine as the stepper
- [ ] Pre-flight simulation (`useSimulateContract`) that catches a failing transaction
      *before* the wallet prompt opens
- [ ] Decode reverts against the bridge ABIs (`decodeErrorResult`) into readable, evidence-
      bearing messages — e.g. "This transfer was already relayed (messageId 0x…)"
- [ ] Small error-mapping layer, deliberately narrow for now and documented as extensible:
      insufficient native gas → "You need ~0.0004 ETH on Base Sepolia for gas — here's the faucet";
      allowance too low → re-run approve
- [ ] Live event subscription via WebSocket transport (`watchContractEvent` + wagmi
      `webSocket()`) replacing the 6-second `getLogs` poll in `use-bridge-messages.ts`
- [ ] HTTP-polling fallback when the WebSocket endpoint is unavailable or drops
- [ ] Approve the exact bridge amount on every run, so all three steps always execute
- [ ] Page-refresh recovery — an in-flight transfer is persisted and rehydrated on mount, so
      reloading mid-bridge does not lose the flow

### Out of Scope

- **shadcn/ui adoption** — `TX_FLOW.md` specified it, but the UI is CSS Modules today and
  shadcn is not initialised; a design-system migration mid-milestone costs more than the
  stepper is worth. Hand-build the stepper, spinner and button in the existing pattern.
- **Relayer changes** — coarse states (`queued → relaying → done`) are fully derivable from
  `BridgeTxInitiated`/`BridgeFinalized` events, so no relayer-side signalling channel is needed.
- **Contract changes** — the custom errors already carry the evidence the UI needs; no new
  errors, no redeploy.
- **Expandable raw relayer detail** (attempt counts, simulation failures, terminal errors) —
  coarse states only; deliberately declined to keep the flow legible.
- **A relayer HTTP/WebSocket backend** — the browser reads chain events directly; no new
  service to host or keep reachable.
- **EIP-712 signature verification and fee collection** — known production gaps flagged in
  `.planning/codebase/CONCERNS.md`; both belong to a separate hardening milestone.

## Context

- **Brownfield.** A full codebase map already exists in `.planning/codebase/`
  (ARCHITECTURE, STACK, CONCERNS, CONVENTIONS, INTEGRATIONS, STRUCTURE, TESTING).
- **Source spec.** `TX_FLOW.md` at the repo root holds the original written specification,
  including target copy for each state and reference code patterns. Two of its instructions
  have been deliberately overridden (shadcn; committed ABI JSON) — see Key Decisions.
- **Existing state machine.** `ui/src/components/bridge-card.tsx` already contains a
  `getActionState()` function covering roughly ten button states. This milestone is largely a
  *replacement* of that logic with a shared state machine feeding both button and stepper —
  not a greenfield build.
- **Errors are already good.** `contracts/src/Errors.sol` uses the Solidity 0.8.26+
  `require(cond, CustomError())` form, and every error carries diagnostic parameters. The gap
  is entirely on the UI decode side.
- **Motivation.** This is a portfolio / job-application showpiece: it must look professional
  and visibly demonstrate debugging a failed transaction down to calldata. Polish drives
  priority, but no state may be faked or simulated for the demo — the state machine has to be
  genuinely correct.
- **Untracked working files.** `TX_FLOW.md`, `collateral-abi.json`, `synthetic-abi.json`,
  `commits.md` and `contracts/.env.example` are present but untracked; work is on branch
  `feat/tx-flow-ux`.

## Constraints

- **Tech stack**: viem only, no ethers — project-wide rule
- **Tech stack**: TypeScript strict mode; functions over classes where functions suffice
- **Tech stack**: Bun for install/run/test, not npm/yarn/pnpm/jest/vitest
- **Styling**: CSS Modules in `ui/src/components/*.module.css`, matching the existing UI; no
  new component framework
- **Amounts**: all token amounts are 6-decimal — never format or convert assuming 18
- **Network**: Base Sepolia and Arbitrum Sepolia testnets only
- **Transport**: WebSocket RPC endpoints for testnets are unreliable — an HTTP fallback path
  is mandatory, not optional, or the demo breaks in exactly the moment it matters
- **Contracts**: Solidity 0.8.24+, OpenZeppelin only, checks-effects-interactions, SafeERC20,
  custom errors not require-strings, NatSpec on external functions — applies if contracts are
  ever touched (they are out of scope here)
- **Semantics**: never change nonce/`processed` semantics or the `messageId` encoding without
  explicit instruction
- **Commits**: one build-order block per commit minimum

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hand-build the stepper in CSS Modules instead of adopting shadcn/ui | shadcn is not initialised, the UI is CSS Modules, and the referenced stepper is a third-party registry component; migration cost outweighs the benefit for one component. Overrides `TX_FLOW.md`. | — Pending |
| Approve the exact amount on every bridge, never skip on sufficient allowance | Guarantees all three stepper steps always execute, so the flow is predictable and demonstrable. Costs the user one extra transaction per bridge. | — Pending |
| Observe relay progress through on-chain events, not a relayer-side channel | `BridgeTxInitiated` → `BridgeFinalized` fully determines the coarse states; avoids standing up and hosting a backend the UI has never had. | — Pending |
| Coarse relay states only (`queued → relaying → done`) | Keeps the flow legible for a normal user. Trade-off accepted: a stuck message reads as "slow" with no further explanation. | — Pending |
| WebSocket subscriptions replace `getLogs` polling, with HTTP fallback | Live state transitions without a 6-second lag; fallback covers flaky public testnet WS endpoints. | — Pending |
| No contract or relayer changes in this milestone | Custom errors already carry the needed evidence; coarse states need no new signal. Keeps scope UI-only. | — Pending |
| Page-refresh recovery pulled into scope | Research found it effectively table stakes (Socket/Bungee ship it) and cheap, since it shares the cold-start seed problem the subscription work already has to solve. | — Pending |
| Failures render in one error banner, not a per-step failed state | Keeps the stepper to the two visual states `TX_FLOW.md` specifies. Researchers argued a per-step failed state was necessary; overruled deliberately, with FLOW-05 added so no step is left spinning after a failure. Per-step failed state deferred to v2. | — Pending |
| ABIs generated by `@wagmi/cli` from Foundry output, not committed JSON | The hand-written `parseAbi` subset carries zero error fragments, and `lock()`/`burn()` nest ERC20 calls whose reverts need the merged ABI. Overrides `TX_FLOW.md`'s committed-JSON approach; removes drift. | — Pending |
| Keyed WS provider decision deferred to the transport phase | No public Base/Arbitrum Sepolia RPC serves `wss://`; whether free-tier third-party infra suffices can only be settled by the smoke test, so deciding now would be premature. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-24 after initialization*
