"""
Pyth Hermes helpers for Mantle price updates.
Fetches pull-oracle update payloads that YieldOracle.updatePrice() can submit on-chain.
"""
from typing import Iterable

import httpx

HERMES_URL = "https://hermes.pyth.network"

PYTH_PRICE_FEEDS = {
    "MNT":  "0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585",
    "USDY": "0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326",
    "mETH": "0xfbc9c3a716650b6e24ab22ab85b1c0ef4141b18f4590cc0b986e2f9064cf73d6",
    "fBTC": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    "BTC":  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    "ETH":  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
}


def get_price_feed_id(symbol: str) -> str | None:
    return PYTH_PRICE_FEEDS.get(symbol)


def _hex_to_bytes(value: str) -> bytes:
    clean = value[2:] if value.startswith("0x") else value
    return bytes.fromhex(clean)


def fetch_price_updates(symbols: Iterable[str]) -> tuple[list[bytes], list[dict]]:
    feed_ids = [PYTH_PRICE_FEEDS[symbol] for symbol in symbols if symbol in PYTH_PRICE_FEEDS]
    if not feed_ids:
        return [], []

    params = [("ids[]", feed_id) for feed_id in feed_ids]
    with httpx.Client(timeout=10) as client:
        response = client.get(f"{HERMES_URL}/v2/updates/price/latest", params=params)
        response.raise_for_status()
        payload = response.json()

    binary = payload.get("binary", {}).get("data", [])
    parsed = payload.get("parsed", [])
    return [_hex_to_bytes(item) for item in binary], parsed
