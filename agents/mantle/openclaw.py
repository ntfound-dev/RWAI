"""
OpenClaw / CMDOP integration layer for RWAi agents.

When CMDOP_API_KEY is set → routes agent skills through OpenClaw (remote mode).
When not set → gracefully falls back (caller uses Groq/Ollama directly).

Skill mapping:
  atlas   → portfolio planning, rebalancing decisions
  nexus   → asset tokenization analysis
  shield  → compliance scoring
  yield   → APY analysis and market snapshot

Usage:
    from agents.mantle.openclaw import run_skill, is_available
    if is_available():
        result = await run_skill("atlas", prompt)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

log = logging.getLogger("rwai.openclaw")

CMDOP_API_KEY   = os.getenv("CMDOP_API_KEY", "")
CMDOP_SERVER    = os.getenv("CMDOP_SERVER", "grpc.cmdop.com:443")

# Map our agent IDs to OpenClaw skill names
SKILL_MAP = {
    "atlas":  "rwai-atlas",
    "nexus":  "rwai-nexus",
    "shield": "rwai-shield",
    "yield":  "rwai-yield",
}

_client = None


def is_available() -> bool:
    """True if CMDOP API key is configured."""
    return bool(CMDOP_API_KEY and not CMDOP_API_KEY.startswith("your_"))


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not is_available():
        return None
    try:
        from cmdop import AsyncCMDOPClient
        _client = AsyncCMDOPClient.remote(
            api_key=CMDOP_API_KEY,
            server=CMDOP_SERVER,
        )
        log.info("OpenClaw/CMDOP client initialized (remote mode)")
        return _client
    except Exception as e:
        log.warning("OpenClaw init failed: %s", e)
        return None


def _load_skill_prompt(agent_id: str) -> str:
    """Load the agent's skill file as the system prompt."""
    path = Path(__file__).parent.parent / "skills" / f"{agent_id}.md"
    return path.read_text() if path.exists() else ""


async def run_skill(agent_id: str, user_prompt: str) -> Optional[str]:
    """
    Run an agent skill via OpenClaw.
    Returns the text response, or None if OpenClaw is unavailable.
    """
    client = _get_client()
    if client is None:
        return None

    skill_name = SKILL_MAP.get(agent_id, f"rwai-{agent_id}")
    system     = _load_skill_prompt(agent_id)

    full_prompt = f"{system}\n\nUser: {user_prompt}" if system else user_prompt

    try:
        async with client:
            result = await client.skills.run(
                skill_name=skill_name,
                prompt=full_prompt,
            )
            if result.success and result.text:
                log.info("OpenClaw skill '%s' succeeded", skill_name)
                return result.text
            log.info("OpenClaw skill '%s' unavailable: %s", skill_name, result.error)
            return None
    except Exception as e:
        log.info("OpenClaw run_skill unavailable: %s", e)
        return None


async def run_agent_prompt(agent_id: str, prompt: str) -> Optional[str]:
    """
    Run a prompt directly through the CMDOP agent (fallback when skill not found).
    Uses client.agent.run() instead of skills.run().
    """
    client = _get_client()
    if client is None:
        return None

    system = _load_skill_prompt(agent_id)
    full   = f"{system}\n\nUser: {prompt}" if system else prompt

    try:
        async with client:
            result = await client.agent.run(full)
            if result.success and result.text:
                return result.text
            return None
    except Exception as e:
        log.warning("OpenClaw agent.run error: %s", e)
        return None
