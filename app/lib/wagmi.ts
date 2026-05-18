import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http, fallback, createStorage, cookieStorage } from "wagmi";
import { mantleL1Source, mantleMainnet, mantleTestnet } from "@/lib/mantle";

export { mantleL1Source, mantleMainnet, mantleTestnet };

// Requires a real project ID from https://cloud.walletconnect.com for production.
// Without it, WalletConnect QR / mobile wallets won't work.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
const sepoliaRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://rpc.sepolia.org";
const mantleMainnetRpc = process.env.NEXT_PUBLIC_MANTLE_MAINNET_RPC || "https://rpc.mantle.xyz";

export const wagmiConfig = getDefaultConfig({
  appName: "RWAi — AI-Native Real World Assets",
  projectId,
  chains: [mantleTestnet, mantleMainnet, mantleL1Source],
  transports: {
    [mantleTestnet.id]: fallback([
      http(process.env.NEXT_PUBLIC_MANTLE_TESTNET_RPC || "https://rpc.sepolia.mantle.xyz", { retryCount: 0 }),
      http("https://mantle-sepolia.drpc.org", { retryCount: 0 }),
      http("https://rpc.ankr.com/mantle_sepolia", { retryCount: 0 }),
      http("https://mantle-sepolia-rpc.publicnode.com", { retryCount: 0 }),
    ], { rank: false, retryCount: 3 }),
    [mantleMainnet.id]: http(mantleMainnetRpc),
    [mantleL1Source.id]: http(sepoliaRpc),
  },
  // cookieStorage: SSR-safe, survives page refresh via Set-Cookie header.
  // Enables wagmi to rehydrate the connected wallet before first paint.
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});
