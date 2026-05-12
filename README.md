# RWAi — AI-Native Real World Asset Platform on Mantle

> Four ERC-8004 sovereign AI agents tokenize real-world assets and manage investor portfolios on Mantle Network. Every agent decision is written permanently on-chain.

**Track:** AI & RWA Track · DoraHacks Turing Test Hackathon  
**Chain:** Mantle Sepolia Testnet (chainId 5003)  
**Stack:** Next.js 14 · FastAPI · Ollama (Qwen3) + Claude fallback · Solidity 0.8.24 · OpenZeppelin v5 · ERC-8004

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
FastAPI Backend (agents/)  ← Ollama (Qwen3) primary + Claude Sonnet fallback
  │  confidence < 0.80 → Claude; both fail → graceful degradation
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
│   │   ├── core.py         # Ollama + Claude inference with fallback
│   │   └── routes/         # chat, tokenize, compliance, yield, portfolio
│   ├── mantle/
│   │   ├── client.py       # Web3 + deployments.json reader
│   │   ├── contracts.py    # Contract ABIs
│   │   ├── executor.py     # On-chain write helpers
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
| ComplianceLog | — |
| YieldOracle | — |
| RWAiRegistry | — |
| AgentReputationManager | — |
| AgentExecutor | — |
| PortfolioVault | — |
| HybridVault | — |
| AssetToken (MANHATTAN demo) | — |
| ERC-8004 Identity *(pre-deployed)* | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation *(pre-deployed)* | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

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

- [ ] 8 contracts deployed + verified on Mantle Sepolia testnet production
- [ ] 4 agents registered on ERC-8004 Identity Registry
- [ ] Live frontend on Vercel
- [ ] Agent backend running (Railway / Render / self-hosted)
- [ ] Demo video (3–4 min) — tokenization + portfolio flow + on-chain proof
- [ ] Open-source GitHub repo

---

*RWAi · Solidity 0.8.24 · OpenZeppelin v5 · ERC-8004 · FastAPI · Next.js 14 · Mantle Network*
