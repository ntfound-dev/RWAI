# RWAi Agent Backend

FastAPI backend powering 4 autonomous AI agents on Mantle Network. Each agent has an ERC-8004 sovereign identity and writes its reasoning permanently on-chain.

## Agents

| Agent | ERC-8004 ID | Role | Autonomy |
|-------|-------------|------|----------|
| **Nexus** | 41 | Asset tokenization — analyzes documents, recommends ERC-20 params | Level 3 |
| **Shield** | 42 | Compliance — screens wallets, reviews regulatory docs | Level 3 |
| **Yield** | 43 | Market monitor — tracks APY and Pyth USD prices across Mantle RWA assets | Level 3 |
| **Atlas** | 44 | Portfolio manager — onboards investors, allocates & rebalances | Level 3 |

Registered on Mantle Sepolia (chainId 5003) — 2026-05-12. Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`

## Stack

- **FastAPI** — async REST API with lifespan-managed background indexer
- **Ollama (Qwen3/Llama)** — primary inference, runs locally (free)
- **Claude Sonnet** — fallback when Ollama confidence < 80%
- **web3.py v6** — on-chain reads and writes to Mantle Sepolia
- **Pyth Hermes** — pull-oracle price update payloads
- **ERC-8004** — agent identity & reputation registry on Mantle
- **JSON indexer** — SQLite-free event store; polls chain every 30s from deployment block

## Project Structure

```
agents/
├── api/
│   ├── app.py              # FastAPI app, CORS, health, status, lifespan indexer start
│   ├── core.py             # Ollama + Claude inference with fallback
│   └── routes/
│       ├── chat.py         # POST /api/agents/chat
│       ├── tokenize.py     # POST /tokenize, /compliance
│       ├── yield_routes.py # GET  /yield, /yield/market-analysis
│       ├── portfolio.py    # POST /portfolio/plan, /rebalance
│       │                   # GET  /portfolio/{user_address}
│       ├── vault.py        # GET/POST /vault/status, /consent, /relay-allowance, /execute
│       └── stats.py        # GET  /stats, /stats/actions, /stats/assets
├── mantle/
│   ├── client.py           # Web3 connection, reads deployments.json
│   ├── contracts.py        # Contract ABIs + handles
│   ├── db.py               # JSON file event store (no native deps)
│   ├── executor.py         # On-chain write helpers (signs with AGENT_PRIVATE_KEY)
│   ├── indexer.py          # Background thread: polls Mantle Sepolia, fills db.py
│   ├── pyth.py             # Pyth Hermes price update fetcher
│   └── reputation.py       # Reads live scores from AgentReputationManager
├── skills/
│   ├── nexus.md            # Nexus system prompt + output schema
│   ├── shield.md           # Shield system prompt + output schema
│   ├── yield.md            # Yield system prompt + output schema
│   └── atlas.md            # Atlas system prompt + output schema
├── rwai_index.json         # Auto-generated event index (gitignored)
├── requirements.txt
└── .env.example
```

## Setup

### 1. Install dependencies

```bash
# From project root (rwai/)
python3 -m venv .venv
.venv/bin/pip install -r agents/requirements.txt
```

### 2. Configure environment

```bash
cp agents/.env.example agents/.env
```

Edit `agents/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...          # Claude fallback
OLLAMA_BASE_URL=http://localhost:11434 # Ollama local
OLLAMA_MODEL=qwen3:8b
CONFIDENCE_THRESHOLD=0.80

MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
MANTLE_CHAIN_ID=5003
RWAI_DEPLOYMENTS_FILE=../contracts/deployments.json
AGENT_PRIVATE_KEY=<deployer_wallet_private_key>

FRONTEND_URLS=http://localhost:3000,https://your-production-app.vercel.app
AUTONOMOUS_EXECUTION_ENABLED=false
```

### 3. (Optional) Run Ollama locally

```bash
ollama serve
ollama pull qwen3:8b
```

### 4. Run the backend

```bash
# From the project root (rwai/)
.venv/bin/python3 -m uvicorn agents.api.app:app --host 0.0.0.0 --port 8001 --reload

# Or use make (starts backend + frontend together)
make dev
```

> **Note:** On WSL2 with the project on a Windows filesystem (`/mnt/c/...`), first startup takes ~10–12 seconds while Python imports web3. Subsequent hot-reloads are faster. The app auto-loads `agents/.env` at startup.

> **Note:** `RWAI_DEPLOYMENTS_FILE` defaults to `contracts/deployments.json`. No extra config needed after `make deploy`.

## API Endpoints

### Health & Status

```
GET  /health
     → Mantle connection status, current block, all contract addresses, agent ERC-8004 IDs

GET  /api/agents/status
     → Live reputation scores for all 4 agents (reads AgentReputationManager.sol)
     → Returns: { nexus: { reputation, localScore, autonomyLevel, actionCount, erc8004_id }, ... }
```

### On-Chain Stats (Indexer)

```
GET  /api/agents/stats
     → Aggregate stats: assetCount, agentRuns, agentRuns24h, avgCompliance, tvlWei
     → assetCountChain / actionCountChain: real-time reads from RWAiRegistry + AgentExecutor

GET  /api/agents/stats/actions?limit=20
     → Recent agent actions indexed from AgentExecutor.AgentActionExecuted events

GET  /api/agents/stats/assets?limit=50
     → Registered assets indexed from RWAiRegistry.AssetRegistered events
```

### Chat

```
POST /api/agents/chat
Body: { "agent_id": "atlas", "messages": [{ "role": "user", "body": "..." }] }
```

### Tokenization (Nexus + Shield)

```
POST /api/agents/tokenize
Body: { "document_text": "...", "asset_type": "real_estate", "token_address": "0x..." }
→ Logs tokenization to AgentExecutor.logTokenization() on Mantle

POST /api/agents/compliance
Body: { "asset_id": 1, "document_text": "...", "jurisdiction": "US" }
→ Logs compliance score to AgentExecutor.logComplianceReview() on Mantle
```

### Yield (Yield Agent)

```
GET  /api/agents/yield?assets=USDY,mETH,MI4
→ AI-generated APY snapshot, writes to YieldOracle.sol + AgentExecutor.sol

GET  /api/agents/yield/prices?assets=USDY,mETH,fBTC
→ Pyth price updates from Hermes, writes prices to YieldOracle.sol

GET  /api/agents/yield/market-analysis
→ Full market snapshot → YieldOracle.createMarketSnapshot()
```

### Portfolio (Atlas)

```
POST /api/agents/portfolio/plan
Body: { "goal": "income", "horizon": "medium", "risk_answer": "hold",
        "amount": 10000, "user_address": "0x..." }
→ Returns allocation strategy, writes AgentExecutor.executeAllocation() if user_address given

POST /api/agents/portfolio/rebalance
Body: { "user_address": "0x...", "from_assets": ["mETH"],
        "to_assets": ["USDY"], "amounts_usd": [1000] }

GET  /api/agents/portfolio/{user_address}
→ Reads portfolio from PortfolioVault.sol on Mantle
```

### HybridVault Autonomy (Atlas)

```
GET  /api/agents/vault/status/{user_address}?token=0x...
     → Agent allowance, balance, daily spend for a user+token pair

POST /api/agents/vault/consent
Body: { "user_address": "0x...", "token": "0x...", "amount_wei": "...", "expiry": 1770000000 }
→ Returns EIP-712 AgentConsent payload for the user to sign in their wallet

POST /api/agents/vault/relay-allowance
Body: { "user_address": "0x...", "token": "0x...", "amount_wei": "...",
        "expiry": 1770000000, "nonce": 0, "signature": "0x..." }
→ Relays signed allowance to HybridVault.setAgentAllowanceBySig()

POST /api/agents/vault/execute
→ Agent execution through HybridVault; requires AUTONOMOUS_EXECUTION_ENABLED=true
```

## AI Confidence & Fallback

1. Ollama is called first (free, local)
2. If response length < 80 chars → confidence = 0.65
3. If confidence < 0.80 threshold → fall back to Claude Sonnet
4. If both fail → return `"Agent temporarily unavailable."`

## On-Chain Event Indexer

At startup, the backend launches a background thread (`mantle/indexer.py`) that:

- Reads the deployment block from `contracts/deployments.json` (`deployedAtBlock: 38500000`)
- Polls Mantle Sepolia every **30 seconds** in chunks of **500 blocks**
- Indexes events from 4 contracts into a local JSON store (`rwai_index.json`)
- Waits 2-block confirmation before indexing (reorg safety)

Events indexed:

| Contract | Event | Stored as |
|----------|-------|-----------|
| RWAiRegistry | AssetRegistered | `assets` |
| RWAiRegistry | ComplianceUpdated | updates `assets.compliance_score` |
| RWAiRegistry | AssetDeactivated | sets `assets.active = false` |
| AgentExecutor | AgentActionExecuted | `agent_actions` |
| PortfolioVault | AllocationExecuted | `tvl_snapshots` |
| YieldOracle | YieldUpdated | `yield_snapshots` |

`/api/agents/stats` merges indexed history with real-time chain reads for the most up-to-date counts.

## On-Chain Writes

Every agent action is written to Mantle Sepolia:

- `YieldOracle.updateYields()` — live APY data
- `YieldOracle.updatePrice()` — Pyth USD price data
- `YieldOracle.createMarketSnapshot()` — full market snapshot
- `AgentExecutor.logTokenization()` — Nexus tokenization log
- `AgentExecutor.logComplianceReview()` — Shield compliance log
- `AgentExecutor.recordYieldSnapshot()` — Yield snapshot with AI reasoning
- `AgentExecutor.executeAllocation()` — Atlas portfolio allocation
- `AgentExecutor.executeRebalance()` — Atlas portfolio rebalance

All operations gracefully no-op when contracts are not yet deployed (zero addresses).
