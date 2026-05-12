import { createConfig, http, fallback } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { mantleL1Source, mantleMainnet, mantleTestnet } from "@/lib/mantle";

export { mantleL1Source, mantleMainnet, mantleTestnet };

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const hasWalletConnectProject =
  walletConnectProjectId &&
  walletConnectProjectId !== "rwai-demo" &&
  walletConnectProjectId !== "your_walletconnect_project_id";

const sepoliaRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://rpc.sepolia.org";
const mantleMainnetRpc = process.env.NEXT_PUBLIC_MANTLE_MAINNET_RPC || "https://rpc.mantle.xyz";

export const wagmiConfig = createConfig({
  chains: [mantleTestnet, mantleL1Source, mantleMainnet],
  connectors: [
    injected(),
    ...(hasWalletConnectProject
      ? [walletConnect({ projectId: walletConnectProjectId as string })]
      : []),
  ],
  transports: {
    [mantleTestnet.id]: fallback([
      http(process.env.NEXT_PUBLIC_MANTLE_TESTNET_RPC || "https://rpc.sepolia.mantle.xyz"),
      http("https://mantle-sepolia.drpc.org"),
      http("https://rpc.ankr.com/mantle_sepolia"),
      http("https://mantle-sepolia-rpc.publicnode.com"),
      http("https://rpc.sepolia.mantle.xyz"),
    ], { rank: false }),
    [mantleL1Source.id]: http(sepoliaRpc),
    [mantleMainnet.id]: http(mantleMainnetRpc),
  },
  ssr: true,
});
