"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { MeshBackground } from "@/components/ui/MeshBackground";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="app-mesh-bg" aria-hidden="true">
          <MeshBackground />
        </div>
        <TopBar />
        <main className="app-shell-main">
          {children}
        </main>
        <StatusBar />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
