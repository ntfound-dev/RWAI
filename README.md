# RWAi — Sovereign AI Agents for Real World Assets on Mantle

> **Track:** AI & RWA Track · Turing Test Hackathon  
> **One-liner:** The first RWA platform where 4 ERC-8004 sovereign AI agents tokenize assets, pin documents to IPFS, manage portfolios, and answer to no one — every decision benchmarked on Mantle forever.

---

## The Problem

**1. Tokenizing a real-world asset costs $100,000 and takes months.**  
Lawyers, Solidity developers, compliance consultants — before a single token exists. Only institutions can afford this. Retail asset owners are locked out entirely.

**2. Mantle's native RWA ecosystem (USDY, mETH, fBTC, mUSD) has no intelligent layer.**  
The assets are excellent. The yield is real. But there is no system that tells a retail investor *what* to buy, *how much*, and *when to rebalance* — based on their risk profile, on current data, on their actual wallet.

**3. On-chain AI has a trust crisis.**  
AI agents are executing decisions that move real money — but there is no verifiable identity, no reputation trail, no auditable record of who decided what and why. When an AI agent acts, it leaves no proof it ever existed.

---

## The Solution

**RWAi** puts four ERC-8004 sovereign AI agents to work on these three problems simultaneously.

```
Asset Owner                          Investor
     │                                   │
     ▼                                   ▼
[Upload PDF/DOCX]              [Tell Atlas what you want]
     │                          (text or VOICE command)
     ▼                                   │
[NEXUS analyzes doc]           [ATLAS builds strategy]
[SHIELD validates compliance]  [YIELD prices the assets]
     │                                   │
     ▼                                   ▼
[Document pinned to IPFS]      [Allocation executed on Mantle]
[ERC-20 deployed on Mantle]            │
     │                                   │
     └──────────────┬────────────────────┘
                    ▼
        AgentExecutor.sol — immutable on-chain log
        Every decision. Every agent. Every outcome.
        Permanently benchmarked on Mantle.
```

**For asset owners:** Upload a PDF deed or income statement → Nexus extracts asset metadata, Shield scores compliance → document is pinned to IPFS (permanent, verifiable) → ERC-20 token deployed on Mantle in minutes. Cost: gas only.

**For investors:** Talk to Atlas (text or voice) → Atlas coordinates Nexus + Shield + Yield → recommends a strategy across real Mantle RWAs → executes allocation → writes reasoning on-chain with its ERC-8004 identity as proof.

**For everyone:** Every AI decision is logged immutably in `AgentExecutor.sol`. Every asset document is pinned to IPFS via Pinata — the CID is stored per listing, making every market card independently verifiable from document to blockchain. Every agent action is signed by its ERC-8004 identity NFT.

---

## Why This Wins the Turing Test

The three defining criteria of this hackathon — built into RWAi's core:

| Hackathon Criterion | How RWAi Delivers |
|---|---|
| **On-chain benchmarking of AI** | `AgentExecutor.sol` logs every agent decision on Mantle — queryable, permanent, the first RWA AI benchmark on-chain |
| **ERC-8004 agent identity** | 4 agents registered (nexus=41, shield=42, yield=43, atlas=44), reputation gating live, reputation mirrors to ERC-8004 on-chain |
| **Radical transparency** | Full proof chain: document on IPFS → compliance on `ComplianceLog.sol` → token on Mantle → AI reasoning on `AgentExecutor.sol` — every step independently verifiable |

---

## Verifiable RWA — The Proof Chain

This is what separates RWAi from every "AI + RWA" demo: **every asset has a complete, independently verifiable proof chain.**

| Layer | What's stored | Where | Verifiable by |
|-------|--------------|-------|---------------|
| Original document | Full text excerpt + asset metadata | **IPFS via Pinata** | Anyone with the CID |
| Compliance decision | Score, jurisdiction, notes, blockers | `ComplianceLog.sol` + `AgentExecutor.sol` | Mantle explorer |
| Token | ERC-20 contract | Mantle Sepolia | Mantlescan |
| AI reasoning | Agent ID, action type, decision text | `AgentExecutor.sol` | Mantlescan |

Market cards show a **📄 IPFS ↗** link — click it, read the original document, verify the compliance score yourself. No trust required.

---

## System Architecture

```mermaid
graph TB
    subgraph FE["🌐 Frontend · Next.js 14 · Vercel"]
        UI["Tokenize · Market · Portfolio · Hub · Chat"]
    end

    subgraph BE["⚡ FastAPI Backend · Railway · Python 3.11"]
        direction TB
        AT["Atlas #44 · Orchestrator"]
        NX["Nexus #41 · Tokenization"]
        SH["Shield #42 · Compliance"]
        YL["Yield #43 · Market Monitor"]
        LLM["LLM Chain: OpenClaw → Groq 70b → Groq 4-scout → Claude"]
        AT -->|delegates| NX
        AT -->|delegates| SH
        AT -->|delegates| YL
        YL -.->|drift signal| AT
        NX -.->|new asset| YL
        NX & SH & YL & AT --> LLM
    end

    subgraph CH["🔗 Mantle Sepolia · chainId 5003"]
        AE["AgentExecutor.sol · immutable AI log"]
        YO["YieldOracle.sol · APY snapshots"]
        CL["ComplianceLog.sol · KYC records"]
        RR["RWAiRegistry.sol · asset registry"]
        HV["HybridVault.sol · EIP-712 consent"]
        AR["AgentReputationManager + ERC-8004"]
    end

    FE -->|HTTPS REST + WebSocket| BE
    NX -->|logTokenization| AE
    NX -->|registerAsset| RR
    SH -->|logComplianceReview| AE & CL
    YL -->|updateYields| YO
    YL -->|recordYieldSnapshot| AE
    AT -->|executeAllocation| AE
    AT -->|agentExecute| HV
    AE --> AR
```

---

## Per-Agent Architecture

### Nexus #41 — Tokenization
```
User uploads PDF/DOCX
  → Nexus: extract value · supply · APY · symbol · concerns
  → Shield: auto-delegated compliance review (4-category score)
  → Document metadata pinned to IPFS via Pinata → CID stored in listing
  → AgentExecutor.logTokenization() + RWAiRegistry.registerAsset()
  → [background] Yield notified: new asset enters monitoring immediately
  → Token live in Market with "📄 IPFS ↗" proof link
```

### Shield #42 — Compliance
```
Asset document + jurisdiction + owner wallet
  → 4-category scoring:
      Document completeness  (30%) — all required docs present?
      Ownership clarity      (25%) — clean title, no encumbrances?
      Jurisdictional risk    (25%) — Reg D / MiFID II / MAS / FCA?
      Sanctions screening    (20%) — wallet vs OFAC / EU sanctions lists
  → Score ≥ 70 → CLEARED  → ComplianceLog.sol + AgentExecutor
  → Score < 70 → BLOCKED  → deployment prevented (score defaults to 0 on failure)
```

### Yield #43 — Market Monitor
```
[30s after startup] then [every 6 hours] + [on every new tokenization]
  → LLM: fetch USDY · mETH · MI4 · fBTC · mUSD yields
  → Compare vs previous snapshot — drift > 100bps triggers DRIFT ALERT
  → YieldOracle.updateYields() + AgentExecutor.recordYieldSnapshot()
  → DRIFT ALERT written on-chain as separate action → Atlas receives signal
```

### Atlas #44 — Orchestration
```
User message (text or voice)
  → Intent detection:
      yield / apy / market   → delegate to Yield (live APY data)
      compliance / kyc       → delegate to Shield (review context)
      tokenize / asset       → delegate to Nexus (tokenization brief)
  → Sub-agent result injected into Atlas context
  → Read live APY from YieldOracle.getLatestYield() on-chain
  → Strategy → AgentExecutor.executeAllocation()
  → HybridVault EIP-712 consent → autonomous rebalance within user's cap
```

---

## The 4 ERC-8004 Agents

| Agent | ERC-8004 ID | Role | Primary On-Chain Action |
|-------|------------|------|------------------------|
| **Nexus** | 41 | Tokenizes RWAs from documents — PDF/DOCX → valuation → IPFS → ERC-20 | `AgentExecutor.logTokenization()` + `RWAiRegistry.registerAsset()` |
| **Shield** | 42 | AI compliance — 4-category scoring, OFAC sanctions screen, 70/100 threshold | `AgentExecutor.logComplianceReview()` + `ComplianceLog.sol` |
| **Yield** | 43 | 6h scheduler — fetches APYs, writes to YieldOracle, detects >100bps drift | `YieldOracle.updateYields()` + `AgentExecutor.recordYieldSnapshot()` |
| **Atlas** | 44 | Intent detection → delegates to Nexus/Shield/Yield → builds strategy | `AgentExecutor.executeAllocation()` / `executeRebalance()` |

**Reputation scores (live on Mantle Sepolia):** Nexus: 85 · Shield: 75 · Yield: 75 · Atlas: 75  
Higher reputation → more autonomous actions permitted. Agents earn reputation through successful on-chain decisions.

**Agent runtime:** OpenClaw/CMDOP → Groq (llama-3.3-70b) → Groq (llama-4-scout-17b, smarter fallback) → Claude → Ollama. Model-agnostic, 5-level chain.

---

## J.A.R.V.I.S. — Atlas Voice & Command Interface

**J**ust **A** **R**ather **V**ery **I**ntelligent **S**ystem is RWAi's full-screen AI interface — Atlas's front-end agent. Available on every page via the JARVIS pill in the top bar or the SPLIT/JARVIS toggle on `/chat`.

```
User speaks or types "Atlas, invest $1000 into USDY"
  └─ JARVIS detects intent → routes to Atlas
     └─ Atlas delegates to sub-agents (Yield for live APY data, etc.)
        └─ Sub-agent result injected into Atlas's context
           └─ Atlas responds with grounded, live data
              └─ Execution intent detected → executeAllocation() called on-chain
                 └─ tx hash returned → ON-CHAIN LOG panel shows EXECUTING (amber)
                    └─ Mantlescan link in HUD — verifiable in real time
```

**Atlas Voice Execution** — When the user says *"execute"*, *"invest $X"*, or *"allocate"*, the backend:
1. Parses the USD amount and target assets from natural language
2. Calls `AgentExecutor.executeAllocation()` on Mantle Sepolia — **no user signature needed**
3. Returns `onChainTx` to the frontend — orb turns AMBER (EXECUTING state)
4. On-chain log panel fills with the transaction hash + Mantlescan link

**What JARVIS shows (all live data):**
- L2 MNT wallet balance + blended APY from on-chain allocations × YieldOracle
- On-chain portfolio allocations from `PortfolioVault.getPortfolio()`
- Live APYs per asset from `YieldOracle.getLatestSnapshot()`
- Agent mesh status + reputation from WebSocket heartbeat
- Real block number from Mantle Sepolia
- Quick commands: "Show alternative allocations" / "Stress-test against -20% MI4" / "Execute on testnet"

**Security:** JARVIS refuses to expose `AGENT_PRIVATE_KEY`, mnemonics, or any backend credential — refusal is client-side before the request reaches Atlas.

---

## Autonomous Agent Control — HybridVault + EIP-712 Capped Consent

This is the feature that separates RWAi from every other "AI + RWA" project: **Atlas does not just recommend — it executes.**

Most AI portfolio tools give advice. Atlas acts. But acting with someone's money requires trust. RWAi solves this with **capped consent** — a single EIP-712 signature that gives Atlas a bounded, revocable allowance to operate autonomously.

```
User signs once (EIP-712)
  └─ "Atlas may move up to $500 from my HybridVault"

Atlas detects opportunity → executes rebalance autonomously
  └─ No per-transaction approvals needed within the cap

Every autonomous action is logged on AgentExecutor.sol
  └─ ERC-8004 identity of Atlas is the signer — permanent proof

Allowance exhausted → Atlas requests new consent
  └─ User is always in control of the ceiling
```

**Why this matters for the scoring criteria:**

- *AI × RWA depth* — AI is the execution layer, not a chatbot. Atlas signs and submits transactions.
- *Mantle integration* — HybridVault.sol lives on Mantle. Every autonomous action is an on-chain event.
- *Path B Application* — this is what "AI-driven RWA application" means: an agent that lowers the barrier by acting on the user's behalf, within explicit consent bounds.

**How consent works (EIP-712):**

```typescript
// User signs this structure — no private key exposure, no full custody
{
  domain: { name: "RWAi HybridVault", chainId: 5003 },
  types:  { AgentConsent: [
    { name: "agent",      type: "address" },  // Atlas wallet
    { name: "allowance",  type: "uint256" },  // cap in wei
    { name: "deadline",   type: "uint256" },  // expiry
    { name: "nonce",      type: "uint256" },  // replay protection
  ]},
  message: { agent, allowance, deadline, nonce }
}
```

The signature is submitted to `HybridVault.relayAllowance()`. From that point, Atlas can call `HybridVault.agentExecute()` for actions up to the cap — each deducting from the allowance, each logged permanently on `AgentExecutor.sol`.

---

## Architecture

```
Browser (Next.js 14)
  │  wagmi v2 + viem · Mantle Sepolia · WalletConnect
  │
  ▼
FastAPI Backend (agents/)
  │  OpenClaw/CMDOP → Groq (70b) → Groq (4-scout) → Claude → Ollama (5-level fallback)
  │  Every decision logged on-chain before response returned
  │  Documents pinned to IPFS via Pinata on tokenization
  │
  ▼
Mantle Sepolia (chainId 5003)
  ├── AgentExecutor.sol          — immutable AI action log (the benchmark)
  ├── AgentReputationManager.sol — reputation score + ERC-8004 mirror
  ├── YieldOracle.sol            — Pyth USD prices + APY market snapshots
  ├── ComplianceLog.sol          — Shield's KYC/AML decisions
  ├── RWAiRegistry.sol           — tokenized asset registry
  ├── AssetToken.sol             — ERC-20 fractional RWA token
  ├── PortfolioVault.sol         — strategy (bps) + execution
  └── HybridVault.sol            — user deposits + EIP-712 agent consent

IPFS (Pinata)
  └── Asset documents pinned at tokenization — CID stored per listing
      ipfs.io/ipfs/<CID> — public, permanent, verifiable

ERC-8004 (Mantle Sepolia — official pre-deployed)
  Identity:   0x8004A818BFB912233c491871b3d84c89A494BD9e
  Reputation: 0x8004B663056A597Dffe9eCcC1965A193B7388713
```

---

## Contract Addresses (Mantle Sepolia)

| Contract | Address |
|----------|---------|
| AgentExecutor | `0x9a822B9A50D090CfcCa1e6474efCd653112d8501` |
| AgentReputationManager | `0xfFE21EC80012D3Bf00F5eE20a400C94455F32D32` |
| YieldOracle | `0x1288dF9F55673cBFc97BCe7aD5445D77B9029B92` |
| ComplianceLog | `0xCc6296557c05ca02f3258DEd19f4104a9C19a80B` |
| RWAiRegistry | `0xeE7a50936a25a375143b75b7Ca743B9513368680` |
| PortfolioVault | `0xf7C43D8fe74712130C0a05D1F58A33515E2C63E4` |
| HybridVault | `0xC6c08db835636Cf40530dDf90Bf3Bb15bc78190D` |
| AssetToken (template) | `0x80E0e5f6488FA2726c042a204344281974f72609` |
| RWAiToken ($RWAI) | `0xa947B1e71E91078c12cf4bAde3A771892772d659` |
| ProtocolTreasury | `0x9c3CD9CEef24F07520bD0f86BE5cF87F1Ff9d679` |
| ERC-8004 Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

**Mock RWA Tokens on Mantle Sepolia**

| Token | Address |
|-------|---------|
| Mock USDY | `0xcE265E23aAc349cEf9Fa3CC058062A44080f2289` |
| Mock mUSD | `0xDf079DB274fAEFfeD10A4a0E5C12f65e1570Cd35` |
| Mock mETH | `0xD57f88B64611dBf74f87FC40f2F1010320483584` |
| Mock fBTC | `0xbED7ad48984fBb3984F5aF83E176fb9f40dB37cc` |

**Agent Wallet:** `0x834De729cb9dF77451DBc6bf7FD05F475B011Ac7`  
Explorer: https://sepolia.mantlescan.xyz

---

## Repository Structure

```
rwai/
├── contracts/              # 11 Solidity contracts · Hardhat · 186 passing tests
│   └── deployments.json    # Live Mantle Sepolia addresses
├── agents/                 # FastAPI backend · Railway
│   ├── api/routes/         # chat, tokenize, compliance, yield, portfolio, market
│   ├── api/app.py          # CORS, auth, rate-limit, yield scheduler, WebSocket
│   ├── mantle/             # Web3, executor, reputation, Pyth, JSON db, Pinata
│   │   └── pinata.py       # IPFS pinning via Pinata API
│   └── skills/             # nexus.md, shield.md, yield.md, atlas.md (ERC-8004 skills)
└── app/                    # Next.js 14 frontend · Vercel
    ├── app/                # /, /hub, /chat, /tokenize, /market, /portfolio, /bridge, /docs
    ├── components/ui/      # JarvisView (full-screen), JarvisPanel (right panel),
    │                       # GlobalJarvisPanel (sidebar overlay), AgentMonogram
    └── hooks/              # useYieldOracle, useAgentSocket, useAgentStatus
```

---

## Live Demo

| Resource | Link |
|----------|------|
| Frontend | https://rwai-theta.vercel.app |
| Swagger UI | https://rwai-production.up.railway.app/docs |
| Mantle Explorer | https://sepolia.mantlescan.xyz |
| Agent Wallet | [0x834De...Ac7](https://sepolia.mantlescan.xyz/address/0x834De729cb9dF77451DBc6bf7FD05F475B011Ac7) |
| AgentExecutor | [0x9a822B...501](https://sepolia.mantlescan.xyz/address/0x9a822B9A50D090CfcCa1e6474efCd653112d8501) |
| Demo Video | *(YouTube/Loom URL — add before submit)* |

---

## Revenue Model

RWAi captures value at three protocol layers — **every fee is live on Mantle Sepolia, collected automatically by `ProtocolTreasury.sol`, verifiable on Mantlescan.**

| Stream | Rate | Mechanism |
|--------|------|-----------|
| **Tokenization fee** | 0.5% of stated asset value | `ProtocolTreasury.collectTokenizationFee()` — called automatically by Nexus on every ERC-20 deploy. **Live on Mantle Sepolia.** |
| **Protocol fee on AUM** | 0.3% / year | Streamed continuously from `HybridVault` deposits; Atlas-managed positions pay into the protocol treasury |
| **Market transaction fee** | 0.15% of trade value | `ProtocolTreasury.collectMarketFee()` — called on every buy/sell in the RWA Market. **Live on Mantle Sepolia.** |
| **Agent API (enterprise)** | $299–$999 / month | Institutions call Atlas, Nexus, Shield, Yield directly via REST — higher consent caps, SLA, dedicated indexer |

**Unit economics at scale (illustrative):**
- $50M AUM → $150,000 / year from vault fee alone
- 100 tokenizations × avg $500K asset → $250,000 single quarter
- Market volume $5M / month → $90,000 / year in transaction fees

All fees flow to `ProtocolTreasury` (`0x9c3CD9CEef24F07520bD0f86BE5cF87F1Ff9d679`) — every `FeeCollected` event is verifiable on [Mantlescan](https://sepolia.mantlescan.xyz/address/0x9c3CD9CEef24F07520bD0f86BE5cF87F1Ff9d679). Governed by $RWAI stakers, not the founding team.

---

## Tokenomics

**$RWAI** is the protocol governance and fee-capture token. It is not required to use the product — retail users interact purely with MNT and RWA tokens. $RWAI exists to align long-term stakeholders.

### Utility

| Function | How |
|----------|-----|
| **Governance** | Vote on fee parameters, new asset type whitelists, agent reputation thresholds |
| **Fee sharing** | Stake $RWAI → earn 70% of protocol fees pro-rata (30% to treasury) |
| **Agent licensing** | New third-party ERC-8004 agents must bond $RWAI; slashed on malicious actions |
| **Discount** | Tokenization fee reduced to 0.2% if paid in $RWAI (vs 0.5% in MNT) |
| **Reputation boost** | Agents backed by staked $RWAI start with higher base reputation (up to +10 points) |

### Supply & Distribution

**Total supply: 100,000,000 $RWAI** — fixed, no inflation.

| Allocation | % | Tokens | Vesting |
|------------|---|--------|---------|
| Ecosystem & grants | 25% | 25M | 4 years linear |
| Protocol treasury | 20% | 20M | DAO-controlled |
| Team & contributors | 18% | 18M | 1-year cliff, 3-year linear |
| Community & airdrops | 15% | 15M | 6-month cliff, then linear |
| Investors (seed) | 12% | 12M | 6-month cliff, 2-year linear |
| Liquidity provision | 10% | 10M | Unlocked at TGE for DEX pools |

**Launch:** $RWAI launches on Mantle after mainnet deployment. Initial liquidity seeded on FusionX (Mantle-native DEX). No presale, no VC dump — team tokens cliff at 12 months.

---

## Go-to-Market Strategy

### Target Segments

**Primary (Year 1):** Crypto-native retail investors on Mantle who already hold USDY, mETH, mUSD, fBTC — they have the assets but no intelligent allocation layer. Zero acquisition cost barrier: Atlas speaks to them in plain English (or voice).

**Secondary (Year 1–2):** SME asset owners (real estate, invoice, commodity) who cannot afford $100K traditional tokenization. RWAi reduces this to gas fees + 0.5% protocol fee.

**Tertiary (Year 2+):** Institutional desks who need verifiable AI decision audit trails — `AgentExecutor.sol` is the only on-chain AI benchmark that exists today.

### Phases

```
Phase 1 — Seed (Now, Testnet)
  └── Hackathon submission → developer mindshare
  └── Open source → forks become distribution
  └── ERC-8004 standard → Mantle ecosystem becomes dependency

Phase 2 — Mainnet Alpha (Q3 2026)
  └── Deploy to Mantle mainnet (Mantle assets: real USDY, mETH)
  └── Partner with Mantle Foundation for co-marketing
  └── Onboard first 10 asset tokenizations (target: real estate, invoices)
  └── JARVIS voice interface as viral acquisition hook

Phase 3 — Growth (Q4 2026)
  └── Integrate real KYC provider (Fractal ID or Sumsub) into Shield agent
  └── $RWAI token launch on FusionX
  └── Enterprise API tier — target family offices and asset managers
  └── Agent marketplace: third parties deploy ERC-8004 agents, bond $RWAI

Phase 4 — Scale (2027+)
  └── Cross-chain (OP Stack, Arbitrum) — AgentExecutor bridges via LayerZero
  └── RWA index products managed autonomously by Atlas
  └── Regulatory sandbox applications (MAS Singapore, ADGM Abu Dhabi)
```

### Distribution Channels

- **Mantle ecosystem programs** — grants, co-marketing, Mantle DeFi integrations
- **Voice-first virality** — JARVIS demo clips on X/Twitter; "speak to your portfolio" is inherently shareable
- **Developer adoption** — ERC-8004 agent SDK; any team building AI × DeFi becomes a distribution partner
- **Asset owner outreach** — direct to SMEs via real estate tokenization communities (RWA.xyz, Centrifuge community)

### Competitive Moat

| Competitor | Gap | RWAi advantage |
|------------|-----|----------------|
| Ondo Finance | No AI, no voice, no agent autonomy | Atlas executes, not just recommends |
| Centrifuge | No AI layer, Substrate chain | Mantle-native, Atlas voice interface |
| OpenTrade | Institutional only, no retail | Retail-first, $10K minimum via HybridVault |
| Generic AI chatbots | No on-chain proof | `AgentExecutor.sol` = immutable AI audit trail |

**The irreplaceable asset:** `AgentExecutor.sol` accumulates every AI decision ever made on RWAi. By the time competitors build equivalent infrastructure, RWAi will have months of verifiable on-chain AI performance data — a benchmark no one can fake retroactively.

---

## Open Source

This project is fully open source under the **MIT License**.

```
MIT License — Copyright (c) 2026 RWAi Contributors
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software to use, copy, modify, merge, publish, distribute the software,
subject to the following conditions: The above copyright notice shall be included
in all copies. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
```

**Contributions welcome.** The codebase is structured so each layer (contracts, agents, frontend) can be developed independently. See each subdirectory for its own README.

---

## Quick Start

```bash
# Install all dependencies
make install

# Configure environment
cp contracts/.env.example contracts/.env   # add PRIVATE_KEY
cp agents/.env.example agents/.env         # add GROQ_API_KEY + AGENT_PRIVATE_KEY + PINATA_JWT

# Deploy contracts + register agents
make production-testnet

# Start dev servers
make dev
# Backend  → http://localhost:8001
# Frontend → http://localhost:3000
```

---

## API Reference (port 8001)

| Method | Path | Agent | Description |
|--------|------|-------|-------------|
| POST | `/api/agents/chat` | any | Conversational interface — text or voice transcript |
| POST | `/api/agents/tokenize` | Nexus | PDF/DOCX → token params + IPFS pin + on-chain log |
| POST | `/api/agents/compliance` | Shield | KYC/AML review → on-chain compliance record |
| GET | `/api/agents/yield` | Yield | Live APY snapshot → writes to YieldOracle |
| GET | `/api/agents/yield/prices` | Yield | Pyth price feed → writes USD prices on-chain |
| POST | `/api/agents/portfolio/plan` | Atlas | Strategy → writes allocation on-chain |
| POST | `/api/agents/portfolio/rebalance` | Atlas | Rebalance → writes rebalance on-chain |
| GET | `/api/agents/market/listings` | — | All user-tokenized RWA listings (with IPFS CIDs) |
| POST | `/api/agents/market/buy` | Atlas | Log purchase on-chain with AI reasoning |
| POST | `/api/agents/market/sell` | Atlas | Log sell on-chain (RWA → USDY) with AI reasoning |
| GET | `/api/agents/status` | — | Live ERC-8004 reputation scores for all agents |

Swagger UI: http://localhost:8001/docs

---

## Hackathon Submission Checklist

**Contracts & Protocol**
- [x] 10 contracts deployed on Mantle Sepolia (chainId 5003)
- [x] 4 agents registered on ERC-8004 Identity Registry (nexus=41, shield=42, yield=43, atlas=44)
- [x] Reputation system live on AgentReputationManager + ERC-8004 mirror
- [x] On-chain action logging: tokenization, compliance, yield snapshot, allocation, rebalance, buy, sell
- [x] HybridVault EIP-712 capped consent — Atlas executes within user-signed allowance
- [x] Revenue model live: ProtocolTreasury collects 0.5% tokenization fee + 0.15% market fee on every transaction

**Agent Intelligence**
- [x] OpenClaw/CMDOP → Groq (llama-3.3-70b) → Groq (llama-4-scout-17b) → Claude → Ollama (5-level fallback)
- [x] Atlas real delegation: intent detection routes to Nexus/Shield/Yield + injects result
- [x] Yield 6h autonomous scheduler + >100bps drift detection → on-chain DRIFT ALERT
- [x] Nexus→Yield notification: newly tokenized assets enter monitoring immediately
- [x] Shield 4-category scoring (doc completeness · ownership · jurisdiction · sanctions) — blocks at <70/100

**Decentralized Storage**
- [x] Asset documents pinned to IPFS via Pinata on every tokenization
- [x] IPFS CID stored per listing — market cards link to original document
- [x] Full verifiability: document (IPFS) → compliance (on-chain) → token (on-chain) → AI reasoning (on-chain)

**Frontend Features**
- [x] Full tokenize flow: PDF → AI analysis → Shield auto-review → ERC-20 on Mantle + IPFS pin
- [x] RWA Market: list with IPFS proof link, buy/sell with Atlas AI reasoning on-chain
- [x] Portfolio management: Atlas builds strategy, live APYs from YieldOracle on all pages
- [x] J.A.R.V.I.S. — full-screen AI interface: voice + text, live oracle data, sensitive data filter
- [x] **Atlas voice execution** — say "invest $X" → `executeAllocation()` fires on Mantle → EXECUTING state + tx hash shown in HUD
- [x] **Gasless UX** — all on-chain txs agent-sponsored; users need zero MNT gas
- [x] All APY data live from YieldOracle.sol (homepage, chat, portfolio, JARVIS)

**Infrastructure**
- [x] 186 contract tests passing, 0 failing (Hardhat)
- [x] Rate limiting, CORS lockdown, API key auth on Railway backend
- [x] Persistent market DB on Railway Volume — listings survive redeploys
- [x] Live frontend on Vercel — https://rwai-theta.vercel.app
- [x] Agent backend deployed on Railway — https://rwai-production.up.railway.app
- [ ] Demo video (3–4 min) — voice command → Atlas executes → on-chain proof shown

---

## Scoring Alignment

**General (60%)**
- *AI × RWA depth*: AI is the execution layer. Atlas signs transactions. Every tokenization, compliance review, allocation, and rebalance is an AI agent action with ERC-8004 identity and permanent on-chain proof.
- *Technical completeness*: 11 contracts deployed, 4 agents with real inter-agent delegation, IPFS document storage, full tokenize + market + portfolio + JARVIS flows — end-to-end, deployed and live. **186 tests passing, 0 failing.**
- *Mantle integration*: ERC-8004 identity + reputation live on Mantle pre-deployed contracts. YieldOracle with Pyth prices. HybridVault with EIP-712 consent. AgentExecutor as the immutable benchmark. 4 mock RWA tokens.
- *Compliance awareness*: Shield's 4-category scoring blocks non-compliant assets before ERC-20 deployment. Every decision is permanent in ComplianceLog.sol. Documents preserved forever on IPFS.

**Track-specific (40%) — Path A + B**
- *Infrastructure (Path A)*: Complete tokenization pipeline — document in, IPFS pin, Shield auto-reviews, Yield auto-prices, ERC-20 out, all logged on-chain with IPFS CID.
- *Application (Path B)*: J.A.R.V.I.S. gives retail investors a voice interface to Atlas. Speak intent → Atlas delegates to agents → executes on Mantle → on-chain proof returned in seconds. **Gasless:** all transactions agent-sponsored, zero MNT required.

---

*RWAi · Solidity 0.8.24 · OpenZeppelin v5 · ERC-8004 · FastAPI · OpenClaw · Pinata IPFS · Next.js 14 · Mantle Network*
