"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/wagmi";
import { ChatModeProvider, useChatMode } from "@/lib/chat-mode-context";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { MeshBackground } from "@/components/ui/MeshBackground";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { JarvisView } from "@/components/ui/JarvisView";
import { GlobalJarvisPanel } from "@/components/ui/GlobalJarvisPanel";

function JarvisViewGate() {
  const { showBridge } = useChatMode();
  if (!showBridge) return null;
  return <JarvisView />;
}

// Singleton QueryClient — created once per app lifetime, not per render.
// staleTime 30s: avoids hammering RPC on every focus/tab-switch.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

export function Providers({ children, initialState }: { children: React.ReactNode; initialState?: State }) {
  return (
    <ErrorBoundary>
      {/* initialState: cookie-parsed on server — rehydrates wallet before first paint */}
      <WagmiProvider config={wagmiConfig} initialState={initialState}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: "#00e5a0",
              accentColorForeground: "#0a0f14",
              borderRadius: "small",
              fontStack: "system",
              overlayBlur: "small",
            })}
            locale="en-US"
          >
            <ChatModeProvider>
              <div className="app-mesh-bg" aria-hidden="true">
                <MeshBackground />
              </div>
              <TopBar />
              <main className="app-shell-main">
                {children}
              </main>
              <StatusBar />
              <JarvisViewGate />
              <GlobalJarvisPanel />
            </ChatModeProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
}
