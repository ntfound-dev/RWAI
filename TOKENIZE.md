# Tokenize Flow — RWAi

End-to-end walkthrough of how a real-world asset becomes an ERC-20 token on Mantle Sepolia through four AI agents.

---

## Overview

```
User uploads documents (PDF / DOCX)
        │
        ▼
  [Nexus] analyzes → token parameters
        │
        ▼
  [Shield] compliance review → score 0–100
        │
        ▼
  User confirms → Deploy on Mantle
        │
        ▼
  [AgentExecutor] logs tokenization on-chain
        │
        ▼
  Asset appears in Portfolio → My Tokenized Assets
```

---

## Steps

### 1 · Upload

**Page:** `/tokenize`  
**Accepted files:** PDF, DOCX  
**What to upload:** deed, income statement, appraisal report

Files are sent to `POST /api/extract-text` which proxies to the Python backend (`pypdf` for PDF, `python-docx` for DOCX). Extracted text is concatenated and passed to Nexus.

---

### 2 · Analyze (Nexus)

**Backend:** `POST /api/agents/tokenize`  
**Agent:** Nexus (`agents/skills/nexus.md`)  
**Model:** llama-4-scout via Groq → Claude fallback

Nexus reads the extracted document text and responds with structured JSON:

```json
{
  "assetType": "real_estate",
  "estimatedValueUSD": 4250000,
  "suggestedTokenName": "RWAi Broadway Tower",
  "suggestedSymbol": "BWAY",
  "suggestedSupply": 2125000,
  "pricePerTokenUSD": 2.00,
  "annualYieldBps": 519,
  "missingDocuments": [],
  "concerns": [],
  "summary": "..."
}
```

`annualYieldBps` is basis points (519 bps = 5.19% APY).

---

### 3 · Compliance (Shield)

**Backend:** `POST /api/agents/compliance`  
**Agent:** Shield (`agents/skills/shield.md`)

Shield reviews the same document text for KYC/AML, ownership clarity, liens, sanctions, and jurisdiction. Returns:

```json
{
  "score": 82,
  "cleared": true,
  "jurisdiction": "US-NY",
  "notes": "..."
}
```

Score ≥ 70 → CLEARED → deploy button enabled.  
Score < 70 → BLOCKED → deploy button disabled.

Shield also writes its decision on-chain: `AgentExecutor.logComplianceReview(agent_id, asset_id, score, reasoning)`.

---

### 4 · Review

User sees both agent results side by side:
- Nexus panel: token parameters
- Shield panel: compliance score + jurisdiction

User can proceed only if Shield cleared the asset.

---

### 5 · Deploy

**Backend:** `POST /api/agents/tokenize` (second call, now with `token_address`)  
**Contract:** `AgentExecutor.logTokenization(agent_id, asset_id, token_address, reasoning)`

The frontend sends:
```json
{
  "document_text": "...",
  "asset_type": "real_estate",
  "asset_id": 0,
  "token_address": "0xcE265E23...",
  "owner_address": "0xUserWallet..."
}
```

`token_address` is `ADDRESSES.AssetToken` — the deployed mock ERC-20 on Mantle Sepolia (this is the test environment; on mainnet each asset gets a freshly deployed contract).

After the on-chain write the backend calls `record_user_tokenization()` to persist full Nexus metadata (name, symbol, APY, value, owner) in the local JSON store so the portfolio can display it immediately without re-querying the chain.

---

### 6 · Live

The UI shows:
- Transaction hash → link to [Mantle Sepolia explorer](https://sepolia.mantlescan.xyz)
- Token parameters confirmed by Nexus
- "Tokenize another asset →" button to restart

---

## Portfolio Integration

After tokenization, the asset appears in `/portfolio` under **My Tokenized Assets**:

- Filtered by connected wallet address (`/api/agents/stats/assets?owner=<address>`)
- Shows: token symbol, name, asset type, estimated value, APY, compliance score, tx link, contract link
- Source: `agents/rwai_index.json` → `user_tokenizations[]` array

---

## Data Flow (files)

| Layer | File | Responsibility |
|-------|------|---------------|
| Frontend | `app/app/tokenize/page.tsx` | 6-step UI, file upload, agent calls |
| API proxy | `app/app/api/extract-text/route.ts` | Forward multipart to Python backend |
| Extract | `agents/api/routes/extract.py` | pypdf / python-docx text extraction |
| Nexus + Shield | `agents/api/routes/tokenize.py` | AI analysis + on-chain log + db record |
| On-chain write | `agents/mantle/executor.py` | `log_tokenization`, `log_compliance_review` |
| Local store | `agents/mantle/db.py` | `record_user_tokenization`, `get_assets` |
| Stats API | `agents/api/routes/stats.py` | `/stats/assets?owner=` |
| Portfolio | `app/app/portfolio/page.tsx` | "My Tokenized Assets" section |

---

## Sample Documents

Pre-built test files in `app/public/samples/`:

| File | Content |
|------|---------|
| `sample-deed.pdf` | Warranty Deed, 123 Broadway NYC, $4.1M transfer |
| `sample-appraisal.pdf` | URAR Appraisal, $4.25M value, 5.21% cap rate |
| `sample-income-statement.pdf` | NOI $390k, 9.19% cap rate |
| `sample-ownership-certificate.docx` | Certificate of Ownership |

Use "Demo with sample asset" on the tokenize page to run a quick end-to-end without real documents.

---

## Supported File Types

| Type | Extension | Extraction |
|------|-----------|-----------|
| PDF | `.pdf` | `pypdf.PdfReader` (server-side) |
| Word | `.docx`, `.doc` | `python-docx` (server-side) |

Images are **not supported** — Nexus needs structured text to produce accurate token parameters.
