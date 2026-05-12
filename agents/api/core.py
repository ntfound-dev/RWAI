"""
Shared AI helpers.
Priority: Ollama (local) → Claude (Anthropic SDK) → OpenAI-compatible (ChainGPT / any)
"""
import os
import logging
from pathlib import Path
from pydantic import BaseModel
import httpx

log = logging.getLogger("rwai.core")

CLAUDE_API_KEY       = os.getenv("ANTHROPIC_API_KEY", "")
OLLAMA_URL           = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL         = os.getenv("OLLAMA_MODEL", "qwen3:8b")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.80"))

# OpenAI-compatible fallback (ChainGPT, OpenAI, Together, etc.)
OPENAI_COMPAT_KEY    = os.getenv("OPENAI_COMPAT_API_KEY", "")
OPENAI_COMPAT_URL    = os.getenv("OPENAI_COMPAT_BASE_URL", "https://api.chaingpt.org")
OPENAI_COMPAT_MODEL  = os.getenv("OPENAI_COMPAT_MODEL", "chaingpt-4o")

SKILLS_DIR = Path(__file__).parent.parent / "skills"


def load_skill(agent_id: str) -> str:
    path = SKILLS_DIR / f"{agent_id}.md"
    return path.read_text() if path.exists() else ""


class ChatMessage(BaseModel):
    role: str
    body: str

class ChatResponse(BaseModel):
    reply: str
    model_used: str
    fallback: bool = False


async def call_ollama(system: str, user: str) -> tuple[str, float]:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(f"{OLLAMA_URL}/api/generate", json={
                "model":  OLLAMA_MODEL,
                "system": system,
                "prompt": user,
                "stream": False,
            })
            data = res.json()
            text = data.get("response", "")
            confidence = 0.85 if len(text) > 80 else 0.65
            return text, confidence
    except Exception as e:
        log.debug("Ollama unavailable: %s", e)
        return "", 0.0


async def call_claude(system: str, user: str) -> str:
    if not CLAUDE_API_KEY or CLAUDE_API_KEY.startswith("your_"):
        raise ValueError("ANTHROPIC_API_KEY not configured")
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=CLAUDE_API_KEY)
        msg = await client.messages.create(
            model="claude-opus-4-7",
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return msg.content[0].text
    except ImportError:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key":         CLAUDE_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "Content-Type":      "application/json",
                },
                json={
                    "model":    "claude-opus-4-7",
                    "max_tokens": 1024,
                    "system":   system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
            if res.status_code != 200:
                raise ValueError(f"Anthropic {res.status_code}: {res.text[:200]}")
            return res.json()["content"][0]["text"]


async def call_openai_compat(system: str, user: str) -> str:
    """OpenAI-compatible endpoint: ChainGPT, Together, OpenAI, etc."""
    if not OPENAI_COMPAT_KEY or OPENAI_COMPAT_KEY.startswith("your_"):
        raise ValueError("OPENAI_COMPAT_API_KEY not configured")
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{OPENAI_COMPAT_URL}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_COMPAT_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":      OPENAI_COMPAT_MODEL,
                "max_tokens": 1024,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
            },
        )
        if res.status_code != 200:
            raise ValueError(f"{OPENAI_COMPAT_URL} returned {res.status_code}: {res.text[:200]}")
        return res.json()["choices"][0]["message"]["content"]


async def agent_complete(agent_id: str, conversation: list[ChatMessage]) -> tuple[str, str, bool]:
    """OpenClaw → Ollama → Claude → Groq fallback chain."""
    skill   = load_skill(agent_id)
    history = "\n".join(
        f"{'User' if m.role == 'user' else agent_id.capitalize()}: {m.body}"
        for m in conversation
    )
    prompt = (
        f"{history}\n\n"
        f"Reply as {agent_id.capitalize()}, staying in character. "
        f"Be concise (3-5 sentences max)."
    )

    # 1. Try OpenClaw (CMDOP) — primary when API key configured
    try:
        from ..mantle.openclaw import run_skill, is_available
        if is_available():
            r = await run_skill(agent_id, prompt)
            if r:
                return r, "openclaw", False
    except Exception as e:
        log.debug("OpenClaw unavailable: %s", e)

    # 2. Try Ollama (local, free)
    reply, confidence = await call_ollama(skill, prompt)
    if confidence >= CONFIDENCE_THRESHOLD and reply:
        return reply, OLLAMA_MODEL, False

    # 3. Try Claude
    try:
        r = await call_claude(skill, prompt)
        return r, "claude-opus-4-7", True
    except Exception as e:
        log.info("Claude unavailable: %s", e)

    # 4. Try Groq / OpenAI-compatible
    try:
        r = await call_openai_compat(skill, prompt)
        return r, OPENAI_COMPAT_MODEL, True
    except Exception as e:
        log.info("OpenAI-compat unavailable: %s", e)

    # 5. Best-effort Ollama reply
    if reply:
        return reply, OLLAMA_MODEL, True

    return "Agent temporarily unavailable.", "none", True
