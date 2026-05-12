"use client";

import { usePathname } from "next/navigation";
import { useBlockNumber } from "wagmi";
import { mantleTestnet } from "@/lib/wagmi";

export function StatusBar() {
  const pathname = usePathname();
  const { data: block } = useBlockNumber({ chainId: mantleTestnet.id, watch: true });

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <span style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span className="live-dot"/>
          4 AGENTS ONLINE
        </span>
        <span>BLOCK {block ? block.toLocaleString() : "—"}</span>
        <span>GAS 0.012 GWEI</span>
        <span style={{ color:"var(--fg-3)" }}>{pathname.replace("/","").toUpperCase() || "HOME"}</span>
      </div>
      <div className="statusbar-right">
        <span>ERC-8004 SYNCED</span>
        <span>OPENCLAW · MANTLE SKILLS · OLLAMA</span>
        <span>
          <kbd style={{ padding:"1px 5px", border:"1px solid var(--line-strong)", borderRadius:2, fontFamily:"var(--font-mono)", fontSize:9 }}>⌘</kbd>{" "}
          <kbd style={{ padding:"1px 5px", border:"1px solid var(--line-strong)", borderRadius:2, fontFamily:"var(--font-mono)", fontSize:9 }}>K</kbd>{" "}
          COMMAND
        </span>
      </div>
    </footer>
  );
}
