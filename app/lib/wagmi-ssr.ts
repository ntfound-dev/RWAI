import type { Config } from "wagmi";

// Minimal server-safe stub for cookieToInitialState().
// That function only reads config.storage?.key — no chains, transports, or connectors needed.
// "wagmi" is the default key used by createStorage({ storage: cookieStorage }).
export const wagmiSSRConfig = {
  storage: { key: "wagmi" },
} as unknown as Config;
