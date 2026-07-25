import { defineConfig } from '@wagmi/cli'
import { foundry, react } from '@wagmi/cli/plugins'

export default defineConfig({
  out: 'src/lib/generated.ts',
  plugins: [
    foundry({
      project: '../contracts',
      artifacts: 'out',
      forge: { build: true },
      exclude: [],
      include: [
        'CollateralTokenBridge.sol/**',
        'SyntheticTokenBridge.sol/**',
        'WrappedToken.sol/**',
        'IERC20.sol/**',
      ],
    }),
    react(),
  ],
})
