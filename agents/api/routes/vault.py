import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ...mantle.executor import (
    execute_on_behalf,
    get_agent_consent_typed_data,
    get_agent_wallet_address,
    get_vault_status,
    relay_set_agent_allowance_by_sig,
)

router = APIRouter()


class VaultConsentRequest(BaseModel):
    user_address: str
    token: str
    amount_wei: int
    expiry: int
    agent_address: Optional[str] = None


class VaultRelayAllowanceRequest(VaultConsentRequest):
    nonce: int
    signature: str


class VaultExecuteRequest(BaseModel):
    user_address: str
    token: str
    to: str
    amount_wei: int
    data_hex: str = "0x"


@router.get("/vault/status/{user_address}")
async def vault_status(user_address: str, token: str, agent: Optional[str] = None):
    status = get_vault_status(user_address, token, agent)
    if not status.get("available"):
        raise HTTPException(503, status.get("message", "HybridVault unavailable"))
    return status


@router.post("/vault/consent")
async def vault_consent(req: VaultConsentRequest):
    agent = req.agent_address or get_agent_wallet_address()
    if not agent:
        raise HTTPException(503, "AGENT_PRIVATE_KEY is not configured")

    status = get_vault_status(req.user_address, req.token, agent)
    if not status.get("available"):
        raise HTTPException(503, status.get("message", "HybridVault unavailable"))
    if not status.get("approvedAgent"):
        raise HTTPException(403, "Configured agent signer is not approved on HybridVault")

    typed_data = get_agent_consent_typed_data(
        req.user_address,
        agent,
        req.token,
        req.amount_wei,
        req.expiry,
    )
    return {
        "typedData": typed_data,
        "agent": agent,
        "vault": status.get("vault"),
        "nonce": typed_data["message"]["nonce"],
        "limits": status.get("limits"),
    }


@router.post("/vault/relay-allowance")
async def vault_relay_allowance(req: VaultRelayAllowanceRequest):
    agent = req.agent_address or get_agent_wallet_address()
    if not agent:
        raise HTTPException(503, "AGENT_PRIVATE_KEY is not configured")

    tx = relay_set_agent_allowance_by_sig(
        req.user_address,
        agent,
        req.token,
        req.amount_wei,
        req.expiry,
        req.nonce,
        req.signature,
    )
    if not tx:
        raise HTTPException(500, "Unable to relay HybridVault allowance")
    return {"onChainTx": tx, "agent": agent}


@router.post("/vault/execute")
async def vault_execute(req: VaultExecuteRequest):
    if os.getenv("AUTONOMOUS_EXECUTION_ENABLED", "false").lower() != "true":
        raise HTTPException(403, "Autonomous execution is disabled")

    try:
        data = bytes.fromhex(req.data_hex[2:] if req.data_hex.startswith("0x") else req.data_hex)
    except ValueError:
        raise HTTPException(400, "data_hex must be valid hex")

    tx = execute_on_behalf(
        req.user_address,
        req.token,
        req.to,
        req.amount_wei,
        data,
    )
    if not tx:
        raise HTTPException(500, "Unable to execute HybridVault action")
    return {"onChainTx": tx}
