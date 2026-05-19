"""
GET  /api/agents/market/listings  — all tokenized RWA listings
POST /api/agents/market/buy       — Atlas logs purchase on-chain
POST /api/agents/market/sell      — Atlas logs sell on-chain (RWA → USDY)
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from ...mantle.db import get_listings
from ...mantle.executor import log_market_purchase, log_market_sell, collect_market_fee
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
    fee_tx = collect_market_fee(req.amount_usd)
    return {
        "success": bool(tx),
        "onChainTx": tx or "",
        "feeTx": fee_tx or "",
        "tokens": tokens,
        "reasoning": reasoning,
    }


class SellRequest(BaseModel):
    seller_address: str
    token_address: str
    token_symbol: str
    token_name: str
    amount_tokens: float     # number of tokens to sell
    price_per_token: float   # price per token in USD
    apy_bps: int = 0


@router.post("/market/sell")
async def sell(req: SellRequest):
    usd_value = req.amount_tokens * req.price_per_token
    amount_wei = int(req.amount_tokens * 1e18)

    prompt = (
        f"You are Atlas. A seller at {req.seller_address[:10]}... is selling "
        f"{req.amount_tokens:,.2f} {req.token_symbol} tokens (${usd_value:,.2f} USD) "
        f"on the RWAi Market. Asset: {req.token_name}, price ${req.price_per_token:.4f}/token. "
        f"Write a 1-2 sentence on-chain reasoning for this rebalance (RWA → USDY)."
    )
    reasoning = f"Atlas market sell: {req.amount_tokens:,.2f} {req.token_symbol} at ${req.price_per_token:.4f}/token (${usd_value:,.2f} total). Rebalancing RWA position to USDY."
    try:
        reply, _, _ = await agent_complete("atlas", [ChatMessage(role="user", body=prompt)])
        if reply and len(reply.strip()) > 10:
            reasoning = reply.strip()
    except Exception:
        pass

    tx = log_market_sell(req.seller_address, req.token_address, amount_wei, reasoning)
    fee_tx = collect_market_fee(usd_value)
    return {
        "success": bool(tx),
        "onChainTx": tx or "",
        "feeTx": fee_tx or "",
        "usd_value": usd_value,
        "reasoning": reasoning,
    }
