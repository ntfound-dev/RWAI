"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/wagmi";
import { ChatModeProvider, useChatMode } from "@/lib/chat-mode-context";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { MeshBackground } from "@/components/ui/MeshBackground";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { BridgeView } from "@/components/ui/BridgeView";
import { GlobalJarvisPanel } from "@/components/ui/GlobalJarvisPanel";

function BridgeViewGate() {
  const { showBridge } = useChatMode();
  if (!showBridge) return null;
  return <BridgeView />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
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
              <BridgeViewGate />
              <GlobalJarvisPanel />
            </ChatModeProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
}
