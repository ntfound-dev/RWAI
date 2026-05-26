"""
GET  /api/agents/market/listings  — all tokenized RWA listings
POST /api/agents/market/buy       — Atlas logs purchase on-chain
POST /api/agents/market/sell      — Atlas logs sell on-chain (RWA → USDY)
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from ...mantle.db import get_listings, get_market_positions, record_market_trade
from ...mantle.executor import log_market_purchase, log_market_sell, collect_market_fee

router = APIRouter()


@router.get("/market/listings")
def listings(limit: int = Query(default=100, le=200)):
    return {"listings": get_listings(limit)}


@router.get("/market/holdings")
def holdings(owner: str = Query(default=None)):
    return {"holdings": get_market_positions(owner=owner)}


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
    position = record_market_trade(
        owner=req.buyer_address,
        token_address=req.token_address,
        token_symbol=req.token_symbol,
        token_name=req.token_name,
        delta_tokens=tokens,
        price_usd=req.price_per_token,
        tx_hash=tx or "",
    )
    return {
        "success": bool(tx),
        "onChainTx": tx or "",
        "feeTx": fee_tx or "",
        "tokens": tokens,
        "position": position,
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
    current = next(
        (
            p for p in get_market_positions(owner=req.seller_address)
            if (p.get("token_address") or "").lower() == req.token_address.lower()
            and (p.get("token_symbol") or "").upper() == req.token_symbol.upper()
        ),
        None,
    )
    is_listing_owner = any(
        (l.get("owner") or "").lower() == req.seller_address.lower()
        and (l.get("token_address") or "").lower() == req.token_address.lower()
        and (l.get("token_symbol") or "").upper() == req.token_symbol.upper()
        for l in get_listings(200)
    )
    if not is_listing_owner and (not current or float(current.get("balance_tokens", 0)) + 1e-9 < req.amount_tokens):
        raise HTTPException(400, "No market holding found for this wallet/token. Buy the asset first or connect the original tokenization wallet.")

    reasoning = f"Atlas market sell: {req.amount_tokens:,.2f} {req.token_symbol} at ${req.price_per_token:.4f}/token (${usd_value:,.2f} total). Rebalancing RWA position to USDY."

    tx = log_market_sell(req.seller_address, req.token_address, amount_units, reasoning)
    fee_tx = collect_market_fee(usd_value)
    position = None
    if current:
        position = record_market_trade(
            owner=req.seller_address,
            token_address=req.token_address,
            token_symbol=req.token_symbol,
            token_name=req.token_name,
            delta_tokens=-req.amount_tokens,
            price_usd=req.price_per_token,
            tx_hash=tx or "",
        )
    return {
        "success": bool(tx),
        "onChainTx": tx or "",
        "feeTx": fee_tx or "",
        "usd_value": usd_value,
        "position": position,
        "reasoning": reasoning,
    }
