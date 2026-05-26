"""
RWAi Agent API — FastAPI backend
"""
import os
import sys
import time
import asyncio
import secrets
import logging
from collections import defaultdict
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

# Railway classifies stderr→error, stdout→info regardless of log level.
# Route all logs to stdout so Railway shows correct severity.
logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
    datefmt="%m/%d/%y %H:%M:%S",
    force=True,
)

# Railway tags WebSocket access log lines as severity:error regardless of log level.
# Suppress them entirely — connection lifecycle adds no diagnostic value.
class _NoWSAccessFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return "WebSocket" not in msg and "connection open" not in msg and "connection closed" not in msg

logging.getLogger("uvicorn.access").addFilter(_NoWSAccessFilter())

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .core import agent_complete, ChatMessage, ChatResponse  # re-export for compat
from contextlib import asynccontextmanager
from .routes.chat          import router as chat_router
from .routes.tokenize      import router as tokenize_router
from .routes.yield_routes  import router as yield_router
from .routes.portfolio     import router as portfolio_router
from .routes.vault         import router as vault_router
from .routes.stats         import router as stats_router
from .routes.extract       import router as extract_router
from .routes.market        import router as market_router
from .routes.tts           import router as tts_router
from .market_data          import yield_snapshot
from ..mantle.client       import get_addresses, is_connected, get_block_number, get_agent_ids, _load_deployments
from ..mantle.reputation   import get_agent_reputation_scores
from ..mantle              import indexer
from ..mantle.executor     import publish_yield_snapshot, record_yield_on_executor

_yield_log = logging.getLogger("rwai.yield_scheduler")

# In-memory previous snapshot for drift detection: {symbol: apyBps}
_prev_yields: dict[str, int] = {}
_DRIFT_THRESHOLD_BPS = 100  # 1% APY shift triggers a rebalance signal

async def _yield_scheduler():
    """
    Auto-publish yield snapshots every 6 hours.
    Tracks mETH, USDY, MI4, fBTC, mUSD. Detects drift vs previous snapshot
    and emits a DRIFT ALERT on-chain when any asset moves > 100bps.
    """
    global _prev_yields
    await asyncio.sleep(30)  # let startup settle
    while True:
        try:
            result = yield_snapshot(["USDY", "mETH", "MI4", "fBTC", "mUSD"])

            yields_bps: dict[str, int] = {
                a["symbol"]: int(a["apyBps"])
                for a in result.get("assets", [])
                if "symbol" in a and "apyBps" in a
            }
            note = result.get("agentNote", "Scheduled yield snapshot — RWAi Yield agent")

            if not yields_bps:
                _yield_log.warning("Yield scheduler: no APY data in agent reply")
            else:
                # Normal snapshot
                tx1 = publish_yield_snapshot(yields_bps, note)
                tx2 = record_yield_on_executor(yields_bps, note)
                _yield_log.info("Yield snapshot — oracle=%s executor=%s assets=%s", tx1, tx2, list(yields_bps.keys()))

                # Drift detection vs previous snapshot
                if _prev_yields:
                    drifted = {
                        sym: (yields_bps[sym], _prev_yields[sym], yields_bps[sym] - _prev_yields[sym])
                        for sym in yields_bps
                        if sym in _prev_yields and abs(yields_bps[sym] - _prev_yields[sym]) >= _DRIFT_THRESHOLD_BPS
                    }
                    if drifted:
                        drift_parts = [
                            f"{sym}: {prev}→{cur}bps (Δ{delta:+d})"
                            for sym, (cur, prev, delta) in drifted.items()
                        ]
                        drift_note = (
                            f"DRIFT ALERT: {', '.join(drift_parts)}. "
                            f"Rebalance signal emitted to Atlas. {note}"
                        )
                        tx3 = record_yield_on_executor(yields_bps, drift_note)
                        _yield_log.info("Drift signal emitted — %s tx=%s", drift_parts, tx3)

                _prev_yields = yields_bps

        except Exception as exc:
            _yield_log.error("Yield scheduler error: %s", exc)
        await asyncio.sleep(6 * 3600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    deployments = _load_deployments()
    if deployments.get("contracts"):
        indexer.start(deployments)
    task = asyncio.create_task(_yield_scheduler())
    yield
    task.cancel()
    indexer.stop()

app = FastAPI(title="RWAi Agent API", version="1.0.0", lifespan=lifespan)

import logging as _logging
_log = _logging.getLogger("rwai.cors")

def _allowed_origins() -> list[str]:
    raw = os.getenv("FRONTEND_URLS") or os.getenv("FRONTEND_URL", "")
    in_production = bool(os.getenv("BACKEND_API_KEY", ""))

    if not raw:
        if in_production:
            # Never silently open CORS in production — log loud warning and lock down
            _log.warning(
                "FRONTEND_URLS is not set. CORS locked to localhost only. "
                "Set FRONTEND_URLS=https://your-app.vercel.app in Railway env vars."
            )
            return ["http://localhost:3000"]
        # Local dev — allow localhost variants
        return ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"]

    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    # Auto-include VERCEL_URL if Railway injects it
    vercel_url = os.getenv("VERCEL_URL", "")
    if vercel_url:
        origins.append(f"https://{vercel_url.strip().rstrip('/')}")
    # Always allow localhost for local dev / preview deploys
    origins += ["http://localhost:3000"]
    return sorted(set(origins))

ALLOWED_ORIGINS = _allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials="*" not in ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Key auth middleware ────────────────────────────────────────
_API_KEY = os.getenv("BACKEND_API_KEY", "")
_PUBLIC_PATHS = {"/health", "/ws", "/docs", "/redoc", "/openapi.json"}

@app.middleware("http")
async def require_api_key(request: Request, call_next):
    if not _API_KEY or request.url.path in _PUBLIC_PATHS:
        return await call_next(request)
    incoming = request.headers.get("x-internal-api-key", "")
    if not secrets.compare_digest(incoming, _API_KEY):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return await call_next(request)

# ── Rate limiter middleware ────────────────────────────────────────
# Per-IP sliding window (60s). No external deps — in-memory per worker.
# Different limits per endpoint: AI routes cost money, so tighter caps.
_LIMITS: list[tuple[str, int]] = [
    ("/api/agents/chat",       20),   # ~$0.01/call via Claude
    ("/api/agents/tokenize",   10),
    ("/api/agents/compliance", 10),
    ("/api/agents/portfolio",  10),
    ("/api/agents/extract",     5),   # file upload — RAM heavy
    ("/api/agents/",           60),   # other agent routes
    ("/",                     120),   # health, status, ws
]
_buckets: dict[str, list[float]] = defaultdict(list)
_rl_lock = asyncio.Lock()

def _limit_for(path: str) -> int:
    for prefix, cap in _LIMITS:
        if path.startswith(prefix):
            return cap
    return 60

def _real_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")

@app.middleware("http")
async def rate_limit(request: Request, call_next):
    ip   = _real_ip(request)
    cap  = _limit_for(request.url.path)
    key  = f"{ip}:{request.url.path[:50]}"
    now  = time.time()
    async with _rl_lock:
        window = [t for t in _buckets[key] if now - t < 60.0]
        if len(window) >= cap:
            return JSONResponse(
                {"error": f"Rate limit exceeded ({cap} req/min). Try again shortly."},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        window.append(now)
        _buckets[key] = window
    return await call_next(request)

# ── Routers ──────────────────────────────────────────────────────
app.include_router(chat_router,      prefix="/api/agents")
app.include_router(tokenize_router,  prefix="/api/agents")
app.include_router(yield_router,     prefix="/api/agents")
app.include_router(portfolio_router, prefix="/api/agents")
app.include_router(vault_router,     prefix="/api/agents")
app.include_router(stats_router,     prefix="/api/agents")
app.include_router(extract_router,   prefix="/api/agents")
app.include_router(market_router,    prefix="/api/agents")
app.include_router(tts_router,       prefix="/api/agents")


# ── Health & Status ──────────────────────────────────────────────
@app.get("/health")
async def health():
    # Minimal response for Railway health check — no sensitive data exposed
    return {"status": "ok", "mantle": {"connected": is_connected()}}


@app.get("/api/agents/info")
async def agents_info():
    """Detailed chain info — protected by API key middleware."""
    return {
        "agents":    ["nexus", "shield", "yield", "atlas"],
        "mantle":    {"connected": is_connected(), "block": get_block_number()},
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


# ── WebSocket — live agent heartbeat ─────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            block   = get_block_number()
            scores  = get_agent_reputation_scores()
            ids     = get_agent_ids()

            def _ws_fmt(name: str) -> dict:
                s     = scores.get(name, {})
                local = s.get("localScore", 75)
                return {
                    "online":     True,
                    "reputation": round(local / 20, 2),
                    "erc8004_id": ids.get(name, 0),
                }

            await websocket.send_json({
                "type":   "heartbeat",
                "block":  block,
                "agents": {
                    "nexus":  _ws_fmt("nexus"),
                    "shield": _ws_fmt("shield"),
                    "yield":  _ws_fmt("yield"),
                    "atlas":  _ws_fmt("atlas"),
                },
                "ts": time.time(),
            })
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
