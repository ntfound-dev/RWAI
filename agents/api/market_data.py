DEFAULT_YIELDS_BPS: dict[str, int] = {
    "USDY": 420,
    "mETH": 612,
    "MI4": 581,
    "fBTC": 350,
    "mUSD": 390,
}


def yield_context() -> str:
    lines = [f"- {sym}: {bps / 100:.2f}% APY ({bps}bps)" for sym, bps in DEFAULT_YIELDS_BPS.items()]
    return (
        "Configured Mantle Sepolia APY snapshot:\n"
        + "\n".join(lines)
        + "\nThese are configured testnet/demo values unless live oracle data is explicitly provided. "
          "Do not invent different APYs."
    )


def yield_snapshot(asset_symbols: list[str] | None = None) -> dict:
    selected = asset_symbols or list(DEFAULT_YIELDS_BPS.keys())
    assets = [
        {
            "symbol": sym,
            "apyBps": DEFAULT_YIELDS_BPS[sym],
            "delta7dBps": 0,
        }
        for sym in selected
        if sym in DEFAULT_YIELDS_BPS
    ]
    return {
        "timestamp": 0,
        "assets": assets,
        "agentNote": "Configured Mantle Sepolia yield snapshot. Live oracle data should replace this in production.",
    }
