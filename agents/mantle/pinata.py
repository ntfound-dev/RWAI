"""
Pinata IPFS helper — pin asset document as styled HTML for RWA listings.
Set PINATA_JWT env var to authenticate.
"""
import io
import os
import logging
import httpx

_log = logging.getLogger("rwai.pinata")

_JWT     = os.getenv("PINATA_JWT", "")
_PIN_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"
_GATEWAY = os.getenv("PINATA_GATEWAY", "https://gateway.pinata.cloud/ipfs").rstrip("/")


def _build_html(
    token_symbol: str,
    token_name: str,
    asset_type: str,
    document_text: str,
    compliance_score: int,
    apy_bps: int,
    value_usd: float,
) -> str:
    score_color = "#00e5a0" if compliance_score >= 70 else "#f59e0b" if compliance_score >= 50 else "#ef4444"
    asset_label = asset_type.replace("_", " ").title()
    apy = f"{apy_bps / 100:.2f}%"
    value = f"${value_usd:,.0f}" if value_usd else "—"
    excerpt = document_text[:3000].replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{token_name} ({token_symbol}) · RWAi</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #0a0e1a; color: #c8d0e0; font-family: 'Courier New', monospace; padding: 32px 24px; }}
  .header {{ border-bottom: 1px solid #1e2a3a; padding-bottom: 20px; margin-bottom: 24px; }}
  .badge {{ display: inline-block; font-size: 10px; letter-spacing: .1em; padding: 3px 8px; border: 1px solid #00e5a033; color: #00e5a0; margin-bottom: 12px; }}
  h1 {{ font-size: 28px; color: #f0f4ff; margin-bottom: 4px; }}
  .sub {{ font-size: 12px; color: #5a6a80; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }}
  .stat {{ background: #111827; border: 1px solid #1e2a3a; padding: 12px; }}
  .stat-label {{ font-size: 9px; letter-spacing: .1em; color: #5a6a80; margin-bottom: 6px; }}
  .stat-value {{ font-size: 18px; color: #f0f4ff; }}
  .score-val {{ color: {score_color}; }}
  .doc {{ background: #0d1220; border: 1px solid #1e2a3a; padding: 16px; font-size: 12px; line-height: 1.7; color: #8a9ab0; white-space: pre-wrap; word-break: break-word; max-height: 480px; overflow-y: auto; }}
  .footer {{ margin-top: 20px; font-size: 10px; color: #3a4a5a; border-top: 1px solid #1e2a3a; padding-top: 12px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }}
  .pill {{ display: inline-block; font-size: 9px; padding: 2px 6px; border: 1px solid #1e2a3a; color: #5a6a80; }}
</style>
</head>
<body>
<div class="header">
  <div class="badge">RWAi · VERIFIED ASSET DOCUMENT · MANTLE SEPOLIA</div>
  <h1>{token_name}</h1>
  <div class="sub">{token_symbol} · {asset_label} · Pinned to IPFS</div>
</div>
<div class="grid">
  <div class="stat"><div class="stat-label">TOKEN SYMBOL</div><div class="stat-value">{token_symbol}</div></div>
  <div class="stat"><div class="stat-label">ASSET TYPE</div><div class="stat-value">{asset_label}</div></div>
  <div class="stat"><div class="stat-label">ESTIMATED VALUE</div><div class="stat-value">{value}</div></div>
  <div class="stat"><div class="stat-label">ANNUAL YIELD</div><div class="stat-value" style="color:#00e5a0">{apy}</div></div>
  <div class="stat"><div class="stat-label">COMPLIANCE SCORE</div><div class="stat-value score-val">{compliance_score}/100</div></div>
  <div class="stat"><div class="stat-label">PLATFORM</div><div class="stat-value" style="font-size:13px">RWAi · Mantle</div></div>
</div>
<div class="doc">{excerpt}</div>
<div class="footer">
  <span>Tokenized on Mantle Sepolia (chainId 5003) · AI agents: Nexus #41 · Shield #42</span>
  <span><span class="pill">ERC-8004</span> <span class="pill">IPFS</span> <span class="pill">MANTLE L2</span></span>
</div>
</body>
</html>"""


def pin_asset_document(
    token_symbol: str,
    token_name: str,
    asset_type: str,
    document_text: str,
    compliance_score: int = 0,
    apy_bps: int = 0,
    value_usd: float = 0,
) -> str | None:
    """Pin styled HTML asset document to IPFS via Pinata. Returns CID or None."""
    if not _JWT:
        return None

    html = _build_html(token_symbol, token_name, asset_type, document_text,
                       compliance_score, apy_bps, value_usd)

    try:
        resp = httpx.post(
            _PIN_URL,
            headers={"Authorization": f"Bearer {_JWT}"},
            files={
                "file": (f"RWAi-{token_symbol}.html", io.BytesIO(html.encode()), "text/html"),
            },
            data={
                "pinataMetadata": f'{{"name":"RWAi-{token_symbol}-{asset_type}"}}',
            },
            timeout=20,
        )
        resp.raise_for_status()
        cid = resp.json().get("IpfsHash")
        _log.info("Pinned %s HTML to IPFS: %s", token_symbol, cid)
        return cid
    except Exception as exc:
        _log.warning("Pinata pin failed for %s: %s", token_symbol, exc)
        return None


def ipfs_url(cid: str) -> str:
    return f"{_GATEWAY}/{cid}"
