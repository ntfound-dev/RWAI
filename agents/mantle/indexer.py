"""
RWAi on-chain event indexer.
Polls Mantle Sepolia for new blocks, indexes contract events into SQLite.
Run as background thread from FastAPI startup.
"""
import time
import logging
import threading
from typing import Optional

from .db import (
    init_db, get_last_indexed_block, set_last_indexed_block,
    upsert_asset, update_compliance, deactivate_asset,
    insert_agent_action, insert_tvl_snapshot, insert_yield_snapshot,
)

log = logging.getLogger("rwai.indexer")

POLL_INTERVAL   = 15    # seconds between polls
BLOCK_CHUNK     = 2000  # max blocks per fetch (avoids RPC timeout)
CONFIRMATIONS   = 2     # wait N blocks before indexing (reorg safety)

_indexer_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()


# ── ABIs (minimal — only indexed events) ─────────────────────────

REGISTRY_ABI = [
    {"type":"event","name":"AssetRegistered",
     "inputs":[{"name":"assetId","type":"uint256","indexed":True},
               {"name":"tokenAddress","type":"address","indexed":False},
               {"name":"owner","type":"address","indexed":False},
               {"name":"assetType","type":"string","indexed":False}]},
    {"type":"event","name":"ComplianceUpdated",
     "inputs":[{"name":"assetId","type":"uint256","indexed":True},
               {"name":"score","type":"uint256","indexed":False},
               {"name":"docHash","type":"bytes32","indexed":False}]},
    {"type":"event","name":"AssetDeactivated",
     "inputs":[{"name":"assetId","type":"uint256","indexed":True}]},
]

EXECUTOR_ABI = [
    {"type":"event","name":"AgentActionExecuted",
     "inputs":[{"name":"actionId","type":"uint256","indexed":True},
               {"name":"agentId","type":"uint256","indexed":True},
               {"name":"agentName","type":"string","indexed":False},
               {"name":"actionType","type":"string","indexed":False},
               {"name":"success","type":"bool","indexed":False}]},
]

VAULT_ABI = [
    {"type":"event","name":"AllocationExecuted",
     "inputs":[{"name":"user","type":"address","indexed":True},
               {"name":"allocationId","type":"uint256","indexed":False},
               {"name":"totalValue","type":"uint256","indexed":False}]},
]

YIELD_ABI = [
    {"type":"event","name":"YieldUpdated",
     "inputs":[{"name":"asset","type":"address","indexed":True},
               {"name":"apyBps","type":"uint256","indexed":False},
               {"name":"agentNote","type":"string","indexed":False}]},
]


def _index_range(w3, contracts: dict, from_block: int, to_block: int) -> None:
    registry  = contracts["registry"]
    executor  = contracts["executor"]
    vault     = contracts["vault"]
    yield_oracle = contracts["yield_oracle"]

    # ── RWAiRegistry events ───────────────────────────────────────
    for ev in registry.events.AssetRegistered.get_logs(fromBlock=from_block, toBlock=to_block):
        blk = w3.eth.get_block(ev.blockNumber)
        upsert_asset(
            ev.args.assetId, ev.args.tokenAddress, ev.args.owner,
            ev.args.assetType, ev.blockNumber, ev.transactionHash.hex(), blk.timestamp
        )
        log.info("AssetRegistered #%d", ev.args.assetId)

    for ev in registry.events.ComplianceUpdated.get_logs(fromBlock=from_block, toBlock=to_block):
        update_compliance(ev.args.assetId, ev.args.score)

    for ev in registry.events.AssetDeactivated.get_logs(fromBlock=from_block, toBlock=to_block):
        deactivate_asset(ev.args.assetId)

    # ── AgentExecutor events ──────────────────────────────────────
    for ev in executor.events.AgentActionExecuted.get_logs(fromBlock=from_block, toBlock=to_block):
        blk = w3.eth.get_block(ev.blockNumber)
        insert_agent_action(
            ev.args.actionId, ev.args.agentId, ev.args.agentName,
            ev.args.actionType, int(ev.args.success),
            ev.blockNumber, ev.transactionHash.hex(), blk.timestamp
        )
        log.info("AgentAction #%d %s.%s", ev.args.actionId, ev.args.agentName, ev.args.actionType)

    # ── PortfolioVault events ─────────────────────────────────────
    for ev in vault.events.AllocationExecuted.get_logs(fromBlock=from_block, toBlock=to_block):
        blk = w3.eth.get_block(ev.blockNumber)
        insert_tvl_snapshot(
            ev.args.user, ev.args.totalValue, ev.blockNumber, blk.timestamp
        )

    # ── YieldOracle events ────────────────────────────────────────
    for ev in yield_oracle.events.YieldUpdated.get_logs(fromBlock=from_block, toBlock=to_block):
        blk = w3.eth.get_block(ev.blockNumber)
        insert_yield_snapshot(
            ev.args.asset, ev.args.apyBps, ev.blockNumber, blk.timestamp
        )


def _run(deployments: dict) -> None:
    try:
        from .client import get_w3
        from web3 import Web3
    except ImportError:
        log.error("web3 not available — indexer disabled")
        return

    init_db()

    w3 = get_w3()
    if not w3:
        log.warning("Mantle RPC not reachable — indexer waiting...")
        while not _stop_event.is_set():
            time.sleep(30)
            w3 = get_w3()
            if w3:
                break
        if not w3:
            return

    addrs = deployments.get("contracts", {})

    contracts = {
        "registry":    w3.eth.contract(address=Web3.to_checksum_address(addrs["RWAiRegistry"]),    abi=REGISTRY_ABI),
        "executor":    w3.eth.contract(address=Web3.to_checksum_address(addrs["AgentExecutor"]),   abi=EXECUTOR_ABI),
        "vault":       w3.eth.contract(address=Web3.to_checksum_address(addrs["PortfolioVault"]),  abi=VAULT_ABI),
        "yield_oracle":w3.eth.contract(address=Web3.to_checksum_address(addrs["YieldOracle"]),     abi=YIELD_ABI),
    }

    # Start from deployment block or last indexed block
    deploy_block = deployments.get("deployedAtBlock", 0)
    last = max(get_last_indexed_block(deploy_block), deploy_block)
    log.info("Indexer starting from block %d", last)

    while not _stop_event.is_set():
        try:
            tip = w3.eth.block_number - CONFIRMATIONS
            if tip > last:
                chunk_end = min(last + BLOCK_CHUNK, tip)
                log.debug("Indexing blocks %d → %d", last + 1, chunk_end)
                _index_range(w3, contracts, last + 1, chunk_end)
                set_last_indexed_block(chunk_end)
                last = chunk_end
        except Exception as e:
            log.warning("Indexer error: %s", e)

        _stop_event.wait(POLL_INTERVAL)

    log.info("Indexer stopped")


def start(deployments: dict) -> None:
    global _indexer_thread
    if _indexer_thread and _indexer_thread.is_alive():
        return
    _stop_event.clear()
    _indexer_thread = threading.Thread(target=_run, args=(deployments,), daemon=True, name="rwai-indexer")
    _indexer_thread.start()
    log.info("Indexer thread started")


def stop() -> None:
    _stop_event.set()
