"use client";

import { useState, useEffect } from "react";
import { getWalletClient } from "wagmi/actions";
import { AgentMonogram } from "@/components/agents/AgentMonogram";
import { useAccount } from "wagmi";
import { parseEther, type Address } from "viem";
import { agentApi, type AgentChatResponse } from "@/lib/agent-api";
import { MANTLE_ASSETS } from "@/lib/contracts";
import { mantleTestnet, wagmiConfig } from "@/lib/wagmi";

const ALLOCATIONS = [
  { symbol:"USDY", name:"Ondo US Dollar Yield", pct:60, apy:4.20, color:"var(--accent)",  value:6000 },
  { symbol:"MI4",  name:"Mantle Index 4",        pct:25, apy:5.81, color:"var(--shield)",  value:2500 },
  { symbol:"mETH", name:"Mantle Staked ETH",     pct:15, apy:6.12, color:"var(--atlas)",   value:1500 },
];

interface OnChainAction {
  action_id: number;
  agent_name: string;
  action_type: string;
  tx_hash: string;
  ts: number;
  success: boolean;
}

const BLENDED_APY = ALLOCATIONS.reduce((acc, a) => acc + (a.pct/100) * a.apy, 0);
const TOTAL_VALUE = 10000;
const MONTHLY_INCOME = (TOTAL_VALUE * BLENDED_APY / 100) / 12;

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [showAtlas, setShowAtlas] = useState(false);
  const [atlasInput, setAtlasInput] = useState("");
  const [autonomyAmount, setAutonomyAmount] = useState("100");
  const [autonomyDays, setAutonomyDays] = useState("7");
  const [autonomyBusy, setAutonomyBusy] = useState(false);
  const [autonomyStatus, setAutonomyStatus] = useState("Atlas autonomy is not enabled for this wallet.");
  const [autonomyTx, setAutonomyTx] = useState("");
  const [atlasMessages, setAtlasMessages] = useState<Array<{ role: string; body: string }>>([
    { role:"agent", body:"Your portfolio is performing well. USDY at 4.20%, MI4 up 14bps this week. Blended yield: 4.71%. No rebalance needed today — all allocations within 10% threshold." }
  ]);
  const [onChainActions, setOnChainActions] = useState<OnChainAction[]>([]);

  useEffect(() => {
    agentApi<{ actions: OnChainAction[] }>("/stats/actions?limit=10")
      .then(d => { if (d.actions?.length) setOnChainActions(d.actions); })
      .catch(() => {});
  }, []);

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

  const enableAtlasAutonomy = async () => {
    if (!address) {
      setAutonomyStatus("Connect wallet before signing Atlas autonomy consent.");
      return;
    }

    try {
      setAutonomyBusy(true);
      setAutonomyTx("");
      setAutonomyStatus("Preparing HybridVault EIP-712 consent...");

      const amountWei = parseEther(autonomyAmount || "0").toString();
      const days = Math.max(1, Number(autonomyDays) || 1);
      const expiry = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
      const token = MANTLE_ASSETS.USDY.address;

      const consent = await agentApi<{
        typedData: Record<string, unknown>;
        agent: string;
        vault: string;
        nonce: string;
      }>("/vault/consent", {
        method: "POST",
        body: JSON.stringify({
          user_address: address,
          token,
          amount_wei: amountWei,
          expiry,
        }),
      });

      setAutonomyStatus("Wallet signature requested. This grants Atlas a capped HybridVault allowance.");
      const walletClient = await getWalletClient(wagmiConfig, { chainId: mantleTestnet.id });
      const signature = await walletClient.request({
        method: "eth_signTypedData_v4",
        params: [address as Address, JSON.stringify(consent.typedData)],
      });

      setAutonomyStatus("Relaying signed allowance to HybridVault...");
      const relay = await agentApi<{ onChainTx: string }>("/vault/relay-allowance", {
        method: "POST",
        body: JSON.stringify({
          user_address: address,
          token,
          amount_wei: amountWei,
          expiry,
          nonce: consent.nonce,
          signature,
          agent_address: consent.agent,
        }),
      });

      setAutonomyTx(relay.onChainTx);
      setAutonomyStatus(`Atlas autonomy enabled through HybridVault ${consent.vault.slice(0, 10)}...${consent.vault.slice(-6)}.`);
    } catch (error) {
      setAutonomyStatus(error instanceof Error ? error.message : "Unable to enable Atlas autonomy.");
    } finally {
      setAutonomyBusy(false);
    }
  };

  return (
    <div style={{ maxWidth:1480, margin:"0 auto", padding:"32px" }}>
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
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0, border:"1px solid var(--line)", marginBottom:24 }}>
        {[
          { label:"Portfolio Value", value:`$${TOTAL_VALUE.toLocaleString()}`, sub:"Conservative strategy" },
          { label:"Blended APY",     value:`${BLENDED_APY.toFixed(2)}%`,       sub:"Atlas optimized" },
          { label:"Monthly Income",  value:`$${MONTHLY_INCOME.toFixed(2)}`,     sub:"Est. distribution" },
          { label:"Risk Score",      value:"3 / 10",                            sub:"Low risk" },
        ].map(({ label, value, sub }, i) => (
          <div key={i} style={{ padding:"16px 18px", borderRight: i < 3 ? "1px solid var(--line)" : "none" }}>
            <div className="mono-sm" style={{ marginBottom:6 }}>{label}</div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:28, color:"var(--fg-0)" }}>{value}</div>
            <div className="mono-sm" style={{ color:"var(--accent)", marginTop:4 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginBottom:24 }}>
        <div className="panel-header">
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <AgentMonogram agent="atlas" active/>
            <span className="mono">Autonomous agent control · HybridVault</span>
          </div>
          <span className="mono-sm" style={{ color:"var(--atlas)" }}>EIP-712 capped consent</span>
        </div>
        <div style={{ padding:"16px", display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:12, alignItems:"end" }}>
          <label style={{ display:"grid", gap:6 }}>
            <span className="mono-sm">USDY allowance</span>
            <input className="input-field" value={autonomyAmount} onChange={e => setAutonomyAmount(e.target.value.replace(/[^\d.]/g, ""))}/>
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="mono-sm">Expiry days</span>
            <input className="input-field" value={autonomyDays} onChange={e => setAutonomyDays(e.target.value.replace(/[^\d]/g, ""))}/>
          </label>
          <button className="btn btn-primary" onClick={enableAtlasAutonomy} disabled={!isConnected || autonomyBusy}>
            {autonomyBusy ? "Signing..." : "Enable Atlas"}
          </button>
        </div>
        <div style={{ padding:"0 16px 16px", display:"flex", justifyContent:"space-between", gap:12, alignItems:"center" }}>
          <span className="mono-sm" style={{ color:"var(--fg-2)", textTransform:"none", letterSpacing:0 }}>{autonomyStatus}</span>
          {autonomyTx && (
            <a href={`https://sepolia.mantlescan.xyz/tx/${autonomyTx}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)", whiteSpace:"nowrap" }}>
              ↗ {autonomyTx.slice(0, 10)}...{autonomyTx.slice(-6)}
            </a>
          )}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns: showAtlas ? "1fr 380px" : "1fr", gap:24 }}>
        <div>
          {/* Allocation chart */}
          <div className="panel" style={{ marginBottom:24 }}>
            <div className="panel-header">
              <span className="mono">Allocation · {ALLOCATIONS.length} assets</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <AgentMonogram agent="atlas" active/>
                <span className="mono-sm" style={{ color:"var(--atlas)" }}>Atlas managed</span>
              </div>
            </div>
            <div style={{ padding:"20px" }}>
              {/* Bar chart */}
              <div style={{ display:"flex", height:40, borderRadius:2, overflow:"hidden", marginBottom:20, gap:2 }}>
                {ALLOCATIONS.map(a => (
                  <div key={a.symbol} style={{ flex:a.pct, background:a.color, opacity:0.7, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--bg-0)", fontWeight:600 }}>{a.pct}%</span>
                  </div>
                ))}
              </div>
              {/* Asset rows */}
              {ALLOCATIONS.map(a => (
                <div key={a.symbol} style={{ display:"grid", gridTemplateColumns:"28px 1fr 80px 80px 80px", alignItems:"center", gap:14, padding:"12px 0", borderBottom:"1px solid var(--line)" }}>
                  <div style={{ width:12, height:12, borderRadius:2, background:a.color, opacity:0.8 }}/>
                  <div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--fg-0)" }}>{a.symbol}</div>
                    <div className="mono-sm" style={{ textTransform:"none", letterSpacing:0, color:"var(--fg-2)" }}>{a.name}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div className="mono-sm" style={{ marginBottom:2 }}>ALLOCATION</div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:15, color:"var(--fg-0)" }}>{a.pct}%</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div className="mono-sm" style={{ marginBottom:2 }}>APY</div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:15, color:"var(--accent)" }}>{a.apy.toFixed(2)}%</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div className="mono-sm" style={{ marginBottom:2 }}>VALUE</div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:15, color:"var(--fg-0)" }}>${a.value.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
            </div>
          </div>
        )}
      </div>

      {!isConnected && (
        <div style={{ marginTop:24, padding:"14px 18px", background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:2, fontSize:13, color:"var(--warn)" }}>
          ⚠ Connect wallet to load your live portfolio from Mantle
        </div>
      )}
    </div>
  );
}
