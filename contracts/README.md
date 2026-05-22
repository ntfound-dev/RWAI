# RWAi Smart Contracts

11 production-grade Solidity contracts deployed on **Mantle Sepolia Testnet** (chainId 5003). All AI agent actions are logged permanently on-chain with full reasoning transparency. Protocol revenue is live — `ProtocolTreasury` collecting fees on every tokenization and market trade.

## Deployed Contracts — Mantle Sepolia (chainId 5003)

Deployed: 2026-05-12 · Deployer: `0x834De729cb9dF77451DBc6bf7FD05F475B011Ac7`

| Contract | Address | Explorer |
|----------|---------|----------|
| **ComplianceLog** | `0xCc6296557c05ca02f3258DEd19f4104a9C19a80B` | [view](https://sepolia.mantlescan.xyz/address/0xCc6296557c05ca02f3258DEd19f4104a9C19a80B) |
| **YieldOracle** | `0x1288dF9F55673cBFc97BCe7aD5445D77B9029B92` | [view](https://sepolia.mantlescan.xyz/address/0x1288dF9F55673cBFc97BCe7aD5445D77B9029B92) |
| **RWAiRegistry** | `0xeE7a50936a25a375143b75b7Ca743B9513368680` | [view](https://sepolia.mantlescan.xyz/address/0xeE7a50936a25a375143b75b7Ca743B9513368680) |
| **AgentReputationManager** | `0xfFE21EC80012D3Bf00F5eE20a400C94455F32D32` | [view](https://sepolia.mantlescan.xyz/address/0xfFE21EC80012D3Bf00F5eE20a400C94455F32D32) |
| **AgentExecutor** | `0x9a822B9A50D090CfcCa1e6474efCd653112d8501` | [view](https://sepolia.mantlescan.xyz/address/0x9a822B9A50D090CfcCa1e6474efCd653112d8501) |
| **PortfolioVault** | `0xf7C43D8fe74712130C0a05D1F58A33515E2C63E4` | [view](https://sepolia.mantlescan.xyz/address/0xf7C43D8fe74712130C0a05D1F58A33515E2C63E4) |
| **HybridVault** | `0x8e9c0ebC81F3db508BFff45f3eE9a10115b604fe` | [view](https://sepolia.mantlescan.xyz/address/0x8e9c0ebC81F3db508BFff45f3eE9a10115b604fe) |
| **AssetToken** (MANHATTAN-001) | `0x80E0e5f6488FA2726c042a204344281974f72609` | [view](https://sepolia.mantlescan.xyz/address/0x80E0e5f6488FA2726c042a204344281974f72609) |
| **RWAiToken** | `0xa947B1e71E91078c12cf4bAde3A771892772d659` | [view](https://sepolia.mantlescan.xyz/address/0xa947B1e71E91078c12cf4bAde3A771892772d659) |
| **ProtocolTreasury** | `0x9c3CD9CEef24F07520bD0f86BE5cF87F1Ff9d679` | [view](https://sepolia.mantlescan.xyz/address/0x9c3CD9CEef24F07520bD0f86BE5cF87F1Ff9d679) |
| **RWAiVesting** | *(deployed via deploy script)* | — |

All contracts verified on Mantlescan.

## Contracts

| Contract | Role |
|----------|------|
| **ComplianceLog** | Wallet KYC/AML records, sanctions list, asset compliance reports |
| **YieldOracle** | Live APY data, Pyth USD prices, market snapshots with AI summaries |
| **RWAiRegistry** | Registry of all tokenized real-world assets |
| **AgentReputationManager** | Local reputation scores (0–100) + ERC-8004 mirror |
| **AgentExecutor** | Immutable log of every AI agent action + portfolio execution |
| **PortfolioVault** | Strategy layer (bps allocations) + execution layer (real amounts) |
| **HybridVault** | User deposits, capped agent allowance, EIP-712 relayer consent |
| **AssetToken** | ERC-20 representing a tokenized real-world asset |
| **RWAiToken** | Protocol governance + staking token; receives 70% of all fee revenue |
| **ProtocolTreasury** | Collects 0.5% tokenization fee + 0.15% market fee; splits 70/30 to stakers/DAO |
| **RWAiVesting** | Linear vesting schedules for team and investor RWAI token allocations |

## Architecture

```
User / Frontend
     │
     ▼
AgentExecutor ←── AI Backend (FastAPI)
     │ logs every action on-chain
     ├── logTokenization()         ← Nexus
     ├── logComplianceReview()     ← Shield
     ├── recordYieldSnapshot()     ← Yield
     ├── executeAllocation()       ← Atlas
     └── executeRebalance()        ← Atlas
          │
          ├── AgentReputationManager  (autonomy gating)
          ├── PortfolioVault          (strategy + execution)
          ├── HybridVault             (user-capped autonomous agent funds)
          ├── YieldOracle             (APY data + Pyth prices)
          ├── ComplianceLog           (KYC/AML)
          └── RWAiRegistry            (asset registry)

ERC-8004 (official Mantle Testnet)
  Identity:   0x8004A818BFB912233c491871b3d84c89A494BD9e
  Reputation: 0x8004B663056A597Dffe9eCcC1965A193B7388713

Agent IDs (registered 2026-05-12)
  Nexus:  41
  Shield: 42
  Yield:  43
  Atlas:  44
```

## Autonomy System

Agent actions are gated by reputation level in `AgentReputationManager`:

| Score | Level | Allowed tx value |
|-------|-------|-----------------|
| < 50  | 1 — Restricted | Blocked |
| 50–69 | 2 — Supervised | ≤ 25% of tx limit |
| 70–89 | 3 — Active | ≤ 50% of tx limit |
| ≥ 90  | 4 — Full | ≤ 100% of tx limit |

All agents start at score **75** (Level 3). High-value rebalances (> $10k) are queued for admin approval.

## Project Structure

```
contracts/
├── contracts/
│   ├── AgentExecutor.sol          — on-chain AI action log
│   ├── AgentReputationManager.sol — ERC-8004 reputation gating
│   ├── AssetToken.sol             — ERC-20 fractional RWA token
│   ├── ComplianceLog.sol          — KYC/AML/sanctions registry
│   ├── HybridVault.sol            — user deposits + EIP-712 agent consent
│   ├── PortfolioVault.sol         — strategy bps + execution layer
│   ├── ProtocolTreasury.sol       — fee collection + 70/30 staker/DAO split
│   ├── RWAiRegistry.sol           — tokenized asset registry
│   ├── RWAiToken.sol              — governance + staking token (receives fees)
│   ├── RWAiVesting.sol            — linear vesting for team/investors
│   ├── YieldOracle.sol            — live APY + Pyth price feeds
│   └── mocks/                     — test mock ERC-20s
├── scripts/
│   ├── deploy.ts           # Full 11-contract deploy + wiring
│   └── registerAgents.ts   # ERC-8004 identity registration
├── test/
│   └── RWAi.test.ts        # 46 tests — all passing
├── hardhat.config.ts
├── deployments.json        # Generated after deploy
└── .env                    # PRIVATE_KEY + RPC
```

## Setup

### 1. Install dependencies

```bash
cd contracts
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PRIVATE_KEY=your_deployer_wallet_private_key
ETHERSCAN_API_KEY=your_etherscan_io_api_key   # from etherscan.io/myapikey (needed for verify)
MIN_DEPLOYER_MNT=0.05
```

`ETHERSCAN_API_KEY` is your [Etherscan.io](https://etherscan.io/myapikey) API key — Mantlescan now uses Etherscan V2 infrastructure.

### 3. Compile

```bash
npm run compile
# or: npx hardhat compile
```

### 4. Run tests (46 tests)

```bash
npm test
# or: npx hardhat test
```

## Deployment to Mantle Sepolia

### Prerequisites

- Wallet needs native **MNT** for gas on Mantle Sepolia (chainId 5003)
- Get MNT from: https://faucet.quicknode.com/mantle/sepolia

### Deploy all 8 contracts

```bash
npm run preflight:sepolia
npm run deploy:sepolia
# or: npx hardhat run scripts/deploy.ts --network mantleSepolia
```

This deploys in order:
1. ComplianceLog
2. YieldOracle
3. RWAiRegistry
4. AgentReputationManager
5. AgentExecutor
6. PortfolioVault
7. HybridVault
8. AssetToken (MANHATTAN-001 demo)
9. RWAiToken
10. ProtocolTreasury (wired to RWAiToken for fee distribution)
11. RWAiVesting

Then automatically wires them together and saves addresses to `deployments.json`.

### Verify on Mantlescan

```bash
npm run verify:sepolia
# or: npx hardhat run scripts/verify.ts --network mantleSepolia
```

`hardhat.config.ts` includes Mantle v2 Sepolia/Mainnet custom chains for Mantlescan:

| Network | Chain ID | Explorer |
|---------|----------|----------|
| mantleSepolia | 5003 | https://sepolia.mantlescan.xyz |
| mantle | 5000 | https://mantlescan.xyz |

### Mantle Sepolia Gas

If the faucet only gives MNT on Ethereum Sepolia (L1), bridge it to Mantle Sepolia (L2) with the Mantle Bridge Sepolia mode. You need Sepolia ETH for the L1 bridge transaction, then native MNT on L2 for deploy, verify-related transactions, and Pyth price updates.

### Register ERC-8004 Agent Identities

```bash
npm run register:agents
# or: npx hardhat run scripts/registerAgents.ts --network mantleSepolia
```

Mints ERC-8004 identity tokens for Nexus, Shield, Yield, Atlas. Updates `deployments.json` with agent IDs.

### After deploy

Sync addresses from `deployments.json` into frontend/backend generated config:

```bash
npm run sync:deployment
```

This updates `app/lib/deployment.ts` and `agents/deployments.json`. Keep `AGENT_PRIVATE_KEY` in `agents/.env`; never commit private keys.

## Mock RWA Assets (Testnet)

No official RWA tokens on Mantle Sepolia — deploy script mints mock ERC-20s automatically on testnet.

| Symbol | Address (Sepolia) |
|--------|-------------------|
| USDY (mock) | `0xcE265E23aAc349cEf9Fa3CC058062A44080f2289` |
| mUSD (mock) | `0xDf079DB274fAEFfeD10A4a0E5C12f65e1570Cd35` |
| mETH (mock) | `0xD57f88B64611dBf74f87FC40f2F1010320483584` |
| fBTC (mock) | `0xbED7ad48984fBb3984F5aF83E176fb9f40dB37cc` |

Mainnet addresses (for future mainnet deploy):

| Symbol | Address (Mainnet) |
|--------|-------------------|
| USDY | `0x5bE26527e817998A7206475496fDE1E68957c5A6` |
| mUSD | `0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3` |
| mETH | `0xcDA86A272531e8640cD7F1a92c01839911B90bb0` |
| fBTC | `0xc96de26018a54d51c097160568752c4e3bd6c364` |
| USDT0 | `0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE` |

## Pyth Price Feeds

`YieldOracle` uses Pyth pull updates. The Yield agent fetches price update payloads from Hermes, sends them to `updatePrice()`, pays `getPythUpdateFee()`, then stores the normalized 18-decimal USD price.

| Symbol | Pyth feed |
|--------|-----------|
| USDY/USD | `0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326` |
| METH/USD | `0xfbc9c3a716650b6e24ab22ab85b1c0ef4141b18f4590cc0b986e2f9064cf73d6` |
| BTC/USD for fBTC | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |

## Test Coverage

```
46 passing

ComplianceLog        (7 tests)  — wallet KYC, sanctions, asset compliance
YieldOracle          (7 tests)  — APY updates, Pyth prices, snapshots, throttle
RWAiRegistry         (3 tests)  — register, update compliance, deactivate
PortfolioVault       (5 tests)  — createPortfolio, executeAllocation, deposit
HybridVault          (3 tests)  — deposit, EIP-712 allowance relay, exposure cap
AssetToken           (7 tests)  — mint, blacklist, transfersEnabled, yield
AgentExecutor        (7 tests)  — autonomy gate, high-value queue, wiring
AgentReputationManager (8 tests) — score updates, level transitions, ERC-8004
```

## Security

- `AccessControl` (OpenZeppelin) — role-based permissions (AGENT_ROLE, ADMIN_ROLE, SHIELD_ROLE, ATLAS_ROLE)
- `ReentrancyGuard` — all value-moving functions
- `Pausable` — emergency stop on AgentExecutor, PortfolioVault, and HybridVault
- High-value threshold: rebalances > $10k require admin approval via `approveHighValueAction()`
- Daily limits per agent with automatic midnight reset
