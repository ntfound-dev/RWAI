import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rainbowWallet,
  trustWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http, fallback, createStorage, cookieStorage, createConfig } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";
import { mantleL1Source, mantleMainnet, mantleTestnet } from "@/lib/mantle";

export { mantleL1Source, mantleMainnet, mantleTestnet };

const projectId     = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
const sepoliaRpc    = process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://rpc.sepolia.org";
const mantleMainnetRpc  = process.env.NEXT_PUBLIC_MANTLE_MAINNET_RPC || "https://rpc.mantle.xyz";
const mantleTestnetRpc  = process.env.NEXT_PUBLIC_MANTLE_TESTNET_RPC || "https://rpc.sepolia.mantle.xyz";

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

const hasValidProjectId = projectId.length > 8 && projectId !== "rwai-demo";

// When WalletConnect project ID is invalid, bypass WC SDK entirely.
// Use wagmi native connectors (injected + metaMask) — no external SDK init,
// no relay server calls, no initialization errors blocking the connect modal.
const connectors = hasValidProjectId
  ? connectorsForWallets(
      [{
        groupName: "Popular",
        wallets: [injectedWallet, metaMaskWallet, coinbaseWallet, walletConnectWallet, rainbowWallet, trustWallet],
      }],
      { appName: "RWAi — AI-Native Real World Assets", projectId },
    )
  : connectorsForWallets(
      [{
        groupName: "Connect Wallet",
        wallets: [injectedWallet, metaMaskWallet],
      }],
      // Use a minimal valid-format projectId — WC SDK won't be invoked
      // for injected/MetaMask wallets so this is just satisfying the type
      { appName: "RWAi — AI-Native Real World Assets", projectId: "rwai0000000000000000000000000001" },
    );

export const wagmiConfig = createConfig({
  chains,
  transports,
  connectors,
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});
