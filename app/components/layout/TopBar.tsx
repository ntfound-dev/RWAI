"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChatMode, type ChatMode } from "@/lib/chat-mode-context";

const NAV = [
  { href: "/",          label: "Home" },
  { href: "/hub",       label: "Agents" },
  { href: "/chat",      label: "Atlas" },
  { href: "/tokenize",  label: "Tokenize" },
  { href: "/market",    label: "Market" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/docs",      label: "Docs" },
];

export function TopBar() {
  const pathname  = usePathname();
  const { mode, setMode, openBridge, jarvisOpen, toggleJarvis } = useChatMode();
  const onChat  = pathname === "/chat";
  const onHome  = pathname === "/";
  const onVoice = pathname === "/voice";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <span className="brand-mark" />
          <span>RWAi</span>
          <span style={{ color:"var(--fg-3)" }}>/</span>
          <span style={{ color:"var(--fg-2)", fontWeight:400 }}>v0.4.1</span>
        </div>
      </div>

      <nav className="topbar-nav" translate="no">
        {NAV.map(({ href, label }) => (
          <Link key={href} href={href}>
            <button className={pathname === href ? "active" : ""} suppressHydrationWarning>{label}</button>
          </Link>
        ))}
      </nav>

      <div className="topbar-right" style={{ display:"flex", alignItems:"center", gap:8 }}>
        {/* SPLIT / JARVIS mode toggle — only on /chat */}
        {onChat && (
          <div style={{ display:"flex", border:"1px solid var(--line-strong)", borderRadius:2, overflow:"hidden" }}>
            {([
              { key: "split",  label: "SPLIT",  action: () => setMode("split") },
              { key: "bridge", label: "JARVIS", action: () => openBridge() },
            ] as { key: ChatMode; label: string; action: () => void }[]).map(({ key, label, action }, i) => (
              <button
                key={key}
                onClick={action}
                style={{
                  background: mode === key ? "rgba(0,229,160,0.12)" : "transparent",
                  border: "none",
                  borderRight: i === 0 ? "1px solid var(--line-strong)" : "none",
                  color: mode === key ? "var(--accent)" : "var(--fg-3)",
                  fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.12em",
                  padding:"5px 10px", cursor:"pointer", textTransform:"uppercase",
                  transition:"all 0.15s",
                }}
              >{label}</button>
            ))}
          </div>
        )}

        {/* JARVIS pill — hidden on home, /chat (has own JARVIS), /voice (IS JARVIS) */}
        {!onHome && !onChat && !onVoice && (
          <button
            onClick={toggleJarvis}
            style={{
              display:"flex", alignItems:"center", gap:5,
              background: jarvisOpen ? "rgba(0,212,255,0.1)" : "rgba(168,85,247,0.06)",
              border: `1px solid ${jarvisOpen ? "rgba(0,212,255,0.5)" : "rgba(168,85,247,0.3)"}`,
              color: jarvisOpen ? "#00d4ff" : "#a855f7",
              fontFamily:"var(--font-mono)", fontSize:9,
              padding:"4px 10px", cursor:"pointer", letterSpacing:"0.12em",
              transition:"all 0.2s",
              boxShadow: jarvisOpen ? "0 0 12px rgba(0,212,255,0.2)" : "none",
            }}
            title={jarvisOpen ? "Close JARVIS" : "Open JARVIS"}
          >
            <span style={{
              width:5, height:5, borderRadius:"50%",
              background: jarvisOpen ? "#00d4ff" : "#a855f7",
              boxShadow: `0 0 6px ${jarvisOpen ? "#00d4ff" : "#a855f7"}`,
              display:"inline-block",
              animation:"topbarJarvisPulse 2s ease-in-out infinite",
            }} />
            JARVIS
          </button>
        )}

        <span className="mono-sm" style={{ color:"var(--fg-2)" }}>MANTLE · TESTNET</span>

        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
            if (!mounted) return null;
            if (!account) return (
              <button className="btn btn-sm btn-primary" onClick={openConnectModal}>Connect</button>
            );
            if (chain?.unsupported) return (
              <button className="btn btn-sm" style={{ color:"var(--error,#f87171)", borderColor:"rgba(248,113,113,0.4)" }} onClick={openChainModal}>
                Wrong Network
              </button>
            );
            return (
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <button className="btn btn-sm" onClick={openChainModal} style={{ padding:"0 8px", fontSize:10 }}>
                  {chain?.hasIcon && chain.iconUrl && (
                    <img src={chain.iconUrl} alt={chain.name ?? ""} style={{ width:12, height:12, borderRadius:"50%", marginRight:4, display:"inline-block", verticalAlign:"middle" }} />
                  )}
                  {chain?.name ?? "Unknown"}
                </button>
                <button className="btn btn-sm" onClick={openAccountModal}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--accent)", boxShadow:"0 0 6px var(--accent)", display:"inline-block", marginRight:5 }} />
                  {account.displayName}
                </button>
              </div>
            );
          }}
        </ConnectButton.Custom>
      </div>

      <style>{`
        @keyframes topbarJarvisPulse { 0%,100%{opacity:1;box-shadow:0 0 6px #a855f7;}50%{opacity:0.5;box-shadow:0 0 2px #a855f7;} }
      `}</style>
    </header>
  );
}
