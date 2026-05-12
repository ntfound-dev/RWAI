import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { mantleL1Source, mantleMainnet, mantleTestnet } from "@/lib/mantle";

export { mantleL1Source, mantleMainnet, mantleTestnet };

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const hasWalletConnectProject =
  walletConnectProjectId &&
  walletConnectProjectId !== "rwai-demo" &&
  walletConnectProjectId !== "your_walletconnect_project_id";

const sepoliaRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://rpc.sepolia.org";
const mantleTestnetRpc = process.env.NEXT_PUBLIC_MANTLE_TESTNET_RPC || "https://rpc.sepolia.mantle.xyz";
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
    [mantleTestnet.id]: http(mantleTestnetRpc),
    [mantleL1Source.id]: http(sepoliaRpc),
    [mantleMainnet.id]: http(mantleMainnetRpc),
  },
  ssr: true,
});
