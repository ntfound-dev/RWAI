from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core import agent_complete, ChatMessage, ChatResponse

router = APIRouter()

VALID_AGENTS = {"nexus", "shield", "yield", "atlas"}

class ChatRequest(BaseModel):
    agent_id: str
    messages: list[ChatMessage]

@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if req.agent_id not in VALID_AGENTS:
        raise HTTPException(400, f"Unknown agent: {req.agent_id}")
    reply, model, fallback = await agent_complete(req.agent_id, req.messages)
    return ChatResponse(reply=reply, model_used=model, fallback=fallback)
