import re
import json
import time
import asyncio
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from ..core import agent_complete, ChatMessage
from ...mantle.executor import log_tokenization, log_compliance_review, publish_yield_snapshot, record_yield_on_executor
from ...mantle.db import record_user_tokenization

_log = logging.getLogger("rwai.tokenize")

router = APIRouter()

# ── Input limits ─────────────────────────────────────────────────
_MAX_DOC_CHARS   = 40_000   # ~10K tokens — enough for any real asset document
_MAX_ASSET_TYPE  = 64

# ── Prompt injection patterns ─────────────────────────────────────
_INJECT_RE = re.compile(
    r"(?im)^.*\b("
    r"ignore\s+(all\s+)?(previous|above|prior|the\s+above)\s+(instructions?|prompts?|text|context|rules?)"
    r"|forget\s+(everything|all|previous|above|prior)"
    r"|disregard\s+(all|the|above|previous)"
    r"|you\s+are\s+now\s+(a|an|the)\b"
    r"|new\s+(role|persona|instructions?|task|objective|goal|prompt|system)\s*:"
    r"|act\s+as\s+(a|an|the)\b"
    r"|from\s+now\s+on[,\s]"
    r"|override\s+(system|instructions?|rules?)"
    r")\b.*$"
)

def _sanitize_doc(text: str) -> str:
    """Truncate and strip prompt injection patterns from user-supplied document text."""
    if len(text) > _MAX_DOC_CHARS:
        text = text[:_MAX_DOC_CHARS] + "\n[document truncated]"
    return _INJECT_RE.sub("[content filtered]", text)


class TokenizeRequest(BaseModel):
    document_text: str
    asset_type: Optional[str] = None
    asset_id: int = 0                     # existing assetId if known (0 = new)
    token_address: str = "0x" + "0" * 40  # address after deploy (or zero)
    owner_address: Optional[str] = None   # wallet that owns the token


class ComplianceRequest(BaseModel):
    asset_id: int
    document_text: str
    jurisdiction: Optional[str] = None
    owner_address: Optional[str] = None  # wallet to screen against sanctions lists


def _parse_json(text: str) -> dict:
    try:
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except Exception:
        pass
    return {"raw": text, "error": "Could not parse structured output"}


def _extract_compliance_score(text: str) -> dict | None:
    """
    Fallback: extract a compliance score from Shield's free-text reply.
    Sums category scores found in patterns like 'scores 30/30' or 'Score: 87'.
    """
    import re
    # Try explicit "total score is N" or "score: N"
    total_pat = re.search(r"(?:total\s+)?score[:\s]+(\d{1,3})", text, re.IGNORECASE)
    if total_pat:
        score = int(total_pat.group(1))
        cleared = score >= 70
        return {"score": score, "cleared": cleared, "notes": text[:600]}

    # Sum category scores written as "X/30", "X/25", "X/20"
    cats = re.findall(r"scores?\s+(\d{1,2})/(?:30|25|20)", text, re.IGNORECASE)
    if cats:
        score = sum(int(v) for v in cats)
        cleared = score >= 70
        return {"score": score, "cleared": cleared, "notes": text[:600]}

    return None


async def _notify_yield(token_name: str, token_symbol: str, apy_bps: int, token_address: str) -> None:
    """Background: Yield monitors the newly tokenized asset and publishes a snapshot."""
    try:
        prompt = (
            f"A new RWA token has just been deployed on Mantle: {token_name} ({token_symbol}) "
            f"at address {token_address} with an initial yield of {apy_bps}bps. "
            f"Incorporate this asset into your current yield monitoring. "
            f"Fetch updated data for USDY, mETH, MI4, fBTC, mUSD, and this new asset, "
            f"note any drift signals, and respond ONLY with the JSON format defined in your skill."
        )
        reply, _, _ = await agent_complete("yield", [ChatMessage(role="user", body=prompt)])
        start = reply.find("{"); end = reply.rfind("}") + 1
        result = json.loads(reply[start:end]) if start >= 0 and end > start else {}
        yields_bps = {
            a["symbol"]: int(a["apyBps"])
            for a in result.get("assets", [])
            if "symbol" in a and "apyBps" in a
        }
        note = result.get("agentNote", f"Yield update triggered by Nexus tokenization of {token_symbol}")
        if yields_bps:
            tx1 = publish_yield_snapshot(yields_bps, note)
            tx2 = record_yield_on_executor(yields_bps, note)
            _log.info("Yield notified of new token %s — oracle=%s executor=%s", token_symbol, tx1, tx2)
    except Exception as exc:
        _log.warning("Yield notification failed for %s: %s", token_symbol, exc)


@router.post("/tokenize")
async def tokenize(req: TokenizeRequest, background_tasks: BackgroundTasks):
    """Nexus analyzes a document and returns token parameters.
    If token_address is non-zero, also logs the tokenization on AgentExecutor
    and notifies Yield to start monitoring the new asset.
    """
    if not req.document_text or not req.document_text.strip():
        raise HTTPException(400, "document_text is required")
    doc = _sanitize_doc(req.document_text)
    asset_type = (req.asset_type or "")[:_MAX_ASSET_TYPE]
    asset_hint = f" Asset type hint: {asset_type}." if asset_type else ""
    prompt = (
        f"Analyze this asset document and respond ONLY with the JSON format defined in your skill."
        f"{asset_hint}\n\n{doc}"
    )
    reply, model, fallback = await agent_complete("nexus", [ChatMessage(role="user", body=prompt)])
    result = _parse_json(reply)
    result.update({"modelUsed": model, "fallback": fallback})

    # Write to AgentExecutor if a token address is available
    non_zero = "0x" + "0" * 40
    if req.token_address and req.token_address != non_zero:
        reasoning = result.get("reasoning", reply[:500])
        tx = log_tokenization(req.asset_id, req.token_address, reasoning)
        if tx:
            result["onChainTx"] = tx

        # Record user tokenization with full nexus metadata so portfolio can display it
        token_name   = result.get("suggestedTokenName") or result.get("tokenName", "")
        token_symbol = result.get("suggestedSymbol") or result.get("symbol", "")
        apy_bps      = result.get("annualYieldBps", 0)

        if req.owner_address:
            record_user_tokenization(
                owner=req.owner_address,
                token_address=req.token_address,
                asset_type=req.asset_type or result.get("assetType", "real_estate"),
                tx_hash=tx or "",
                token_name=token_name,
                token_symbol=token_symbol,
                apy_bps=apy_bps,
                value_usd=result.get("estimatedValueUSD", 0),
                price_usd=result.get("pricePerTokenUSD", 0),
                supply=result.get("suggestedSupply", 0),
                compliance_score=0,
            )

        # Notify Yield agent in background — new asset enters market monitoring
        if token_symbol:
            background_tasks.add_task(
                _notify_yield, token_name, token_symbol, apy_bps, req.token_address
            )

    return result


@router.post("/compliance")
async def compliance(req: ComplianceRequest):
    """Shield reviews an asset for compliance and logs the result on AgentExecutor."""
    if not req.document_text or not req.document_text.strip():
        raise HTTPException(400, "document_text is required")
    doc = _sanitize_doc(req.document_text)
    jurisdiction = (req.jurisdiction or "unknown")[:64]
    wallet_line = (
        f"\nOwner wallet for sanctions screening: {req.owner_address}"
        if req.owner_address else ""
    )
    prompt = (
        f"Review this asset (ID: {req.asset_id}) for compliance. "
        f"Jurisdiction: {jurisdiction}.{wallet_line}\n\n"
        f"Score using your 4-category breakdown:\n"
        f"- Document completeness (30%): Are all required documents present?\n"
        f"- Ownership clarity (25%): Is title clear, no disputes or encumbrances?\n"
        f"- Jurisdictional compliance (25%): Which regulation applies (Reg D, MiFID II, etc.)? Is the exemption valid?\n"
        f"- Sanctions screening (20%): Are any parties or the owner wallet flagged on OFAC/EU lists?\n\n"
        f"Apply the 70/100 threshold: score < 70 → cleared: false, BLOCK deployment.\n\n"
        f"{doc}\n\n"
        f"You MUST reply with ONLY a JSON object — no prose, no explanation outside the JSON. "
        f'Example: {{"score":87,"cleared":true,"jurisdiction":"US-NY","regulation":"Reg D 506(b)","notes":"...","blockers":[],"warnings":[]}}'
    )
    reply, model, fallback = await agent_complete("shield", [ChatMessage(role="user", body=prompt)])
    result = _parse_json(reply)
    # If JSON parse failed, try to extract score from free-text reply
    if "error" in result:
        extracted = _extract_compliance_score(reply)
        if extracted:
            result = extracted
    result.update({"modelUsed": model, "fallback": fallback})

    # Default score to 0 (not 75) so a parse failure never masks a BLOCK
    score = result.get("score", result.get("complianceScore", 0))
    reasoning = result.get("notes", result.get("reasoning", result.get("summary", reply[:500])))
    tx = log_compliance_review(req.asset_id, int(score), reasoning)
    if tx:
        result["onChainTx"] = tx

    return result
