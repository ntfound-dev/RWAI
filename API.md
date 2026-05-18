# RWAi Agent API — Endpoint Reference

**Base URL (production):** `https://your-railway-app.railway.app`  
**Proxy URL (via Vercel):** `https://your-app.vercel.app/api/agents`

---

## Authentication

Semua endpoint `/api/agents/*` membutuhkan header:

```
x-internal-api-key: <BACKEND_API_KEY>
```

Request tanpa header ini → `401 Unauthorized`.

> **Catatan:** Frontend Next.js (Vercel) sudah inject header ini secara otomatis via proxy `_backend.ts`. Header tidak pernah terekspos ke browser.

Endpoint publik (tidak butuh key):
- `GET /health`
- `GET /ws` (WebSocket)

---

## Rate Limits

Per IP address, per menit (sliding window 60 detik):

| Endpoint | Limit |
|---|---|
| `/api/agents/chat` | 20 req/min |
| `/api/agents/tokenize` | 10 req/min |
| `/api/agents/compliance` | 10 req/min |
| `/api/agents/portfolio/*` | 10 req/min |
| `/api/agents/extract-text` | 5 req/min |
| Endpoint agent lainnya | 60 req/min |
| `/health`, `/ws` | 120 req/min |

Response saat limit tercapai:
```json
HTTP 429
{"error": "Rate limit exceeded (20 req/min). Try again shortly."}
Headers: Retry-After: 60
```

---

## Agents

| ID | Peran |
|---|---|
| `atlas` | Orchestrator — portfolio strategy, reasoning, chat umum |
| `nexus` | Tokenisasi — analisis dokumen aset |
| `shield` | Compliance — review regulasi |
| `yield` | Yield — APY feed, market analysis |

---

## Endpoints

### Health

#### `GET /health`
Railway health check — publik, tidak butuh API key.

**Response:**
```json
{"status": "ok", "mantle": {"connected": true}}
```

---

### Info

#### `GET /api/agents/info`
Detail chain, contract addresses, dan agent IDs. Protected.

**Response:**
```json
{
  "agents": ["nexus", "shield", "yield", "atlas"],
  "mantle": {"connected": true, "block": 18234521},
  "contracts": {
    "ComplianceLog": "0xCc6296...",
    "YieldOracle": "0x1288dF...",
    "RWAiRegistry": "0xeE7a50...",
    "AgentExecutor": "0x9a822B...",
    "PortfolioVault": "0xf7C43D...",
    "HybridVault": "0xC6c08d..."
  },
  "agentIds": {"nexus": 41, "shield": 42, "yield": 43, "atlas": 44}
}
```

---

### Chat

#### `POST /api/agents/chat`
Kirim pesan ke salah satu agent AI. Rate limit: **20 req/min**.

**Request:**
```json
{
  "agent_id": "atlas",
  "messages": [
    {"role": "user", "body": "What is my portfolio risk?"},
    {"role": "atlas", "body": "Your current CVaR is 3.2%."},
    {"role": "user", "body": "How can I reduce it?"}
  ]
}
```

| Field | Type | Keterangan |
|---|---|---|
| `agent_id` | string | `atlas` \| `nexus` \| `shield` \| `yield` |
| `messages` | array | History percakapan. Max 20 pesan, tiap pesan max 2000 char |

**Response:**
```json
{
  "reply": "To reduce CVaR, consider shifting 15% allocation from mETH to USDY...",
  "model_used": "llama-3.3-70b-versatile",
  "fallback": false
}
```

**Errors:**
```json
HTTP 400 — {"detail": "Unknown agent: xyz"}
HTTP 429 — Rate limit exceeded
```

---

### Status

#### `GET /api/agents/status`
Reputasi live semua agent dari `AgentReputationManager` on-chain.

**Response:**
```json
{
  "atlas":  {"online": true, "reputation": 3.75, "localScore": 75, "autonomyLevel": 3, "actionCount": 12, "erc8004_id": 44},
  "nexus":  {"online": true, "reputation": 3.75, "localScore": 75, "autonomyLevel": 3, "actionCount": 8,  "erc8004_id": 41},
  "shield": {"online": true, "reputation": 3.75, "localScore": 75, "autonomyLevel": 3, "actionCount": 5,  "erc8004_id": 42},
  "yield":  {"online": true, "reputation": 3.75, "localScore": 75, "autonomyLevel": 3, "actionCount": 9,  "erc8004_id": 43}
}
```

---

### Portfolio

#### `POST /api/agents/portfolio/plan`
Atlas membangun strategi portfolio berdasarkan profil investor. Rate limit: **10 req/min**.

**Request:**
```json
{
  "goal": "income",
  "horizon": "medium",
  "risk_answer": "hold",
  "amount": 10000,
  "avoid": "",
  "user_address": "0xabc..."
}
```

| Field | Type | Default | Keterangan |
|---|---|---|---|
| `goal` | string | `"income"` | `income` \| `growth` \| `balanced` |
| `horizon` | string | `"medium"` | `short` \| `medium` \| `long` |
| `risk_answer` | string | `"hold"` | Reaksi market drop: `sell` \| `hold` \| `buy` |
| `amount` | float | `10000` | Jumlah USD untuk diinvestasikan |
| `avoid` | string | `""` | Simbol aset yang dihindari, pisah koma |
| `user_address` | string | null | Jika diisi, tulis alokasi ke AgentExecutor on-chain |

**Response:**
```json
{
  "allocations": [
    {"asset": "USDY", "bps": 5000},
    {"asset": "mETH", "bps": 2500},
    {"asset": "mUSD", "bps": 1500},
    {"asset": "fBTC", "bps": 1000}
  ],
  "riskScore": 3,
  "strategyType": "conservative",
  "reasoning": "High USDY allocation provides stable yield...",
  "modelUsed": "llama-3.3-70b-versatile",
  "fallback": false,
  "onChainTx": "0xabc123..."
}
```

#### `POST /api/agents/portfolio/rebalance`
Atlas eksekusi rebalance dan tulis ke AgentExecutor.

**Request:**
```json
{
  "user_address": "0xabc...",
  "from_assets": ["mETH", "fBTC"],
  "to_assets": ["USDY", "mUSD"],
  "amounts_usd": [2500.0, 1000.0]
}
```

**Response:**
```json
{
  "reasoning": "Shifting from high-volatility assets to stable yield...",
  "modelUsed": "llama-3.3-70b-versatile",
  "fallback": false,
  "onChainTx": "0xdef456..."
}
```

#### `GET /api/agents/portfolio/{user_address}`
Baca portfolio dari `PortfolioVault` on-chain.

**Response (ada portfolio):**
```json
{
  "hasPortfolio": true,
  "assets": ["USDY", "mETH"],
  "allocations": [5000, 5000],
  "riskScore": 4,
  "strategyType": "balanced",
  "createdAt": 1748000000,
  "lastRebalanced": 1748100000,
  "atlasReasoning": "Balanced allocation for medium horizon..."
}
```

**Response (belum ada):**
```json
{"hasPortfolio": false}
```

---

### Yield

#### `GET /api/agents/yield?assets=USDY,mETH,MI4`
Yield agent fetch APY terkini dan tulis snapshot ke `YieldOracle` on-chain.

**Query params:**
| Param | Default | Keterangan |
|---|---|---|
| `assets` | `USDY,mETH,MI4` | Simbol aset, pisah koma |

**Response:**
```json
{
  "assets": [
    {"symbol": "USDY", "apyBps": 420, "source": "Ondo Finance"},
    {"symbol": "mETH",  "apyBps": 612, "source": "Mantle LSP"},
    {"symbol": "MI4",   "apyBps": 581, "source": "Mantle Index"}
  ],
  "agentNote": "Yield snapshot by RWAi Yield agent",
  "modelUsed": "llama-3.3-70b-versatile",
  "fallback": false,
  "oracleTx": "0xabc...",
  "executorTx": "0xdef..."
}
```

#### `GET /api/agents/yield/prices?assets=USDY,mETH,fBTC`
Fetch Pyth pull update dan tulis harga USD ke `YieldOracle`.

**Response:**
```json
{
  "assets": ["USDY", "mETH", "fBTC"],
  "priceTxs": {
    "USDY": "0xabc...",
    "mETH": "0xdef...",
    "fBTC": "0x123..."
  }
}
```

#### `GET /api/agents/yield/market-analysis`
Yield agent produksi analisis pasar komprehensif semua aset RWA Mantle.

**Response:**
```json
{
  "assets": [...],
  "marketSummary": "Overall Mantle RWA market shows stable yield...",
  "agentNote": "Market analysis by RWAi Yield agent",
  "snapshotTx": "0xabc...",
  "modelUsed": "llama-3.3-70b-versatile",
  "fallback": false
}
```

---

### Tokenize

#### `POST /api/agents/tokenize`
Nexus analisis dokumen aset dan return parameter token. Rate limit: **10 req/min**.

**Request:**
```json
{
  "document_text": "Property deed for 123 Main St...",
  "asset_type": "real_estate",
  "asset_id": 0,
  "token_address": "0x0000000000000000000000000000000000000000",
  "owner_address": "0xabc..."
}
```

| Field | Type | Keterangan |
|---|---|---|
| `document_text` | string | **Required.** Max 40.000 char. Injection patterns difilter otomatis |
| `asset_type` | string | Hint tipe aset, max 64 char. Opsional |
| `asset_id` | int | ID aset existing (0 = baru) |
| `token_address` | string | Jika bukan zero address, log tokenisasi ke AgentExecutor |
| `owner_address` | string | Wallet pemilik token. Opsional |

**Response:**
```json
{
  "suggestedTokenName": "Main Street Property Token",
  "suggestedSymbol": "MSPT",
  "suggestedSupply": 1000000,
  "pricePerTokenUSD": 1.00,
  "estimatedValueUSD": 1000000,
  "annualYieldBps": 650,
  "assetType": "real_estate",
  "reasoning": "Commercial property with stable rental income...",
  "modelUsed": "llama-3.3-70b-versatile",
  "fallback": false,
  "onChainTx": "0xabc..."
}
```

#### `POST /api/agents/compliance`
Shield review aset untuk compliance dan log ke AgentExecutor. Rate limit: **10 req/min**.

**Request:**
```json
{
  "asset_id": 1,
  "document_text": "Asset prospectus...",
  "jurisdiction": "US"
}
```

**Response:**
```json
{
  "complianceScore": 87,
  "passed": true,
  "flags": [],
  "reasoning": "Asset meets SEC Reg D exemption requirements...",
  "modelUsed": "llama-3.3-70b-versatile",
  "fallback": false,
  "onChainTx": "0xabc..."
}
```

---

### Extract Text

#### `POST /api/agents/extract-text`
Ekstrak teks dari file PDF/DOCX/TXT untuk dikirim ke `/tokenize`. Rate limit: **5 req/min**.

**Request:** `multipart/form-data`

| Field | Keterangan |
|---|---|
| `files` | 1–5 file. Max 10 MB per file |

**Ekstensi yang didukung:** `.pdf`, `.docx`, `.doc`, `.txt`, `.md`

**Response:**
```json
{
  "results": [
    {"name": "deed.pdf", "text": "Property deed for 123 Main St..."},
    {"name": "appraisal.pdf", "text": "Appraised value: $1,200,000..."}
  ]
}
```

**Errors:**
```json
HTTP 400 — {"detail": "Max 5 files per request"}
HTTP 400 — {"detail": "Unsupported file type: file.exe. Allowed: .pdf, .docx, .doc, .txt, .md"}
HTTP 413 — {"detail": "deed.pdf exceeds 10 MB limit"}
```

---

### Market

#### `GET /api/agents/market/listings?limit=100`
Semua RWA listing yang sudah ditokenisasi.

**Query params:**
| Param | Default | Max | Keterangan |
|---|---|---|---|
| `limit` | 100 | 200 | Jumlah listing yang dikembalikan |

**Response:**
```json
{
  "listings": [
    {
      "token_address": "0xabc...",
      "token_name": "Main Street Property Token",
      "token_symbol": "MSPT",
      "asset_type": "real_estate",
      "price_usd": 1.00,
      "apy_bps": 650,
      "owner": "0xdef..."
    }
  ]
}
```

#### `POST /api/agents/market/buy`
Atlas log pembelian RWA on-chain.

**Request:**
```json
{
  "buyer_address": "0xabc...",
  "token_address": "0xdef...",
  "token_symbol": "MSPT",
  "token_name": "Main Street Property Token",
  "amount_usd": 5000.0,
  "price_per_token": 1.00,
  "apy_bps": 650
}
```

**Response:**
```json
{
  "success": true,
  "onChainTx": "0xabc...",
  "tokens": 5000.0,
  "reasoning": "Atlas market purchase: 5,000.00 MSPT at $1.0000/token ($5,000.00 total)."
}
```

#### `POST /api/agents/market/sell`
Atlas log penjualan RWA on-chain (RWA → USDY).

**Request:**
```json
{
  "seller_address": "0xabc...",
  "token_address": "0xdef...",
  "token_symbol": "MSPT",
  "token_name": "Main Street Property Token",
  "amount_tokens": 1000.0,
  "price_per_token": 1.05,
  "apy_bps": 650
}
```

**Response:**
```json
{
  "success": true,
  "onChainTx": "0xabc...",
  "usd_value": 1050.0,
  "reasoning": "Atlas market sell: 1,000.00 MSPT at $1.0500/token ($1,050.00 total)."
}
```

---

### Stats

#### `GET /api/agents/stats`
Statistik gabungan: indexed DB (history) + real-time chain counters.

**Response:**
```json
{
  "assetCount": 12,
  "agentRuns": 847,
  "totalValueUSD": 4250000.0,
  "assetCountChain": 12,
  "actionCountChain": 847
}
```

#### `GET /api/agents/stats/actions?limit=20&agent=atlas`
Recent agent actions dari indexer.

**Query params:**
| Param | Default | Max | Keterangan |
|---|---|---|---|
| `limit` | 20 | 100 | Jumlah action |
| `agent` | null | — | Filter by agent name |

**Response:**
```json
{
  "actions": [
    {
      "agent_name": "atlas",
      "action_type": "portfolio_plan",
      "reasoning": "Conservative allocation for risk-averse investor...",
      "tx_hash": "0xabc...",
      "timestamp": 1748000000
    }
  ]
}
```

#### `GET /api/agents/stats/assets?limit=50&owner=0xabc...`
Daftar aset yang ditokenisasi.

**Query params:**
| Param | Default | Max | Keterangan |
|---|---|---|---|
| `limit` | 50 | 200 | Jumlah aset |
| `owner` | null | — | Filter by owner address |

---

### Vault (HybridVault)

#### `GET /api/agents/vault/status/{user_address}?token=0x...&agent=0x...`
Status vault user: saldo, allowance agent, limits.

**Response:**
```json
{
  "available": true,
  "vault": "0xC6c08d...",
  "balance": "1000000000000000000",
  "allowance": "100000000000000000",
  "expiry": 1780000000,
  "approvedAgent": true,
  "limits": {
    "perTxCap": "115792089...",
    "perAgentDailyCap": "115792089...",
    "perUserPercentCapBps": 1000
  }
}
```

#### `POST /api/agents/vault/consent`
Generate EIP-712 typed data untuk user sign di wallet (MetaMask).

**Request:**
```json
{
  "user_address": "0xabc...",
  "token": "0xcE265E...",
  "amount_wei": 1000000000000000000,
  "expiry": 1780000000,
  "agent_address": null
}
```

**Response:**
```json
{
  "typedData": {
    "domain": {"name": "HybridVault", "version": "1", "chainId": 5003, "verifyingContract": "0xC6c08d..."},
    "types": {"AgentConsent": [...]},
    "message": {"user": "0xabc...", "agent": "0xsig...", "token": "0xcE...", "amount": "1000000000000000000", "expiry": 1780000000, "nonce": 0}
  },
  "agent": "0xsig...",
  "vault": "0xC6c08d...",
  "nonce": 0,
  "limits": {...}
}
```

#### `POST /api/agents/vault/relay-allowance`
Relay signature dari user ke HybridVault (set agent allowance).

**Request:**
```json
{
  "user_address": "0xabc...",
  "token": "0xcE265E...",
  "amount_wei": 1000000000000000000,
  "expiry": 1780000000,
  "nonce": 0,
  "signature": "0x...",
  "agent_address": null
}
```

**Response:**
```json
{"onChainTx": "0xabc...", "agent": "0xsig..."}
```

#### `POST /api/agents/vault/execute`
Eksekusi transfer dari vault on-behalf user. **Hanya aktif jika `AUTONOMOUS_EXECUTION_ENABLED=true`.**

**Request:**
```json
{
  "user_address": "0xabc...",
  "token": "0xcE265E...",
  "to": "0xdest...",
  "amount_wei": 100000000000000000,
  "data_hex": "0x"
}
```

**Response:**
```json
{"onChainTx": "0xabc..."}
```

---

### WebSocket

#### `WS /ws`
Live heartbeat setiap 5 detik. Publik, tidak butuh API key.

**Message format:**
```json
{
  "type": "heartbeat",
  "block": 18234521,
  "agents": {
    "atlas":  {"online": true, "reputation": 3.75, "erc8004_id": 44},
    "nexus":  {"online": true, "reputation": 3.75, "erc8004_id": 41},
    "shield": {"online": true, "reputation": 3.75, "erc8004_id": 42},
    "yield":  {"online": true, "reputation": 3.75, "erc8004_id": 43}
  },
  "ts": 1748000000.123
}
```

**Connect (JavaScript):**
```js
const ws = new WebSocket("wss://your-railway-app.railway.app/ws");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## Error Codes

| HTTP | Keterangan |
|---|---|
| 400 | Bad request — input tidak valid |
| 401 | Unauthorized — API key salah atau tidak ada |
| 403 | Forbidden — fitur dinonaktifkan (e.g. autonomous execution) |
| 413 | Payload Too Large — file melebihi 10 MB |
| 429 | Too Many Requests — rate limit tercapai |
| 500 | Internal server error |
| 502 | Backend Railway tidak bisa dijangkau dari Vercel |
| 503 | Service unavailable — contracts belum deploy atau AGENT_PRIVATE_KEY tidak dikonfigurasi |

---

## Asset Addresses (Mantle Sepolia Testnet)

| Simbol | Address |
|---|---|
| USDY | `0xcE265E23aAc349cEf9Fa3CC058062A44080f2289` |
| mETH | `0xD57f88B64611dBf74f87FC40f2F1010320483584` |
| fBTC | `0xbED7ad48984fBb3984F5aF83E176fb9f40dB37cc` |
| mUSD | `0xDf079DB274fAEFfeD10A4a0E5C12f65e1570Cd35` |

## Contract Addresses (Mantle Sepolia — deployed 2026-05-12)

| Contract | Address |
|---|---|
| ComplianceLog | `0xCc6296557c05ca02f3258DEd19f4104a9C19a80B` |
| YieldOracle | `0x1288dF9F55673cBFc97BCe7aD5445D77B9029B92` |
| RWAiRegistry | `0xeE7a50936a25a375143b75b7Ca743B9513368680` |
| AgentReputationManager | `0xfFE21EC80012D3Bf00F5eE20a400C94455F32D32` |
| AgentExecutor | `0x9a822B9A50D090CfcCa1e6474efCd653112d8501` |
| PortfolioVault | `0xf7C43D8fe74712130C0a05D1F58A33515E2C63E4` |
| HybridVault | `0xC6c08db835636Cf40530dDf90Bf3Bb15bc78190D` |
| AssetToken | `0x80E0e5f6488FA2726c042a204344281974f72609` |
