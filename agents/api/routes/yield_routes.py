import json
from fastapi import APIRouter
from ..core import agent_complete, ChatMessage
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
    prompt = (
        f"Fetch current yield data for: {', '.join(asset_list)}. "
        "Respond ONLY with the JSON format defined in your skill."
    )
    reply, model, fallback = await agent_complete("yield", [ChatMessage(role="user", body=prompt)])
    result = _parse_json(reply)

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
    prompt = (
        "Generate a comprehensive market analysis for all tracked Mantle RWA assets "
        "(USDY, mETH, fBTC, MI4). Include yield trends, market conditions, and a "
        "brief investment thesis. Respond ONLY with the JSON format defined in your skill."
    )
    reply, model, fallback = await agent_complete("yield", [ChatMessage(role="user", body=prompt)])
    result = _parse_json(reply)

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
