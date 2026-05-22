import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rainbowWallet,
  trustWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http, fallback, createStorage, cookieStorage, createConfig } from "wagmi";
import { mantleL1Source, mantleMainnet, mantleTestnet } from "@/lib/mantle";

export { mantleL1Source, mantleMainnet, mantleTestnet };

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
const sepoliaRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://rpc.sepolia.org";
const mantleMainnetRpc = process.env.NEXT_PUBLIC_MANTLE_MAINNET_RPC || "https://rpc.mantle.xyz";
const mantleTestnetRpc = process.env.NEXT_PUBLIC_MANTLE_TESTNET_RPC || "https://rpc.sepolia.mantle.xyz";

const chains = [mantleTestnet, mantleMainnet, mantleL1Source] as const;

const transports = {
  [mantleTestnet.id]: fallback([
    http(mantleTestnetRpc, { retryCount: 0 }),
    http("https://mantle-sepolia.drpc.org", { retryCount: 0 }),
    http("https://rpc.ankr.com/mantle_sepolia", { retryCount: 0 }),
    http("https://mantle-sepolia-rpc.publicnode.com", { retryCount: 0 }),
  ], { rank: false, retryCount: 3 }),
  [mantleMainnet.id]: http(mantleMainnetRpc),
  [mantleL1Source.id]: http(sepoliaRpc),
};

// Build wallet list — always include injected + MetaMask, add WalletConnect only when
// a real project ID is configured so mobile QR code actually works.
const hasValidProjectId = projectId.length > 8 && projectId !== "rwai-demo";

const walletGroups = [
  {
    groupName: "Popular",
    wallets: [
      injectedWallet,
      metaMaskWallet,
      coinbaseWallet,
      ...(hasValidProjectId ? [walletConnectWallet, rainbowWallet, trustWallet] : []),
    ],
  },
];

const connectors = connectorsForWallets(walletGroups, {
  appName: "RWAi — AI-Native Real World Assets",
  projectId: hasValidProjectId ? projectId : "00000000000000000000000000000000",
});

export const wagmiConfig = createConfig({
  chains,
  transports,
  connectors,
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});
