import json
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from ..core import agent_complete, ChatMessage
from ...mantle.executor import execute_allocation, execute_rebalance
from ...mantle.contracts import get_portfolio_vault
from ...mantle.client import get_w3

router = APIRouter()

ZERO_ADDR = "0x" + "0" * 40

# Mantle Sepolia asset addresses (must match executor.py)
ASSET_ADDRESSES = {
    "USDY": "0x5bE26527e817998A7206475496fDE1E68957c5A6",
    "mETH": "0xcDA86A272531e8640cD7F1a92c01839911B90bb0",
    "fBTC": "0x8734DB1C5C1f6a4f862F2A66DB7B0E0A5aD18e3",
    "MI4":  "0x0000000000000000000000000000000000000004",
}


class PlanRequest(BaseModel):
    goal:        str   = "income"
    horizon:     str   = "medium"
    risk_answer: str   = "hold"
    amount:      float = 10000
    avoid:       str   = ""
    user_address: Optional[str] = None   # if set, writes allocation to chain


class RebalanceRequest(BaseModel):
    user_address: str
    from_assets:  list[str]  # symbols
    to_assets:    list[str]
    amounts_usd:  list[float]


def _parse_json(text: str) -> dict:
    try:
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except Exception:
        pass
    return {"raw": text}


@router.post("/portfolio/plan")
async def portfolio_plan(body: PlanRequest):
    """Atlas builds a portfolio strategy. If user_address provided, writes allocation to AgentExecutor."""
    prompt = f"""Build a portfolio strategy for this investor:
- Goal: {body.goal}
- Time horizon: {body.horizon}
- Market drop reaction: {body.risk_answer}
- Investment amount: ${body.amount}
- Assets to avoid: {body.avoid or 'none'}

Respond ONLY with the JSON format defined in your skill."""

    reply, model, fallback = await agent_complete("atlas", [ChatMessage(role="user", body=prompt)])
    result = _parse_json(reply)
    result.update({"modelUsed": model, "fallback": fallback})

    # Write allocation to AgentExecutor if user wallet provided
    if body.user_address and body.user_address != ZERO_ADDR and "allocations" in result:
        allocations = result["allocations"]
        symbols  = [a["asset"] for a in allocations if "asset" in a]
        bps_list = [a.get("bps", 0) for a in allocations]
        total    = body.amount
        # Convert bps → simulated wei amounts (1e18 scale, no real value on testnet)
        amounts  = [int(total * bps / 10000 * 1e18) for bps in bps_list]

        reasoning = result.get("reasoning", reply[:500])
        tx = execute_allocation(body.user_address, symbols, amounts, reasoning)
        if tx:
            result["onChainTx"] = tx

    return result


@router.post("/portfolio/rebalance")
async def portfolio_rebalance(body: RebalanceRequest):
    """Atlas executes a rebalance and writes it to AgentExecutor."""
    prompt = (
        f"Execute a portfolio rebalance for user {body.user_address}. "
        f"Move from {body.from_assets} to {body.to_assets} with amounts {body.amounts_usd} USD. "
        "Explain the reasoning briefly."
    )
    reply, model, fallback = await agent_complete("atlas", [ChatMessage(role="user", body=prompt)])

    amounts_wei = [int(a * 1e18) for a in body.amounts_usd]
    tx = execute_rebalance(
        body.user_address,
        body.from_assets,
        body.to_assets,
        amounts_wei,
        reply[:500],
    )

    return {
        "reasoning": reply,
        "modelUsed": model,
        "fallback": fallback,
        "onChainTx": tx,
    }


@router.get("/portfolio/{user_address}")
async def get_portfolio(user_address: str):
    """Read portfolio data from PortfolioVault on Mantle."""
    vault = get_portfolio_vault()
    if not vault:
        return {"hasPortfolio": False, "message": "Contracts not deployed yet"}

    try:
        has = vault.functions.hasPortfolio(user_address).call()
        if not has:
            return {"hasPortfolio": False}

        p = vault.functions.getPortfolio(user_address).call()
        return {
            "hasPortfolio": True,
            "assets":        p[0],
            "allocations":   p[1],
            "riskScore":     p[2],
            "strategyType":  p[3],
            "createdAt":     p[4],
            "lastRebalanced":p[5],
            "atlasReasoning":p[6],
        }
    except Exception as e:
        return {"hasPortfolio": False, "error": str(e)}
