"""
Pinata IPFS helper — pin document metadata for RWA asset listings.
Set PINATA_JWT env var to authenticate.
"""
import os
import logging
import httpx

_log = logging.getLogger("rwai.pinata")

_JWT = os.getenv("PINATA_JWT", "")
_PIN_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"
# Pinata deprecated the public gateway — use dedicated gateway if set, else ipfs.io
_GATEWAY = os.getenv("PINATA_GATEWAY", "https://ipfs.io/ipfs").rstrip("/")


def pin_asset_document(
    token_symbol: str,
    token_name: str,
    asset_type: str,
    document_text: str,
    compliance_score: int = 0,
    apy_bps: int = 0,
    value_usd: float = 0,
) -> str | None:
    """
    Pin asset document metadata to IPFS via Pinata.
    Returns the IPFS CID on success, None if not configured or on error.
    """
    if not _JWT:
        return None

    payload = {
        "pinataMetadata": {"name": f"RWAi-{token_symbol}-{asset_type}"},
        "pinataContent": {
            "token_symbol":     token_symbol,
            "token_name":       token_name,
            "asset_type":       asset_type,
            "document_excerpt": document_text[:2000],
            "compliance_score": compliance_score,
            "apy_bps":          apy_bps,
            "value_usd":        value_usd,
            "platform":         "RWAi · Mantle Sepolia",
        },
    }

    try:
        resp = httpx.post(
            _PIN_URL,
            json=payload,
            headers={"Authorization": f"Bearer {_JWT}"},
            timeout=15,
        )
        resp.raise_for_status()
        cid = resp.json().get("IpfsHash")
        _log.info("Pinned %s to IPFS: %s", token_symbol, cid)
        return cid
    except Exception as exc:
        _log.warning("Pinata pin failed for %s: %s", token_symbol, exc)
        return None


def ipfs_url(cid: str) -> str:
    return f"{_GATEWAY}/{cid}"
