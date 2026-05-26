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


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        log.warning("Invalid %s; using %s", name, default)
        return default


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        log.warning("Invalid %s; using %s", name, default)
        return default

CLAUDE_API_KEY      = os.getenv("ANTHROPIC_API_KEY", "")
GROQ_API_KEY        = os.getenv("OPENAI_COMPAT_API_KEY", "")
GROQ_URL            = os.getenv("OPENAI_COMPAT_BASE_URL", "https://api.groq.com/openai")
GROQ_MODEL          = os.getenv("OPENAI_COMPAT_MODEL", "llama-3.3-70b-versatile")
GROQ_FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant")
CLAUDE_MODEL        = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

LLM_TEMPERATURE     = _float_env("LLM_TEMPERATURE", 0.2)
LLM_MAX_TOKENS      = _int_env("LLM_MAX_TOKENS", 420)

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
    on_chain_tx: str = ""


_PRODUCTION_GUARDRAILS = """
## Production Answer Rules
- Do not invent live APYs, prices, wallet balances, tx hashes, legal status, or contract state.
- Only say an execution succeeded when the context includes a real tx hash.
- If required data is missing, say exactly what is unavailable and give the next safe step.
- Keep chat/voice answers to 1-3 short sentences unless the user asks for detail.
- For JSON-only tasks, return valid JSON only: no markdown, no prose wrapper.
- This is Mantle Sepolia/testnet unless production network context is explicitly provided.
- Do not promise profit or guaranteed yield; frame outputs as analysis, not financial advice.
""".strip()


def _system_prompt(agent_id: str, skill: str) -> str:
    base = skill.strip() or f"You are {agent_id.capitalize()}, an RWAi agent."
    return f"{base}\n\n{_PRODUCTION_GUARDRAILS}"


def _role_label(role: str, agent_id: str) -> str:
    r = role.lower().strip()
    if r == "user":
        return "User"
    if r == "system":
        return "Context"
    if r in {"assistant", "atlas", "nexus", "shield", "yield", agent_id.lower()}:
        return agent_id.capitalize()
    return "Context"


async def call_groq(system: str, user: str, model: str = GROQ_MODEL) -> str:
    if not GROQ_API_KEY or GROQ_API_KEY.startswith("your_"):
        raise ValueError("OPENAI_COMPAT_API_KEY (Groq) not configured")
    async with httpx.AsyncClient(timeout=18) as client:
        res = await client.post(
            f"{GROQ_URL}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":       model,
                "temperature": LLM_TEMPERATURE,
                "max_tokens":  LLM_MAX_TOKENS,
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
        client = anthropic.AsyncAnthropic(api_key=CLAUDE_API_KEY, timeout=20)
        msg = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=LLM_MAX_TOKENS,
            temperature=LLM_TEMPERATURE,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return msg.content[0].text
    except ImportError:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key":         CLAUDE_API_KEY,
                    "anthropic-version":  "2023-06-01",
                    "Content-Type":       "application/json",
                },
                json={
                    "model":       CLAUDE_MODEL,
                    "max_tokens":  LLM_MAX_TOKENS,
                    "temperature": LLM_TEMPERATURE,
                    "system":      system,
                    "messages":    [{"role": "user", "content": user}],
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


_MAX_MESSAGES   = 20        # keep last N turns
_MAX_MSG_CHARS  = 2_000     # truncate individual messages

async def agent_complete(agent_id: str, conversation: list[ChatMessage]) -> tuple[str, str, bool]:
    """
    Fallback chain: OpenClaw → Groq → Claude → Ollama (local opt-in)
    Returns: (reply, model_used, is_fallback)
    """
    skill = _system_prompt(agent_id, load_skill(agent_id))
    # Cap history to prevent prompt bloat / cost abuse
    capped = conversation[-_MAX_MESSAGES:]
    history = "\n".join(
        f"{_role_label(m.role, agent_id)}: {m.body[:_MAX_MSG_CHARS]}"
        for m in capped
    )
    prompt = (
        f"{history}\n\n"
        f"Reply as {agent_id.capitalize()}. Follow the production answer rules. "
        f"If the latest user asks for JSON, output JSON only."
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

    # 2. Groq primary model
    try:
        r = await call_groq(skill, prompt, GROQ_MODEL)
        if r and len(r.strip()) > 10:
            return r.strip(), GROQ_MODEL, False
    except Exception as e:
        log.info("Groq unavailable: %s", e)

    # 2b. Groq fallback model — explicit model argument, no global env mutation.
    if GROQ_FALLBACK_MODEL and GROQ_FALLBACK_MODEL != GROQ_MODEL:
        try:
            r = await call_groq(skill, prompt, GROQ_FALLBACK_MODEL)
            if r and len(r.strip()) > 10:
                return r.strip(), GROQ_FALLBACK_MODEL, True
        except Exception as e:
            log.info("Groq fallback unavailable: %s", e)

    # 3. Claude — reliable but paid
    try:
        r = await call_claude(skill, prompt)
        return r.strip(), CLAUDE_MODEL, True
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
