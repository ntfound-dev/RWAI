# RWAi — AI-Native Real World Asset Platform on Mantle

> Four ERC-8004 sovereign AI agents tokenize real-world assets and manage investor portfolios on Mantle Network. Every agent decision is written permanently on-chain.

**Track:** AI & RWA Track · DoraHacks Turing Test Hackathon  
**Chain:** Mantle Sepolia Testnet (chainId 5003)  
**Stack:** Next.js 14 · FastAPI · OpenClaw/CMDOP + Groq fallback · Solidity 0.8.24 · OpenZeppelin v5 · ERC-8004

---

## One-Line Pitch

RWAi is the first RWA platform where 4 ERC-8004 sovereign AI agents autonomously tokenize real-world assets and manage investor portfolios — with every AI decision permanently verifiable on Mantle.

---

## The 4 AI Agents

| Agent | Role | On-Chain Action |
|-------|------|----------------|
| **Nexus** | Analyzes documents → recommends ERC-20 token params | `AgentExecutor.logTokenization()` |
| **Shield** | Compliance scoring, KYC/AML, sanctions screening | `AgentExecutor.logComplianceReview()` |
| **Yield** | Monitors APY and Pyth USD prices across Mantle RWAs | `YieldOracle.createMarketSnapshot()` / `YieldOracle.updatePrice()` |
| **Atlas** | Onboards investors, builds strategies, executes rebalancing | `AgentExecutor.executeAllocation()` |

Each agent has an **ERC-8004 identity** on Mantle. Reputation score (0–100) gates autonomy level — higher score → more autonomous actions allowed.

---

## Architecture

```
Browser
  │
  ▼
Next.js 14 (app/)          ← wagmi v2 + viem, Mantle Sepolia
  │
  ▼
FastAPI Backend (agents/)  ← OpenClaw/CMDOP → Groq (llama-3.3-70b) → Claude
  │  4-level fallback chain; every decision logged on-chain
  │
  ▼
Mantle Sepolia (chainId 5003)
  ├── AgentExecutor.sol          — immutable AI action log
  ├── HybridVault.sol            — user deposits + capped autonomous agent allowance
  ├── AgentReputationManager.sol — local score + ERC-8004 mirror
  ├── YieldOracle.sol            — live APY + Pyth USD prices + market snapshots
  ├── PortfolioVault.sol         — strategy layer (bps) + execution layer
  ├── ComplianceLog.sol          — KYC/AML + sanctions list
  ├── RWAiRegistry.sol           — tokenized asset registry
  └── AssetToken.sol             — ERC-20 fractional RWA token

ERC-8004 (official Mantle Testnet — pre-deployed)
  Identity:   0x8004A818BFB912233c491871b3d84c89A494BD9e
  Reputation: 0x8004B663056A597Dffe9eCcC1965A193B7388713
```

---

## Repository Structure

```
rwai/
├── contracts/              # Hardhat — 8 Solidity contracts
│   ├── contracts/          # AgentExecutor, ReputationManager, YieldOracle,
│   │                       # PortfolioVault, ComplianceLog, RWAiRegistry, AssetToken
│   ├── scripts/
│   │   ├── deploy.ts       # Full 8-contract deploy + wiring
│   │   └── registerAgents.ts # ERC-8004 identity registration
│   ├── test/RWAi.test.ts   # 46 tests — all passing
│   ├── hardhat.config.ts
│   └── README.md
│
├── agents/                 # FastAPI — 4 AI agent backend
│   ├── api/
│   │   ├── app.py          # FastAPI app + health + status
│   │   ├── core.py         # OpenClaw → Groq → Claude fallback chain
│   │   └── routes/         # chat, tokenize, compliance, yield, portfolio
│   ├── mantle/
│   │   ├── client.py       # Web3 + deployments.json reader
│   │   ├── contracts.py    # Contract ABIs
│   │   ├── executor.py     # On-chain write helpers
│   │   ├── openclaw.py     # OpenClaw/CMDOP integration (primary AI layer)
│   │   ├── pyth.py         # Hermes price update fetcher
│   │   └── reputation.py   # Live reputation reader
│   ├── skills/             # nexus.md, shield.md, yield.md, atlas.md
│   ├── requirements.txt
│   └── README.md
│
├── app/                    # Next.js 14 — frontend
│   ├── app/                # /, /hub, /tokenize, /portfolio, /chat, /docs
│   ├── components/         # UI + layout + agent components
│   ├── lib/contracts.ts    # ABIs + addresses
│   └── README.md
│
└── Makefile                # One-command setup & dev
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- Python 3.11+
- A wallet with **native MNT** on Mantle Sepolia for gas.
  If your faucet only mints MNT on Ethereum Sepolia (L1), bridge that testnet MNT to Mantle Sepolia (L2) in Mantle Bridge Sepolia mode.

### 1. Install dependencies

```bash
make install
```

### 2. Configure environment

```bash
# Contracts — add PRIVATE_KEY
cp contracts/.env.example contracts/.env

# Agents — add ANTHROPIC_API_KEY + AGENT_PRIVATE_KEY
cp agents/.env.example agents/.env

# Frontend — add WalletConnect project ID + contract addresses
# (edit app/.env.local)
```

### 3. Run tests

```bash
make test
```

### 4. Deploy contracts to Mantle Sepolia

```bash
make preflight
make deploy
make register
make verify
make sync-deployment
```

For the full testnet-production flow in one command:

```bash
make production-testnet
```

### 5. Start dev servers

```bash
make dev
# Backend  → http://localhost:8001
# Frontend → http://localhost:3000
```

See all available commands:

```bash
make help
```

---

## Contract Addresses

> Fill after running `make deploy` or `cd contracts && npm run deploy:sepolia`

| Contract | Address |
|----------|---------|
| ComplianceLog | `0xCc6296557c05ca02f3258DEd19f4104a9C19a80B` |
| YieldOracle | `0x1288dF9F55673cBFc97BCe7aD5445D77B9029B92` |
| RWAiRegistry | `0xeE7a50936a25a375143b75b7Ca743B9513368680` |
| AgentReputationManager | `0xfFE21EC80012D3Bf00F5eE20a400C94455F32D32` |
| AgentExecutor | `0x9a822B9A50D090CfcCa1e6474efCd653112d8501` |
| PortfolioVault | `0xf7C43D8fe74712130C0a05D1F58A33515E2C63E4` |
| HybridVault | `0xC6c08db835636Cf40530dDf90Bf3Bb15bc78190D` |
| AssetToken | `0x80E0e5f6488FA2726c042a204344281974f72609` |
| ERC-8004 Identity *(pre-deployed)* | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation *(pre-deployed)* | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

**Mock RWA Tokens (Mantle Sepolia)**

| Token | Address | Supply |
|-------|---------|--------|
| Mock USDY | `0xcE265E23aAc349cEf9Fa3CC058062A44080f2289` | 1,000,000 |
| Mock mUSD | `0xDf079DB274fAEFfeD10A4a0E5C12f65e1570Cd35` | 1,000,000 |
| Mock mETH | `0xD57f88B64611dBf74f87FC40f2F1010320483584` | 100 |
| Mock fBTC | `0xbED7ad48984fBb3984F5aF83E176fb9f40dB37cc` | 10 |

**Agent Wallet:** `0x834De729cb9dF77451DBc6bf7FD05F475B011Ac7`  
**Agent IDs (ERC-8004):** nexus=41, shield=42, yield=43, atlas=44

Mantle Sepolia Explorer: https://sepolia.mantlescan.xyz

---

## API Endpoints (Backend — port 8001)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Mantle connection + contract addresses |
| GET | `/api/agents/status` | Live reputation scores for all 4 agents |
| POST | `/api/agents/chat` | Chat with any agent |
| POST | `/api/agents/tokenize` | Nexus analyzes document → token params |
| POST | `/api/agents/compliance` | Shield compliance review |
| GET | `/api/agents/yield` | Live APY snapshot → writes to Mantle |
| GET | `/api/agents/yield/prices` | Pyth price updates → writes USD prices to Mantle |
| GET | `/api/agents/yield/market-analysis` | Full market snapshot |
| POST | `/api/agents/portfolio/plan` | Atlas builds strategy → writes allocation |
| POST | `/api/agents/portfolio/rebalance` | Execute rebalance |
| GET | `/api/agents/portfolio/{address}` | Read portfolio from chain |
| GET | `/api/agents/vault/status/{address}` | Read HybridVault balance, nonce, allowance |
| POST | `/api/agents/vault/consent` | Build EIP-712 AgentConsent for Atlas autonomy |
| POST | `/api/agents/vault/relay-allowance` | Relay signed HybridVault allowance |
| POST | `/api/agents/vault/execute` | Autonomous agent execution, gated by `AUTONOMOUS_EXECUTION_ENABLED=true` |

Swagger docs: http://localhost:8001/docs

---

## Hackathon Checklist

- [x] 8 contracts deployed on Mantle Sepolia (chainId 5003)
- [x] 4 agents registered on ERC-8004 Identity Registry (nexus=41, shield=42, yield=43, atlas=44)
- [x] 4 mock RWA tokens deployed + minted (USDY, mUSD, mETH, fBTC)
- [x] 5 assets registered in RWAiRegistry on-chain
- [x] On-chain action log working (logTokenization, logComplianceReview, executeAllocation)
- [x] Agent reputation system live (nexus score: 85, others: 75)
- [x] OpenClaw/CMDOP integration as primary AI execution layer
- [ ] Live frontend on Vercel
- [ ] Agent backend running (Railway)
- [ ] Demo video (3–4 min) — tokenization + portfolio flow + on-chain proof
- [ ] Public GitHub repo at submission

---

*RWAi · Solidity 0.8.24 · OpenZeppelin v5 · ERC-8004 · FastAPI · Next.js 14 · Mantle Network*
