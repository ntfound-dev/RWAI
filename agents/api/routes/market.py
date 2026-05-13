"""
GET  /api/agents/market/listings  — all tokenized RWA listings
POST /api/agents/market/buy       — Atlas logs purchase on-chain
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from ...mantle.db import get_listings
from ...mantle.executor import log_market_purchase
from ..core import agent_complete, ChatMessage

router = APIRouter()


@router.get("/market/listings")
def listings(limit: int = Query(default=100, le=200)):
    return {"listings": get_listings(limit)}


class BuyRequest(BaseModel):
    buyer_address: str
    token_address: str
    token_symbol: str
    token_name: str
    amount_usd: float        # USD the buyer wants to spend
    price_per_token: float   # price per token in USD
    apy_bps: int = 0


@router.post("/market/buy")
async def buy(req: BuyRequest):
    tokens = req.amount_usd / req.price_per_token if req.price_per_token > 0 else 0
    amount_wei = int(tokens * 1e18)

    prompt = (
        f"You are Atlas. A buyer at {req.buyer_address[:10]}... just purchased "
        f"{tokens:,.2f} {req.token_symbol} tokens (${req.amount_usd:,.2f} USD) "
        f"from the RWAi Market. Token: {req.token_name}, price ${req.price_per_token:.4f}/token, "
        f"yield {req.apy_bps/100:.2f}% APY. "
        f"Write a 1-2 sentence on-chain reasoning for this allocation."
    )
    reasoning = f"Atlas market purchase: {tokens:,.2f} {req.token_symbol} at ${req.price_per_token:.4f}/token (${req.amount_usd:,.2f} total). Yield: {req.apy_bps/100:.2f}% APY."
    try:
        reply, _, _ = await agent_complete("atlas", [ChatMessage(role="user", body=prompt)])
        if reply and len(reply.strip()) > 10:
            reasoning = reply.strip()
    except Exception:
        pass

    tx = log_market_purchase(req.buyer_address, req.token_address, amount_wei, reasoning)
    return {
        "success": bool(tx),
        "onChainTx": tx or "",
        "tokens": tokens,
        "reasoning": reasoning,
    }
