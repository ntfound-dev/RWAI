"""
RWAi Agent API — FastAPI backend
"""
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core import agent_complete, ChatMessage, ChatResponse  # re-export for compat
from contextlib import asynccontextmanager
from .routes.chat          import router as chat_router
from .routes.tokenize      import router as tokenize_router
from .routes.yield_routes  import router as yield_router
from .routes.portfolio     import router as portfolio_router
from .routes.vault         import router as vault_router
from .routes.stats         import router as stats_router
from ..mantle.client       import get_addresses, is_connected, get_block_number, get_agent_ids, _load_deployments
from ..mantle.reputation   import get_agent_reputation_scores
from ..mantle              import indexer

@asynccontextmanager
async def lifespan(app: FastAPI):
    deployments = _load_deployments()
    if deployments.get("contracts"):
        indexer.start(deployments)
    yield
    indexer.stop()

app = FastAPI(title="RWAi Agent API", version="1.0.0", lifespan=lifespan)

def _allowed_origins() -> list[str]:
    raw = os.getenv("FRONTEND_URLS") or os.getenv("FRONTEND_URL") or "*"
    if raw == "*":
        return ["*"]

    origins = [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]
    vercel_url = os.getenv("VERCEL_URL")
    if vercel_url:
        origins.append(f"https://{vercel_url.strip().rstrip('/')}")
    return sorted(set(["http://localhost:3000", *origins]))

ALLOWED_ORIGINS = _allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials="*" not in ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────
app.include_router(chat_router,      prefix="/api/agents")
app.include_router(tokenize_router,  prefix="/api/agents")
app.include_router(yield_router,     prefix="/api/agents")
app.include_router(portfolio_router, prefix="/api/agents")
app.include_router(vault_router,     prefix="/api/agents")
app.include_router(stats_router,     prefix="/api/agents")


# ── Health & Status ──────────────────────────────────────────────
@app.get("/health")
async def health():
    chain_ok = is_connected()
    block    = get_block_number()
    return {
        "status":    "ok",
        "agents":    ["nexus", "shield", "yield", "atlas"],
        "mantle":    {"connected": chain_ok, "block": block},
        "contracts": get_addresses(),
        "agentIds":  get_agent_ids(),
    }


@app.get("/api/agents/status")
async def agents_status():
    """Return live reputation scores from AgentReputationManager if available."""
    scores    = get_agent_reputation_scores()
    agent_ids = get_agent_ids()

    def _fmt(name: str) -> dict:
        s = scores.get(name, {})
        # Convert 0-100 localScore to 0-5 star rating for frontend
        local = s.get("localScore", 75)
        stars = round(local / 20, 2)  # 75 → 3.75, 100 → 5.0
        return {
            "online":       True,
            "reputation":   stars,
            "localScore":   local,
            "autonomyLevel":s.get("autonomyLevel", 3),
            "actionCount":  s.get("actionCount", 0),
            "erc8004_id":   agent_ids.get(name, 0),
        }

    return {
        "nexus":  _fmt("nexus"),
        "shield": _fmt("shield"),
        "yield":  _fmt("yield"),
        "atlas":  _fmt("atlas"),
    }
