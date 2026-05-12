"""
JSON file-based event store for RWAi on-chain indexer.
Replaces SQLite to avoid native _sqlite3 C extension dependency.
"""
import json
import threading
import time
import os
from pathlib import Path
from typing import Any

DB_PATH = Path(os.getenv("RWAI_DB_PATH", str(Path(__file__).parent.parent / "rwai_index.json")))

_lock = threading.Lock()


def _load() -> dict:
    if DB_PATH.exists():
        try:
            with open(DB_PATH, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "last_block": 0,
        "assets": {},           # asset_id -> asset dict
        "agent_actions": {},    # action_id -> action dict
        "tvl_snapshots": [],
        "yield_snapshots": [],
    }


def _save(data: dict) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = DB_PATH.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f)
    tmp.replace(DB_PATH)


def init_db() -> None:
    with _lock:
        data = _load()
        _save(data)


def get_last_indexed_block(default: int = 0) -> int:
    with _lock:
        return _load().get("last_block", default)


def set_last_indexed_block(block: int) -> None:
    with _lock:
        data = _load()
        data["last_block"] = block
        _save(data)


def upsert_asset(asset_id, token_address, owner, asset_type, block_number, tx_hash, ts):
    with _lock:
        data = _load()
        key = str(asset_id)
        if key not in data["assets"]:
            data["assets"][key] = {
                "asset_id":        asset_id,
                "token_address":   token_address,
                "owner":           owner,
                "asset_type":      asset_type,
                "compliance_score": 0,
                "active":          True,
                "block_number":    block_number,
                "tx_hash":         tx_hash,
                "ts":              ts,
            }
            _save(data)


def update_compliance(asset_id, score):
    with _lock:
        data = _load()
        key = str(asset_id)
        if key in data["assets"]:
            data["assets"][key]["compliance_score"] = score
            _save(data)


def deactivate_asset(asset_id):
    with _lock:
        data = _load()
        key = str(asset_id)
        if key in data["assets"]:
            data["assets"][key]["active"] = False
            _save(data)


def insert_agent_action(action_id, agent_id, agent_name, action_type, success, block_number, tx_hash, ts):
    with _lock:
        data = _load()
        key = str(action_id)
        if key not in data["agent_actions"]:
            data["agent_actions"][key] = {
                "action_id":   action_id,
                "agent_id":    agent_id,
                "agent_name":  agent_name,
                "action_type": action_type,
                "success":     bool(success),
                "block_number": block_number,
                "tx_hash":     tx_hash,
                "ts":          ts,
            }
            _save(data)


def insert_tvl_snapshot(user_address, total_value, block_number, ts):
    with _lock:
        data = _load()
        data["tvl_snapshots"].append({
            "user_address": user_address,
            "total_value":  str(total_value),
            "block_number": block_number,
            "ts":           ts,
        })
        if len(data["tvl_snapshots"]) > 1000:
            data["tvl_snapshots"] = data["tvl_snapshots"][-1000:]
        _save(data)


def insert_yield_snapshot(asset, apy_bps, block_number, ts):
    with _lock:
        data = _load()
        data["yield_snapshots"].append({
            "asset":        asset,
            "apy_bps":      apy_bps,
            "block_number": block_number,
            "ts":           ts,
        })
        if len(data["yield_snapshots"]) > 1000:
            data["yield_snapshots"] = data["yield_snapshots"][-1000:]
        _save(data)


def get_stats() -> dict:
    with _lock:
        data = _load()

    assets  = list(data["assets"].values())
    actions = list(data["agent_actions"].values())

    active_assets     = [a for a in assets if a.get("active", True)]
    successful_runs   = [a for a in actions if a.get("success", False)]
    cutoff_24h        = int(time.time()) - 86400
    runs_24h          = [a for a in successful_runs if a.get("ts", 0) > cutoff_24h]

    tvl_wei = sum(int(s.get("total_value", 0)) for s in data["tvl_snapshots"])

    compliant = [a["compliance_score"] for a in active_assets if a.get("compliance_score", 0) > 0]
    avg_compliance = round(sum(compliant) / len(compliant), 1) if compliant else 0

    return {
        "assetCount":       len(active_assets),
        "agentRuns":        len(successful_runs),
        "agentRuns24h":     len(runs_24h),
        "tvlWei":           str(tvl_wei),
        "avgCompliance":    avg_compliance,
        "lastIndexedBlock": data.get("last_block", 0),
    }


def get_recent_actions(limit: int = 20) -> list:
    with _lock:
        data = _load()
    actions = sorted(data["agent_actions"].values(), key=lambda a: a.get("ts", 0), reverse=True)
    return actions[:limit]


def get_assets(limit: int = 50) -> list:
    with _lock:
        data = _load()
    assets = sorted(data["assets"].values(), key=lambda a: a.get("asset_id", 0), reverse=True)
    return assets[:limit]
