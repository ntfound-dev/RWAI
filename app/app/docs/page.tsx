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
  { id:"portfolio-doc",    label:"Portfolio" },
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
    title: ["Where do I", "begin?"],
    body: "RWAi is simple: connect your wallet, chat with Atlas, and let AI manage your portfolio. You don't need to understand blockchain or DeFi — just tell Atlas how much you want to invest and how much risk you're comfortable with. Atlas handles the rest.\n\nIf you're a developer who wants to build on top of RWAi, all the code is open-source. Deploy your own contracts to Mantle Sepolia in under 30 minutes.",
    code: { title: "developer quickstart", body: `# Clone & install\ngit clone https://github.com/ntfound-dev/RWAI\ncd rwai/contracts && npm install\ncd ../app && npm install\n\n# Fill in env\ncp contracts/.env.example contracts/.env\ncp agents/.env.example agents/.env\n\n# Deploy contracts to Mantle Sepolia\ncd contracts && npm run deploy:testnet\n\n# Run everything\nmake run\n# Backend  → http://localhost:8001\n# Frontend → http://localhost:3000` },
  },
  "architecture": {
    kicker: "HOW IT WORKS",
    title: ["How does RWAi", "actually work?"],
    body: "Think of it as having 4 AI assistants working around the clock:\n\n① You chat with Atlas — say \"invest $10,000 conservatively\".\n② Atlas asks Yield to check current interest rates on all assets.\n③ Atlas asks Shield to verify all assets are legal and safe.\n④ Atlas creates an allocation plan and writes the decision to the blockchain — permanent, transparent, verifiable by anyone.\n\nEvery AI decision is stored on-chain. Not a promise — proof.",
    code: { title: "system flow", body: `You (chat/UI)\n  ↓\nAtlas — AI portfolio manager\n  ├── asks Yield: "what's the current USDY rate?"\n  ├── asks Shield: "is this asset compliant?"  \n  └── writes decision → AgentExecutor.sol (Mantle)\n            ↓\n    stored forever on-chain\n    verifiable at sepolia.mantlescan.xyz` },
  },
  "nexus-doc": {
    kicker: "AGENT · NEXUS",
    title: ["Got a real asset?", "Nexus tokenizes it."],
    body: "Nexus is the AI that turns real-world assets — land, property, stocks, bonds — into digital tokens on Mantle.\n\nHow it works: upload your asset documents (certificates, deeds, appraisal reports). Nexus reads them, calculates fair value, suggests a token name and supply, then asks Shield to verify legal compliance before deployment.\n\nThe result: your asset becomes an ERC-20 token that can be traded, fractionally owned, or used as collateral — all recorded on-chain.",
    code: { title: "example Nexus analysis output", body: `Input document: "Land certificate 500m² Bali, HM title, 2024"\n\nNexus output:\n  Token name    : RWAi Bali Land\n  Symbol        : BALI500\n  Est. value    : $315,000\n  Supply        : 1,000,000 tokens\n  Price/token   : $0.315\n  Annual yield  : 2.00%\n  Shield status : Cleared ✓\n  TX on-chain   : 0x185071df...` },
  },
  "shield-doc": {
    kicker: "AGENT · SHIELD",
    title: ["Is it legally", "safe?"],
    body: "Shield is the AI compliance agent that ensures every tokenized asset meets legal standards before it goes live.\n\nShield checks: are the ownership documents complete? Are there legal risks in that jurisdiction? Is the associated wallet on any international sanctions list?\n\nShield's review is stored permanently in ComplianceLog.sol — so investors can verify that an asset has passed due diligence themselves, without taking anyone's word for it.",
    code: { title: "example Shield compliance score", body: `Asset: Bali Land 500m²\n\nCompliance score : 82 / 100  ✓ Cleared\nJurisdiction     : Indonesia\nNotes            : Documents complete.\n                   Moderate local market risk.\nStored in        : ComplianceLog.sol\nTX               : 0x2af248...` },
  },
  "yield-doc": {
    kicker: "AGENT · YIELD",
    title: ["Best rates,", "monitored 24/7."],
    body: "Yield is the AI that monitors interest rates (APY) across all RWA assets on Mantle — USDY, mETH, fBTC, mUSD — every few hours.\n\nIf an asset's rate rises significantly, Yield automatically signals Atlas to consider rebalancing the portfolio. All yield data is written to YieldOracle.sol so it can be publicly verified — not a number that can be manipulated.\n\nYou can also ask directly: \"what's the current mETH rate?\" — Yield will respond with real-time data.",
    code: { title: "live yield snapshot", body: `Yield Agent — market snapshot\n\n  USDY   4.20% APY  ██████░░░░  stable\n  mETH   6.12% APY  █████████░  up +0.8%\n  fBTC   3.50% APY  █████░░░░░  stable\n  mUSD   3.90% APY  ██████░░░░  stable\n\nBlended (conservative 50/25/15/10):\n  → 4.57% APY\n  → $38.08 / month per $10,000` },
  },
  "atlas-doc": {
    kicker: "AGENT · ATLAS",
    title: ["Your AI", "portfolio manager."],
    body: "Atlas is the primary AI you chat with. It knows your portfolio, understands your investment goals, and coordinates Nexus, Shield, and Yield to execute your strategy.\n\nTell Atlas: how much capital you want to invest, whether you're conservative or aggressive, and your investment horizon. Atlas will build a plan, explain its reasoning in plain language, then write that decision to the blockchain — transparent and auditable any time.\n\nYou can also enable autonomous mode: Atlas can rebalance automatically within the limits you set, without requiring confirmation each time.",
    code: { title: "example conversation with Atlas", body: `You   : "I have $10,000. I want a conservative\n         investment — I can't afford big losses."\n\nAtlas : "Got it. I recommend:\n         50% USDY  — stable, 4.2% APY\n         25% mETH  — growth, 6.1% APY\n         15% mUSD  — stable, 3.9% APY\n         10% fBTC  — diversification\n         \n         Blended APY: ~4.57%\n         Est. income: $38/month\n         \n         Reasoning written on-chain →\n         TX: 0x77a66d..."` },
  },
  "portfolio-doc": {
    kicker: "FEATURE · PORTFOLIO",
    title: ["Your portfolio,", "managed by Atlas."],
    body: "The Portfolio page shows your RWA asset allocation in real-time: what percentage is in USDY, mETH, mUSD, and fBTC, your combined yield, and estimated monthly income.\n\nEvery allocation change Atlas makes is stored on-chain — you can click the TX link and verify it yourself on Mantlescan any time. Nothing can be hidden.\n\nTo enable Atlas in autonomous mode:\n① Deposit USDY into HybridVault as Atlas's working capital.\n② Click 'Enable Atlas' — sign the permission with your wallet. This caps how much Atlas can manage and for how long.\n③ Atlas can start auto-rebalancing within the limits you approved — no further confirmation needed until permission expires.",
    code: { title: "how to read the portfolio page", body: `Portfolio Value   → total value of your investments\nBlended APY       → weighted average yield across all assets\nMonthly Income    → estimated income per month\nRisk Score        → 1 (very safe) – 10 (very aggressive)\n\nAllocation chart  → proportion of each asset (color bars)\nAgent history     → all Atlas actions + on-chain TX links\n\nHybridVault panel:\n  Deposit →  move USDY into vault\n  Withdraw ← pull USDY back to wallet\n  Enable Atlas → grant autonomous permission to Atlas` },
  },
  "erc8004": {
    kicker: "PROTOCOL · ERC-8004",
    title: ["AI identity", "on the blockchain."],
    body: "ERC-8004 is Mantle's official standard for AI agent identity. Every RWAi agent — Nexus, Shield, Yield, Atlas — has a unique identity NFT on Mantle that stores their track record.\n\nEvery time an agent successfully completes a task, its reputation score goes up. If an agent fails or breaks the rules, the score drops. This score determines how autonomously an agent can act: higher score → can manage larger amounts without human confirmation.\n\nThis isn't a cosmetic feature — it's a real AI accountability system running on the blockchain.",
    code: { title: "current agent reputation scores", body: `Agent     ID    Score   Autonomy Level\n────────────────────────────────────\nNexus     41    85/100  Medium (level 3)\nShield    42    75/100  Medium (level 3)\nYield     43    75/100  Medium (level 3)\nAtlas     44    75/100  Medium (level 3)\n\nLevel 1 = restricted  (score < 50)\nLevel 2 = limited     (score 50–69)\nLevel 3 = medium      (score 70–89)\nLevel 4 = full        (score ≥ 90)` },
  },
  "contracts": {
    kicker: "PROTOCOL · CONTRACTS",
    title: ["8 contracts,", "all on-chain."],
    body: "All of RWAi's logic runs on smart contracts on Mantle Sepolia — not on hidden servers that can be shut down or manipulated.\n\nEvery agent action is permanently recorded in AgentExecutor. Every tokenized asset is logged in RWAiRegistry. Every compliance score is stored in ComplianceLog. Yield data lives in YieldOracle.\n\nAll contracts are open-source and verifiable on Mantlescan — anyone can audit without permission.",
    code: { title: "contract addresses (Mantle Sepolia)", body: `AgentExecutor     ${ADDRESSES.AgentExecutor}\nRWAiRegistry      ${ADDRESSES.RWAiRegistry}\nComplianceLog     ${ADDRESSES.ComplianceLog}\nYieldOracle       ${ADDRESSES.YieldOracle}\nPortfolioVault    ${ADDRESSES.PortfolioVault}\nHybridVault       ${ADDRESSES.HybridVault}\nAssetToken        ${ADDRESSES.AssetToken}\n\nVerify at:\nhttps://sepolia.mantlescan.xyz` },
  },
  "orchestration": {
    kicker: "PROTOCOL · ORCHESTRATION",
    title: ["Atlas leads,", "agents execute."],
    body: "When you ask Atlas to work, Atlas doesn't work alone — it automatically coordinates the entire agent team.\n\nExample: you ask Atlas to build a new portfolio. Atlas will:\n① Ask Yield to check today's rates for all assets\n② Ask Shield to verify the assets being included\n③ Calculate optimal allocation based on your risk score\n④ Write the plan to PortfolioVault on Mantle\n⑤ Store the reasoning in AgentExecutor — permanently\n\nAll of this happens in seconds. You see the result, not the process — but the process is fully auditable any time.",
    code: { title: "Atlas on-chain action trail", body: `You: "Build a conservative $10k portfolio"\n       ↓\nAtlas → Yield.getAPY()           [internal]\nAtlas → Shield.verify()           [internal]\nAtlas → executeAllocation()       [on-chain TX]\n         → AgentExecutor.sol\n         → TX: 0x77a66d7a...\n         → stored permanently\n         → verify: sepolia.mantlescan.xyz` },
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
