"""
Contract ABIs and handles for RWAi contracts on Mantle.
All signatures match the production contracts (AgentExecutor v2 with agentId as first param).
"""
from .client import get_w3, get_addresses

ZERO_ADDR = "0x" + "0" * 40

# ── ABIs ──────────────────────────────────────────────────────────

YIELD_ORACLE_ABI = [
    {
        "inputs": [{"name": "asset", "type": "address"}],
        "name": "getLatestYield",
        "outputs": [
            {"name": "apyBps",    "type": "uint256"},
            {"name": "timestamp", "type": "uint256"},
            {"name": "agentNote", "type": "string"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "asset", "type": "address"}],
        "name": "getCurrentYield",
        "outputs": [
            {"name": "apyBps",    "type": "uint256"},
            {"name": "timestamp", "type": "uint256"},
            {"name": "agentNote", "type": "string"},
            {"name": "isActive",  "type": "bool"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "asset", "type": "address"}],
        "name": "getCurrentPrice",
        "outputs": [
            {"name": "priceE18",      "type": "uint256"},
            {"name": "confidenceE18", "type": "uint256"},
            {"name": "exponent",      "type": "int32"},
            {"name": "publishTime",   "type": "uint256"},
            {"name": "timestamp",     "type": "uint256"},
            {"name": "agentNote",     "type": "string"},
            {"name": "isActive",      "type": "bool"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "asset", "type": "address"}],
        "name": "pythPriceFeedIds",
        "outputs": [{"name": "", "type": "bytes32"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getTrackedAssets",
        "outputs": [{"name": "", "type": "address[]"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getLatestSnapshot",
        "outputs": [
            {
                "components": [
                    {"name": "snapshotId",    "type": "uint256"},
                    {"name": "assets",        "type": "address[]"},
                    {"name": "apys",          "type": "uint256[]"},
                    {"name": "marketSummary", "type": "string"},
                    {"name": "timestamp",     "type": "uint256"},
                    {"name": "blockNumber",   "type": "uint256"},
                ],
                "name": "",
                "type": "tuple",
            }
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "priceUpdate", "type": "bytes[]"}],
        "name": "getPythUpdateFee",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "assets",    "type": "address[]"},
            {"name": "apysBps",   "type": "uint256[]"},
            {"name": "agentNote", "type": "string"},
        ],
        "name": "updateYields",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "assets",        "type": "address[]"},
            {"name": "apys",          "type": "uint256[]"},
            {"name": "marketSummary", "type": "string"},
        ],
        "name": "createMarketSnapshot",
        "outputs": [{"name": "snapshotId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "asset",       "type": "address"},
            {"name": "priceUpdate", "type": "bytes[]"},
            {"name": "agentNote",   "type": "string"},
        ],
        "name": "updatePrice",
        "outputs": [
            {"name": "priceE18",      "type": "uint256"},
            {"name": "confidenceE18", "type": "uint256"},
            {"name": "publishTime",   "type": "uint256"},
        ],
        "stateMutability": "payable",
        "type": "function",
    },
]

AGENT_EXECUTOR_ABI = [
    {
        "inputs": [],
        "name": "actionCount",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "", "type": "uint256"}],
        "name": "actionLog",
        "outputs": [
            {"name": "agentId",      "type": "uint256"},
            {"name": "agentName",    "type": "string"},
            {"name": "actionType",   "type": "string"},
            {"name": "aiReasoning",  "type": "string"},
            {"name": "actionData",   "type": "bytes"},
            {"name": "triggeredBy",  "type": "address"},
            {"name": "timestamp",    "type": "uint256"},
            {"name": "blockNumber",  "type": "uint256"},
            {"name": "success",      "type": "bool"},
            {"name": "errorMessage", "type": "string"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    # ── Nexus ──
    {
        "inputs": [
            {"name": "agentId",      "type": "uint256"},
            {"name": "assetId",      "type": "uint256"},
            {"name": "tokenAddress", "type": "address"},
            {"name": "aiReasoning",  "type": "string"},
        ],
        "name": "logTokenization",
        "outputs": [{"name": "actionId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    # ── Shield ──
    {
        "inputs": [
            {"name": "agentId",     "type": "uint256"},
            {"name": "assetId",     "type": "uint256"},
            {"name": "score",       "type": "uint256"},
            {"name": "aiReasoning", "type": "string"},
        ],
        "name": "logComplianceReview",
        "outputs": [{"name": "actionId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    # ── Yield ──
    {
        "inputs": [
            {"name": "agentId",        "type": "uint256"},
            {"name": "assetAddresses", "type": "address[]"},
            {"name": "apysBps",        "type": "uint256[]"},
            {"name": "agentSummary",   "type": "string"},
        ],
        "name": "recordYieldSnapshot",
        "outputs": [{"name": "actionId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    # ── Atlas ──
    {
        "inputs": [
            {"name": "agentId",     "type": "uint256"},
            {"name": "user",        "type": "address"},
            {"name": "assets",      "type": "address[]"},
            {"name": "amounts",     "type": "uint256[]"},
            {"name": "aiReasoning", "type": "string"},
        ],
        "name": "executeAllocation",
        "outputs": [{"name": "actionId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "agentId",     "type": "uint256"},
            {"name": "user",        "type": "address"},
            {"name": "fromAssets",  "type": "address[]"},
            {"name": "toAssets",    "type": "address[]"},
            {"name": "amounts",     "type": "uint256[]"},
            {"name": "aiReasoning", "type": "string"},
        ],
        "name": "executeRebalance",
        "outputs": [{"name": "actionId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

AGENT_REPUTATION_ABI = [
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "localScore",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "actionCount",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "getAutonomyLevel",
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function",
    },
]

PORTFOLIO_VAULT_ABI = [
    {
        "inputs": [{"name": "user", "type": "address"}],
        "name": "hasPortfolio",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "user", "type": "address"}],
        "name": "getPortfolio",
        "outputs": [
            {
                "components": [
                    {"name": "assets",         "type": "address[]"},
                    {"name": "allocations",    "type": "uint256[]"},
                    {"name": "riskScore",      "type": "uint256"},
                    {"name": "strategyType",   "type": "string"},
                    {"name": "createdAt",      "type": "uint256"},
                    {"name": "lastRebalanced", "type": "uint256"},
                    {"name": "atlasReasoning", "type": "string"},
                ],
                "name": "",
                "type": "tuple",
            }
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getSupportedAssets",
        "outputs": [{"name": "", "type": "address[]"}],
        "stateMutability": "view",
        "type": "function",
    },
]

# ── Contract handles ──────────────────────────────────────────────

def _contract(name: str, abi: list):
    w3 = get_w3()
    if not w3:
        return None
    addr = get_addresses().get(name, ZERO_ADDR)
    if addr == ZERO_ADDR:
        return None
    return w3.eth.contract(address=addr, abi=abi)


def get_yield_oracle():
    return _contract("YieldOracle", YIELD_ORACLE_ABI)

def get_agent_executor():
    return _contract("AgentExecutor", AGENT_EXECUTOR_ABI)


# ── HybridVault ABI (minimal) ─────────────────────────────────────
HYBRID_VAULT_ABI = [
    {
        "inputs": [
            {"name": "user", "type": "address"},
            {"name": "token", "type": "address"},
        ],
        "name": "balances",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "user", "type": "address"},
            {"name": "agent", "type": "address"},
            {"name": "token", "type": "address"},
        ],
        "name": "allowances",
        "outputs": [
            {"name": "amount", "type": "uint256"},
            {"name": "expiry", "type": "uint256"},
            {"name": "dailySpent", "type": "uint256"},
            {"name": "dailyWindowStart", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "user", "type": "address"}],
        "name": "nonces",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "agent", "type": "address"}],
        "name": "approvedAgents",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "perTxCap",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "perAgentDailyCap",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "perUserPercentCapBps",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "user", "type": "address"},
            {"name": "agent", "type": "address"},
            {"name": "token", "type": "address"},
            {"name": "amount", "type": "uint256"},
            {"name": "expiry", "type": "uint256"},
            {"name": "nonce", "type": "uint256"},
            {"name": "signature", "type": "bytes"},
        ],
        "name": "setAgentAllowanceBySig",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "user", "type": "address"},
            {"name": "token", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"},
            {"name": "data", "type": "bytes"},
        ],
        "name": "executeOnBehalf",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "DOMAIN_SEPARATOR",
        "outputs": [{"name": "", "type": "bytes32"}],
        "stateMutability": "view",
        "type": "function",
    },
]


def get_hybrid_vault():
    return _contract("HybridVault", HYBRID_VAULT_ABI)

def get_agent_reputation():
    return _contract("AgentReputationManager", AGENT_REPUTATION_ABI)

def get_portfolio_vault():
    return _contract("PortfolioVault", PORTFOLIO_VAULT_ABI)
