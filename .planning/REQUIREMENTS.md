# Requirements: L2 Mint & Lock Bridge — Transaction Flow UX

**Defined:** 2026-07-24
**Core Value:** The user is never left guessing: at every moment the UI shows exactly which state their bridge transaction is in, and when it fails it says why in plain language backed by the actual on-chain error.

## v1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### ABI Foundation

- [ ] **ABI-01**: Bridge ABIs are generated from Foundry build output via `@wagmi/cli`'s foundry plugin, run through a Bun script
- [ ] **ABI-02**: The generated ABI includes every custom error fragment from `Errors.sol`, plus the ERC20/OpenZeppelin error fragments needed to decode token-originated reverts
- [ ] **ABI-03**: The hand-written `parseAbi` subset in `ui/src/lib/abis.ts` and the untracked root ABI JSON dumps are removed, with all ABI imports pointing at the generated file

### Error Decoding

- [ ] **ERR-01**: A revert carrying a known bridge custom error is shown as a readable sentence that includes the error's evidence values (e.g. the `messageId` for `BridgeMessageAlreadyProcessed`)
- [ ] **ERR-02**: Insufficient native gas is shown as an actionable message naming the chain, the approximate amount needed, and a faucet link
- [ ] **ERR-03**: Insufficient allowance is shown as a message directing the user to re-run approve
- [ ] **ERR-04**: An ERC20-originated revert (e.g. `SafeERC20FailedOperation`) decodes correctly rather than falling through as unknown
- [ ] **ERR-05**: A wallet rejection is reported as a rejection, distinct from an on-chain failure
- [ ] **ERR-06**: An out-of-gas failure, which carries empty revert data and cannot be decoded, produces a specific message rather than a generic one
- [ ] **ERR-07**: A Solidity `Panic(uint256)` revert is decoded to its documented meaning
- [ ] **ERR-08**: An unrecognised revert falls through to a generic message that still exposes the raw revert data for debugging
- [ ] **ERR-09**: The error-mapping layer is a single module documented in-code as intentionally narrow and extensible

### Pre-flight Simulation

- [ ] **SIM-01**: The bridge transaction is simulated before the wallet prompt opens, and a failing simulation prevents the wallet from opening at all
- [ ] **SIM-02**: A failed simulation surfaces the decoded reason through the same error layer as a failed transaction
- [ ] **SIM-03**: Write-side failures are decoded independently of simulation, so a transaction that passes simulation but reverts on-chain still reports a real reason

### Transaction Flow State

- [ ] **FLOW-01**: A single derived state value is the only source of truth for both the stepper and the action button
- [ ] **FLOW-02**: Approve runs on every bridge for the exact amount, so all three steps always execute
- [ ] **FLOW-03**: `getActionState()` and the duplicated `approveHash`/`bridgeHash` local state are removed from `bridge-card.tsx`
- [ ] **FLOW-04**: A user who reloads the page mid-bridge sees their in-flight transaction restored, rehydrated from persisted storage
- [ ] **FLOW-05**: On failure the flow leaves the pending state, so no step is ever left spinning while the explanation sits in the error banner

### Stepper

- [ ] **STEP-01**: A three-step stepper — Bridge Approved, Bridge tx submitted, Bridge Tx relayed — renders on the left, below the "L2 Bridge" title and explanations
- [ ] **STEP-02**: Each step shows a blue spinner while pending and a green checkmark once confirmed
- [ ] **STEP-03**: Each step shows status text matching its real state: submitting, picked-up-and-processing, or completed successfully
- [ ] **STEP-04**: The stepper is hand-built with CSS Modules, matching the existing component convention

### Action Button

- [ ] **BTN-01**: The button's label, variant and icon are driven by the same derived state as the stepper, with no second derivation
- [ ] **BTN-02**: A spinner replaces the button icon while a transaction is pending or processing, and the button is disabled throughout

### Live Updates

- [ ] **LIVE-01**: Relay completion is detected from the destination-chain `BridgeFinalized` event, watched with an explicit `chainId` so it works regardless of which chain the wallet is on
- [ ] **LIVE-02**: WebSocket RPC endpoints for both chains are verified by manual smoke test before any application code depends on them
- [ ] **LIVE-03**: The WebSocket transport sits at index 0 of the `fallback()` array with ranking disabled, so live subscriptions actually use `eth_subscribe`
- [ ] **LIVE-04**: A bounded `getLogs` seed runs before the live subscription opens, so an event that fired before subscription is never missed
- [ ] **LIVE-05**: WebSocket failure degrades to HTTP polling via an explicit `onError` path, and the transaction flow keeps working throughout
- [ ] **LIVE-06**: A staleness watchdog detects a silently dead socket that never fires an error, and triggers the polling fallback
- [ ] **LIVE-07**: Logs re-emitted with `removed: true` after a chain reorganisation do not leave a step falsely marked confirmed
- [ ] **LIVE-08**: Event-derived state is keyed by `messageId`, so duplicate events on resubscribe are applied once
- [ ] **LIVE-09**: The message explorer list is upgraded from 6-second polling to the same live-watch mechanism, keeping its bounded seed scan

## v2 Requirements

Deferred. Tracked but not in this roadmap.

### Transaction Flow

- **V2-01**: A visually distinct per-step failed state, so the failing step itself carries the error rather than a shared banner
- **V2-02**: Expandable raw relayer detail — attempt counts, simulation failures, terminal errors — behind a disclosure
- **V2-03**: Per-step explorer links, rather than a single link on completion
- **V2-04**: Estimated time remaining for the relay step

### Bridge Hardening

- **V2-05**: EIP-712 signature verification replacing the trusted-relayer model
- **V2-06**: Fee collection so the relayer does not operate at a loss

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| shadcn/ui adoption | UI is CSS Modules and shadcn is uninitialised; a design-system migration costs more than one stepper is worth. Overrides `TX_FLOW.md`. |
| Contract changes | `Errors.sol` already carries the evidence the UI needs; no new errors, no redeploy |
| Relayer changes | Coarse states are fully derivable from chain events, so no relayer-side signal is needed |
| A relayer HTTP/WebSocket backend | The browser reads chain events directly; no new service to host or keep reachable |
| Fake progress bars or invented ETA countdowns | Directly conflicts with the project's "no faked states" constraint; a documented UX anti-pattern |
| Auto-retry or auto-resubmit on failure | Hides state changes from the user, which is the opposite of this milestone's core value |
| Standalone activity/history drawer | Duplicates the existing message explorer |
| Upgrading to wagmi v3 | RainbowKit 2.2.11 hard-pins peer dep `wagmi: ^2.9.0` |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ABI-01 | Phase 1 | Pending |
| ABI-02 | Phase 1 | Pending |
| ABI-03 | Phase 1 | Pending |
| ERR-01 | Phase 1 | Pending |
| ERR-02 | Phase 1 | Pending |
| ERR-03 | Phase 1 | Pending |
| ERR-04 | Phase 1 | Pending |
| ERR-05 | Phase 1 | Pending |
| ERR-06 | Phase 1 | Pending |
| ERR-07 | Phase 1 | Pending |
| ERR-08 | Phase 1 | Pending |
| ERR-09 | Phase 1 | Pending |
| FLOW-01 | Phase 1 | Pending |
| FLOW-05 | Phase 1 | Pending |
| LIVE-01 | Phase 2 | Pending |
| LIVE-02 | Phase 2 | Pending |
| LIVE-03 | Phase 2 | Pending |
| LIVE-04 | Phase 2 | Pending |
| LIVE-05 | Phase 2 | Pending |
| LIVE-06 | Phase 2 | Pending |
| LIVE-07 | Phase 2 | Pending |
| LIVE-08 | Phase 2 | Pending |
| LIVE-09 | Phase 2 | Pending |
| FLOW-02 | Phase 3 | Pending |
| FLOW-03 | Phase 3 | Pending |
| FLOW-04 | Phase 3 | Pending |
| SIM-01 | Phase 3 | Pending |
| SIM-02 | Phase 3 | Pending |
| SIM-03 | Phase 3 | Pending |
| STEP-01 | Phase 3 | Pending |
| STEP-02 | Phase 3 | Pending |
| STEP-03 | Phase 3 | Pending |
| STEP-04 | Phase 3 | Pending |
| BTN-01 | Phase 3 | Pending |
| BTN-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 35 total <!-- corrected during roadmap creation: the "## v1 Requirements" section lists 35 requirement IDs (ABI:3, ERR:9, SIM:3, FLOW:5, STEP:4, BTN:2, LIVE:9); the previous "31 total" placeholder predated this count and was stale -->
- Mapped to phases: 35
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-24*
*Last updated: 2026-07-24 after roadmap creation (Phase 1-3 mapping, coverage corrected 31→35)*
