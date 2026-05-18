import re
import json
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core import agent_complete, ChatMessage
from ...mantle.executor import log_tokenization, log_compliance_review
from ...mantle.db import record_user_tokenization

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


@router.post("/tokenize")
async def tokenize(req: TokenizeRequest):
    """Nexus analyzes a document and returns token parameters.
    If token_address is non-zero, also logs the tokenization on AgentExecutor.
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
        if req.owner_address:
            record_user_tokenization(
                owner=req.owner_address,
                token_address=req.token_address,
                asset_type=req.asset_type or result.get("assetType", "real_estate"),
                tx_hash=tx or "",
                token_name=result.get("suggestedTokenName") or result.get("tokenName", ""),
                token_symbol=result.get("suggestedSymbol") or result.get("symbol", ""),
                apy_bps=result.get("annualYieldBps", 0),
                value_usd=result.get("estimatedValueUSD", 0),
                price_usd=result.get("pricePerTokenUSD", 0),
                supply=result.get("suggestedSupply", 0),
                compliance_score=0,
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
        f"{doc}\n\nRespond ONLY with the JSON format defined in your skill."
    )
    reply, model, fallback = await agent_complete("shield", [ChatMessage(role="user", body=prompt)])
    result = _parse_json(reply)
    result.update({"modelUsed": model, "fallback": fallback})

    # Default score to 0 (not 75) so a parse failure never masks a BLOCK
    score = result.get("score", result.get("complianceScore", 0))
    reasoning = result.get("notes", result.get("reasoning", result.get("summary", reply[:500])))
    tx = log_compliance_review(req.asset_id, int(score), reasoning)
    if tx:
        result["onChainTx"] = tx

    return result
