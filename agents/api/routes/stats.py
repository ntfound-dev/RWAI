"""
GET /api/agents/stats  — on-chain indexed stats
GET /api/agents/stats/actions — recent agent actions
GET /api/agents/stats/assets  — registered assets
"""
from fastapi import APIRouter, Query
from ...mantle.db import get_stats, get_recent_actions, get_assets
from ...mantle.client import get_w3, get_addresses
from ...mantle.executor import get_agent_wallet_address

router = APIRouter()


def _mnt_price() -> float:
    """Fetch MNT/USD price from Pyth Hermes (off-chain pull oracle)."""
    try:
        from ...mantle.pyth import fetch_price_updates
        _, parsed = fetch_price_updates(["MNT"])
        if parsed:
            p = parsed[0]["price"]
            return round(float(p["price"]) * (10 ** p["expo"]), 6)
    except Exception:
        pass
    return 0.0


def _chain_stats() -> dict:
    """Real-time reads from chain (fast — just 2 calls)."""
    addrs = get_addresses()
    w3 = get_w3()
    if not w3:
        return {}

    from web3 import Web3

    registry_abi  = [{"inputs":[],"name":"assetCount","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}]
    executor_abi  = [{"inputs":[],"name":"actionCount","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}]
    treasury_abi  = [{"inputs":[],"name":"totalCollected","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}]

    try:
        registry = w3.eth.contract(address=Web3.to_checksum_address(addrs["RWAiRegistry"]),  abi=registry_abi)
        executor = w3.eth.contract(address=Web3.to_checksum_address(addrs["AgentExecutor"]), abi=executor_abi)
        result = {
            "assetCountChain":  registry.functions.assetCount().call(),
            "actionCountChain": executor.functions.actionCount().call(),
            "protocolRevenueUsd": 0.0,
        }
        if "ProtocolTreasury" in addrs:
            treasury = w3.eth.contract(address=Web3.to_checksum_address(addrs["ProtocolTreasury"]), abi=treasury_abi)
            total_wei = treasury.functions.totalCollected().call()
            # 1 RWAI = 1 USD for demo denomination
            result["protocolRevenueUsd"] = round(total_wei / 1e18, 2)
        # Agent wallet native MNT balance (pays gas for all users)
        try:
            agent_addr = get_agent_wallet_address()
            if agent_addr:
                mnt_wei = w3.eth.get_balance(Web3.to_checksum_address(agent_addr))
                result["agentMntBalance"] = round(mnt_wei / 1e18, 4)
        except Exception:
            result["agentMntBalance"] = 0.0
        # MNT/USD price from Pyth Hermes
        result["mntPriceUsd"] = _mnt_price()
        return result
    except Exception:
        return {}


@router.get("/stats")
def stats():
    """
    Combined stats: indexed DB (history + TVL) + real-time chain counters.
    Indexed data updates every 30s; chain counters are always fresh.
    """
    db   = get_stats()
    live = _chain_stats()
    return {
        **db,
        **live,
        # Use chain counter as authoritative asset/action count
        "assetCount":        live.get("assetCountChain",    db.get("assetCount", 0)),
        "agentRuns":         live.get("actionCountChain",   db.get("agentRuns",  0)),
        "protocolRevenueUsd": live.get("protocolRevenueUsd", 0.0),
        "agentMntBalance":    live.get("agentMntBalance",    0.0),
        "mntPriceUsd":        live.get("mntPriceUsd",        0.0),
    }


@router.get("/stats/actions")
def recent_actions(limit: int = Query(default=20, le=100), agent: str = Query(default=None)):
    actions = get_recent_actions(limit * 4 if agent else limit)
    if agent:
        actions = [a for a in actions if a.get("agent_name", "").lower() == agent.lower()][:limit]
    return {"actions": actions}


@router.get("/stats/assets")
def asset_list(limit: int = Query(default=50, le=200), owner: str = Query(default=None)):
    return {"assets": get_assets(limit, owner=owner)}
