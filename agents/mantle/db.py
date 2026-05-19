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

_DEFAULT_DB = "/data/rwai_index.json" if os.path.isdir("/data") else str(Path(__file__).parent.parent / "rwai_index.json")
DB_PATH = Path(os.getenv("RWAI_DB_PATH", _DEFAULT_DB))

_lock = threading.Lock()


def _load() -> dict:
    if DB_PATH.exists():
        try:
            with open(DB_PATH, "r") as f:
                data = json.load(f)
                if "user_tokenizations" not in data:
                    data["user_tokenizations"] = []
                return data
        except Exception:
            pass
    return {
        "last_block": 0,
        "assets": {},           # asset_id -> asset dict (from chain indexer)
        "agent_actions": {},    # action_id -> action dict
        "user_tokenizations": [],  # user-initiated tokenizations (off-chain metadata)
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


def upsert_asset(asset_id, token_address, owner, asset_type, block_number, tx_hash, ts,
                 token_name=None, token_symbol=None, apy_bps=0, value_usd=0):
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
                "token_name":      token_name or "",
                "token_symbol":    token_symbol or "",
                "apy_bps":         int(apy_bps or 0),
                "value_usd":       float(value_usd or 0),
            }
            _save(data)
        else:
            # Update meta fields if provided and not already set
            changed = False
            entry = data["assets"][key]
            if token_name and not entry.get("token_name"):
                entry["token_name"] = token_name; changed = True
            if token_symbol and not entry.get("token_symbol"):
                entry["token_symbol"] = token_symbol; changed = True
            if apy_bps and not entry.get("apy_bps"):
                entry["apy_bps"] = int(apy_bps); changed = True
            if value_usd and not entry.get("value_usd"):
                entry["value_usd"] = float(value_usd); changed = True
            if changed:
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


def record_user_tokenization(owner: str, token_address: str, asset_type: str, tx_hash: str,
                              token_name: str = "", token_symbol: str = "",
                              apy_bps: int = 0, value_usd: float = 0,
                              compliance_score: int = 0,
                              price_usd: float = 0, supply: int = 0) -> None:
    with _lock:
        data = _load()
        entry = {
            "asset_id":        None,
            "token_address":   token_address,
            "owner":           owner,
            "asset_type":      asset_type,
            "compliance_score": int(compliance_score or 0),
            "active":          True,
            "block_number":    0,
            "tx_hash":         tx_hash,
            "ts":              int(time.time()),
            "token_name":      token_name,
            "token_symbol":    token_symbol,
            "apy_bps":         int(apy_bps or 0),
            "value_usd":       float(value_usd or 0),
            "price_usd":       float(price_usd or 0),
            "supply":          int(supply or 0),
            "_source":         "user",
        }
        # Upsert by symbol+owner — prevent duplicate cards for same asset
        existing = data["user_tokenizations"]
        dedup_key = (token_symbol.upper(), owner.lower()) if token_symbol else None
        if dedup_key:
            for i, rec in enumerate(existing):
                if (rec.get("token_symbol","").upper(), rec.get("owner","").lower()) == dedup_key:
                    entry["ts"] = rec.get("ts", entry["ts"])  # preserve original listing date
                    existing[i] = entry
                    _save(data)
                    return
        existing.append(entry)
        _save(data)


def get_listings(limit: int = 100) -> list:
    """Return all user-tokenized assets as market listings."""
    with _lock:
        data = _load()
    listings = sorted(data.get("user_tokenizations", []), key=lambda a: a.get("ts", 0), reverse=True)
    return listings[:limit]


def get_assets(limit: int = 50, owner: str = None) -> list:
    with _lock:
        data = _load()
    chain_assets = list(data["assets"].values())
    user_assets  = list(data.get("user_tokenizations", []))
    if owner:
        owner_lc = owner.lower()
        chain_assets = [a for a in chain_assets if (a.get("owner") or "").lower() == owner_lc]
        user_assets  = [a for a in user_assets  if (a.get("owner") or "").lower() == owner_lc]
    all_assets = sorted(chain_assets + user_assets, key=lambda a: a.get("ts", 0), reverse=True)
    return all_assets[:limit]
