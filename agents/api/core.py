"""
Agent AI fallback chain.
Priority: OpenClaw → Groq (free, cloud) → Claude → Ollama (local opt-in)
"""
import os
import logging
from pathlib import Path
from pydantic import BaseModel
import httpx

log = logging.getLogger("rwai.core")

CLAUDE_API_KEY      = os.getenv("ANTHROPIC_API_KEY", "")
GROQ_API_KEY        = os.getenv("OPENAI_COMPAT_API_KEY", "")
GROQ_URL            = os.getenv("OPENAI_COMPAT_BASE_URL", "https://api.groq.com/openai")
GROQ_MODEL          = os.getenv("OPENAI_COMPAT_MODEL", "llama-3.3-70b-versatile")

# Ollama is opt-in local only — not used in cloud deployments
OLLAMA_ENABLED      = os.getenv("OLLAMA_ENABLED", "false").lower() == "true"
OLLAMA_URL          = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL        = os.getenv("OLLAMA_MODEL", "qwen3:8b")

SKILLS_DIR = Path(__file__).parent.parent / "skills"


def load_skill(agent_id: str) -> str:
    path = SKILLS_DIR / f"{agent_id}.md"
    return path.read_text() if path.exists() else ""


class ChatMessage(BaseModel):
    role: str
    body: str


class ChatResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    reply: str
    model_used: str
    fallback: bool = False


async def call_groq(system: str, user: str) -> str:
    if not GROQ_API_KEY or GROQ_API_KEY.startswith("your_"):
        raise ValueError("OPENAI_COMPAT_API_KEY (Groq) not configured")
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{GROQ_URL}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":      GROQ_MODEL,
                "max_tokens": 1024,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
            },
        )
        if res.status_code != 200:
            raise ValueError(f"Groq {res.status_code}: {res.text[:200]}")
        return res.json()["choices"][0]["message"]["content"]


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
                    "anthropic-version":  "2023-06-01",
                    "Content-Type":       "application/json",
                },
                json={
                    "model":      "claude-opus-4-7",
                    "max_tokens": 1024,
                    "system":     system,
                    "messages":   [{"role": "user", "content": user}],
                },
            )
            if res.status_code != 200:
                raise ValueError(f"Anthropic {res.status_code}: {res.text[:200]}")
            return res.json()["content"][0]["text"]


async def call_ollama(system: str, user: str) -> str:
    async with httpx.AsyncClient(timeout=25) as client:
        res = await client.post(f"{OLLAMA_URL}/api/generate", json={
            "model":  OLLAMA_MODEL,
            "system": system,
            "prompt": user,
            "stream": False,
        })
        text = res.json().get("response", "").strip()
        if not text:
            raise ValueError("Empty Ollama response")
        return text


async def agent_complete(agent_id: str, conversation: list[ChatMessage]) -> tuple[str, str, bool]:
    """
    Fallback chain: OpenClaw → Groq → Claude → Ollama (local opt-in)
    Returns: (reply, model_used, is_fallback)
    """
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

    # 1. OpenClaw (primary when API key configured)
    try:
        from ..mantle.openclaw import run_skill, is_available
        if is_available():
            r = await run_skill(agent_id, prompt)
            if r and len(r.strip()) > 10:
                return r.strip(), "openclaw", False
    except Exception as e:
        log.debug("OpenClaw unavailable: %s", e)

    # 2. Groq — free, cloud, fast (primary cloud fallback)
    try:
        r = await call_groq(skill, prompt)
        if r and len(r.strip()) > 10:
            return r.strip(), GROQ_MODEL, False
    except Exception as e:
        log.info("Groq unavailable: %s", e)

    # 3. Claude — reliable but paid
    try:
        r = await call_claude(skill, prompt)
        return r.strip(), "claude-opus-4-7", True
    except Exception as e:
        log.info("Claude unavailable: %s", e)

    # 4. Ollama — local only, opt-in via OLLAMA_ENABLED=true
    if OLLAMA_ENABLED:
        try:
            r = await call_ollama(skill, prompt)
            return r, OLLAMA_MODEL, True
        except Exception as e:
            log.info("Ollama unavailable: %s", e)

    return "Agent temporarily unavailable.", "none", True
