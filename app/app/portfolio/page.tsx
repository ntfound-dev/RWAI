"use client";

import { useState, useEffect } from "react";
import { getWalletClient } from "wagmi/actions";
import { AgentMonogram } from "@/components/agents/AgentMonogram";
import { useAccount } from "wagmi";
import { parseEther, type Address, encodeFunctionData } from "viem";
import { agentApi, type AgentChatResponse } from "@/lib/agent-api";
import { MANTLE_ASSETS, ADDRESSES } from "@/lib/contracts";
import { mantleTestnet, wagmiConfig } from "@/lib/wagmi";
import { useYieldOracle } from "@/hooks/useYieldOracle";
import { useWalletPortfolio } from "@/hooks/useWalletPortfolio";
import { useGaslessConsent } from "@/hooks/useGaslessConsent";

const ASSET_META: Record<string, { name: string; color: string; apy: number }> = {
  USDY: { name:"Ondo US Dollar Yield", color:"var(--accent)",  apy:4.20 },
  mUSD: { name:"Mantle USD",           color:"var(--nexus)",   apy:3.90 },
  mETH: { name:"Mantle Staked ETH",    color:"var(--atlas)",   apy:6.12 },
  fBTC: { name:"Mantle Wrapped BTC",   color:"var(--warn)",    apy:3.50 },
};

const PLANS = [
  {
    id: "conservative", label: "Conservative", riskScore: 3,
    goal: "income", horizon: "medium", risk_answer: "hold",
    allocations: [
      { symbol:"USDY", pct:50 }, { symbol:"mETH", pct:25 },
      { symbol:"mUSD", pct:15 }, { symbol:"fBTC", pct:10 },
    ],
  },
  {
    id: "balanced", label: "Balanced", riskScore: 5,
    goal: "growth", horizon: "medium", risk_answer: "hold",
    allocations: [
      { symbol:"USDY", pct:35 }, { symbol:"mETH", pct:30 },
      { symbol:"mUSD", pct:20 }, { symbol:"fBTC", pct:15 },
    ],
  },
  {
    id: "aggressive", label: "Aggressive", riskScore: 8,
    goal: "growth", horizon: "long", risk_answer: "buy more",
    allocations: [
      { symbol:"USDY", pct:20 }, { symbol:"mETH", pct:40 },
      { symbol:"mUSD", pct:15 }, { symbol:"fBTC", pct:25 },
    ],
  },
] as const;

const DEFAULT_ALLOCATIONS = PLANS[0].allocations;

interface Allocation { symbol: string; pct: number; apy: number; name: string; color: string; value: number; }
interface OnChainAction {
  action_id: number;
  agent_name: string;
  action_type: string;
  tx_hash: string;
  ts: number;
  success: boolean;
}
interface TokenizedAsset {
  asset_id: number | null;
  token_address: string;
  owner: string;
  asset_type: string;
  compliance_score: number;
  active: boolean;
  block_number: number;
  tx_hash: string;
  ts: number;
  token_name: string;
  token_symbol: string;
  apy_bps: number;
  value_usd: number;
  _source?: string;
}

const DEMO_VALUE = 10000;

const GAS_BADGE = (
  <span className="tag" style={{ fontSize:9, color:"var(--accent)", borderColor:"rgba(0,229,160,0.3)" }}>
    ⛽ ~$0.001 gas · Mantle L2
  </span>
);

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { apyMap, hasData, snapshotCount } = useYieldOracle();
  const wallet  = useWalletPortfolio(address);
  const consent = useGaslessConsent();
  const [showAtlas, setShowAtlas] = useState(false);
  const [atlasInput, setAtlasInput] = useState("");
  const [autonomyAmount, setAutonomyAmount] = useState("100");
  const [autonomyDays, setAutonomyDays] = useState("7");
  const [depositAmount, setDepositAmount] = useState("100");
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositTx, setDepositTx] = useState("");
  const [depositStatus, setDepositStatus] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("100");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawTx, setWithdrawTx] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState("");
  const [atlasMessages, setAtlasMessages] = useState<Array<{ role: string; body: string }>>([
    { role:"agent", body:"Choose a plan below — Conservative, Balanced, or Aggressive. I'll execute the allocation on Mantle and write my reasoning on-chain. You can also deposit USDY to HybridVault and enable my autonomous mode." }
  ]);
  const [onChainActions, setOnChainActions] = useState<OnChainAction[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("conservative");
  const [planBusy, setPlanBusy] = useState(false);
  const [planTx, setPlanTx] = useState("");
  const [planStatus, setPlanStatus] = useState("");
  const [allocations, setAllocations] = useState<Allocation[]>(
    DEFAULT_ALLOCATIONS.map(a => ({
      ...a, ...ASSET_META[a.symbol], value: DEMO_VALUE * a.pct / 100,
    }))
  );
  const [myAssets, setMyAssets] = useState<TokenizedAsset[]>([]);

  const refreshActions = () => {
    agentApi<{ actions: OnChainAction[] }>("/stats/actions?limit=10")
      .then(d => { if (d.actions?.length) setOnChainActions(d.actions); })
      .catch(() => {});
  };

  const refreshMyAssets = (addr: string) => {
    agentApi<{ assets: TokenizedAsset[] }>(`/stats/assets?owner=${addr}&limit=20`)
      .then(d => {
        if (d.assets) {
          // Only show user-initiated tokenizations, not chain-indexed protocol tokens
          setMyAssets(d.assets.filter(a => a._source === "user"));
        }
      })
      .catch(() => {});
  };

  useEffect(() => { refreshActions(); }, []);
  useEffect(() => {
    if (address) refreshMyAssets(address);
    else setMyAssets([]);
  }, [address]);

  const activatePlan = async (planId: string) => {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan || !isConnected || !address) return;

    // Optimistic UI update — use live oracle APY when available, fall back to static
    setSelectedPlan(planId);
    const planValue = isConnected && wallet.hasBalance ? wallet.totalValueUSD : DEMO_VALUE;
    setAllocations(plan.allocations.map(a => ({
      ...a,
      ...ASSET_META[a.symbol],
      apy: apyMap[a.symbol] ?? ASSET_META[a.symbol].apy,
      value: planValue * a.pct / 100,
    })));

    setPlanBusy(true);
    setPlanTx("");
    setPlanStatus("Atlas is writing allocation to Mantle...");
    try {
      const d = await agentApi<{ onChainTx?: string; reasoning?: string }>("/portfolio/plan", {
        method: "POST",
        body: JSON.stringify({
          user_address: address,
          amount: planValue,
          goal: plan.goal,
          horizon: plan.horizon,
          risk_answer: plan.risk_answer,
        }),
      });
      if (d.onChainTx) {
        setPlanTx(d.onChainTx);
        setPlanStatus(`${plan.label} plan activated — reasoning stored on-chain.`);
        setTimeout(refreshActions, 3000);
      } else {
        setPlanStatus(`${plan.label} plan built by Atlas. On-chain log requires agent wallet (AGENT_PRIVATE_KEY) on backend.`);
      }
    } catch {
      setPlanStatus("Plan set locally. Backend unavailable.");
    } finally {
      setPlanBusy(false);
    }
  };

  const sendAtlas = async () => {
    if (!atlasInput.trim()) return;
    const q = atlasInput;
    setAtlasInput("");
    setAtlasMessages(prev => [...prev, { role:"user", body:q }]);
    try {
      const data = await agentApi<AgentChatResponse>("/chat", {
        method:"POST",
        body: JSON.stringify({ agentId:"atlas", messages:[...atlasMessages, { role:"user", body:q }] }),
      });
      setAtlasMessages(prev => [...prev, { role:"agent", body: data.reply ?? "Atlas unavailable." }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Atlas temporarily offline.";
      setAtlasMessages(prev => [...prev, { role:"agent", body:`Production backend error: ${message}` }]);
    }
  };

  useEffect(() => {
    if (!isConnected || typeof window === "undefined" || !(window as any).ethereum) return;
    const infuraRpc = process.env.NEXT_PUBLIC_MANTLE_TESTNET_RPC || "https://rpc.sepolia.mantle.xyz";
    (window as any).ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x138B",
        chainName: "Mantle Sepolia Testnet",
        nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
        rpcUrls: [infuraRpc],
        blockExplorerUrls: ["https://sepolia.mantlescan.xyz"],
      }],
    }).catch(() => {});
  }, [isConnected]);

  const depositToVault = async () => {
    if (!address) return;
    setDepositBusy(true);
    setDepositStatus("Approving USDY...");
    try {
      const walletClient = await getWalletClient(wagmiConfig, { chainId: mantleTestnet.id });
      const token = MANTLE_ASSETS.USDY.address;
      const vault = ADDRESSES.HybridVault as Address;
      const amount = parseEther(depositAmount || "100");

      // 1. Approve
      const approveData = encodeFunctionData({
        abi: [{ name:"approve", type:"function", inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}] }],
        functionName: "approve",
        args: [vault, amount],
      });
      const approveTx = await walletClient.sendTransaction({ to: token, data: approveData, account: address as Address, chain: mantleTestnet });
      setDepositStatus("Approve sent, depositing...");

      // 2. Deposit
      const depositData = encodeFunctionData({
        abi: [{ name:"deposit", type:"function", inputs:[{name:"token",type:"address"},{name:"amount",type:"uint256"}], outputs:[] }],
        functionName: "deposit",
        args: [token, amount],
      });
      const depTx = await walletClient.sendTransaction({ to: vault, data: depositData, account: address as Address, chain: mantleTestnet });
      setDepositTx(depTx);
      setDepositStatus(`Deposited ${depositAmount} USDY to HybridVault.`);
    } catch (err) {
      setDepositStatus(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setDepositBusy(false);
    }
  };

  const withdrawFromVault = async () => {
    if (!address) return;
    setWithdrawBusy(true);
    setWithdrawStatus("Sending withdraw...");
    try {
      const walletClient = await getWalletClient(wagmiConfig, { chainId: mantleTestnet.id });
      const token = MANTLE_ASSETS.USDY.address;
      const vault = ADDRESSES.HybridVault as Address;
      const amount = parseEther(withdrawAmount || "0");

      const data = encodeFunctionData({
        abi: [{ name:"withdraw", type:"function", inputs:[{name:"token",type:"address"},{name:"amount",type:"uint256"}], outputs:[] }],
        functionName: "withdraw",
        args: [token, amount],
      });
      const tx = await walletClient.sendTransaction({ to: vault, data, account: address as Address, chain: mantleTestnet });
      setWithdrawTx(tx);
      setWithdrawStatus(`Withdrawn ${withdrawAmount} USDY back to wallet.`);
    } catch (err) {
      setWithdrawStatus(err instanceof Error ? err.message : "Withdraw failed.");
    } finally {
      setWithdrawBusy(false);
    }
  };

  return (
    <div className="app-page">
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:32 }}>
        <div>
          <div className="mono" style={{ color:"var(--accent)", marginBottom:8 }}>§ portfolio · atlas managed</div>
          <h1 className="display" style={{ fontSize:64 }}>Your RWA portfolio.</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAtlas(v => !v)}>
          {showAtlas ? "Hide Atlas" : "Ask Atlas →"}
        </button>
      </div>

      {/* Stats row */}
      {(() => {
        const plan    = PLANS.find(p => p.id === selectedPlan) ?? PLANS[0];
        const isReal  = isConnected && !wallet.isLoading;
        const total   = isReal && wallet.hasBalance ? wallet.totalValueUSD : (isConnected ? 0 : DEMO_VALUE);
        const blended = isReal && wallet.hasBalance
          ? wallet.holdings.reduce((s, h) => s + (h.pct / 100) * h.apy, 0)
          : allocations.reduce((s, a) => s + (a.pct / 100) * a.apy, 0);
        const isDemo  = !isConnected;
        return (
          <div className="pf-stats-4" style={{ border:`1px solid ${isDemo ? "rgba(245,158,11,0.4)" : "var(--line)"}`, marginBottom:24, position:"relative" }}>
            {isDemo && (
              <div style={{ position:"absolute", top:-10, left:16, background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.4)", borderRadius:2, padding:"1px 8px", zIndex:1 }}>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"#fbbf24", letterSpacing:"0.1em" }}>DEMO — connect wallet to see real balance</span>
              </div>
            )}
            {[
              { label:"Portfolio Value", value: wallet.isLoading ? "…" : `$${total.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}`, sub: isDemo ? "Demo · $10k simulation" : isReal && wallet.hasBalance ? "Live wallet balance" : "No RWA assets found" },
              { label:"Blended APY",     value:`${blended.toFixed(2)}%`,           sub:"Atlas optimized" },
              { label:"Monthly Income",  value: wallet.isLoading ? "…" : `$${((total * blended / 100) / 12).toFixed(2)}`, sub:"Est. distribution" },
              { label:"Risk Score",      value:`${plan.riskScore} / 10`,           sub: plan.riskScore <= 3 ? "Low risk" : plan.riskScore <= 6 ? "Medium risk" : "High risk" },
            ].map(({ label, value, sub }, i) => (
              <div key={i} style={{ padding:"16px 18px", borderRight: i < 3 ? "1px solid var(--line)" : "none" }}>
                <div className="mono-sm" style={{ marginBottom:6 }}>{label}</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:28, color: isDemo ? "rgba(251,191,36,0.7)" : "var(--fg-0)" }}>{value}</div>
                <div className="mono-sm" style={{ color: isDemo ? "#fbbf24" : "var(--accent)", marginTop:4 }}>{sub}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Plan selector */}
      <div className="panel" style={{ marginBottom:24 }}>
        <div className="panel-header">
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <AgentMonogram agent="atlas" active/>
            <span className="mono">Select a plan · Atlas executes on Mantle</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {hasData && (
              <span className="tag" style={{ fontSize:9, color:"var(--accent)", borderColor:"rgba(0,229,160,0.25)" }}>
                <span className="live-dot" style={{ width:5, height:5, display:"inline-block", marginRight:4 }}/>
                APY · YieldOracle.sol · {Number(snapshotCount)} snapshots
              </span>
            )}
            {planBusy && <span className="mono-sm" style={{ color:"var(--atlas)" }}>Writing to chain…</span>}
          </div>
        </div>
        <div className="pf-plans-3">
          {PLANS.map((plan, i) => {
            const blended = plan.allocations.reduce((s,a) => s + (a.pct/100)*((apyMap[a.symbol] ?? ASSET_META[a.symbol]?.apy) ?? 0), 0);
            const active = selectedPlan === plan.id;
            return (
              <div key={plan.id} style={{
                padding:"16px", borderRight: i < 2 ? "1px solid var(--line)" : "none",
                background: active ? "var(--bg-2)" : "transparent",
                borderTop: active ? "2px solid var(--atlas)" : "2px solid transparent",
                transition:"all 0.15s",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color: active ? "var(--atlas)" : "var(--fg-0)", marginBottom:2 }}>{plan.label}</div>
                    <div className="mono-sm" style={{ color:"var(--fg-3)" }}>Risk {plan.riskScore}/10</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:18, color:"var(--accent)" }}>{blended.toFixed(2)}%</div>
                    <div className="mono-sm" style={{ color:"var(--fg-3)" }}>APY</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:4, marginBottom:12 }}>
                  {plan.allocations.map(a => (
                    <div key={a.symbol} style={{ flex:a.pct, height:4, borderRadius:1, background:ASSET_META[a.symbol]?.color ?? "var(--fg-3)", opacity:0.7 }}/>
                  ))}
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:12 }}>
                  {plan.allocations.map(a => (
                    <span key={a.symbol} className="mono-sm" style={{ color:"var(--fg-2)" }}>{a.symbol} {a.pct}%</span>
                  ))}
                </div>
                <button
                  className={active ? "btn btn-primary" : "btn btn-ghost"}
                  style={{ width:"100%", fontSize:11 }}
                  onClick={() => activatePlan(plan.id)}
                  disabled={planBusy || !isConnected}
                >
                  {active ? (planBusy ? "Activating…" : "Active ✓") : "Activate Plan →"}
                </button>
              </div>
            );
          })}
        </div>
        {(planStatus || planTx) && (
          <div style={{ padding:"10px 16px", borderTop:"1px solid var(--line)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span className="mono-sm" style={{ color:"var(--fg-2)", textTransform:"none", letterSpacing:0 }}>{planStatus}</span>
            {planTx && <a href={`https://sepolia.mantlescan.xyz/tx/${planTx}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>↗ {planTx.slice(0,10)}…{planTx.slice(-6)}</a>}
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom:24 }}>
        <div className="panel-header">
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <AgentMonogram agent="atlas" active/>
            <span className="mono">Autonomous agent control · HybridVault</span>
          </div>
          <span className="mono-sm" style={{ color:"var(--atlas)" }}>EIP-712 capped consent</span>
        </div>

        {/* Step 1: Deposit */}
        <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--line)", background:"var(--bg-1)" }}>
          <div className="mono-sm" style={{ color:"var(--fg-3)", marginBottom:8 }}>STEP 1 · Deposit USDY to vault</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end" }}>
            <label style={{ display:"grid", gap:6 }}>
              <span className="mono-sm">Amount (mock USDY)</span>
              <input className="input-field" value={depositAmount} onChange={e => setDepositAmount(e.target.value.replace(/[^\d.]/g, ""))}/>
            </label>
            <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end" }}>
              <button className="btn btn-ghost" onClick={depositToVault} disabled={!isConnected || depositBusy} style={{ fontSize:11 }}>
                {depositBusy ? "Depositing..." : "Deposit →"}
              </button>
              {GAS_BADGE}
            </div>
          </div>
          {(depositStatus || depositTx) && (
            <div style={{ marginTop:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span className="mono-sm" style={{ color:"var(--fg-2)", textTransform:"none", letterSpacing:0 }}>{depositStatus}</span>
              {depositTx && <a href={`https://sepolia.mantlescan.xyz/tx/${depositTx}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>↗ {depositTx.slice(0,10)}…</a>}
            </div>
          )}
        </div>

        {/* Withdraw */}
        <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--line)", background:"var(--bg-1)" }}>
          <div className="mono-sm" style={{ color:"var(--fg-3)", marginBottom:8 }}>WITHDRAW · Pull USDY back to wallet</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end" }}>
            <label style={{ display:"grid", gap:6 }}>
              <span className="mono-sm">Amount (mock USDY)</span>
              <input className="input-field" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value.replace(/[^\d.]/g, ""))}/>
            </label>
            <button className="btn btn-ghost" onClick={withdrawFromVault} disabled={!isConnected || withdrawBusy} style={{ fontSize:11 }}>
              {withdrawBusy ? "Withdrawing..." : "Withdraw ←"}
            </button>
          </div>
          {(withdrawStatus || withdrawTx) && (
            <div style={{ marginTop:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span className="mono-sm" style={{ color:"var(--fg-2)", textTransform:"none", letterSpacing:0 }}>{withdrawStatus}</span>
              {withdrawTx && <a href={`https://sepolia.mantlescan.xyz/tx/${withdrawTx}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>↗ {withdrawTx.slice(0,10)}…</a>}
            </div>
          )}
        </div>

        {/* Step 2: Enable Atlas */}
        <div style={{ padding:"12px 16px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <div className="mono-sm" style={{ color:"var(--fg-3)" }}>STEP 2 · Grant Atlas capped allowance</div>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:9, padding:"2px 7px", background:"rgba(0,229,160,0.1)", border:"1px solid rgba(0,229,160,0.35)", borderRadius:2, color:"var(--accent)", letterSpacing:"0.08em" }}>⚡ GASLESS</span>
          </div>
          <div className="mono-sm" style={{ color:"var(--fg-3)", marginBottom:10, textTransform:"none", letterSpacing:0, fontSize:11 }}>You sign once (EIP-712). RWAi relays the tx on-chain — you pay zero gas for this step.</div>
          {consent.status === "success" ? (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--accent)" }}>✅ Atlas autonomy active — consent relayed gaslessly</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span className="mono-sm" style={{ color:"var(--fg-3)" }}>Agent: {consent.agentAddr.slice(0,10)}…{consent.agentAddr.slice(-6)}</span>
                <a href={`https://sepolia.mantlescan.xyz/tx/${consent.tx}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>
                  ↗ {consent.tx.slice(0,10)}…{consent.tx.slice(-6)}
                </a>
              </div>
              <button className="btn btn-ghost" style={{ marginTop:8, fontSize:11 }} onClick={consent.reset}>Reset →</button>
            </div>
          ) : (
            <>
              <div className="pf-consent-3">
                <label style={{ display:"grid", gap:6 }}>
                  <span className="mono-sm">USDY allowance</span>
                  <input className="input-field" value={autonomyAmount} onChange={e => setAutonomyAmount(e.target.value.replace(/[^\d.]/g, ""))}/>
                </label>
                <label style={{ display:"grid", gap:6 }}>
                  <span className="mono-sm">Expiry days</span>
                  <input className="input-field" value={autonomyDays} onChange={e => setAutonomyDays(e.target.value.replace(/[^\d]/g, ""))}/>
                </label>
                <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end" }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => address && consent.grant({ userAddress: address, amountUsdy: autonomyAmount, days: Number(autonomyDays) })}
                    disabled={!isConnected || consent.status === "preparing" || consent.status === "awaiting_signature" || consent.status === "relaying"}
                  >
                    {consent.status === "preparing"        ? "Preparing…"  :
                     consent.status === "awaiting_signature" ? "Sign wallet…" :
                     consent.status === "relaying"         ? "Relaying…"   : "Enable Atlas ⚡"}
                  </button>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--accent)", letterSpacing:"0.06em" }}>⚡ gasless · backend pays</span>
                </div>
              </div>
              {(consent.error || consent.status !== "idle") && (
                <div style={{ marginTop:8 }}>
                  {consent.error
                    ? <span className="mono-sm" style={{ color:"var(--warn)", textTransform:"none", letterSpacing:0 }}>{consent.error}</span>
                    : <span className="mono-sm" style={{ color:"var(--fg-2)", textTransform:"none", letterSpacing:0 }}>
                        {consent.status === "preparing"         ? "Fetching EIP-712 typed data from HybridVault…"  :
                         consent.status === "awaiting_signature" ? "Waiting for wallet signature (no gas required)…" :
                         consent.status === "relaying"          ? "Backend relaying tx to Mantle — you pay $0 gas…" : ""}
                      </span>
                  }
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="rp-two-col" style={{ display:"grid", gridTemplateColumns: showAtlas ? "1fr 380px" : "1fr", gap:24 }}>
        <div>
          {/* Allocation chart */}
          {(() => {
            const showReal = isConnected && !wallet.isLoading && wallet.hasBalance;
            const rows = showReal
              ? wallet.holdings.filter(h => h.balance > 0).map(h => ({
                  symbol: h.symbol, name: h.name, color: h.color,
                  pct: h.pct, apy: h.apy, value: h.valueUSD,
                  extra: `${h.balance < 0.0001 ? h.balance.toExponential(2) : h.balance.toLocaleString(undefined,{maximumFractionDigits:4})} ${h.symbol}`,
                }))
              : allocations.map(a => ({ ...a, extra: null }));
            const isEmpty = isConnected && !wallet.isLoading && !wallet.hasBalance;
            return (
              <div className="panel" style={{ marginBottom:24 }}>
                <div className="panel-header">
                  <span className="mono">
                    {showReal ? `Holdings · ${rows.length} assets` : isEmpty ? "Holdings · no assets" : `Target allocation · ${allocations.length} assets`}
                  </span>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {showReal && <span className="tag" style={{ fontSize:9, color:"var(--accent)", borderColor:"rgba(0,229,160,0.3)" }}>LIVE</span>}
                    {!showReal && !isConnected && <span className="tag" style={{ fontSize:9, color:"#fbbf24", borderColor:"rgba(245,158,11,0.3)" }}>DEMO</span>}
                    <AgentMonogram agent="atlas" active/>
                    <span className="mono-sm" style={{ color:"var(--atlas)" }}>Atlas managed</span>
                  </div>
                </div>
                {isEmpty ? (
                  <div style={{ padding:"32px 16px", textAlign:"center" }}>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--fg-3)", marginBottom:8 }}>No RWA assets detected in this wallet</div>
                    <div style={{ fontSize:12, color:"var(--fg-3)", marginBottom:16 }}>Select a plan above → Atlas will write your target allocation on-chain</div>
                    <a href="/market" style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--accent)", textDecoration:"none" }}>Buy assets on Market →</a>
                  </div>
                ) : (
                  <div style={{ padding:"20px" }}>
                    <div style={{ display:"flex", height:40, borderRadius:2, overflow:"hidden", marginBottom:20, gap:2 }}>
                      {rows.filter(r => r.pct > 0).map(r => (
                        <div key={r.symbol} style={{ flex: r.pct, background: r.color, opacity:0.7, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--bg-0)", fontWeight:600 }}>{Math.round(r.pct)}%</span>
                        </div>
                      ))}
                    </div>
                    {rows.map(r => (
                      <div key={r.symbol} style={{ display:"grid", gridTemplateColumns:`28px 1fr 80px 80px ${showReal ? "120px" : "80px"}`, alignItems:"center", gap:14, padding:"12px 0", borderBottom:"1px solid var(--line)" }}>
                        <div style={{ width:12, height:12, borderRadius:2, background:r.color, opacity:0.8 }}/>
                        <div>
                          <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--fg-0)" }}>{r.symbol}</div>
                          <div className="mono-sm" style={{ textTransform:"none", letterSpacing:0, color:"var(--fg-2)" }}>{r.name}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div className="mono-sm" style={{ marginBottom:2 }}>{showReal ? "SHARE" : "ALLOC"}</div>
                          <div style={{ fontFamily:"var(--font-mono)", fontSize:15, color:"var(--fg-0)" }}>{r.pct.toFixed(1)}%</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div className="mono-sm" style={{ marginBottom:2 }}>APY</div>
                          <div style={{ fontFamily:"var(--font-mono)", fontSize:15, color:"var(--accent)" }}>{r.apy.toFixed(2)}%</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div className="mono-sm" style={{ marginBottom:2 }}>{showReal ? "BALANCE" : "VALUE"}</div>
                          <div style={{ fontFamily:"var(--font-mono)", fontSize:showReal ? 11 : 15, color:"var(--fg-0)" }}>
                            {showReal ? r.extra : `$${r.value.toLocaleString()}`}
                          </div>
                          {showReal && <div style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--fg-2)" }}>${r.value.toLocaleString(undefined,{maximumFractionDigits:2})}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* My Tokenized Assets */}
          {(myAssets.length > 0 || isConnected) && (
            <div className="panel" style={{ marginBottom:24 }}>
              <div className="panel-header">
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <AgentMonogram agent="nexus" active/>
                  <span className="mono">My Tokenized Assets · Nexus issued</span>
                </div>
                <span className="mono-sm" style={{ color:"var(--nexus)" }}>ERC-20 on Mantle</span>
              </div>
              {myAssets.length === 0 ? (
                <div style={{ padding:"24px 16px", textAlign:"center", color:"var(--fg-3)", fontSize:12 }}>
                  No tokenized assets yet.{" "}
                  <a href="/tokenize" style={{ color:"var(--accent)", textDecoration:"none" }}>Tokenize an asset →</a>
                </div>
              ) : myAssets.map((a, i) => {
                const date = new Date(a.ts * 1000).toLocaleString("sv-SE").replace("T"," ").slice(0,16);
                const symbol = a.token_symbol || (a.asset_id != null ? `RWA-${a.asset_id}` : "RWA");
                const name = a.token_name || a.asset_type?.replace(/_/g," ") || "Real World Asset";
                const apy = a.apy_bps ? (a.apy_bps / 100).toFixed(2) : null;
                const value = a.value_usd ? `$${Number(a.value_usd).toLocaleString()}` : null;
                const score = a.compliance_score;
                const shortAddr = `${a.token_address.slice(0,8)}…${a.token_address.slice(-6)}`;
                return (
                  <div key={`${a.tx_hash}-${i}`} style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", alignItems:"start", gap:14, padding:"14px 16px", borderBottom: i < myAssets.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <div style={{ width:36, height:36, borderRadius:2, background:"var(--bg-2)", border:"1px solid var(--line-strong)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--nexus)", fontWeight:600 }}>{symbol.slice(0,4)}</span>
                    </div>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--fg-0)" }}>{symbol}</span>
                        <span className="tag" style={{ fontSize:9 }}>{name}</span>
                        <span className="tag" style={{ fontSize:9, color: score >= 70 ? "var(--accent)" : "var(--warn)", borderColor: score >= 70 ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)" }}>
                          Score {score}/100
                        </span>
                      </div>
                      <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                        <span className="mono-sm" style={{ color:"var(--fg-3)" }}>{date}</span>
                        {value && <span className="mono-sm" style={{ color:"var(--fg-2)" }}>Value {value}</span>}
                        {apy && <span className="mono-sm" style={{ color:"var(--accent)" }}>APY {apy}%</span>}
                        <span className="mono-sm" style={{ color:"var(--fg-3)" }}>Token {shortAddr}</span>
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                      {a.tx_hash && (
                        <a href={`https://sepolia.mantlescan.xyz/tx/${a.tx_hash}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)", whiteSpace:"nowrap" }}>
                          ↗ {a.tx_hash.slice(0,6)}…{a.tx_hash.slice(-4)}
                        </a>
                      )}
                      <a href={`https://sepolia.mantlescan.xyz/address/${a.token_address}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--fg-3)", whiteSpace:"nowrap" }}>
                        contract ↗
                      </a>
                    </div>
                  </div>
                );
              })}
              {myAssets.length > 0 && (
                <div style={{ padding:"10px 16px", borderTop:"1px solid var(--line)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span className="mono-sm" style={{ color:"var(--fg-3)" }}>{myAssets.length} asset{myAssets.length !== 1 ? "s" : ""} tokenized · stored on Mantle Sepolia</span>
                  <a href="/tokenize" className="mono-sm" style={{ color:"var(--accent)", textDecoration:"none" }}>Tokenize another →</a>
                </div>
              )}
            </div>
          )}

          {/* Rebalance history */}
          <div className="panel">
            <div className="panel-header">
              <span className="mono">Agent action history · on-chain reasoning</span>
              <span className="mono-sm" style={{ color:"var(--fg-3)" }}>All stored on Mantle</span>
            </div>
            {onChainActions.length > 0 ? onChainActions.map((r, i) => {
              const date = new Date(r.ts * 1000).toLocaleString("sv-SE").replace("T", " ").slice(0, 16);
              const shortTx = r.tx_hash ? `${r.tx_hash.slice(0, 6)}…${r.tx_hash.slice(-4)}` : "—";
              return (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"28px 1fr auto", alignItems:"start", gap:12, padding:"14px 16px", borderBottom: i < onChainActions.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <AgentMonogram agent={r.agent_name as "atlas"|"nexus"|"shield"|"yield"} active/>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span className="mono-sm" style={{ color:"var(--fg-3)" }}>{date}</span>
                      <span className="tag" style={{ fontSize:9 }}>{r.agent_name}</span>
                      <span className="tag" style={{ fontSize:9, color: r.success ? "var(--accent)" : "var(--warn)", borderColor: r.success ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)" }}>{r.action_type}</span>
                    </div>
                    <p style={{ fontSize:12, color:"var(--fg-1)", lineHeight:1.5 }}>Action #{r.action_id} · {r.success ? "Success" : "Failed"}</p>
                  </div>
                  {r.tx_hash ? (
                    <a href={`https://sepolia.mantlescan.xyz/tx/${r.tx_hash}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)", whiteSpace:"nowrap" }}>
                      ↗ {shortTx}
                    </a>
                  ) : <span className="mono-sm" style={{ color:"var(--fg-3)" }}>—</span>}
                </div>
              );
            }) : (
              <div style={{ padding:"24px 16px", textAlign:"center", color:"var(--fg-3)", fontSize:12 }}>
                No on-chain actions yet. Agent actions will appear here after Atlas executes.
              </div>
            )}
          </div>
        </div>

        {/* Atlas chat sidebar */}
        {showAtlas && (
          <div className="panel" style={{ display:"flex", flexDirection:"column", height:"fit-content", position:"sticky", top:72 }}>
            <div className="panel-header">
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <AgentMonogram agent="atlas" active/>
                <span className="mono">Atlas</span>
              </div>
              <span className="live-dot"/>
            </div>
            <div style={{ padding:"12px", overflowY:"auto", maxHeight:400, display:"flex", flexDirection:"column", gap:10 }}>
              {atlasMessages.map((m, i) => (
                <div key={i} style={{ padding:"10px 12px", borderRadius:2, fontSize:12, lineHeight:1.55,
                  background: m.role === "user" ? "var(--bg-2)" : "var(--bg-0)",
                  border: m.role === "user" ? "1px solid var(--line-strong)" : "1px solid rgba(168,85,247,0.2)",
                  color:"var(--fg-0)", alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth:"90%",
                }}>
                  {m.body}
                </div>
              ))}
            </div>
            <div style={{ padding:"12px", borderTop:"1px solid var(--line)", display:"flex", gap:6 }}>
              <input className="input-field" style={{ fontSize:12 }} value={atlasInput} onChange={e => setAtlasInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendAtlas()} placeholder="Ask Atlas about your portfolio…"/>
              <button className="btn btn-primary btn-sm" onClick={sendAtlas}>→</button>
              <a href="/voice" title="Talk to Atlas (voice)">
                <button className="btn btn-sm" style={{ color:"var(--warn)", borderColor:"rgba(245,158,11,0.3)", padding:"0 10px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="9" y="2" width="6" height="12" rx="3"/>
                    <path d="M5 10a7 7 0 0 0 14 0"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </button>
              </a>
            </div>
          </div>
        )}
      </div>

      {!isConnected && (
        <div style={{ marginTop:24, padding:"14px 18px", background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:2, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, color:"var(--warn)" }}>⚠ Connect wallet to load your live RWA balance from Mantle — figures above are a $10,000 demo simulation</span>
        </div>
      )}
      {isConnected && !wallet.isLoading && !wallet.hasBalance && (
        <div style={{ marginTop:24, padding:"14px 18px", background:"rgba(0,229,160,0.04)", border:"1px solid rgba(0,229,160,0.2)", borderRadius:2, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <span style={{ fontSize:13, color:"var(--fg-2)" }}>Wallet connected — no USDY, mETH, mUSD or fBTC detected on Mantle Sepolia. Buy assets on Market or get testnet tokens.</span>
          <a href="/market" style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--accent)", whiteSpace:"nowrap", textDecoration:"none" }}>Go to Market →</a>
        </div>
      )}

      {/* Bridge utility */}
      <div style={{ marginTop:16, padding:"12px 16px", background:"var(--bg-1)", border:"1px solid var(--line)", borderRadius:2, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <div>
          <span className="mono-sm" style={{ color:"var(--fg-2)" }}>Need MNT or USDY on Mantle?</span>
          <span className="mono-sm" style={{ color:"var(--fg-3)", marginLeft:8 }}>Bridge assets from L1 or swap on Mantle.</span>
        </div>
        <a href="/bridge">
          <button className="btn btn-sm btn-ghost" style={{ whiteSpace:"nowrap" }}>Bridge →</button>
        </a>
      </div>
    </div>
  );
}
