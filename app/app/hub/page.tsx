"use client";

import { useState } from "react";
import { AgentMonogram, AGENTS } from "@/components/agents/AgentMonogram";
import { ADDRESSES } from "@/lib/contracts";
import { useAgentStatus } from "@/hooks/useAgentStatus";

type AgentId = keyof typeof AGENTS;

const ERC8004_EXPLORER = "https://sepolia.mantlescan.xyz/address";

export default function HubPage() {
  const [selected, setSelected] = useState<AgentId>("atlas");
  const agent = AGENTS[selected];
  const { data: status, loading } = useAgentStatus();

  function rep(id: AgentId): string {
    return status?.[id] ? status[id].reputation.toFixed(2) : agent.rep.toFixed(2);
  }
  function score(id: AgentId): number {
    return status?.[id]?.localScore ?? 75;
  }
  function erc8004Id(id: AgentId): number | null {
    return status?.[id]?.erc8004_id ?? null;
  }
  function actionCount(id: AgentId): number {
    return status?.[id]?.actionCount ?? 0;
  }

  return (
    <div style={{ maxWidth:1480, margin:"0 auto", padding:"32px" }}>
      <div style={{ marginBottom:32 }}>
        <div className="mono" style={{ color:"var(--accent)", marginBottom:8 }}>§ agent hub · ERC-8004 registered</div>
        <h1 className="display" style={{ fontSize:64 }}>Four sovereign agents. <span style={{ fontStyle:"italic", color:"var(--fg-2)" }}>One platform.</span></h1>
      </div>

      {/* Agent cards row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0, border:"1px solid var(--line)", marginBottom:32 }}>
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
              <div><div className="mono-sm" style={{ marginBottom:2 }}>REPUTATION</div><div style={{ fontFamily:"var(--font-mono)", fontSize:20, color:"var(--fg-0)" }}>{loading ? "…" : rep(a.id as AgentId)}</div></div>
              <div style={{ textAlign:"right" }}><div className="mono-sm" style={{ marginBottom:2 }}>ERC-8004 ID</div><div style={{ fontFamily:"var(--font-mono)", fontSize:20, color:"var(--fg-0)" }}>#{loading ? "…" : (erc8004Id(a.id as AgentId) ?? "—")}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail panel for selected agent */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>

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
            <a href={`${ERC8004_EXPLORER}/${ADDRESSES.ERC8004_Identity}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)", cursor:"pointer" }}>
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
                <div style={{ fontFamily:"var(--font-mono)", fontSize:28, color:"var(--fg-0)" }}>{loading ? "…" : actionCount(selected)}</div>
                <div className="mono-sm" style={{ color:"var(--fg-2)", marginTop:4 }}>Recorded on Mantle</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: recent actions */}
        <div className="panel">
          <div className="panel-header">
            <span className="mono">Recent on-chain actions</span>
            <a href={`${ERC8004_EXPLORER}/${ADDRESSES.AgentExecutor}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>
              ↗ AgentExecutor.sol
            </a>
          </div>
          <div>
            {actionCount(selected) === 0 ? (
              <div style={{ padding:"32px 16px", textAlign:"center" }}>
                <div className="mono-sm" style={{ color:"var(--fg-3)", marginBottom:8 }}>No on-chain actions recorded yet</div>
                <div className="mono-sm" style={{ color:"var(--fg-3)" }}>Actions appear here after the agent executes on Mantle Sepolia</div>
              </div>
            ) : (
              <div style={{ padding:"16px", color:"var(--fg-2)", fontSize:12, fontFamily:"var(--font-mono)" }}>
                {actionCount(selected)} action{actionCount(selected) !== 1 ? "s" : ""} recorded — view on explorer ↗
              </div>
            )}
          </div>
          <div style={{ padding:"12px 16px", borderTop:"1px solid var(--line)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span className="mono-sm">All actions stored permanently on Mantle</span>
            <a href={`${ERC8004_EXPLORER}/${ADDRESSES.AgentExecutor}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>
              {loading ? "…" : actionCount(selected)} total · view all ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
