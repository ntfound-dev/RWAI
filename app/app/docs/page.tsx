"use client";

import { useState, useCallback } from "react";
import { ADDRESSES } from "@/lib/contracts";

// ── Sidebar structure ───────────────────────────────────────────
const SIDEBAR = [
  {
    group: "OVERVIEW",
    items: [
      { id: "getting-started", label: "Getting Started" },
      { id: "architecture",    label: "Architecture" },
    ],
  },
  {
    group: "FEATURES",
    items: [
      { id: "tokenize",     label: "Tokenize" },
      { id: "market",       label: "Market" },
      { id: "portfolio-doc",label: "Portfolio" },
    ],
  },
  {
    group: "AGENTS",
    items: [
      { id: "atlas-doc",  label: "Atlas" },
      { id: "nexus-doc",  label: "Nexus" },
      { id: "shield-doc", label: "Shield" },
      { id: "yield-doc",  label: "Yield" },
      { id: "orchestration", label: "Orchestration" },
    ],
  },
  {
    group: "PROTOCOL",
    items: [
      { id: "erc8004",   label: "ERC-8004 Identity" },
      { id: "contracts", label: "Contract Addresses" },
      { id: "consent",   label: "EIP-712 Consent" },
    ],
  },
  {
    group: "TOKENOMICS",
    items: [
      { id: "tokenomics", label: "$RWAI Token" },
      { id: "revenue",    label: "Revenue Model" },
      { id: "gtm",        label: "Go-to-Market" },
    ],
  },
  {
    group: "API REFERENCE",
    items: [
      { id: "api-auth",      label: "Auth & Rate Limits" },
      { id: "api-chat",      label: "Chat & Status" },
      { id: "api-portfolio", label: "Portfolio" },
      { id: "api-tokenize",  label: "Tokenize & Extract" },
      { id: "api-market",    label: "Market" },
      { id: "api-vault",     label: "Vault" },
      { id: "api-stats",     label: "Stats & WebSocket" },
    ],
  },
];

const FLAT = SIDEBAR.flatMap(g => g.items);

// ── Copy button ─────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [text]);
  return (
    <button onClick={copy} style={{
      position:"absolute", top:10, right:10,
      background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
      color: copied ? "var(--accent)" : "var(--fg-3)",
      fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.1em",
      padding:"3px 8px", cursor:"pointer", borderRadius:2, transition:"all 0.2s",
    }}>
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

// ── Code block ──────────────────────────────────────────────────
function Code({ title, body, lang = "bash" }: { title?: string; body: string; lang?: string }) {
  return (
    <div style={{
      background:"#040d16", border:"1px solid var(--line)",
      borderRadius:4, marginBottom:24, overflow:"hidden",
    }}>
      {title && (
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"8px 14px", borderBottom:"1px solid var(--line)",
          background:"rgba(255,255,255,0.02)",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ display:"flex", gap:5 }}>
              {["#f87171","#fbbf24","#34d399"].map(c=>(
                <span key={c} style={{ width:8, height:8, borderRadius:"50%", background:c, opacity:0.7 }}/>
              ))}
            </div>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--fg-3)", letterSpacing:"0.06em" }}>
              {title}
            </span>
          </div>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--fg-3)", opacity:0.5 }}>{lang}</span>
        </div>
      )}
      <div style={{ position:"relative" }}>
        <CopyBtn text={body} />
        <pre style={{
          padding:"16px 44px 16px 16px",
          fontFamily:"var(--font-mono)", fontSize:11.5,
          color:"var(--fg-1)", lineHeight:1.85,
          overflowX:"auto", whiteSpace:"pre", margin:0,
        }}>
          {body}
        </pre>
      </div>
    </div>
  );
}

// ── Callout ─────────────────────────────────────────────────────
function Callout({ type, children }: { type: "info"|"warn"|"tip"; children: React.ReactNode }) {
  const colors = {
    info: { border:"rgba(0,212,255,0.3)", bg:"rgba(0,212,255,0.05)", icon:"ℹ", c:"#00d4ff" },
    warn: { border:"rgba(251,191,36,0.3)", bg:"rgba(251,191,36,0.05)", icon:"⚠", c:"#fbbf24" },
    tip:  { border:"rgba(0,229,160,0.3)", bg:"rgba(0,229,160,0.05)", icon:"✦", c:"var(--accent)" },
  }[type];
  return (
    <div style={{
      border:`1px solid ${colors.border}`, background:colors.bg,
      borderRadius:4, padding:"12px 16px", marginBottom:20,
      display:"flex", gap:10, alignItems:"flex-start",
    }}>
      <span style={{ color:colors.c, fontSize:13, flexShrink:0, marginTop:1 }}>{colors.icon}</span>
      <span style={{ fontSize:12.5, color:"var(--fg-1)", lineHeight:1.65 }}>{children}</span>
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────
function Table({ headers, rows }: { headers: string[]; rows: (string|React.ReactNode)[][] }) {
  return (
    <div style={{ overflowX:"auto", marginBottom:24 }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono)", fontSize:11.5 }}>
        <thead>
          <tr style={{ borderBottom:"1px solid var(--line)" }}>
            {headers.map(h=>(
              <th key={h} style={{ textAlign:"left", padding:"8px 12px", color:"var(--fg-3)", fontWeight:400, letterSpacing:"0.08em", fontSize:10 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,i)=>(
            <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", background: i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
              {row.map((cell,j)=>(
                <td key={j} style={{ padding:"9px 12px", color:"var(--fg-1)", verticalAlign:"top", lineHeight:1.55 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Inline code ─────────────────────────────────────────────────
function IC({ children }: { children: string }) {
  return (
    <code style={{
      fontFamily:"var(--font-mono)", fontSize:11, padding:"1px 5px",
      background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)",
      borderRadius:2, color:"var(--accent)",
    }}>{children}</code>
  );
}

// ── H2 / H3 ────────────────────────────────────────────────────
function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize:20, fontWeight:600, marginBottom:10, marginTop:36, color:"var(--fg-0)" }}>{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize:14, fontWeight:500, marginBottom:8, marginTop:24, color:"var(--fg-1)", letterSpacing:"0.04em" }}>{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize:13.5, color:"var(--fg-1)", lineHeight:1.75, marginBottom:16 }}>{children}</p>;
}

// ── Business Impact strip ───────────────────────────────────────
function BizStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{
      display:"grid", gridTemplateColumns:`repeat(${items.length}, 1fr)`,
      gap:1, background:"var(--line)", border:"1px solid var(--line)",
      borderRadius:4, overflow:"hidden", marginBottom:24,
    }}>
      {items.map(({ label, value }) => (
        <div key={label} style={{ background:"var(--bg-1)", padding:"12px 16px" }}>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--fg-3)", letterSpacing:"0.1em", marginBottom:4 }}>{label}</div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--accent)", fontWeight:600 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Divider label ───────────────────────────────────────────────
function Divider({ label }: { label: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, margin:"32px 0 20px" }}>
      <div style={{ flex:1, height:1, background:"var(--line)" }}/>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.14em", color:"var(--fg-3)" }}>{label}</span>
      <div style={{ flex:1, height:1, background:"var(--line)" }}/>
    </div>
  );
}

// ── Section content components ──────────────────────────────────
function GettingStarted() {
  return (
    <>
      <BizStrip items={[
        { label:"TIME TO FIRST TRADE", value:"< 5 min" },
        { label:"GAS COST (MANTLE)",   value:"~$0.001" },
        { label:"MIN INVESTMENT",      value:"$10 USD" },
        { label:"AI AGENTS AVAILABLE", value:"4 / 4" },
      ]} />
      <P>RWAi is simple: connect your wallet, chat with Atlas, and let AI manage your portfolio. You don't need to understand blockchain — just tell Atlas how much you want to invest and your risk tolerance. Atlas handles the rest.</P>
      <Callout type="tip">New to Web3? You only need a MetaMask or any EVM wallet connected to <strong>Mantle Sepolia</strong> (chainId 5003). No ETH required — gas on Mantle is near-zero.</Callout>
      <H2>Developer Quickstart</H2>
      <Code title="terminal" lang="bash" body={`git clone https://github.com/ntfound-dev/RWAI
cd rwai/contracts && npm install
cd ../app && npm install

# Configure environment
cp contracts/.env.example contracts/.env    # add PRIVATE_KEY
cp agents/.env.example agents/.env          # add GROQ_API_KEY

# Deploy contracts to Mantle Sepolia
cd contracts && npm run deploy:testnet

# Start everything
make dev
# Backend  → http://localhost:8001
# Frontend → http://localhost:3000`} />
      <H2>Environment Variables</H2>
      <Table
        headers={["Variable", "Where", "Required"]}
        rows={[
          [<IC>PRIVATE_KEY</IC>, "contracts/.env", "✓ Deploy contracts"],
          [<IC>GROQ_API_KEY</IC>, "agents/.env", "✓ AI agents"],
          [<IC>ANTHROPIC_API_KEY</IC>, "agents/.env", "Fallback (optional)"],
          [<IC>AGENT_PRIVATE_KEY</IC>, "agents/.env", "✓ On-chain execution"],
          [<IC>NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</IC>, "app/.env.local", "✓ WalletConnect"],
        ]}
      />
    </>
  );
}

function Architecture() {
  return (
    <>
      <BizStrip items={[
        { label:"CONTRACTS DEPLOYED",  value:"8 on Mantle" },
        { label:"AI PROVIDERS",        value:"4-level chain" },
        { label:"DECISION LATENCY",    value:"< 3 seconds" },
        { label:"AUDIT TRAIL",         value:"Permanent on-chain" },
      ]} />
      <P>RWAi is a three-layer system: a Next.js frontend, a FastAPI AI backend, and 8 Solidity contracts on Mantle Sepolia. Every AI decision is logged on-chain before the response is returned to the user.</P>
      <Code title="system diagram" lang="text" body={`Browser (Next.js 14)
  wagmi v2 + viem · RainbowKit · Mantle Sepolia · WalletConnect
  ↓
FastAPI Backend  (agents/)
  OpenClaw/CMDOP → Groq llama-3.3-70b → Claude (4-level fallback)
  Every decision logged on-chain BEFORE response returned
  ↓
Mantle Sepolia (chainId 5003)
  ├── AgentExecutor.sol          — immutable AI action log
  ├── AgentReputationManager.sol — ERC-8004 reputation scores
  ├── YieldOracle.sol            — Pyth price feeds + APY snapshots
  ├── ComplianceLog.sol          — Shield KYC/AML decisions
  ├── RWAiRegistry.sol           — tokenized asset registry
  ├── AssetToken.sol             — ERC-20 fractional RWA token
  ├── PortfolioVault.sol         — allocation strategy + execution
  └── HybridVault.sol            — user deposits + EIP-712 consent`} />
      <H2>AI Runtime Chain</H2>
      <Table
        headers={["Priority", "Provider", "Model", "Condition"]}
        rows={[
          ["1", "OpenClaw/CMDOP", "Custom", "Primary — always attempted first"],
          ["2", "Groq", "llama-3.3-70b-versatile", "Fallback if OpenClaw unavailable"],
          ["3", "Anthropic", "Claude Sonnet", "Fallback if Groq fails"],
          ["4", "Ollama", "qwen3:8b", "Local opt-in only — disabled in cloud"],
        ]}
      />
      <Callout type="info">The AI runtime is model-agnostic. Swapping the primary provider requires only changing <IC>OPENAI_COMPAT_BASE_URL</IC> and <IC>OPENAI_COMPAT_MODEL</IC> in the agent environment.</Callout>
    </>
  );
}

function Tokenize() {
  return (
    <>
      <BizStrip items={[
        { label:"TRADITIONAL COST",   value:"$100,000+" },
        { label:"RWAI COST",          value:"Gas + 0.5%" },
        { label:"TRADITIONAL TIME",   value:"3–6 months" },
        { label:"RWAI TIME",          value:"< 10 minutes" },
      ]} />
      <P>The Tokenize flow converts any real-world asset — property deeds, bonds, certificates — into an ERC-20 token on Mantle in 6 AI-driven steps.</P>
      <Callout type="tip">Traditional asset tokenization requires lawyers, Solidity developers, and compliance consultants — costing $100,000+ before a single token exists. RWAi replaces all three with AI agents. Cost: gas fees + 0.5% protocol fee.</Callout>
      <Callout type="warn">Accepted file types: <strong>PDF, DOCX</strong>. Images (.jpg, .png) are not supported — Nexus requires structured text to produce accurate valuations.</Callout>
      <H2>Step-by-Step Flow</H2>
      <Table
        headers={["Step", "Action", "Agent", "On-chain"]}
        rows={[
          ["①", "Upload PDF / DOCX", "—", "No"],
          ["②", "Asset analysis — name, supply, APY, price/token", "Nexus", "No"],
          ["③", "Compliance review — score ≥ 70 to proceed", "Shield", "ComplianceLog.sol"],
          ["④", "User reviews both results side-by-side", "—", "No"],
          ["⑤", "Deploy — ERC-20 created, tokenization logged", "Nexus", "AgentExecutor.sol + RWAiRegistry.sol"],
          ["⑥", "Asset live in Market + Portfolio", "—", "No"],
        ]}
      />
      <H2>Nexus Output Schema</H2>
      <Code title="POST /api/agents/tokenize → response" lang="json" body={`{
  "assetType":         "real_estate",
  "estimatedValueUSD": 4250000,
  "suggestedTokenName":"RWAi Broadway Tower",
  "suggestedSymbol":   "BWAY",
  "suggestedSupply":   2000000,
  "pricePerTokenUSD":  2.125,
  "annualYieldBps":    519,      // 5.19% APY
  "missingDocuments":  [],
  "concerns":          [],
  "summary":           "Class-A NYC office. Clean title. Strong yield."
}`} />
    </>
  );
}

function Market() {
  return (
    <>
      <BizStrip items={[
        { label:"MARKET FEE",         value:"0.15% / trade" },
        { label:"MIN TRADE SIZE",     value:"$1 USD" },
        { label:"SETTLEMENT",         value:"Instant on Mantle" },
        { label:"AUDIT TRAIL",        value:"Every trade on-chain" },
      ]} />
      <P>The RWA Market lists every asset tokenized through Nexus. Anyone can buy fractions — or the original owner can sell their position. Every trade is logged on-chain by Atlas.</P>
      <Callout type="tip">Traditional RWA markets require accredited investor status ($1M+ net worth) and $50,000+ minimum tickets. RWAi opens the same assets to anyone with $1 and a wallet — fractional ownership with no minimums.</Callout>
      <H2>Buy Flow</H2>
      <Code title="POST /api/agents/market/buy" lang="json" body={`// Request
{
  "buyer_address":   "0xYourWallet",
  "token_address":   "0xcE265E23...",
  "token_symbol":    "BWAY",
  "amount_usd":      1000,
  "price_per_token": 2.125
}

// Atlas reasoning (stored on-chain)
"Allocating 470 BWAY tokens at $2.125/token ($998.75 total).
 5.19% APY — compliant real estate asset, score 82/100."

// On-chain action
AgentExecutor.executeAllocation(atlasId=44, buyer, [tokenAddress], [470e18], reasoning)`} />
      <H2>Sell Flow</H2>
      <Code title="POST /api/agents/market/sell" lang="json" body={`// Request
{
  "seller_address":  "0xYourWallet",
  "token_address":   "0xcE265E23...",
  "amount_tokens":   250,
  "price_per_token": 2.125
}

// On-chain: RWA token → USDY rebalance
AgentExecutor.executeRebalance(
  atlasId=44, seller,
  [tokenAddress],   // from: RWA token
  [USDY_address],   // to: USDY stablecoin
  [250e18], reasoning
)`} />
      <Callout type="info">All buy/sell transactions are attributed to Atlas (ERC-8004 ID: 44) with AI-generated reasoning stored permanently on Mantlescan.</Callout>
    </>
  );
}

function Portfolio() {
  return (
    <>
      <BizStrip items={[
        { label:"AVG BLENDED APY",    value:"4.57%" },
        { label:"AUM FEE",            value:"0.3% / year" },
        { label:"REBALANCE COST",     value:"Gas only" },
        { label:"AUTONOMOUS CONSENT", value:"EIP-712 capped" },
      ]} />
      <P>The Portfolio page shows your RWA allocation in real-time: asset breakdown, blended APY, monthly income estimate, and full Atlas action history with on-chain TX links.</P>
      <Callout type="tip">Traditional robo-advisors charge 0.25–0.75% AUM fee with no on-chain proof of decisions. RWAi charges 0.3%/yr with every rebalance permanently logged on Mantle — Atlas literally signs its decisions with its ERC-8004 identity.</Callout>
      <H2>HybridVault — Autonomous Mode</H2>
      <P>Enable autonomous mode to let Atlas rebalance without per-transaction confirmations. You sign once (EIP-712) and set a cap — Atlas operates within it.</P>
      <Code title="EIP-712 consent structure" lang="typescript" body={`{
  domain: { name: "RWAi HybridVault", chainId: 5003 },
  types: {
    AgentConsent: [
      { name: "agent",     type: "address" },  // Atlas wallet
      { name: "allowance", type: "uint256" },  // cap in wei
      { name: "deadline",  type: "uint256" },  // expiry timestamp
      { name: "nonce",     type: "uint256" },  // replay protection
    ]
  },
  message: { agent, allowance, deadline, nonce }
}`} />
      <Table
        headers={["Field", "Description"]}
        rows={[
          [<IC>Portfolio Value</IC>, "Total current value of all RWA positions"],
          [<IC>Blended APY</IC>, "Weighted average yield across all assets"],
          [<IC>Monthly Income</IC>, "Estimated income: value × APY / 12"],
          [<IC>Risk Score</IC>, "1 (very safe) – 10 (very aggressive)"],
          [<IC>Agent History</IC>, "All Atlas actions with on-chain TX links"],
        ]}
      />
    </>
  );
}

function AgentDoc({ id }: { id: string }) {
  const data: Record<string, { color: string; num: string; role: string; body: JSX.Element }> = {
    "atlas-doc": {
      color: "#00d4ff", num: "44", role: "Portfolio strategy, voice commands, autonomous execution",
      body: (
        <>
          <BizStrip items={[
            { label:"WHO BENEFITS",    value:"Retail investors" },
            { label:"VALUE PROP",      value:"Robo-advisor + execution" },
            { label:"DIFFERENTIATOR", value:"Voice-first + on-chain proof" },
            { label:"REVENUE STREAM",  value:"AUM 0.3% / market 0.15%" },
          ]} />
          <P>Atlas is the primary AI you chat with — by text or voice. It knows your portfolio, understands your goals, and coordinates Nexus, Shield, and Yield to execute your strategy.</P>
          <Callout type="tip">Most AI portfolio tools stop at recommendations. Atlas executes — it submits on-chain transactions autonomously within your EIP-712 consent cap. Every action is signed by Atlas's ERC-8004 identity (#44) and stored permanently on Mantle.</Callout>
          <Divider label="TECHNICAL REFERENCE" />
          <H3>On-chain actions</H3>
          <Table headers={["Method", "Contract", "Trigger"]} rows={[
            [<IC>executeAllocation()</IC>, "AgentExecutor.sol", "New portfolio plan"],
            [<IC>executeRebalance()</IC>, "AgentExecutor.sol", "Rebalance or sell"],
            [<IC>agentExecute()</IC>, "HybridVault.sol", "Autonomous action within consent cap"],
          ]} />
          <Code title="example conversation" lang="text" body={`You   : "I have $10,000 — invest conservatively"

Atlas : "Here's my recommended allocation:
         50% USDY  — 4.20% APY  (stable)
         25% mETH  — 6.12% APY  (growth)
         15% mUSD  — 3.90% APY  (stable)
         10% fBTC  — 3.50% APY  (diversification)

         Blended APY : 4.57%
         Monthly est.: $38.08

         Writing plan to AgentExecutor.sol...
         TX: 0x77a66d7a..."`} />
        </>
      ),
    },
    "nexus-doc": {
      color: "var(--nexus)", num: "41", role: "Tokenizes RWAs from uploaded documents",
      body: (
        <>
          <BizStrip items={[
            { label:"WHO BENEFITS",   value:"Asset owners / SMEs" },
            { label:"COST REDUCTION", value:"99% vs traditional" },
            { label:"TIME TO TOKEN",  value:"< 10 minutes" },
            { label:"REVENUE STREAM", value:"Tokenization 0.5% fee" },
          ]} />
          <P>Nexus reads PDF and DOCX documents — deeds, appraisals, certificates — and extracts the metadata needed to deploy an ERC-20 token on Mantle. It works in seconds versus the months traditional tokenization takes.</P>
          <Callout type="tip">A $500k real estate tokenization traditionally costs $100k+ in legal and dev fees. Through Nexus: gas (~$0.01 on Mantle) + 0.5% protocol fee ($2,500). The asset owner retains 99.5% of value from day one — and can accept fractional buyers globally.</Callout>
          <Divider label="TECHNICAL REFERENCE" />
          <H3>On-chain actions</H3>
          <Table headers={["Method", "Contract"]} rows={[
            [<IC>logTokenization()</IC>, "AgentExecutor.sol"],
            [<IC>registerAsset()</IC>, "RWAiRegistry.sol"],
          ]} />
          <Code title="example Nexus output" lang="json" body={`{
  "suggestedTokenName": "RWAi Bali Land",
  "suggestedSymbol":    "BALI500",
  "estimatedValueUSD":  315000,
  "suggestedSupply":    1000000,
  "pricePerTokenUSD":   0.315,
  "annualYieldBps":     200,
  "concerns":           []
}`} />
        </>
      ),
    },
    "shield-doc": {
      color: "var(--warn)", num: "42", role: "AI compliance — KYC/AML, sanctions, risk scoring",
      body: (
        <>
          <BizStrip items={[
            { label:"WHO BENEFITS",   value:"Asset owners + investors" },
            { label:"REVIEW COST",    value:"Gas only (no lawyers)" },
            { label:"REVIEW TIME",    value:"< 30 seconds" },
            { label:"STORED ON-CHAIN",value:"ComplianceLog.sol" },
          ]} />
          <P>Shield reviews every asset before it can go live. It checks document completeness, jurisdictional legal risks, and wallet sanctions status. Every review is stored permanently in <IC>ComplianceLog.sol</IC>.</P>
          <Callout type="tip">Traditional compliance consultants charge $5,000–$20,000 per asset review and take weeks. Shield delivers an AI compliance score in seconds — stored on-chain so investors can verify it themselves without trusting a third party.</Callout>
          <Divider label="TECHNICAL REFERENCE" />
          <H3>Scoring</H3>
          <Table headers={["Score", "Status", "Meaning"]} rows={[
            ["≥ 70", "✓ Cleared", "Asset may proceed to deployment"],
            ["50–69", "⚠ Conditional", "Proceed with warnings flagged to user"],
            ["< 50", "✗ Blocked", "Asset cannot be tokenized"],
          ]} />
          <Code title="ComplianceLog event" lang="solidity" body={`event ComplianceReviewed(
  uint256 indexed agentId,    // 42 (Shield)
  address indexed wallet,
  uint8   score,              // 0–100
  bool    cleared,
  string  jurisdiction,
  bytes32 evidenceHash        // IPFS hash of review
);`} />
        </>
      ),
    },
    "yield-doc": {
      color: "var(--accent)", num: "43", role: "Prices assets via Pyth, monitors APY on Mantle",
      body: (
        <>
          <BizStrip items={[
            { label:"WHO BENEFITS",   value:"All investors" },
            { label:"DATA SOURCE",    value:"Pyth (tamper-proof)" },
            { label:"UPDATE FREQ",   value:"Every few hours" },
            { label:"STORED ON-CHAIN",value:"YieldOracle.sol" },
          ]} />
          <P>Yield monitors interest rates across all Mantle RWA assets every few hours. It writes live prices and APY snapshots to <IC>YieldOracle.sol</IC> — publicly verifiable, not a number that can be manually changed.</P>
          <Callout type="tip">Traditional yield data is provided by platforms who could manipulate it. Yield writes APY snapshots directly to <IC>YieldOracle.sol</IC> via Pyth — a decentralized price oracle. Any investor can query the contract themselves and verify the rates are real.</Callout>
          <Divider label="TECHNICAL REFERENCE" />
          <H3>Supported price feeds (Pyth)</H3>
          <Table headers={["Asset", "Feed ID (truncated)", "Current APY"]} rows={[
            ["USDY", "0xe393449f...", "4.20%"],
            ["mUSD", "0xe393449f...", "3.90%"],
            ["mETH", "0xfbc9c3a7...", "6.12%"],
            ["fBTC", "0xe62df6c8...", "3.50%"],
          ]} />
          <Code title="GET /api/agents/yield" lang="json" body={`{
  "assets": [
    { "symbol": "USDY", "priceUSD": 1.000, "apyBps": 420 },
    { "symbol": "mETH", "priceUSD": 2847,  "apyBps": 612 },
    { "symbol": "fBTC", "priceUSD": 95200, "apyBps": 350 },
    { "symbol": "mUSD", "priceUSD": 1.000, "apyBps": 390 }
  ],
  "blendedApy": 457,
  "snapshotBlock": 38612004
}`} />
        </>
      ),
    },
    "orchestration": {
      color: "#a855f7", num: "—", role: "Multi-agent coordination flow",
      body: (
        <>
          <BizStrip items={[
            { label:"UX BENEFIT",     value:"One chat, 4 agents" },
            { label:"LATENCY",        value:"< 3 seconds total" },
            { label:"USER ACTION",    value:"Zero — Atlas decides" },
            { label:"EXTENSIBILITY",  value:"Bond $RWAI + add agent" },
          ]} />
          <P>Atlas orchestrates Nexus, Shield, and Yield automatically. You never need to invoke individual agents — Atlas decides which agents to consult and in what order based on your request.</P>
          <Callout type="tip">From an investor's perspective: you say one sentence, and four AI specialists collaborate in parallel to deliver a result that is immediately written to the blockchain. No forms, no waiting, no manual steps.</Callout>
          <Divider label="TECHNICAL REFERENCE" />
          <Code title="orchestration flow — build portfolio" lang="text" body={`User: "Build a conservative $10k portfolio"
  ↓
Atlas
  ├─① calls Yield internally   → get live APY for all assets
  ├─② calls Shield internally  → verify assets are compliant
  ├─③ calculates allocation     → 50/25/15/10 split
  └─④ writes to chain
        PortfolioVault.executeAllocation()
        AgentExecutor.sol logs reasoning + ERC-8004 signature
        TX: 0x77a66d7a...  (permanent, verifiable)`} />
          <Callout type="tip">The orchestration pattern is extensible — third-party ERC-8004 agents can be bonded into the system via $RWAI staking and will be callable by Atlas as additional specialists.</Callout>
        </>
      ),
    },
  };

  const d = data[id];
  if (!d) return null;

  return (
    <>
      <div style={{
        display:"inline-flex", alignItems:"center", gap:10, marginBottom:20,
        background:"rgba(255,255,255,0.03)", border:"1px solid var(--line)",
        borderRadius:4, padding:"8px 14px",
      }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:d.color, boxShadow:`0 0 8px ${d.color}` }}/>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-2)" }}>ERC-8004 ID</span>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:13, color:d.color }}>{d.num}</span>
        <span style={{ color:"var(--line)", padding:"0 4px" }}>·</span>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--fg-3)" }}>{d.role}</span>
      </div>
      {d.body}
    </>
  );
}

function ERC8004() {
  return (
    <>
      <P>ERC-8004 is Mantle's official standard for on-chain AI agent identity. Every RWAi agent has a unique identity NFT that stores its reputation score and action history — permanently verifiable on Mantlescan.</P>
      <Callout type="info">ERC-8004 contracts are pre-deployed by Mantle on Sepolia. RWAi registers agents to these contracts — not a custom implementation.</Callout>
      <H2>Live Agent Reputation</H2>
      <Table
        headers={["Agent", "ERC-8004 ID", "Score", "Autonomy Level", "Max Action"]}
        rows={[
          ["Nexus",  "41", "85 / 100", "Level 3 — Medium",     "Tokenization + registry"],
          ["Shield", "42", "75 / 100", "Level 3 — Medium",     "Compliance log"],
          ["Yield",  "43", "75 / 100", "Level 3 — Medium",     "Oracle update"],
          ["Atlas",  "44", "75 / 100", "Level 3 — Medium",     "Full portfolio execution"],
        ]}
      />
      <H2>Autonomy Levels</H2>
      <Table
        headers={["Level", "Score Range", "Capability"]}
        rows={[
          ["Level 1 — Restricted", "< 50",   "Read-only. Cannot submit on-chain actions."],
          ["Level 2 — Limited",    "50 – 69", "Can submit low-value actions (< $1,000 / tx)."],
          ["Level 3 — Medium",     "70 – 89", "Normal operation. Default for new agents."],
          ["Level 4 — Full",       "≥ 90",    "Unrestricted. Earns through sustained performance."],
        ]}
      />
      <Code title="ERC-8004 registry addresses (Mantle Sepolia)" lang="text" body={`Identity Registry   0x8004A818BFB912233c491871b3d84c89A494BD9e
Reputation Registry 0x8004B663056A597Dffe9eCcC1965A193B7388713`} />
    </>
  );
}

function Contracts() {
  return (
    <>
      <P>All RWAi logic runs on 8 Solidity contracts (0.8.24, OpenZeppelin v5) deployed on Mantle Sepolia. Source code is MIT licensed and fully open-source.</P>
      <Callout type="tip">Verify any contract directly on <a href="https://sepolia.mantlescan.xyz" target="_blank" rel="noreferrer" style={{ color:"var(--accent)" }}>sepolia.mantlescan.xyz</a> — no permission required.</Callout>
      <H2>Core Contracts</H2>
      <Table
        headers={["Contract", "Address", "Purpose"]}
        rows={[
          [<IC>AgentExecutor</IC>,          ADDRESSES.AgentExecutor,          "Immutable AI action log — every decision"],
          [<IC>AgentReputationManager</IC>, ADDRESSES.AgentReputationManager, "ERC-8004 reputation scores + gating"],
          [<IC>YieldOracle</IC>,            ADDRESSES.YieldOracle,            "Pyth price feeds + APY market snapshots"],
          [<IC>ComplianceLog</IC>,          ADDRESSES.ComplianceLog,          "Shield KYC/AML decisions"],
          [<IC>RWAiRegistry</IC>,           ADDRESSES.RWAiRegistry,           "All tokenized RWA asset records"],
          [<IC>PortfolioVault</IC>,         ADDRESSES.PortfolioVault,         "Strategy allocation + execution"],
          [<IC>HybridVault</IC>,            ADDRESSES.HybridVault,            "User deposits + EIP-712 agent consent"],
          [<IC>AssetToken (template)</IC>,  ADDRESSES.AssetToken,             "ERC-20 RWA token template"],
        ]}
      />
      <H2>Mock RWA Assets (Testnet)</H2>
      <Table
        headers={["Token", "Address"]}
        rows={[
          ["USDY", "0xcE265E23aAc349cEf9Fa3CC058062A44080f2289"],
          ["mUSD", "0xDf079DB274fAEFfeD10A4a0E5C12f65e1570Cd35"],
          ["mETH", "0xD57f88B64611dBf74f87FC40f2F1010320483584"],
          ["fBTC", "0xbED7ad48984fBb3984F5aF83E176fb9f40dB37cc"],
        ]}
      />
    </>
  );
}

function Consent() {
  return (
    <>
      <P>HybridVault uses EIP-712 typed-data signatures to grant Atlas a bounded, revocable allowance to act autonomously on your behalf — without exposing your private key or requiring approval for each transaction.</P>
      <H2>How It Works</H2>
      <Code title="1. User signs once" lang="typescript" body={`const consent = {
  domain: { name: "RWAi HybridVault", chainId: 5003 },
  types: {
    AgentConsent: [
      { name: "agent",     type: "address" },  // Atlas: 0x834De...
      { name: "allowance", type: "uint256" },  // e.g. 500 USDY
      { name: "deadline",  type: "uint256" },  // e.g. now + 30 days
      { name: "nonce",     type: "uint256" },  // replay protection
    ]
  },
  message: { agent, allowance: parseEther("500"), deadline, nonce }
};

const sig = await walletClient.signTypedData(consent);`} />
      <Code title="2. Atlas executes autonomously within cap" lang="solidity" body={`// Atlas calls this — no user confirmation needed per tx
HybridVault.agentExecute(
  user,         // your wallet
  asset,        // e.g. mETH address
  amount,       // deducted from remaining allowance
  reason        // Atlas-generated reasoning, stored on AgentExecutor
)
// Each call deducts from allowance. When exhausted → Atlas requests new consent.`} />
      <Callout type="warn">The signature is <strong>not</strong> a full wallet approval — it caps Atlas to the exact allowance amount you specify. Atlas cannot move more than the cap under any circumstances.</Callout>
    </>
  );
}

function Tokenomics() {
  return (
    <>
      <P>$RWAI is the protocol governance and fee-capture token. Total supply: <strong>100,000,000 RWAI — fixed cap, no inflation, ever.</strong> It is not required to use the product — retail users pay gas in MNT only. $RWAI aligns long-term stakeholders.</P>
      <H2>Token Utility</H2>
      <Table
        headers={["#", "Utility", "How"]}
        rows={[
          ["①", "Governance", "Vote on fee parameters, asset type whitelists, autonomy thresholds"],
          ["②", "Fee sharing", "Stake RWAI → earn 70% of all protocol fees pro-rata"],
          ["③", "Agent licensing", "Bond 10,000 RWAI to register ERC-8004 agent. Slashed on malicious action."],
          ["④", "Fee discount", "Tokenization fee: 0.5% → 0.2% when paid in RWAI (60% saving)"],
          ["⑤", "Reputation boost", "Bonded agents start with +10 reputation points"],
        ]}
      />
      <H2>Supply Allocation</H2>
      <Table
        headers={["Allocation", "Tokens", "%", "Vesting"]}
        rows={[
          ["Ecosystem & grants",  "25,000,000", "25%", "4yr linear, no cliff"],
          ["Protocol treasury",   "20,000,000", "20%", "DAO-controlled (no vesting)"],
          ["Team & contributors", "18,000,000", "18%", "1yr cliff + 3yr linear (revocable)"],
          ["Community & airdrops","15,000,000", "15%", "6mo cliff + 2.5yr linear (revocable)"],
          ["Investors (seed)",    "12,000,000", "12%", "6mo cliff + 2yr linear (revocable)"],
          ["Liquidity provision", "10,000,000", "10%", "Unlocked at TGE for DEX pools"],
        ]}
      />
      <H2>Token Contracts</H2>
      <Code title="contracts (Mantle Sepolia — deploy with: npm run deploy:token)" lang="text" body={`RWAiToken        — ERC-20Votes + staking + agent bond + fee discount
RWAiVesting      — cliff + linear vesting for all allocations
ProtocolTreasury — fee collection: 70% stakers / 30% treasury

Source: contracts/contracts/RWAiToken.sol
        contracts/contracts/RWAiVesting.sol
        contracts/contracts/ProtocolTreasury.sol`} />
      <Callout type="tip">$RWAI will launch on <strong>FusionX</strong> (Mantle-native DEX) at mainnet. No presale, no VC dump — team tokens cliff at 12 months.</Callout>
    </>
  );
}

function Revenue() {
  return (
    <>
      <P>RWAi captures value at three protocol layers. Every fee is enforced by smart contracts — no hidden charges, no off-chain billing. All fee rates are governance-updatable within hard caps by $RWAI stakers.</P>
      <H2>Fee Streams</H2>
      <Table
        headers={["Stream", "Rate", "Contract", "Hard Cap"]}
        rows={[
          ["Tokenization fee", "0.5% of asset value (0.2% in RWAI)", "ProtocolTreasury.collectTokenizationFee()", "2%"],
          ["AUM fee",          "0.3% / year on HybridVault deposits", "ProtocolTreasury.collectAumFee()",          "1% / yr"],
          ["Market fee",       "0.15% of each buy/sell",              "ProtocolTreasury.collectMarketFee()",       "1%"],
        ]}
      />
      <H2>Fee Distribution</H2>
      <Code title="ProtocolTreasury.distributeFees()" lang="solidity" body={`// Called by anyone — incentivises regular distribution
function distributeFees() external {
    uint256 toStakers  = (pending * 7_000) / 10_000;  // 70%
    uint256 toTreasury = pending - toStakers;           // 30%

    rwaiStaking.depositFees(toStakers);   // → RWAI stakers pro-rata
    // toTreasury stays in contract       // → DAO spend
}`} />
      <H2>Unit Economics (illustrative)</H2>
      <Table
        headers={["Scenario", "Annual Revenue"]}
        rows={[
          ["100 tokenizations × avg $500k asset  → 0.5% fee", "$250,000 / quarter"],
          ["$50M AUM in HybridVault              → 0.3% / yr", "$150,000 / year"],
          ["$5M / month trade volume             → 0.15% fee",  "$90,000 / year"],
          ["Combined (illustrative @ scale)",                    "~$490,000 / year"],
        ]}
      />
      <Callout type="info">Revenue is denominated in $RWAI. Protocol fees paid in MNT or RWA tokens are converted to RWAI before distribution — creating natural buy pressure as usage grows.</Callout>
    </>
  );
}

function GTM() {
  return (
    <>
      <P>RWAi targets three segments across four deployment phases. The core growth loop: every on-chain AI decision that accumulates in <IC>AgentExecutor.sol</IC> is a benchmark competitors cannot fake retroactively.</P>
      <H2>Target Segments</H2>
      <Table
        headers={["Segment", "Profile", "Acquisition"]}
        rows={[
          ["Crypto-native retail", "Mantle holders of USDY/mETH/mUSD/fBTC — no intelligent allocation layer exists today", "JARVIS voice demo · free to use"],
          ["SME asset owners", "Real estate, invoice, commodity owners who cannot afford $100k traditional tokenization", "RWAi = gas fees + 0.5%"],
          ["Institutional desks", "Need verifiable AI decision audit trails for compliance", "AgentExecutor.sol = first on-chain AI benchmark"],
        ]}
      />
      <H2>Roadmap</H2>
      <Table
        headers={["Phase", "Timeline", "Milestones"]}
        rows={[
          ["Phase 1 — Seed",         "Now (Testnet)",  "Hackathon → developer mindshare · Open source distribution · ERC-8004 standard as dependency"],
          ["Phase 2 — Alpha",        "Q3 2026",        "Mainnet deploy · Mantle Foundation partnership · First 10 real tokenizations · $RWAI token contracts"],
          ["Phase 3 — Growth",       "Q4 2026",        "Real KYC integration (Fractal ID) · $RWAI TGE on FusionX · Enterprise API · Agent marketplace"],
          ["Phase 4 — Scale",        "2027+",          "Cross-chain via LayerZero · RWA index products · MAS Singapore regulatory sandbox"],
        ]}
      />
      <H2>Competitive Positioning</H2>
      <Table
        headers={["Competitor", "Gap", "RWAi Advantage"]}
        rows={[
          ["Ondo Finance",   "No AI, no voice, no execution",          "Atlas executes autonomously, not just recommends"],
          ["Centrifuge",     "No AI layer, not Mantle-native",          "Mantle-native + JARVIS voice interface"],
          ["OpenTrade",      "Institutional only, $50k minimum",        "Retail-first from $10k via HybridVault"],
          ["Generic AI bots","No on-chain proof, no audit trail",       "AgentExecutor.sol = immutable AI benchmark"],
        ]}
      />
    </>
  );
}

// ── API Reference sections ──────────────────────────────────────
function ApiAuth() {
  return (
    <>
      <P>All <IC>/api/agents/*</IC> endpoints require this header. The Next.js proxy (Vercel) injects it automatically — it is never exposed to the browser.</P>
      <Code title="request header" lang="http" body={`x-internal-api-key: <BACKEND_API_KEY>`} />
      <Callout type="tip">Public endpoints (no key needed): <IC>GET /health</IC> and <IC>WS /ws</IC>.</Callout>
      <H2>Rate Limits</H2>
      <P>Per IP address, sliding 60-second window. Response on limit: <IC>HTTP 429</IC> with <IC>Retry-After: 60</IC>.</P>
      <Table
        headers={["Endpoint", "Limit"]}
        rows={[
          [<IC>/api/agents/chat</IC>,       "20 req / min"],
          [<IC>/api/agents/tokenize</IC>,   "10 req / min"],
          [<IC>/api/agents/compliance</IC>, "10 req / min"],
          [<IC>/api/agents/portfolio/*</IC>,"10 req / min"],
          [<IC>/api/agents/extract-text</IC>,"5 req / min"],
          ["Other agent endpoints",          "60 req / min"],
          [<IC>/health</IC>, <IC>/ws</IC>,  "120 req / min"],
        ]}
      />
      <H2>Error Codes</H2>
      <Table
        headers={["HTTP", "Meaning"]}
        rows={[
          ["400", "Bad request — invalid input"],
          ["401", "Unauthorized — wrong or missing API key"],
          ["403", "Forbidden — feature disabled (e.g. autonomous execution)"],
          ["413", "Payload Too Large — file exceeds 10 MB"],
          ["429", "Too Many Requests — rate limit reached"],
          ["500", "Internal server error"],
          ["502", "Railway backend unreachable from Vercel"],
          ["503", "Service unavailable — contracts not deployed or AGENT_PRIVATE_KEY missing"],
        ]}
      />
    </>
  );
}

function ApiChat() {
  return (
    <>
      <H2>POST /api/agents/chat</H2>
      <P>Send a message to any AI agent. Rate limit: 20 req/min.</P>
      <Code title="request" lang="json" body={`{
  "agent_id": "atlas",
  "messages": [
    {"role": "user",  "body": "What is my portfolio risk?"},
    {"role": "atlas", "body": "Your current CVaR is 3.2%."},
    {"role": "user",  "body": "How can I reduce it?"}
  ]
}`} />
      <Table headers={["Field", "Type", "Detail"]} rows={[
        [<IC>agent_id</IC>, "string", "atlas | nexus | shield | yield"],
        [<IC>messages</IC>, "array",  "Max 20 messages, each body max 2,000 chars"],
      ]} />
      <Code title="response" lang="json" body={`{
  "reply":      "To reduce CVaR, consider shifting 15% from mETH to USDY...",
  "model_used": "llama-3.3-70b-versatile",
  "fallback":   false
}`} />
      <Divider label="STATUS" />
      <H2>GET /api/agents/status</H2>
      <P>Live reputation scores for all agents from <IC>AgentReputationManager</IC> on-chain.</P>
      <Code title="response" lang="json" body={`{
  "atlas":  {"online": true, "reputation": 3.75, "localScore": 75, "autonomyLevel": 3, "actionCount": 12, "erc8004_id": 44},
  "nexus":  {"online": true, "reputation": 3.75, "localScore": 75, "autonomyLevel": 3, "actionCount":  8, "erc8004_id": 41},
  "shield": {"online": true, "reputation": 3.75, "localScore": 75, "autonomyLevel": 3, "actionCount":  5, "erc8004_id": 42},
  "yield":  {"online": true, "reputation": 3.75, "localScore": 75, "autonomyLevel": 3, "actionCount":  9, "erc8004_id": 43}
}`} />
    </>
  );
}

function ApiPortfolio() {
  return (
    <>
      <H2>POST /api/agents/portfolio/plan</H2>
      <P>Atlas builds a portfolio strategy based on investor profile. Rate limit: 10 req/min.</P>
      <Code title="request" lang="json" body={`{
  "goal":         "income",
  "horizon":      "medium",
  "risk_answer":  "hold",
  "amount":       10000,
  "avoid":        "",
  "user_address": "0xabc..."
}`} />
      <Table headers={["Field", "Values", "Default"]} rows={[
        [<IC>goal</IC>,        "income | growth | balanced", "income"],
        [<IC>horizon</IC>,     "short | medium | long",      "medium"],
        [<IC>risk_answer</IC>, "sell | hold | buy",          "hold"],
        [<IC>amount</IC>,      "USD float",                  "10000"],
        [<IC>avoid</IC>,       "comma-separated symbols",    '""'],
        [<IC>user_address</IC>,"wallet — logs on-chain if set","null"],
      ]} />
      <Code title="response" lang="json" body={`{
  "allocations":   [{"asset":"USDY","bps":5000},{"asset":"mETH","bps":2500},{"asset":"mUSD","bps":1500},{"asset":"fBTC","bps":1000}],
  "riskScore":     3,
  "strategyType":  "conservative",
  "reasoning":     "High USDY allocation provides stable yield...",
  "modelUsed":     "llama-3.3-70b-versatile",
  "fallback":      false,
  "onChainTx":     "0xabc123..."
}`} />
      <Divider label="REBALANCE" />
      <H2>POST /api/agents/portfolio/rebalance</H2>
      <Code title="request" lang="json" body={`{
  "user_address": "0xabc...",
  "from_assets":  ["mETH", "fBTC"],
  "to_assets":    ["USDY", "mUSD"],
  "amounts_usd":  [2500.0, 1000.0]
}`} />
      <Code title="response" lang="json" body={`{"reasoning":"...","modelUsed":"llama-3.3-70b-versatile","fallback":false,"onChainTx":"0xdef456..."}`} />
      <Divider label="READ" />
      <H2>GET /api/agents/portfolio/{"{user_address}"}</H2>
      <P>Read portfolio from <IC>PortfolioVault</IC> on-chain.</P>
      <Code title="response" lang="json" body={`{
  "hasPortfolio":   true,
  "assets":         ["USDY","mETH"],
  "allocations":    [5000, 5000],
  "riskScore":      4,
  "strategyType":   "balanced",
  "createdAt":      1748000000,
  "lastRebalanced": 1748100000,
  "atlasReasoning": "Balanced allocation for medium horizon..."
}`} />
    </>
  );
}

function ApiTokenize() {
  return (
    <>
      <H2>POST /api/agents/tokenize</H2>
      <P>Nexus analyses an asset document and returns token parameters. Rate limit: 10 req/min. Input is sanitised — injection patterns are stripped automatically.</P>
      <Code title="request" lang="json" body={`{
  "document_text": "Property deed for 123 Main St...",
  "asset_type":    "real_estate",
  "asset_id":      0,
  "token_address": "0x0000000000000000000000000000000000000000",
  "owner_address": "0xabc..."
}`} />
      <Table headers={["Field", "Detail"]} rows={[
        [<IC>document_text</IC>, "Required. Max 40,000 chars."],
        [<IC>asset_type</IC>,    "Optional hint, max 64 chars."],
        [<IC>token_address</IC>, "Non-zero → logs tokenization to AgentExecutor."],
      ]} />
      <Code title="response" lang="json" body={`{
  "suggestedTokenName": "Main Street Property Token",
  "suggestedSymbol":    "MSPT",
  "suggestedSupply":    1000000,
  "pricePerTokenUSD":   1.00,
  "estimatedValueUSD":  1000000,
  "annualYieldBps":     650,
  "reasoning":          "Commercial property with stable rental income...",
  "modelUsed":          "llama-3.3-70b-versatile",
  "fallback":           false,
  "onChainTx":          "0xabc..."
}`} />
      <Divider label="COMPLIANCE" />
      <H2>POST /api/agents/compliance</H2>
      <P>Shield reviews an asset for compliance and logs to AgentExecutor. Rate limit: 10 req/min.</P>
      <Code title="request" lang="json" body={`{"asset_id":1,"document_text":"Asset prospectus...","jurisdiction":"US"}`} />
      <Code title="response" lang="json" body={`{
  "complianceScore": 87,
  "passed":          true,
  "flags":           [],
  "reasoning":       "Asset meets SEC Reg D exemption requirements...",
  "modelUsed":       "llama-3.3-70b-versatile",
  "fallback":        false,
  "onChainTx":       "0xabc..."
}`} />
      <Divider label="EXTRACT TEXT" />
      <H2>POST /api/agents/extract-text</H2>
      <P>Extract text from uploaded files to feed into <IC>/tokenize</IC>. Rate limit: 5 req/min.</P>
      <Callout type="info">Content-Type: <IC>multipart/form-data</IC>. Max 5 files, max 10 MB each. Allowed: <IC>.pdf .docx .doc .txt .md</IC></Callout>
      <Code title="response" lang="json" body={`{
  "results": [
    {"name": "deed.pdf",      "text": "Property deed for 123 Main St..."},
    {"name": "appraisal.pdf", "text": "Appraised value: $1,200,000..."}
  ]
}`} />
    </>
  );
}

function ApiMarket() {
  return (
    <>
      <H2>GET /api/agents/market/listings</H2>
      <P>All tokenized RWA listings. Query param: <IC>limit</IC> (default 100, max 200).</P>
      <Code title="response" lang="json" body={`{
  "listings": [{
    "token_address": "0xabc...",
    "token_name":    "Main Street Property Token",
    "token_symbol":  "MSPT",
    "asset_type":    "real_estate",
    "price_usd":     1.00,
    "apy_bps":       650,
    "owner":         "0xdef..."
  }]
}`} />
      <Divider label="BUY" />
      <H2>POST /api/agents/market/buy</H2>
      <P>Atlas logs an RWA purchase on-chain via <IC>AgentExecutor</IC>.</P>
      <Code title="request" lang="json" body={`{
  "buyer_address":   "0xabc...",
  "token_address":   "0xdef...",
  "token_symbol":    "MSPT",
  "token_name":      "Main Street Property Token",
  "amount_usd":      5000.0,
  "price_per_token": 1.00,
  "apy_bps":         650
}`} />
      <Code title="response" lang="json" body={`{
  "success":    true,
  "onChainTx":  "0xabc...",
  "tokens":     5000.0,
  "reasoning":  "Atlas market purchase: 5,000.00 MSPT at $1.0000/token."
}`} />
      <Divider label="SELL" />
      <H2>POST /api/agents/market/sell</H2>
      <Code title="request" lang="json" body={`{
  "seller_address":  "0xabc...",
  "token_address":   "0xdef...",
  "token_symbol":    "MSPT",
  "token_name":      "Main Street Property Token",
  "amount_tokens":   1000.0,
  "price_per_token": 1.05,
  "apy_bps":         650
}`} />
      <Code title="response" lang="json" body={`{"success":true,"onChainTx":"0xabc...","usd_value":1050.0,"reasoning":"Atlas market sell: 1,000.00 MSPT at $1.0500/token."}`} />
    </>
  );
}

function ApiVault() {
  return (
    <>
      <H2>GET /api/agents/vault/status/{"{user_address}"}</H2>
      <P>User vault balance, agent allowance, and caps. Query params: <IC>token</IC>, <IC>agent</IC>.</P>
      <Code title="response" lang="json" body={`{
  "available":     true,
  "vault":         "0xC6c08d...",
  "balance":       "1000000000000000000",
  "allowance":     "100000000000000000",
  "expiry":        1780000000,
  "approvedAgent": true,
  "limits": {
    "perTxCap":             "115792...",
    "perAgentDailyCap":     "115792...",
    "perUserPercentCapBps": 1000
  }
}`} />
      <Divider label="CONSENT" />
      <H2>POST /api/agents/vault/consent</H2>
      <P>Generates EIP-712 typed data for the user to sign in their wallet. The returned <IC>typedData</IC> is passed to <IC>signTypedData</IC> in the frontend.</P>
      <Code title="request" lang="json" body={`{
  "user_address": "0xabc...",
  "token":        "0xcE265E...",
  "amount_wei":   1000000000000000000,
  "expiry":       1780000000,
  "agent_address": null
}`} />
      <Code title="response (pass typedData to wallet)" lang="json" body={`{
  "typedData": {
    "domain":  {"name":"HybridVault","version":"1","chainId":5003,"verifyingContract":"0xC6c08d..."},
    "types":   {"AgentConsent":[{"name":"user","type":"address"},{"name":"agent","type":"address"},{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"expiry","type":"uint256"},{"name":"nonce","type":"uint256"}]},
    "message": {"user":"0xabc...","agent":"0x...","token":"0xcE...","amount":"1000000000000000000","expiry":1780000000,"nonce":0}
  },
  "agent": "0x...", "vault": "0xC6c08d...", "nonce": 0
}`} />
      <Divider label="RELAY" />
      <H2>POST /api/agents/vault/relay-allowance</H2>
      <P>Sends the user's EIP-712 signature to HybridVault to set the agent allowance on-chain.</P>
      <Code title="request" lang="json" body={`{
  "user_address": "0xabc...",
  "token":        "0xcE265E...",
  "amount_wei":   1000000000000000000,
  "expiry":       1780000000,
  "nonce":        0,
  "signature":    "0x...",
  "agent_address": null
}`} />
      <Code title="response" lang="json" body={`{"onChainTx":"0xabc...","agent":"0x..."}`} />
      <Divider label="EXECUTE" />
      <H2>POST /api/agents/vault/execute</H2>
      <Callout type="warn">Only active when <IC>AUTONOMOUS_EXECUTION_ENABLED=true</IC> in Railway env. Disabled by default.</Callout>
      <Code title="request" lang="json" body={`{"user_address":"0xabc...","token":"0xcE265E...","to":"0xdest...","amount_wei":100000000000000000,"data_hex":"0x"}`} />
      <Code title="response" lang="json" body={`{"onChainTx":"0xabc..."}`} />
    </>
  );
}

function ApiStats() {
  return (
    <>
      <H2>GET /api/agents/stats</H2>
      <P>Combined stats from indexer DB + live chain counters.</P>
      <Code title="response" lang="json" body={`{
  "assetCount":      12,
  "agentRuns":       847,
  "totalValueUSD":   4250000.0,
  "assetCountChain": 12,
  "actionCountChain":847
}`} />
      <Divider label="ACTIONS" />
      <H2>GET /api/agents/stats/actions</H2>
      <P>Recent agent actions from the indexer. Query params: <IC>limit</IC> (default 20, max 100), <IC>agent</IC> (filter by name).</P>
      <Code title="response" lang="json" body={`{
  "actions": [{
    "agent_name":  "atlas",
    "action_type": "portfolio_plan",
    "reasoning":   "Conservative allocation for risk-averse investor...",
    "tx_hash":     "0xabc...",
    "timestamp":   1748000000
  }]
}`} />
      <Divider label="ASSETS" />
      <H2>GET /api/agents/stats/assets</H2>
      <P>Tokenized asset list. Query params: <IC>limit</IC> (default 50, max 200), <IC>owner</IC> (filter by wallet).</P>
      <Divider label="WEBSOCKET" />
      <H2>WS /ws</H2>
      <P>Live heartbeat every 5 seconds. Public — no API key needed.</P>
      <Code title="message format" lang="json" body={`{
  "type":  "heartbeat",
  "block": 18234521,
  "agents": {
    "atlas":  {"online":true,"reputation":3.75,"erc8004_id":44},
    "nexus":  {"online":true,"reputation":3.75,"erc8004_id":41},
    "shield": {"online":true,"reputation":3.75,"erc8004_id":42},
    "yield":  {"online":true,"reputation":3.75,"erc8004_id":43}
  },
  "ts": 1748000000.123
}`} />
      <Code title="connect" lang="javascript" body={`const ws = new WebSocket("wss://your-railway-app.railway.app/ws");
ws.onmessage = (e) => console.log(JSON.parse(e.data));`} />
    </>
  );
}

// ── Content router ──────────────────────────────────────────────
function PageContent({ id }: { id: string }) {
  if (id === "getting-started") return <GettingStarted />;
  if (id === "architecture")    return <Architecture />;
  if (id === "tokenize")        return <Tokenize />;
  if (id === "market")          return <Market />;
  if (id === "portfolio-doc")   return <Portfolio />;
  if (id === "erc8004")         return <ERC8004 />;
  if (id === "contracts")       return <Contracts />;
  if (id === "consent")         return <Consent />;
  if (id === "tokenomics")      return <Tokenomics />;
  if (id === "revenue")         return <Revenue />;
  if (id === "gtm")             return <GTM />;
  if (["atlas-doc","nexus-doc","shield-doc","yield-doc","orchestration"].includes(id))
    return <AgentDoc id={id} />;
  if (id === "api-auth")      return <ApiAuth />;
  if (id === "api-chat")      return <ApiChat />;
  if (id === "api-portfolio") return <ApiPortfolio />;
  if (id === "api-tokenize")  return <ApiTokenize />;
  if (id === "api-market")    return <ApiMarket />;
  if (id === "api-vault")     return <ApiVault />;
  if (id === "api-stats")     return <ApiStats />;
  return null;
}

// ── Page ────────────────────────────────────────────────────────
const META: Record<string, { title: string; subtitle: string; tag: string }> = {
  "getting-started": { title:"Getting Started",      subtitle:"Connect your wallet and start in under 5 minutes.", tag:"OVERVIEW" },
  "architecture":    { title:"Architecture",          subtitle:"How the three layers work together.",               tag:"OVERVIEW" },
  "tokenize":        { title:"Tokenize",              subtitle:"Upload documents, deploy ERC-20 on Mantle.",        tag:"FEATURE" },
  "market":          { title:"RWA Market",            subtitle:"Buy and sell fractions of tokenized assets.",       tag:"FEATURE" },
  "portfolio-doc":   { title:"Portfolio",             subtitle:"Real-time allocation + Atlas autonomous mode.",     tag:"FEATURE" },
  "atlas-doc":       { title:"Atlas",                 subtitle:"Your AI portfolio manager. Voice + text.",          tag:"AGENT · ERC-8004 #44" },
  "nexus-doc":       { title:"Nexus",                 subtitle:"Tokenizes real-world assets from documents.",       tag:"AGENT · ERC-8004 #41" },
  "shield-doc":      { title:"Shield",                subtitle:"AI compliance — KYC/AML, sanctions, risk score.",  tag:"AGENT · ERC-8004 #42" },
  "yield-doc":       { title:"Yield",                 subtitle:"Monitors APY via Pyth, writes to YieldOracle.",    tag:"AGENT · ERC-8004 #43" },
  "orchestration":   { title:"Orchestration",         subtitle:"How Atlas coordinates the multi-agent system.",     tag:"PROTOCOL" },
  "erc8004":         { title:"ERC-8004 Identity",     subtitle:"Mantle's standard for on-chain AI agent identity.", tag:"PROTOCOL" },
  "contracts":       { title:"Contract Addresses",    subtitle:"All 8 contracts deployed on Mantle Sepolia.",       tag:"PROTOCOL" },
  "consent":         { title:"EIP-712 Consent",       subtitle:"Bounded, revocable autonomous agent permission.",   tag:"PROTOCOL" },
  "tokenomics":      { title:"$RWAI Tokenomics",      subtitle:"100M fixed supply. Governance + fee capture.",      tag:"TOKENOMICS" },
  "revenue":         { title:"Revenue Model",         subtitle:"Three on-chain fee streams. All governance-capped.", tag:"BUSINESS" },
  "gtm":             { title:"Go-to-Market",          subtitle:"Four phases. One compounding on-chain moat.",       tag:"BUSINESS" },
  "api-auth":      { title:"Auth & Rate Limits",   subtitle:"API key authentication and per-IP rate limiting.",   tag:"API REFERENCE" },
  "api-chat":      { title:"Chat & Status",         subtitle:"Send messages to agents, read live reputation.",     tag:"API REFERENCE" },
  "api-portfolio": { title:"Portfolio API",         subtitle:"Plan, rebalance, and read on-chain portfolio.",      tag:"API REFERENCE" },
  "api-tokenize":  { title:"Tokenize & Extract",    subtitle:"Nexus tokenization, Shield compliance, file extract.",tag:"API REFERENCE" },
  "api-market":    { title:"Market API",            subtitle:"Listings, buy and sell RWA tokens on-chain.",        tag:"API REFERENCE" },
  "api-vault":     { title:"Vault API",             subtitle:"HybridVault status, EIP-712 consent, relay, execute.",tag:"API REFERENCE" },
  "api-stats":     { title:"Stats & WebSocket",     subtitle:"Indexer stats, action history, live WS heartbeat.",  tag:"API REFERENCE" },
};

export default function DocsPage() {
  const [active, setActive] = useState("getting-started");
  const meta     = META[active] ?? META["getting-started"];
  const flatIdx  = FLAT.findIndex(i => i.id === active);
  const prev     = flatIdx > 0 ? FLAT[flatIdx - 1] : null;
  const next     = flatIdx < FLAT.length - 1 ? FLAT[flatIdx + 1] : null;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", maxWidth:1300, margin:"0 auto", height:"calc(100vh - 48px)", overflow:"hidden" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        borderRight:"1px solid var(--line)", overflowY:"auto",
        padding:"24px 0",
        scrollbarWidth:"thin",
      }}>
        {/* Search bar (UI only) */}
        <div style={{ padding:"0 16px 20px" }}>
          <div style={{
            display:"flex", alignItems:"center", gap:8,
            background:"rgba(255,255,255,0.04)", border:"1px solid var(--line)",
            borderRadius:3, padding:"7px 10px",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              placeholder="Search docs…"
              style={{ background:"transparent", border:"none", outline:"none", color:"var(--fg-2)", fontFamily:"var(--font-mono)", fontSize:11, width:"100%" }}
            />
          </div>
        </div>

        {/* Nav groups */}
        {SIDEBAR.map(group => (
          <div key={group.group} style={{ marginBottom:8 }}>
            <div style={{
              padding:"4px 16px", fontSize:9, letterSpacing:"0.14em",
              color:"var(--fg-3)", fontFamily:"var(--font-mono)", fontWeight:600,
            }}>
              {group.group}
            </div>
            {group.items.map(item => (
              <button key={item.id} onClick={() => setActive(item.id)} style={{
                display:"block", width:"100%", textAlign:"left",
                padding:"7px 16px 7px 20px",
                fontFamily:"var(--font-mono)", fontSize:11.5, letterSpacing:"0.03em",
                background: active === item.id ? "rgba(0,229,160,0.07)" : "transparent",
                color: active === item.id ? "var(--accent)" : "var(--fg-2)",
                border:"none", borderLeft: active === item.id ? "2px solid var(--accent)" : "2px solid transparent",
                cursor:"pointer", transition:"all 0.12s",
              }}>
                {item.label}
              </button>
            ))}
          </div>
        ))}

        {/* External links */}
        <div style={{ padding:"16px 16px 0", borderTop:"1px solid var(--line)", marginTop:8 }}>
          {[
            { label:"Mantlescan Explorer", href:"https://sepolia.mantlescan.xyz" },
            { label:"GitHub Repository",   href:"https://github.com/ntfound-dev/RWAI" },
            { label:"FastAPI Swagger",      href:"http://localhost:8001/docs" },
          ].map(l=>(
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" style={{
              display:"flex", alignItems:"center", gap:6,
              padding:"6px 0", fontSize:11, color:"var(--fg-3)",
              textDecoration:"none", fontFamily:"var(--font-mono)",
              transition:"color 0.12s",
            }}
            onMouseEnter={e=>(e.currentTarget.style.color="var(--accent)")}
            onMouseLeave={e=>(e.currentTarget.style.color="var(--fg-3)")}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              {l.label}
            </a>
          ))}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ overflowY:"auto", padding:"32px 48px 60px", scrollbarWidth:"thin" }}>

        {/* Breadcrumb */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:20, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--fg-3)" }}>
          <span>DOCS</span>
          <span style={{ color:"var(--line)" }}>›</span>
          <span style={{ color:"var(--accent)", letterSpacing:"0.08em" }}>{meta.tag}</span>
        </div>

        {/* Page header */}
        <div style={{ marginBottom:32, paddingBottom:24, borderBottom:"1px solid var(--line)" }}>
          <h1 style={{ fontSize:36, fontWeight:700, lineHeight:1.1, marginBottom:8, color:"var(--fg-0)" }}>
            {meta.title}
          </h1>
          <p style={{ fontSize:14, color:"var(--fg-3)", fontFamily:"var(--font-mono)", margin:0 }}>
            {meta.subtitle}
          </p>
        </div>

        {/* Dynamic content */}
        <PageContent id={active} />

        {/* Prev / Next nav */}
        <div style={{
          display:"grid", gridTemplateColumns:"1fr 1fr", gap:12,
          marginTop:48, paddingTop:24, borderTop:"1px solid var(--line)",
        }}>
          {prev ? (
            <button onClick={()=>setActive(prev.id)} style={{
              background:"rgba(255,255,255,0.03)", border:"1px solid var(--line)",
              borderRadius:4, padding:"14px 16px", cursor:"pointer",
              textAlign:"left", transition:"border-color 0.15s",
            }}
            onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(0,229,160,0.4)")}
            onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--line)")}
            >
              <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--fg-3)", marginBottom:4 }}>← PREVIOUS</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--fg-1)" }}>{prev.label}</div>
            </button>
          ) : <div/>}

          {next ? (
            <button onClick={()=>setActive(next.id)} style={{
              background:"rgba(255,255,255,0.03)", border:"1px solid var(--line)",
              borderRadius:4, padding:"14px 16px", cursor:"pointer",
              textAlign:"right", transition:"border-color 0.15s",
            }}
            onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(0,229,160,0.4)")}
            onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--line)")}
            >
              <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--fg-3)", marginBottom:4 }}>NEXT →</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--fg-1)" }}>{next.label}</div>
            </button>
          ) : <div/>}
        </div>
      </main>
    </div>
  );
}
