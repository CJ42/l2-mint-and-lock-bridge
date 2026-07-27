import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, webSocket } from "viem";
import { cookieStorage, createStorage, http } from "wagmi";
import { arbitrumSepolia, baseSepolia } from "wagmi/chains";

import { rpcUrls } from "@/lib/config";
import { webSocketOptions } from "@/lib/live-clients";

const BASE_SEPOLIA_RPC_URLS = [
  http(rpcUrls.baseSepolia.default),
  http(rpcUrls.baseSepolia.fallback),
];

const ARBITRUM_SEPOLIA_RPC_URLS = [
  http(rpcUrls.arbitrumSepolia.default),
  http(rpcUrls.arbitrumSepolia.fallback),
];

export function getConfig() {
  return getDefaultConfig({
    appName: "Mint & Lock Bridge",
    projectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
      "development-project-id",
    chains: [baseSepolia, arbitrumSepolia],
    ssr: true,
    transports: {
      [baseSepolia.id]: rpcUrls.baseSepolia.ws
        ? fallback([
            webSocket(rpcUrls.baseSepolia.ws, webSocketOptions),
            ...BASE_SEPOLIA_RPC_URLS,
          ])
        : fallback(BASE_SEPOLIA_RPC_URLS),
      [arbitrumSepolia.id]: rpcUrls.arbitrumSepolia.ws
        ? fallback([
            webSocket(rpcUrls.arbitrumSepolia.ws, webSocketOptions),
            ...ARBITRUM_SEPOLIA_RPC_URLS,
          ])
        : fallback(ARBITRUM_SEPOLIA_RPC_URLS),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
