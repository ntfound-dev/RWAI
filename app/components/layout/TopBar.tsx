"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";

const NAV = [
  { href: "/",          label: "Home" },
  { href: "/hub",       label: "Agents" },
  { href: "/chat",      label: "Chat" },
  { href: "/tokenize",  label: "Tokenize" },
  { href: "/market",    label: "Market" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/voice",     label: "Atlas" },
  { href: "/docs",      label: "Docs" },
];

export function TopBar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const injectedConnector = connectors.find(connector => connector.id === "injected") ?? connectors[0];

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

      <nav className="topbar-nav">
        {NAV.map(({ href, label }) => (
          <Link key={href} href={href}>
            <button className={pathname === href ? "active" : ""}>{label}</button>
          </Link>
        ))}
      </nav>

      <div className="topbar-right" style={{ display:"flex", alignItems:"center", gap:12 }}>
        <span className="mono-sm" style={{ color:"var(--fg-2)" }}>MANTLE · TESTNET</span>
        {isConnected ? (
          <button className="btn btn-sm" onClick={() => disconnect()}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--accent)", boxShadow:"0 0 6px var(--accent)", display:"inline-block" }}/>
            {address?.slice(0,6)}…{address?.slice(-4)}
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" disabled={!injectedConnector} onClick={() => injectedConnector && connect({ connector: injectedConnector })}>
            Connect
          </button>
        )}
      </div>
    </header>
  );
}
