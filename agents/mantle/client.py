"""
Mantle chain client — Web3 connection + contract handles.
Reads deployed addresses from contracts/deployments.json (after npm run deploy:testnet).
"""
import os, json
from pathlib import Path
from typing import Optional

try:
    from web3 import Web3
    try:
        from web3.middleware import ExtraDataToPOAMiddleware as _POAMiddleware
    except ImportError:
        from web3.middleware import geth_poa_middleware as _POAMiddleware  # web3 v6
    WEB3_AVAILABLE = True
except ImportError:
    WEB3_AVAILABLE = False
    _POAMiddleware = None

# ── RPC ─────────────────────────────────────────────────────────
def _rpc_url() -> str:
    return os.getenv("MANTLE_RPC_URL", "https://rpc.sepolia.mantle.xyz")

def _chain_id() -> int:
    return int(os.getenv("MANTLE_CHAIN_ID", "5003"))

# ── ERC-8004 (official Mantle Testnet) ──────────────────────────
ERC8004_IDENTITY   = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
ERC8004_REPUTATION = "0x8004B663056A597Dffe9eCcC1965A193B7388713"

def _load_deployments() -> dict:
    root = Path(__file__).parent.parent.parent
    candidates = []
    if os.getenv("RWAI_DEPLOYMENTS_FILE"):
        candidates.append(Path(os.environ["RWAI_DEPLOYMENTS_FILE"]))
    candidates.extend([
        root / "contracts" / "deployments.json",
        root / "agents" / "deployments.json",
    ])

    for path in candidates:
        if path.exists():
            return json.loads(path.read_text())
    return {}

def get_w3() -> Optional["Web3"]:
    if not WEB3_AVAILABLE:
        return None
    w3 = Web3(Web3.HTTPProvider(_rpc_url(), request_kwargs={"timeout": 10}))
    if _POAMiddleware is not None:
        w3.middleware_onion.inject(_POAMiddleware, layer=0)
    return w3 if w3.is_connected() else None

def get_addresses() -> dict:
    defaults = {
        "ComplianceLog":          "0x0000000000000000000000000000000000000000",
        "YieldOracle":            "0x0000000000000000000000000000000000000000",
        "RWAiRegistry":           "0x0000000000000000000000000000000000000000",
        "AgentReputationManager": "0x0000000000000000000000000000000000000000",
        "AgentExecutor":          "0x0000000000000000000000000000000000000000",
        "PortfolioVault":         "0x0000000000000000000000000000000000000000",
        "HybridVault":            "0x0000000000000000000000000000000000000000",
        "AssetToken":             "0x0000000000000000000000000000000000000000",
    }
    deps = _load_deployments()
    return {**defaults, **deps.get("contracts", {})}

def get_agent_ids() -> dict:
    deps = _load_deployments()
    erc8004 = deps.get("erc8004", {})
    return erc8004.get("agentIds", {"nexus": 0, "shield": 0, "yield": 0, "atlas": 0})

def is_connected() -> bool:
    w3 = get_w3()
    return w3 is not None and w3.is_connected()

def get_block_number() -> Optional[int]:
    w3 = get_w3()
    if w3:
        return w3.eth.block_number
    return None
