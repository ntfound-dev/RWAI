# RWAi — Demo Video Script
## Turing Test Hackathon · AI & RWA Track + Grand Champion

**Duration:** 2:30 – 3:00 minutes  
**Voice:** Your own voice (calm, confident — NOT AI generated)  
**Screen:** OBS or Loom recording of localhost:3000  
**Resolution:** 1920×1080 minimum  

---

## Grand Champion Scoring — what every scene must show

| Dimension | Weight | What judges look for |
|-----------|--------|----------------------|
| Technical Depth | 30% | Real on-chain tx, ERC-8004 agents, AI in the execution path |
| Innovation | 25% | New paradigm: AI agents with identity + voice + capped consent |
| Mantle Ecosystem | 25% | Deployed on Mantle, uses native assets, ERC-8004 |
| Product Completeness | 20% | Full flow works end-to-end, smooth UX |

---

## Scene-by-Scene Script

---

### SCENE 1 — Opening Hook (0:00 – 0:18)

**Screen:** RWAi homepage (`/`)  
**Action:** Slow pan across the page, then hover over the 4 agent cards  

**Narration (your voice):**
> "Every AI agent you've ever seen just gives advice.  
> RWAi agents execute.  
> Four sovereign AI agents — each with a verifiable on-chain identity via ERC-8004 —  
> tokenizing real-world assets and managing portfolios on Mantle Network.  
> Every decision: permanently benchmarked on-chain. Forever."

---

### SCENE 2 — Agents Hub (0:18 – 0:35)

**Screen:** `/hub`  
**Action:** Show 4 agents with reputation scores. Click into Atlas — show ERC-8004 ID 44, reputation 75.  

**Narration:**
> "Four agents. Four ERC-8004 identities registered on Mantle.  
> Nexus tokenizes. Shield validates compliance. Yield prices assets. Atlas manages your portfolio.  
> Each agent has a reputation score gating how autonomously it can act — the higher the score, the more it can do without asking you."

**Key visual:** Show the `AgentReputationManager` reputation score live on screen.

---

### SCENE 3 — Tokenize a Real-World Asset (0:35 – 1:10)

**Screen:** `/tokenize`  
**Action:**
1. Drag and drop a PDF (property deed or income statement)
2. Watch Nexus analyze: token name, symbol, APY, supply, compliance score appear
3. Click Deploy — show the transaction signing in MetaMask
4. Show success: contract address + tx hash on Mantle Sepolia Explorer

**Narration:**
> "I'm going to tokenize a property-backed asset right now.  
> I upload the document — Nexus reads it, extracts the financials, prices the token, and Shield scores it for compliance.  
> One click — Nexus deploys an ERC-20 token on Mantle and logs this action to AgentExecutor.sol with its ERC-8004 identity as cryptographic proof."

**Key visual:** Open Mantle explorer — show the `logTokenization()` transaction with agent reasoning on-chain.

> "That tokenization just cost gas. No lawyers. No consultants. An AI agent did it."

---

### SCENE 4 — RWA Market (1:10 – 1:30)

**Screen:** `/market`  
**Action:**
1. Show the tokenized asset listed in the market grid
2. Click Buy on a different asset
3. Show Atlas AI reasoning appear: "Atlas market purchase: ..."
4. Show on-chain tx link — open in explorer

**Narration:**
> "The asset is instantly listed on the RWAi market.  
> Any investor can buy it — and when they do, Atlas generates on-chain reasoning for the allocation,  
> logs it to AgentExecutor, and signs it with Atlas's ERC-8004 identity.  
> Not just a swap — a verifiable AI investment decision on Mantle."

---

### SCENE 5 — Atlas Voice (THE MONEY SHOT) (1:30 – 2:15)

**Screen:** `/voice` — the full Jarvis HUD  
**Action:**
1. Show Atlas orb pulsing in STANDBY
2. Hold mic button — say clearly: *"Atlas, I have one thousand dollars. Build me a portfolio."*
3. Show orb: LISTENING (cyan rings) → PROCESSING (purple hue-rotate) → SPEAKING (green pulse)
4. Let Atlas speak the response (TTS voice)
5. Show on-chain log panel fill with INPUT → RESPONSE entries
6. Say: *"Atlas, execute the allocation."*
7. Show orb go EXECUTING (amber) — show tx appear in log with explorer link

**Narration (before speaking to Atlas):**
> "Now — the feature that no other RWA project has.  
> Atlas is a sovereign AI agent you can talk to.  
> Watch."

*[speak to Atlas on screen]*

**After Atlas responds:**
> "Atlas heard that. Reasoned about it. Responded.  
> And right here — every action is logged on Mantle with Atlas's ERC-8004 identity.  
> This is radical transparency: you can watch an AI agent think and act on-chain, in real time."

**Key visual:** Show the left HUD panel — AGENT: ATLAS · 44 · REPUTATION: 75 — while Atlas is speaking.

---

### SCENE 6 — On-Chain Proof (2:15 – 2:40)

**Screen:** Mantle Sepolia Explorer — `AgentExecutor` contract  
**Action:** Show recent transactions — logTokenization, executeAllocation, market buys — all with AI reasoning in calldata

**Narration:**
> "Every action you just saw — tokenization, market purchase, portfolio allocation —  
> is permanently on Mantle.  
> Query the AgentExecutor contract right now.  
> You'll see the agent's reasoning, the timestamp, the ERC-8004 identity that signed it.  
> This is the first RWA platform that treats AI accountability as infrastructure — not an afterthought."

---

### SCENE 7 — Closing (2:40 – 2:55)

**Screen:** Back to homepage or Atlas voice page  
**Action:** Slow zoom on the RWAi logo / Atlas orb

**Narration:**
> "RWAi: four sovereign ERC-8004 agents on Mantle.  
> Tokenize any real-world asset from a document.  
> Manage your portfolio by talking to Atlas.  
> Every decision — benchmarked on-chain forever.  
>  
> OpenClaw gave AI agents hands. Mantle gave them a home."

---

## Recording Checklist

- [ ] Backend running (`make dev` — port 8001 live)
- [ ] Frontend running (port 3000)
- [ ] MetaMask connected to Mantle Sepolia (chainId 5003), wallet has MNT for gas
- [ ] Have a sample PDF ready (any deed/income doc — even a template)
- [ ] Atlas agent backend responding (test `/api/agents/status` first)
- [ ] Chrome/Edge (Web Speech API required for voice)
- [ ] Mic working and tested
- [ ] Mantle explorer open in second tab, ready to show
- [ ] Record at 1080p, no notifications on screen

## Voice Tips

- Speak slower than you think you need to — judges are reading subtitles and watching the screen
- Pause 1 second after each scene transition
- For Scene 5 (Atlas voice): speak clearly and not too fast — the STT needs to catch it
- Your own voice = credibility. AI voice = demo project. Use your own.

## Common Mistakes to Avoid

- Do NOT narrate what you're clicking ("now I click the button") — just click and let the narration tell the WHY
- Do NOT show errors or loading spinners — have everything pre-warmed
- Do NOT skip the explorer step — judges need to see the on-chain proof to score Technical Depth
- Do NOT rush Scene 5 — the Atlas voice moment is the innovation differentiator, let it breathe

---

## One-Line Pitch (for submission form)

> **RWAi: 4 ERC-8004 sovereign AI agents tokenize real-world assets, manage portfolios via voice, and benchmark every decision permanently on Mantle — the first AI accountability infrastructure for RWA.**
