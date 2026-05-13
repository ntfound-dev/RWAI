import json
import time
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from ..core import agent_complete, ChatMessage
from ...mantle.executor import log_tokenization, log_compliance_review
from ...mantle.db import record_user_tokenization

router = APIRouter()


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
    asset_hint = f" Asset type hint: {req.asset_type}." if req.asset_type else ""
    prompt = (
        f"Analyze this asset document and respond ONLY with the JSON format defined in your skill."
        f"{asset_hint}\n\n{req.document_text}"
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
    prompt = (
        f"Review this asset (ID: {req.asset_id}) for compliance. "
        f"Jurisdiction: {req.jurisdiction or 'unknown'}.\n\n"
        f"{req.document_text}\n\nRespond ONLY with the JSON format defined in your skill."
    )
    reply, model, fallback = await agent_complete("shield", [ChatMessage(role="user", body=prompt)])
    result = _parse_json(reply)
    result.update({"modelUsed": model, "fallback": fallback})

    # Write compliance score to AgentExecutor
    score = result.get("complianceScore", result.get("score", 75))
    reasoning = result.get("reasoning", result.get("summary", reply[:500]))
    tx = log_compliance_review(req.asset_id, int(score), reasoning)
    if tx:
        result["onChainTx"] = tx

    return result
