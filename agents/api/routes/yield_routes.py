import json
from fastapi import APIRouter
from ..core import agent_complete, ChatMessage
from ..market_data import yield_snapshot as configured_yield_snapshot
from ...mantle.executor import (
    publish_yield_snapshot,
    publish_market_snapshot,
    record_yield_on_executor,
    publish_price_update,
)

router = APIRouter()


def _parse_json(text: str) -> dict:
    try:
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except Exception:
        pass
    return {"raw": text}


@router.get("/yield")
async def yield_snapshot(assets: str = "USDY,mETH,MI4"):
    """Yield agent fetches current APY and writes snapshot to Mantle."""
    asset_list = [a.strip() for a in assets.split(",")]
    result = configured_yield_snapshot(asset_list)
    model, fallback = "configured-yield-snapshot", False

    # Build bps map from structured response
    yields_bps: dict = {}
    if "assets" in result:
        for a in result["assets"]:
            if "symbol" in a and "apyBps" in a:
                yields_bps[a["symbol"]] = a["apyBps"]

    note    = result.get("agentNote", "Yield snapshot by RWAi Yield agent")
    tx_data = {}

    if yields_bps:
        # Write to YieldOracle
        tx1 = publish_yield_snapshot(yields_bps, note)
        if tx1:
            tx_data["oracleTx"] = tx1

        # Write AI reasoning to AgentExecutor
        tx2 = record_yield_on_executor(yields_bps, note)
        if tx2:
            tx_data["executorTx"] = tx2

    result.update({"modelUsed": model, "fallback": fallback, **tx_data})
    return result


@router.get("/yield/prices")
async def price_snapshot(assets: str = "USDY,mETH,fBTC"):
    """Fetch Pyth pull updates and write fresh USD prices to YieldOracle."""
    asset_list = [a.strip() for a in assets.split(",") if a.strip()]
    tx_data = {}

    for symbol in asset_list:
        tx = publish_price_update(symbol, f"{symbol}/USD via Pyth Hermes")
        if tx:
            tx_data[symbol] = tx

    return {"assets": asset_list, "priceTxs": tx_data}


@router.get("/yield/market-analysis")
async def market_analysis():
    """Yield agent produces a broader market analysis and snapshot."""
    result = configured_yield_snapshot(["USDY", "mETH", "fBTC", "MI4", "mUSD"])
    result["marketSummary"] = "Configured Mantle Sepolia snapshot. Use live oracle/indexer feeds before making production investment claims."
    model, fallback = "configured-yield-snapshot", False

    yields_bps: dict = {}
    if "assets" in result:
        for a in result["assets"]:
            if "symbol" in a and "apyBps" in a:
                yields_bps[a["symbol"]] = a["apyBps"]

    summary = result.get("agentNote", result.get("marketSummary", "Market analysis by RWAi Yield agent"))

    if yields_bps:
        tx = publish_market_snapshot(yields_bps, summary)
        if tx:
            result["snapshotTx"] = tx

    result.update({"modelUsed": model, "fallback": fallback})
    return result
