"use client";

import { useState } from "react";
import { AgentMonogram } from "@/components/agents/AgentMonogram";
import { ADDRESSES } from "@/lib/contracts";

const SECTIONS = [
  { id:"getting-started",  label:"Getting Started" },
  { id:"architecture",     label:"Architecture" },
  { id:"nexus-doc",        label:"Nexus" },
  { id:"shield-doc",       label:"Shield" },
  { id:"yield-doc",        label:"Yield" },
  { id:"atlas-doc",        label:"Atlas" },
  { id:"erc8004",          label:"ERC-8004" },
  { id:"contracts",        label:"Contracts" },
  { id:"orchestration",    label:"Orchestration" },
];

type SectionId = typeof SECTIONS[number]["id"];

interface SectionContent {
  kicker: string;
  title: string[];
  body: string;
  code?: { title: string; body: string };
}

const CONTENT: Record<string, SectionContent> = {
  "getting-started": {
    kicker: "GETTING STARTED",
    title: ["Build on", "RWAi."],
    body: "RWAi is open-source. Clone the repo, install deps, set env vars, deploy to Mantle Testnet in under 30 minutes.",
    code: { title: "quickstart", body: `# Clone & install\ngit clone https://github.com/yourteam/rwai\ncd rwai/contracts && npm install\ncd ../app && npm install\n\n# Configure\ncp contracts/.env.example contracts/.env\n# Add PRIVATE_KEY + MANTLE_API_KEY\n\n# Deploy contracts\ncd contracts && npm run deploy:testnet\n\n# Register ERC-8004 agents\nnpm run register:agents\n\n# Start frontend\ncd ../app && npm run dev` },
  },
  "architecture": {
    kicker: "GETTING STARTED · ARCHITECTURE",
    title: ["Four layers,", "one fabric."],
    body: "OpenClaw Gateway is the backbone: users talk to agents via Telegram or WebChat, custom Mantle skills give agents DeFi hands (swap, yield fetch, deploy) on Merchant Moe and Fluxion. Ollama (Qwen3) runs locally for free; Claude fires as fallback. Every action is recorded on-chain via ERC-8004.",
    code: { title: "layout", body: `┌─────────────────────────────────────────┐\n│  CHANNELS · Telegram · WebChat · Discord│\n├─────────────────────────────────────────┤\n│  OPENCLAW GATEWAY  ·  self-hosted       │\n│  ▸ Skills: Nexus, Shield, Yield, Atlas  │\n│  ▸ Custom Mantle skills (swap, yield)   │\n│  ▸ Models: Ollama (Qwen3) + Claude      │\n│  ▸ Router: multi-agent isolation        │\n├─────────────────────────────────────────┤\n│  CLIENT  ·  Next.js · Wagmi · Viem      │\n├─────────────────────────────────────────┤\n│  ON-CHAIN  ·  Mantle L2                 │\n│  ▸ RWAiRegistry · ERC-8004              │\n│  ▸ Merchant Moe · Fluxion               │\n└─────────────────────────────────────────┘` },
  },
  "nexus-doc": {
    kicker: "AGENTS · NEXUS", title: ["Tokenization,", "precise."],
    body: "Nexus parses asset documents, computes valuations, and drafts the ERC-20 + RWA registry payload. Outputs are deterministic given the same inputs.",
    code: { title: "nexus.draft_erc20()", body: `await nexus.draftErc20({\n  asset: 'manhattan-001',\n  supply: 2_500_000,\n  yieldBps: 408,\n  jurisdiction: 'US-NY-RegD',\n});\n// → AssetToken.sol deployed on Mantle\n// → ERC-8004 reputation +10` },
  },
  "shield-doc": {
    kicker: "AGENTS · SHIELD", title: ["Compliance,", "cautious."],
    body: "Shield runs KYC, ownership verification, jurisdictional risk, and sanctions screening before any asset deploys. Default posture: refuse.",
    code: { title: "shield.review()", body: `const r = await shield.review({ assetId });\n// r.score: 0–100\n// r.cleared: boolean\n// Stored permanently in ComplianceLog.sol\nif (r.score < 70) throw new Error('blocked: ' + r.notes);` },
  },
  "yield-doc": {
    kicker: "AGENTS · YIELD", title: ["Markets,", "observed."],
    body: "Yield reads from Mantle DEX oracles, computes drift, and publishes on-chain snapshots to YieldOracle.sol every 6 hours. It signals Atlas when rebalancing is needed.",
    code: { title: "yield.feed()", body: `const apy = await yield.feed(['USDY','MI4','mETH']);\n// { USDY: 4.20, MI4: 5.81, mETH: 6.12 }\n// → Written to YieldOracle.sol on Mantle\n// → ERC-8004 reputation +5` },
  },
  "atlas-doc": {
    kicker: "AGENTS · ATLAS", title: ["Strategy,", "orchestrated."],
    body: "Atlas talks with users, plans allocations under risk constraints, and delegates execution to the other agents. The only agent that can call other agents.",
    code: { title: "atlas.plan()", body: `const plan = await atlas.plan({\n  amount: 10_000,\n  risk: 'conservative',\n  horizon: '24mo'\n});\n// Delegates: shield.kyc() → yield.feed() → nexus.register()\n// → PortfolioVault.sol updated on Mantle\n// → AI reasoning stored in AgentExecutor.sol` },
  },
  "erc8004": {
    kicker: "PROTOCOL · ERC-8004", title: ["Reputation,", "on-chain."],
    body: "ERC-8004 gives each RWAi agent a sovereign NFT identity on Mantle. Reputation increments after every successful action, creating a verifiable track record.",
    code: { title: "ERC-8004 addresses", body: `// Mantle Testnet (official Mantle deployment)\nIdentity Registry:\n  ${ADDRESSES.ERC8004_Identity}\n\nReputation Registry:\n  ${ADDRESSES.ERC8004_Reputation}\n\n// Called after every agent action:\nERC8004_REPUTATION.postFeedback(\n  agentId, identityRegistry,\n  score, tag, feedbackURI\n);` },
  },
  "contracts": {
    kicker: "PROTOCOL · CONTRACTS", title: ["Six contracts,", "OpenZeppelin v5."],
    body: "All RWAi contracts use OpenZeppelin v5 as foundation. No security-critical logic from scratch.",
    code: { title: "contract addresses (testnet)", body: `RWAiRegistry:   ${ADDRESSES.RWAiRegistry}\nComplianceLog:  ${ADDRESSES.ComplianceLog}\nYieldOracle:    ${ADDRESSES.YieldOracle}\nAgentExecutor:  ${ADDRESSES.AgentExecutor}\nPortfolioVault: ${ADDRESSES.PortfolioVault}\n\n// All verified on:\n// https://sepolia.mantlescan.xyz` },
  },
  "orchestration": {
    kicker: "PROTOCOL · ORCHESTRATION", title: ["Atlas,", "in command."],
    body: "Orchestration uses a typed delegation protocol. Each delegation carries a capability check, a budget (token + time), and a return contract.",
    code: { title: "delegate", body: `const result = await atlas.delegate({\n  to: 'shield', tool: 'risk_scan',\n  args: { assets: ['USDY','MI4','mETH'] },\n  budget: { tokens: 800, ms: 2000 },\n});\n// Atlas writes reasoning to AgentExecutor.sol\n// ERC-8004 reputation updated for both agents` },
  },
};

export default function DocsPage() {
  const [active, setActive] = useState<SectionId>("getting-started");
  const content = CONTENT[active] ?? CONTENT["getting-started"];

  return (
    <div style={{ maxWidth:1280, margin:"0 auto", padding:"32px", display:"grid", gridTemplateColumns:"220px 1fr", gap:0 }}>

      {/* Sidebar nav */}
      <div style={{ borderRight:"1px solid var(--line)", paddingRight:24 }}>
        <div className="mono" style={{ marginBottom:16, color:"var(--fg-3)" }}>DOCUMENTATION</div>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)}
            style={{
              display:"block", width:"100%", textAlign:"left", padding:"8px 10px", marginBottom:2,
              fontFamily:"var(--font-mono)", fontSize:11, letterSpacing:"0.06em", textTransform:"uppercase",
              background: active === s.id ? "var(--bg-2)" : "transparent",
              color: active === s.id ? "var(--fg-0)" : "var(--fg-2)",
              border: "none", borderRadius:2, cursor:"pointer",
              borderLeft: active === s.id ? "2px solid var(--accent)" : "2px solid transparent",
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ paddingLeft:40 }}>
        <div className="mono" style={{ color:"var(--accent)", marginBottom:14 }}>{content.kicker}</div>
        <h1 className="display" style={{ fontSize:64, marginBottom:20, lineHeight:1.05 }}>
          {content.title.map((line, i) => <span key={i}>{i > 0 && <br/>}{line}</span>)}
        </h1>
        <p style={{ fontSize:14, color:"var(--fg-1)", maxWidth:600, marginBottom:32, lineHeight:1.65 }}>
          {content.body}
        </p>

        {content.code && (
          <div className="panel" style={{ maxWidth:640 }}>
            <div className="panel-header">
              <span className="mono-sm" style={{ textTransform:"none", letterSpacing:0, fontFamily:"var(--font-mono)" }}>
                {content.code.title}
              </span>
            </div>
            <pre style={{ padding:"16px", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-1)", lineHeight:1.8, overflowX:"auto", whiteSpace:"pre-wrap" }}>
              {content.code.body}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
