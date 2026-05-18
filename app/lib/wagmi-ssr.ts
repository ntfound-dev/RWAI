import { createConfig, http, fallback, createStorage, cookieStorage } from "wagmi";
import { mantleTestnet, mantleMainnet, mantleL1Source } from "@/lib/mantle";

const sepoliaRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://rpc.sepolia.org";
const mantleMainnetRpc = process.env.NEXT_PUBLIC_MANTLE_MAINNET_RPC || "https://rpc.mantle.xyz";

// Server-safe config for SSR cookie parsing only.
// Does NOT use RainbowKit's getDefaultConfig (client-only).
// Must share the same cookieStorage key as the client wagmiConfig.
export const wagmiSSRConfig = createConfig({
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
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});
