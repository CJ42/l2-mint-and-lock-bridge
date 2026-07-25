# API Coverage — Phase 3 (Flow Orchestration & UI Integration)

No external API integration: this phase composes already-installed local libraries (`wagmi/actions`,
a subpath export of the installed `wagmi`, and `viem`) and consumes RPC transport that Phase 2 owns
and configures — it adds no new external service, SDK, package or endpoint whose capability surface
could be silently under-covered.

## Why this is a declaration rather than a matrix

The deterministic detector returns `detected: false` when run over this phase's ROADMAP section at
plan time. It is expected to return `detected: true` at seal time, because the plan bodies contain
`wire`/`consume` alongside `endpoint` while describing how the orchestration hook is wired to the
already-existing transport. That is a vocabulary coincidence, not an integration: nothing in this
phase chooses, authenticates against, or wraps a third-party service.

For completeness, the two surfaces this phase touches and why neither is an external-API integration:

| Surface | Why not an external API integration |
|---|---|
| `wagmi/actions` (`simulateContract`, `writeContract`, `waitForTransactionReceipt`, `getTransactionReceipt`) | A subpath export of `wagmi@2.19.5`, already in `bun.lock`; `03-RESEARCH.md` confirmed by direct filesystem read that it re-exports the already-resolved transitive `@wagmi/core`. No install, no account, no key, no capability surface to decide over. |
| Base Sepolia / Arbitrum Sepolia RPC endpoints | Owned, verified and configured by Phase 2 (`LIVE-02`'s recorded smoke test, `LIVE-03`'s transport ordering). This phase issues calls through clients Phase 2 built and makes no endpoint or provider decision of its own. |

The bridge contracts' own write surface is the project's own Solidity, explicitly out of scope for
this milestone (`REQUIREMENTS.md` § Out of Scope, "Contract changes"), and the two functions the flow
needs — `lock` and `burn` — are the complete origin-side write surface for a bridge transfer in each
direction. Nothing is omitted.
