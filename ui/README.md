# Mint & Lock UI

Next.js App Router interface for bridging 6-decimal USDC between Base Sepolia
and Arbitrum Sepolia. Deployment addresses come from the repository root
`addresses.json`; values in `.env.local` can override them.

```sh
bun install
bun run dev
```

The message explorer deliberately uses no backend. It scans `BridgeInitiated`
and `BridgeFinalized` events over roughly the latest 50,000 blocks on each
chain, in ranges of at most 2,000 blocks, then joins them by message ID. This is
simple zero-infrastructure indexing for a demo; a production UI should query an
indexer or relayer API instead of repeatedly scanning historical ranges.
