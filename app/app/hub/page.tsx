"use client";

import { useState, useEffect } from "react";
import { AgentMonogram, AGENTS } from "@/components/agents/AgentMonogram";
import { ADDRESSES } from "@/lib/contracts";
import { useAgentStatus } from "@/hooks/useAgentStatus";

type AgentId = keyof typeof AGENTS;

const ERC8004_EXPLORER = "https://sepolia.mantlescan.xyz/address";
const TX_EXPLORER      = "https://sepolia.mantlescan.xyz/tx";

interface OnChainAction {
  action_id:   number;
  agent_id:    number;
  agent_name:  string;
  action_type: string;
  success:     boolean;
  block_number: number;
  tx_hash:     string;
  ts:          number;
}

const TYPE_COLOR: Record<string, string> = {
  tokenization:        "var(--nexus)",
  compliance_review:   "var(--shield)",
  allocation:          "var(--atlas)",
  rebalance:           "var(--atlas)",
  market_purchase:     "var(--accent)",
  market_sell:         "var(--warn)",
  yield_update:        "var(--yield)",
};

function fmtTs(ts: number) {
  return new Date(ts * 1000).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

export default function HubPage() {
  const [selected, setSelected] = useState<AgentId>("atlas");
  const { data: status, loading } = useAgentStatus();
  const [actions, setActions]   = useState<OnChainAction[]>([]);
  const [actLoading, setActLoading] = useState(false);

  const agent = AGENTS[selected];

  function rep(id: AgentId)      { return status?.[id] ? status[id].reputation.toFixed(2) : agent.rep.toFixed(2); }
  function score(id: AgentId)    { return status?.[id]?.localScore ?? 75; }
  function erc8004Id(id: AgentId){ return status?.[id]?.erc8004_id ?? null; }
  function totalCount(id: AgentId){ return status?.[id]?.actionCount ?? 0; }

  useEffect(() => {
    setActLoading(true);
    fetch(`/api/agents/stats/actions?agent=${selected}&limit=8`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : { actions: [] })
      .then(d  => setActions(d.actions ?? []))
      .catch(() => setActions([]))
      .finally(() => setActLoading(false));
  }, [selected]);

  return (
    <div style={{ maxWidth:1480, margin:"0 auto", padding:"32px" }}>
      <div style={{ marginBottom:32 }}>
        <div className="mono" style={{ color:"var(--accent)", marginBottom:8 }}>§ agent hub · ERC-8004 registered</div>
        <h1 className="display" style={{ fontSize:64 }}>Four sovereign agents. <span style={{ fontStyle:"italic", color:"var(--fg-2)" }}>One platform.</span></h1>
      </div>

      {/* Agent cards */}
      <div className="rp-agents-4" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0, border:"1px solid var(--line)", marginBottom:32 }}>
        {(Object.values(AGENTS) as typeof AGENTS[AgentId][]).map((a, i) => (
          <div key={a.id}
            onClick={() => setSelected(a.id as AgentId)}
            style={{
              padding:"24px 22px", cursor:"pointer", transition:"background 150ms",
              background: selected === a.id ? "var(--bg-2)" : "var(--bg-1)",
              borderRight: i < 3 ? "1px solid var(--line)" : "none",
              borderBottom: selected === a.id ? `2px solid var(--${a.id})` : "2px solid transparent",
            }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <AgentMonogram agent={a.id as AgentId} size="lg" active={selected === a.id}/>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span className="live-dot" style={{ background:`var(--${a.id})`, boxShadow:`0 0 6px var(--${a.id})` }}/>
                <span className="mono-sm" style={{ color:`var(--${a.id})` }}>ONLINE</span>
              </div>
            </div>
            <div className="display" style={{ fontSize:28, marginBottom:4 }}>{a.name}</div>
            <div className="mono-sm" style={{ color:`var(--${a.id})`, marginBottom:10 }}>{a.role}</div>
            <p style={{ fontSize:12, color:"var(--fg-1)", lineHeight:1.5, marginBottom:14 }}>{a.blurb}</p>
            <div style={{ display:"flex", justifyContent:"space-between", paddingTop:12, borderTop:"1px solid var(--line)" }}>
              <div>
                <div className="mono-sm" style={{ marginBottom:2 }}>REPUTATION</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:20, color:"var(--fg-0)" }}>{loading ? "…" : rep(a.id as AgentId)}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div className="mono-sm" style={{ marginBottom:2 }}>ERC-8004 ID</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:20, color:"var(--fg-0)" }}>#{loading ? "…" : (erc8004Id(a.id as AgentId) ?? "—")}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      <div className="rp-two-col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>

        {/* Left: agent details */}
        <div className="panel">
          <div className="panel-header">
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <AgentMonogram agent={selected} size="lg" active/>
              <div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--fg-0)" }}>{agent.name}</div>
                <div className="mono-sm" style={{ color:`var(--${selected})` }}>{agent.role}</div>
              </div>
            </div>
            <a href={`${ERC8004_EXPLORER}/${ADDRESSES.ERC8004_Identity}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>
              ↗ ERC-8004 Identity
            </a>
          </div>
          <div style={{ padding:"16px" }}>
            <div className="mono-sm" style={{ marginBottom:10 }}>TOOLS</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:20 }}>
              {agent.tools.map(t => (
                <span key={t} className="tag" style={{ fontSize:10, color:`var(--${selected})`, borderColor:`var(--${selected})40` }}>{t}()</span>
              ))}
            </div>
            <div className="mono-sm" style={{ marginBottom:10 }}>ERC-8004 IDENTITY</div>
            <div style={{ background:"var(--bg-0)", border:"1px solid var(--line)", borderRadius:2, padding:"10px 12px", marginBottom:16 }}>
              <div className="mono-sm" style={{ textTransform:"none", letterSpacing:0, color:"var(--fg-1)", fontFamily:"var(--font-mono)", fontSize:11 }}>
                Identity Registry: {ADDRESSES.ERC8004_Identity}<br/>
                Reputation Registry: {ADDRESSES.ERC8004_Reputation}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ background:"var(--bg-0)", border:"1px solid var(--line)", padding:"12px", borderRadius:2 }}>
                <div className="mono-sm" style={{ marginBottom:6 }}>REPUTATION SCORE</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:28, color:`var(--${selected})` }}>{loading ? "…" : rep(selected)}</div>
                <div className="mono-sm" style={{ color:"var(--fg-2)", marginTop:4 }}>Score {loading ? "…" : score(selected)}/100 · Level {status?.[selected]?.autonomyLevel ?? 3}</div>
              </div>
              <div style={{ background:"var(--bg-0)", border:"1px solid var(--line)", padding:"12px", borderRadius:2 }}>
                <div className="mono-sm" style={{ marginBottom:6 }}>ON-CHAIN ACTIONS</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:28, color:"var(--fg-0)" }}>{loading ? "…" : totalCount(selected)}</div>
                <div className="mono-sm" style={{ color:"var(--fg-2)", marginTop:4 }}>Recorded on Mantle</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: real on-chain actions */}
        <div className="panel">
          <div className="panel-header">
            <span className="mono">Recent on-chain actions · {agent.name}</span>
            <a href={`${ERC8004_EXPLORER}/${ADDRESSES.AgentExecutor}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>
              ↗ AgentExecutor.sol
            </a>
          </div>

          {actLoading ? (
            <div style={{ padding:"32px 16px", textAlign:"center", color:"var(--fg-3)", fontSize:12 }}>Loading…</div>
          ) : actions.length === 0 ? (
            <div style={{ padding:"32px 16px", textAlign:"center" }}>
              <div className="mono-sm" style={{ color:"var(--fg-3)", marginBottom:8 }}>No on-chain actions recorded yet</div>
              <div className="mono-sm" style={{ color:"var(--fg-3)" }}>Actions appear after {agent.name} executes on Mantle Sepolia</div>
            </div>
          ) : (
            actions.map((a, i) => (
              <div key={a.action_id ?? i} style={{
                display:"grid", gridTemplateColumns:"auto 1fr auto",
                alignItems:"center", gap:12, padding:"12px 16px",
                borderBottom: i < actions.length - 1 ? "1px solid var(--line)" : "none",
              }}>
                {/* Status dot */}
                <div style={{
                  width:7, height:7, borderRadius:"50%",
                  background: a.success ? "var(--accent)" : "var(--warn)",
                  boxShadow: `0 0 6px ${a.success ? "var(--accent)" : "var(--warn)"}`,
                  flexShrink:0,
                }} />
                <div>
                  {/* Action type badge */}
                  <span className="tag" style={{
                    fontSize:9, marginBottom:4, display:"inline-block",
                    color: TYPE_COLOR[a.action_type] ?? "var(--fg-2)",
                    borderColor: `${TYPE_COLOR[a.action_type] ?? "var(--line)"}40`,
                  }}>
                    {a.action_type.replace(/_/g, " ").toUpperCase()}
                  </span>
                  <div className="mono-sm" style={{ color:"var(--fg-3)", marginTop:2 }}>
                    Block #{a.block_number?.toLocaleString() ?? "—"} · {a.ts ? fmtTs(a.ts) : "—"}
                  </div>
                </div>
                {/* Tx link */}
                {a.tx_hash ? (
                  <a href={`${TX_EXPLORER}/${a.tx_hash}`} target="_blank" rel="noopener noreferrer"
                    className="mono-sm" style={{ color:"var(--accent)", whiteSpace:"nowrap" }}>
                    {a.tx_hash.slice(0,6)}…{a.tx_hash.slice(-4)} ↗
                  </a>
                ) : (
                  <span className="mono-sm" style={{ color:"var(--fg-3)" }}>—</span>
                )}
              </div>
            ))
          )}

          <div style={{ padding:"12px 16px", borderTop:"1px solid var(--line)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span className="mono-sm">All actions stored permanently on Mantle</span>
            <a href={`${ERC8004_EXPLORER}/${ADDRESSES.AgentExecutor}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>
              {loading ? "…" : totalCount(selected)} total · view all ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
