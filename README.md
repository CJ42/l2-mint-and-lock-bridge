# l2-mint-and-lock-bridge

Monorepo for the UI, smart contracts and relayer of a token bridge between two L2 networks: Base Sepolia and Arbitrum Sepolia.

## Instructions

1. Build all the packages (contract ABI, bridge UI)

```bash
bun run build        # topological build with caching
```

or alternatively

```bash
turbo run build --filter=relayer   # scoped runs
```

2. Run the bridge UI and relayers in parallel

```bash
bun run dev          # turbo runs all dev tasks in parallel
```