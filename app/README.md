# RWAi Frontend

Next.js 14 web app for the RWAi platform — AI-native real-world asset tokenization on Mantle Network.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing — hero, stats, agent cards |
| `/hub` | Asset Hub — browse tokenized RWAs, live APY |
| `/tokenize` | Upload documents → Nexus + Shield analyze → deploy token |
| `/portfolio` | Atlas onboarding → AI portfolio strategy |
| `/chat` | Live chat with any of the 4 agents |
| `/docs` | Platform documentation |

## Stack

- **Next.js 14** (App Router)
- **wagmi v2 + viem** — wallet connection (MetaMask, WalletConnect)
- **Mantle Sepolia** — chainId 5003, native gas MNT
- **Tailwind CSS** — styling
- **Framer Motion** — animations
- **lucide-react** — icons

## Project Structure

```
app/
├── app/
│   ├── layout.tsx          # Root layout, WagmiProvider
│   ├── page.tsx            # Landing page
│   ├── hub/page.tsx        # Asset Hub
│   ├── tokenize/page.tsx   # Tokenize assets
│   ├── portfolio/page.tsx  # Portfolio management
│   ├── chat/page.tsx       # Agent chat
│   ├── docs/page.tsx       # Documentation
│   └── api/                # Next.js API routes (agent proxy)
├── components/
│   ├── agents/             # Agent card, status components
│   ├── layout/             # Header, sidebar, navigation
│   └── ui/                 # Reusable UI primitives
├── lib/
│   └── contracts.ts        # Contract addresses + ABIs
├── public/
├── .env.local              # Environment variables
└── package.json
```

## Setup

### 1. Install dependencies

```bash
cd app
npm install
```

### 2. Configure environment

Edit `.env.local`:

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# Contract addresses — fill after deploying contracts
NEXT_PUBLIC_RWAI_REGISTRY=0x...
NEXT_PUBLIC_COMPLIANCE_LOG=0x...
NEXT_PUBLIC_YIELD_ORACLE=0x...
NEXT_PUBLIC_AGENT_EXECUTOR=0x...
NEXT_PUBLIC_PORTFOLIO_VAULT=0x...
NEXT_PUBLIC_HYBRID_VAULT=0x...

# Backend URL
NEXT_PUBLIC_AGENT_API_URL=http://localhost:8001
AGENT_API_URL=http://localhost:8001
```

Get a free WalletConnect project ID at: https://cloud.walletconnect.com

### 3. Run development server

```bash
npm run dev
# App available at http://localhost:3000
```

### 4. Build for production

```bash
npm run build
npm start
```

## Connecting Wallet

1. Install MetaMask
2. Add Mantle Sepolia network:
   - Network name: Mantle Sepolia
   - RPC URL: `https://rpc.sepolia.mantle.xyz`
   - Chain ID: `5003`
   - Currency symbol: `MNT`
   - Explorer: `https://sepolia.mantlescan.xyz`
3. Click **Connect Wallet** in the top-right corner

## Contract Addresses

After deploying with `cd contracts && npm run deploy:sepolia`, sync addresses into `app/lib/deployment.ts`:

```bash
cd contracts
npm run sync:deployment
```

## Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Set the same environment variables in the Vercel dashboard under Project → Settings → Environment Variables.

## Agent API Integration

The frontend calls the FastAPI backend at `NEXT_PUBLIC_AGENT_API_URL` (default `http://localhost:8001`). Make sure the backend is running before using the chat or tokenize features.

Quick check:
```bash
curl http://localhost:8001/health
```
