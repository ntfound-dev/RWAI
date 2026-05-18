"use client";

export const AGENTS = {
  nexus: { id: "nexus",  name: "Nexus",  role: "Tokenization",   glyph: "N", color: "var(--nexus)",  rep: 5.00, runs: 0, blurb: "Parses asset documents, valuates, and proposes token structure.", tools: ["parse_pdf", "valuate_asset", "draft_erc20", "register_rwa"] },
  shield:{ id: "shield", name: "Shield", role: "Compliance",     glyph: "S", color: "var(--shield)", rep: 5.00, runs: 0, blurb: "Reviews KYC, ownership, and jurisdictional risk before deploy.",  tools: ["kyc_check", "ownership_verify", "jurisdiction_scan", "risk_score"] },
  yield: { id: "yield",  name: "Yield",  role: "Market Monitor", glyph: "Y", color: "var(--yield)",  rep: 3.75, runs: 0, blurb: "Watches yields across mETH, USDY, MI4 and surfaces drift.",     tools: ["yield_feed", "price_oracle", "rebalance_signal", "apy_diff"] },
  atlas: { id: "atlas",  name: "Atlas",  role: "Portfolio",      glyph: "A", color: "var(--atlas)",  rep: 4.25, runs: 0, blurb: "Talks with users to set strategy and orchestrates the others.",  tools: ["plan_strategy", "delegate", "rebalance", "explain"] },
} as const;

export type AgentId = keyof typeof AGENTS;

function AgentLogoSvg({ agent }: { agent: AgentId }) {
  if (agent === "atlas") return (
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.2" opacity="0.35"/>
      <ellipse cx="16" cy="16" rx="11" ry="4.5" stroke="currentColor" strokeWidth="1.2" opacity="0.6" style={{ transformOrigin:"16px 16px", animation:"atlasOrbit 6s linear infinite" }}/>
      <circle cx="16" cy="16" r="3" fill="currentColor"/>
      <circle cx="16" cy="16" r="3" fill="currentColor" opacity="0.4" style={{ transformOrigin:"16px 16px", animation:"atlasPulse 2s ease-in-out infinite" }}/>
      <circle r="1.6" fill="currentColor"><animateMotion dur="4s" repeatCount="indefinite" path="M 0,0 a 11,4.5 0 1,1 0.01,0"/></circle>
    </svg>
  );
  if (agent === "nexus") return (
    <svg viewBox="0 0 32 32" fill="none">
      <line x1="16" y1="6" x2="6"  y2="22" stroke="currentColor" strokeWidth="1" opacity="0.4" style={{ animation:"nexusEdge 1.6s ease-in-out infinite" }}/>
      <line x1="16" y1="6" x2="26" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.4" style={{ animation:"nexusEdge 1.6s ease-in-out 0.2s infinite" }}/>
      <line x1="6"  y1="22" x2="26" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.4" style={{ animation:"nexusEdge 1.6s ease-in-out 0.4s infinite" }}/>
      <circle cx="16" cy="6"  r="2.6" fill="currentColor" style={{ transformOrigin:"16px 6px",  animation:"nexusNode 1.6s ease-in-out infinite" }}/>
      <circle cx="6"  cy="22" r="2.6" fill="currentColor" style={{ transformOrigin:"6px 22px",  animation:"nexusNode 1.6s ease-in-out 0.4s infinite" }}/>
      <circle cx="26" cy="22" r="2.6" fill="currentColor" style={{ transformOrigin:"26px 22px", animation:"nexusNode 1.6s ease-in-out 0.8s infinite" }}/>
    </svg>
  );
  if (agent === "shield") return (
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M 16 4 L 26 9 L 26 18 Q 26 24 16 28 Q 6 24 6 18 L 6 9 Z" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.1"/>
      <path d="M 16 4 L 26 9 L 26 18 Q 26 24 16 28 Q 6 24 6 18 L 6 9 Z" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6" style={{ strokeDasharray:80, animation:"shieldDraw 3s ease-in-out infinite" }}/>
      <line x1="6" y1="16" x2="26" y2="16" stroke="currentColor" strokeWidth="1.2" opacity="0.9" style={{ animation:"shieldScan 2.4s ease-in-out infinite" }}/>
      <circle cx="16" cy="16" r="1.8" fill="currentColor"/>
    </svg>
  );
  return (
    <svg viewBox="0 0 32 32" fill="none">
      <line x1="4" y1="28" x2="28" y2="28" stroke="currentColor" strokeWidth="0.8" opacity="0.3"/>
      {[0,1,2,3,4].map(i => (
        <rect key={i} x={5+i*5} width="3" fill="currentColor" y="10" height="18"
          style={{ animation:`yieldBar 1.4s ease-in-out ${i*0.12}s infinite`, transformOrigin:`${6.5+i*5}px 28px` }}/>
      ))}
      <path d="M 5 14 L 10 11 L 15 17 L 20 8 L 25 13" stroke="currentColor" strokeWidth="1.2" fill="none" strokeDasharray="40" style={{ animation:"yieldLine 3s ease-in-out infinite" }}/>
    </svg>
  );
}

interface Props { agent: AgentId; size?: "sm" | "md" | "lg" | "xl"; active?: boolean; }

export function AgentMonogram({ agent, size = "md", active = false }: Props) {
  const a = AGENTS[agent];
  const sizeClass = size === "lg" ? " lg" : size === "xl" ? " xl" : size === "sm" ? " sm" : "";
  return (
    <div className={`agent-mono${sizeClass}${active ? " active" : ""}`} data-agent={agent} title={a.name}>
      <div style={{ position:"absolute", inset:0, color:`var(--${agent})`, display:"grid", placeItems:"center" }}>
        <div style={{ width:"78%", height:"78%" }}><AgentLogoSvg agent={agent}/></div>
      </div>
    </div>
  );
}
