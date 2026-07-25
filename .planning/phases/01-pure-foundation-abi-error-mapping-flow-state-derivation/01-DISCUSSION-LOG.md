# Phase 1: Pure Foundation — ABI, Error Mapping & Flow-State Derivation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-25
**Phase:** 1-Pure Foundation — ABI, Error Mapping & Flow-State Derivation
**Areas discussed:** ABI generation script scope, Error message copy/tone/faucet links

---

## ABI generation script scope

**Q1: What does the Bun script actually do, beyond invoking `wagmi generate`?**

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal wrapper | Script only runs `wagmi generate`; legacy-file cleanup is a one-time manual step in this phase's plan | ✓ |
| Wrapper + drift guard | Also asserts every `Errors.sol` error name is present in the output, exits non-zero if missing | |
| Wrapper + drift guard + self-cleaning | Same as above, plus refuses to coexist with legacy root ABI JSON files on every run | |
| Other | — | |

**User's choice:** Minimal wrapper.
**Notes:** Keeps the ongoing script simple; the one-time cleanup of `collateral-abi.json`, `synthetic-abi.json`, and the hand-written `parseAbi` subset happens as an explicit step in the Phase 1 plan instead of being re-checked by tooling every run.

**Q2: Which contracts feed the generated ABI?**

| Option | Description | Selected |
|--------|-------------|----------|
| Four-way include | `CollateralTokenBridge.sol/**`, `SyntheticTokenBridge.sol/**`, `WrappedToken.sol/**`, `IERC20.sol/**` | ✓ |
| Three-way include, keep IERC20 hand-written | Skip generating IERC20; keep today's tiny hand-written `erc20Abi` for the external USDC contract | |
| Other | — | |

**User's choice:** Four-way include.
**Notes:** Discovered during discussion that Base Sepolia's collateral token is the real, externally-owned USDC contract (`script/DeployBase.s.sol`'s `BASE_SEPOLIA_USDC` constant), not a contract this repo builds — so it has no custom errors to generate, but its interface (`balanceOf`/`allowance`/`approve`) is still needed and is available via the `IERC20.sol` Foundry lib artifact.

**Q3: Merged single export, or per-contract exports, for error decoding?**

| Option | Description | Selected |
|--------|-------------|----------|
| Merged | Error-decoder module concatenates all four contracts' `abi` arrays into one combined `bridgeErrorAbi` at import time | ✓ |
| Per-contract | Decoder keeps four exports separate, tries each in sequence | |
| Other | — | |

**User's choice:** Merged.
**Notes:** `@wagmi/cli`'s `react()` plugin still emits normal per-contract named exports from codegen — the merge happens in the error-decoder module, not in codegen itself.

---

## Error message copy, tone, and faucet links

**Research performed inline:** Searched for current (2026) official Base Sepolia and Arbitrum Sepolia ETH faucets before asking any questions. Found Alchemy's no-login-required faucet covers both chains (`https://www.alchemy.com/faucets/base-sepolia`, `https://www.alchemy.com/faucets/arbitrum-sepolia`; 0.1 ETH/day, no signup, minor eligibility checks against mainnet history).

**Q1: Faucet link and the "~0.0004 ETH" amount — fixed constant, or computed from the simulation's gas estimate?**

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed constants | Hardcode "~0.0004 ETH" for both chains, matching existing PROJECT.md copy | |
| Computed | Read actual `gas`/`gasPrice` from the failed simulate/write result, compute a real figure per failure, fall back to fixed default if unavailable | ✓ |
| Other | — | |

**User's choice:** Computed, with fixed fallback.
**Notes:** More accurate given the portfolio-demo motivation (showing real gas debugging, not canned copy); the computation is scoped as a small isolated helper inside the same narrow error-mapping module (ERR-09 still applies).

**Q2: Copy strategy for admin-only/invariant errors a normal user should never trigger**

| Option | Description | Selected |
|--------|-------------|----------|
| Full friendly copy for all ~12 | Distinct human sentence for every error name, including admin-only ones | |
| Two-tier | User-facing errors get full copy; admin-only/invariant errors collapse into one shared generic message that still names the real error | ✓ |
| Other | — | |

**User's choice:** Two-tier.

**Q3: Copy template, and whether `NotRelayer` belongs in Tier 1 or Tier 2**

| Option | Description | Selected |
|--------|-------------|----------|
| Move NotRelayer to Tier 2 | Structurally unreachable from this UI's own transactions | (superseded, see below) |
| Keep NotRelayer in Tier 1 with full copy | Defensive, in case UI call graph changes later | |
| Other | User typed a free-text clarification | ✓ |

**User's choice (free text):** "Don't take into account `NotRelayer` case since it will never happen on the UI side."
**Notes:** Slightly stronger than "move to Tier 2" — `NotRelayer` gets zero special-case handling anywhere in the decode chain; it simply falls through the same generic path as any other named-but-unmapped error. Copy template confirmed as plain sentence + parenthetical raw evidence, matching the two examples already in `PROJECT.md`/`TX_FLOW.md`.

---

## Claude's Discretion

- Exact plain-language phrasing for each standard Solidity `Panic(uint256)` code (0x01, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32, 0x41, 0x51).
- Exact wording of the Tier-2 generic message beyond the agreed template (`"Something unexpected happened on-chain (${errorName})."`).
- File/function naming inside the error-mapping module and `deriveFlowState()` — follow existing codebase conventions, not separately discussed.

## Deferred Ideas

None deferred to a future phase. Two originally-identified gray areas — `deriveFlowState()`'s exact discriminated-union shape, and how failure is represented relative to the 3 named stepper steps — were surfaced but not selected for discussion this session; they remain open for the planner/researcher to resolve using FLOW-01/FLOW-05 from REQUIREMENTS.md, or a follow-up discussion pass.
