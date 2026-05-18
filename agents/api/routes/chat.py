import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..core import agent_complete, ChatMessage, ChatResponse

router = APIRouter()
_log = logging.getLogger("rwai.chat")

VALID_AGENTS = {"nexus", "shield", "yield", "atlas"}

# Keywords that trigger Atlas to delegate to a specific agent
_YIELD_KW    = {"yield", "apy", "market", "return", "drift", "interest", "rate", "meth", "usdy", "mi4", "fbtc"}
_SHIELD_KW   = {"compliance", "kyc", "kyc", "regulation", "jurisdiction", "legal", "sanction", "reg d", "mifid", "cleared", "blocked"}
_NEXUS_KW    = {"tokenize", "tokenization", "token", "valuate", "valuation", "appraisal", "deed", "asset", "erc20", "deploy"}

class ChatRequest(BaseModel):
    agent_id: str
    messages: list[ChatMessage]


async def _atlas_with_delegation(messages: list[ChatMessage]) -> tuple[str, str, bool]:
    """
    Atlas chat with real delegation to Nexus/Shield/Yield when intent detected.
    Enriches Atlas's context with the sub-agent's actual output before responding.
    """
    last = messages[-1].body.lower() if messages else ""
    words = set(last.replace(",", " ").replace(".", " ").split())
    enrichment = ""

    try:
        if words & _YIELD_KW:
            _log.info("Atlas delegating to Yield (market data)")
            y_prompt = (
                "Provide a brief current yield snapshot for USDY, mETH, MI4, fBTC, mUSD. "
                "Respond ONLY with the JSON format defined in your skill."
            )
            y_reply, _, _ = await agent_complete("yield", [ChatMessage(role="user", body=y_prompt)])
            enrichment = f"\n\n[Yield agent data]:\n{y_reply[:800]}"

        elif words & _SHIELD_KW:
            _log.info("Atlas delegating to Shield (compliance context)")
            s_prompt = (
                f"The user asked: '{messages[-1].body}'. "
                "Provide a brief compliance overview relevant to this question — "
                "applicable regulations, key risks, and what documentation is typically required."
            )
            s_reply, _, _ = await agent_complete("shield", [ChatMessage(role="user", body=s_prompt)])
            enrichment = f"\n\n[Shield agent data]:\n{s_reply[:800]}"

        elif words & _NEXUS_KW:
            _log.info("Atlas delegating to Nexus (tokenization context)")
            n_prompt = (
                f"The user asked about tokenization: '{messages[-1].body}'. "
                "Briefly explain the tokenization process, typical token parameters, "
                "and what documents are needed. Keep it concise."
            )
            n_reply, _, _ = await agent_complete("nexus", [ChatMessage(role="user", body=n_prompt)])
            enrichment = f"\n\n[Nexus agent data]:\n{n_reply[:800]}"

    except Exception as exc:
        _log.warning("Atlas delegation failed: %s", exc)

    # Inject sub-agent data into Atlas's final message context
    if enrichment:
        enriched = list(messages)
        enriched[-1] = ChatMessage(
            role=messages[-1].role,
            body=messages[-1].body + enrichment,
        )
        return await agent_complete("atlas", enriched)

    return await agent_complete("atlas", messages)


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if req.agent_id not in VALID_AGENTS:
        raise HTTPException(400, f"Unknown agent: {req.agent_id}")

    if req.agent_id == "atlas":
        reply, model, fallback = await _atlas_with_delegation(req.messages)
    else:
        reply, model, fallback = await agent_complete(req.agent_id, req.messages)

    return ChatResponse(reply=reply, model_used=model, fallback=fallback)
