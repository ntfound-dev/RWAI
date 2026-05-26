"""
GET  /api/agents/market/listings  — all tokenized RWA listings
POST /api/agents/market/buy       — Atlas logs purchase on-chain
POST /api/agents/market/sell      — Atlas logs sell on-chain (RWA → USDY)
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from ...mantle.db import get_listings
from ...mantle.executor import log_market_purchase, log_market_sell, collect_market_fee

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
    amount_units = int(req.amount_usd * 100)

    reasoning = f"Atlas market purchase: {tokens:,.2f} {req.token_symbol} at ${req.price_per_token:.4f}/token (${req.amount_usd:,.2f} total). Yield: {req.apy_bps/100:.2f}% APY."

    tx = log_market_purchase(req.buyer_address, req.token_address, amount_units, reasoning)
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
    amount_units = int(usd_value * 100)

    reasoning = f"Atlas market sell: {req.amount_tokens:,.2f} {req.token_symbol} at ${req.price_per_token:.4f}/token (${usd_value:,.2f} total). Rebalancing RWA position to USDY."

    tx = log_market_sell(req.seller_address, req.token_address, amount_units, reasoning)
    fee_tx = collect_market_fee(usd_value)
    return {
        "success": bool(tx),
        "onChainTx": tx or "",
        "feeTx": fee_tx or "",
        "usd_value": usd_value,
        "reasoning": reasoning,
    }
