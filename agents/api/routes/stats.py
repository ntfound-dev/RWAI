"""
GET /api/agents/stats  — on-chain indexed stats
GET /api/agents/stats/actions — recent agent actions
GET /api/agents/stats/assets  — registered assets
"""
from fastapi import APIRouter, Query
from ...mantle.db import get_stats, get_recent_actions, get_assets
from ...mantle.client import get_w3, get_addresses

router = APIRouter()


def _chain_stats() -> dict:
    """Real-time reads from chain (fast — just 2 calls)."""
    addrs = get_addresses()
    w3 = get_w3()
    if not w3:
        return {}

    from web3 import Web3

    registry_abi  = [{"inputs":[],"name":"assetCount","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}]
    executor_abi  = [{"inputs":[],"name":"actionCount","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}]

    try:
        registry = w3.eth.contract(address=Web3.to_checksum_address(addrs["RWAiRegistry"]),  abi=registry_abi)
        executor = w3.eth.contract(address=Web3.to_checksum_address(addrs["AgentExecutor"]), abi=executor_abi)
        return {
            "assetCountChain":  registry.functions.assetCount().call(),
            "actionCountChain": executor.functions.actionCount().call(),
        }
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
        "assetCount":  live.get("assetCountChain",  db.get("assetCount", 0)),
        "agentRuns":   live.get("actionCountChain", db.get("agentRuns",  0)),
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
