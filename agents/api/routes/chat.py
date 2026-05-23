import re
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core import agent_complete, ChatMessage, ChatResponse

router = APIRouter()
_log = logging.getLogger("rwai.chat")

VALID_AGENTS = {"nexus", "shield", "yield", "atlas"}

# Keywords that trigger Atlas to delegate to a specific agent
_YIELD_KW    = {"yield", "apy", "market", "return", "drift", "interest", "rate", "meth", "usdy", "mi4", "fbtc"}
_SHIELD_KW   = {"compliance", "kyc", "kyc", "regulation", "jurisdiction", "legal", "sanction", "reg d", "mifid", "cleared", "blocked"}
_NEXUS_KW    = {"tokenize", "tokenization", "token", "valuate", "valuation", "appraisal", "deed", "asset", "erc20", "deploy"}
_EXECUTE_KW  = {"execute", "executes", "invest", "investing", "allocate", "allocation", "buy", "purchase", "deploy capital", "put it in", "go ahead", "do it", "confirm"}

# Mantle assets available for Atlas allocation
_ASSET_KW = {"usdy": "USDY", "meth": "mETH", "fbtc": "fBTC", "musd": "mUSD", "mi4": "USDY"}

class ChatRequest(BaseModel):
    agent_id: str
    messages: list[ChatMessage]
    wallet_address: Optional[str] = None


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


_WORD_NUMS: dict[str, int] = {
    "zero":0,"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,
    "ten":10,"eleven":11,"twelve":12,"thirteen":13,"fourteen":14,"fifteen":15,"sixteen":16,
    "seventeen":17,"eighteen":18,"nineteen":19,"twenty":20,"thirty":30,"forty":40,"fifty":50,
    "sixty":60,"seventy":70,"eighty":80,"ninety":90,
    "hundred":100,"thousand":1_000,"million":1_000_000,"billion":1_000_000_000,
}

def _words_to_usd(text: str) -> Optional[float]:
    """Convert English number words in text to float — 'one thousand five hundred dollars' → 1500."""
    words = re.sub(r"[,\-]", " ", text).split()
    total, current = 0, 0
    found = False
    for w in words:
        n = _WORD_NUMS.get(w.lower())
        if n is None:
            continue
        found = True
        if n >= 1_000_000_000:
            total += (current or 1) * n; current = 0
        elif n >= 1_000:
            total += (current or 1) * n; current = 0
        elif n == 100:
            current = (current or 1) * 100
        else:
            current += n
    total += current
    return float(total) if found and total > 0 else None


def _detect_execution(messages: list[ChatMessage], wallet: Optional[str]) -> Optional[str]:
    """
    If the user's last message is an execution command, call execute_allocation on-chain.
    Returns tx hash or None.
    """
    if not messages:
        return None
    last = messages[-1].body.lower()
    words = set(re.sub(r"[,.\-!?]", " ", last).split())
    if not (words & _EXECUTE_KW):
        return None

    # Parse USD amount — "$1000", "1000 dollars", "1k dollars", "one thousand dollars"
    m = re.search(r"\$?([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:dollars?|usd)?", last, re.IGNORECASE)
    if m:
        amount_usd = float(m.group(1).replace(",", ""))
        if m.group(2):
            amount_usd *= 1000
    else:
        amount_usd = _words_to_usd(last) or 0.0
    if amount_usd <= 0:
        return None

    # Detect mentioned assets; default to USDY
    assets = [v for k, v in _ASSET_KW.items() if k in last] or ["USDY"]
    assets = list(dict.fromkeys(assets))  # deduplicate, preserve order
    per_asset = amount_usd / len(assets)
    # Use USD cents as unit — AgentExecutor is a log contract, not ERC-20 transfer.
    # 1e18 caused _checkAutonomy to always fail (100e18 > agentTransactionLimits default of 0).
    amounts_wei = [int(per_asset * 100)] * len(assets)  # e.g. $100 → 10000 units

    try:
        from ...mantle.executor import execute_allocation, get_agent_wallet_address, AGENT_PRIVATE_KEY
        if not AGENT_PRIVATE_KEY:
            _log.warning("Atlas execution skipped — AGENT_PRIVATE_KEY not set in env")
            return None
        user = wallet or get_agent_wallet_address() or "0x" + "0" * 40
        tx = execute_allocation(user, assets, amounts_wei, f"Atlas voice allocation: ${amount_usd:,.0f} into {', '.join(assets)}")
        if tx:
            _log.info("Atlas executed allocation on-chain: %s (assets=%s amount=$%s)", tx, assets, amount_usd)
        else:
            _log.warning("Atlas execution returned None — check AGENT_PRIVATE_KEY and contract addresses")
        return tx
    except Exception as exc:
        _log.warning("Atlas on-chain execution failed: %s", exc)
        return None


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if req.agent_id not in VALID_AGENTS:
        raise HTTPException(400, f"Unknown agent: {req.agent_id}")

    if req.agent_id == "atlas":
        last_body = req.messages[-1].body.lower() if req.messages else ""
        execution_attempted = bool(set(re.sub(r"[,.\-!?]", " ", last_body).split()) & _EXECUTE_KW)
        tx = _detect_execution(req.messages, req.wallet_address)

        # Inject TX result before LLM reply — prevents hallucination of fake TX hashes
        messages_with_ctx = list(req.messages)
        if tx:
            messages_with_ctx.append(ChatMessage(
                role="system",
                body=f"[SYSTEM] On-chain execution SUCCEEDED. Real TX hash: {tx}. Tell the user this exact hash and that it is live on Mantle Sepolia AgentExecutor.",
            ))
        elif execution_attempted:
            messages_with_ctx.append(ChatMessage(
                role="system",
                body="[SYSTEM] On-chain execution FAILED — no transaction was submitted. Do NOT invent or guess a TX hash. Tell the user honestly that the on-chain log could not be written and to retry.",
            ))
        reply, model, fallback = await _atlas_with_delegation(messages_with_ctx)
    else:
        reply, model, fallback = await agent_complete(req.agent_id, req.messages)
        tx = None

    return ChatResponse(reply=reply, model_used=model, fallback=fallback, on_chain_tx=tx or "")
