"use client";

import { useState, useEffect, useRef } from "react";
import { AgentMonogram, AGENTS } from "@/components/agents/AgentMonogram";
import { MeshBackground } from "@/components/ui/MeshBackground";
import { agentApi, type AgentChatResponse } from "@/lib/agent-api";

// ── Transcript data ───────────────────────────────────────────────
type MsgKind = "text" | "reasoning" | "tool" | "plan-options";
interface Alloc { sym: string; pct: number; apy: string; risk: string; reason: string; }
interface Plan  { id: string; name: string; confidence: number; recommended: boolean; expected: string; cvar: string; tag: string; allocation: Alloc[]; }
interface Msg {
  role: string; kind: MsgKind;
  body?: string;
  steps?: string[];
  tool?: string; args?: string; result?: Record<string, string>; latency?: string;
  plans?: Plan[];
}

const TRANSCRIPT: Msg[] = [
  { role: "atlas", kind: "text", body: "I'm Atlas. I orchestrate the other three agents to plan and run your portfolio. Tell me what you want to do — or pick a starter below." },
  { role: "user",  kind: "text", body: "I have $10k. Build me a few strategy options to compare." },
  { role: "atlas", kind: "reasoning", steps: [
    "Parsing intent: amount=10000 USD, multiple-options requested",
    "Delegating yield_diff() → Yield agent",
    "Delegating risk_scan() → Shield agent",
    "Generating 3 allocation candidates across risk tiers",
  ]},
  { role: "yield", kind: "tool", tool: "yield_feed", args: "sources=3", result: { USDY: "4.20%", MI4: "5.81%", mETH: "6.12%" }, latency: "0.42s" },
  { role: "shield", kind: "tool", tool: "risk_scan",  args: "assets=[USDY,MI4,mETH]", result: { USDY: "low", MI4: "low-mid", mETH: "mid" }, latency: "0.61s" },
  { role: "atlas", kind: "text", body: "I prepared 3 plans across risk tiers. Pick one — I'll handle execution end-to-end. You only approve once." },
  { role: "atlas", kind: "plan-options", plans: [
    { id: "cons", name: "Conservative", confidence: 94, recommended: true,  expected: "4.78%", cvar: "1.84%", tag: "matches your past behavior",
      allocation: [{ sym: "USDY", pct: 60, apy: "4.20%", risk: "low",     reason: "Treasury-backed stability anchor" },
                   { sym: "MI4",  pct: 30, apy: "5.81%", risk: "low-mid", reason: "Diversified Mantle blue-chips" },
                   { sym: "mETH", pct: 10, apy: "6.12%", risk: "mid",     reason: "Modest upside via liquid-staked ETH" }]},
    { id: "bal",  name: "Balanced",     confidence: 88, recommended: false, expected: "5.41%", cvar: "3.20%", tag: "modest upside",
      allocation: [{ sym: "USDY", pct: 35, apy: "4.20%", risk: "low",     reason: "Stability buffer" },
                   { sym: "MI4",  pct: 40, apy: "5.81%", risk: "low-mid", reason: "Core exposure" },
                   { sym: "mETH", pct: 25, apy: "6.12%", risk: "mid",     reason: "Yield kicker" }]},
    { id: "aggr", name: "Aggressive",   confidence: 82, recommended: false, expected: "5.92%", cvar: "5.40%", tag: "higher CVaR",
      allocation: [{ sym: "USDY", pct: 15, apy: "4.20%", risk: "low",     reason: "Minimum buffer" },
                   { sym: "MI4",  pct: 35, apy: "5.81%", risk: "low-mid", reason: "Diversified core" },
                   { sym: "mETH", pct: 50, apy: "6.12%", risk: "mid",     reason: "Maximum yield seek" }]},
  ]},
];

const BEATS = [600, 900, 1400, 1100, 1300, 900, 0];

// ── Count-up hook ─────────────────────────────────────────────────
function useCountUp(target: number, duration = 700) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current, to = target;
    if (from === to) return;
    const start = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ── Orchestration state ───────────────────────────────────────────
function orchState(step: number) {
  const s = Math.min(step, 7);
  return {
    step: s,
    status: {
      atlas:  s < 2 ? "idle" : s < 6 ? "thinking" : "done",
      yield:  s < 3 ? "idle" : s < 4 ? "thinking" : "done",
      shield: s < 4 ? "idle" : s < 5 ? "thinking" : "done",
      nexus:  "idle",
    } as Record<string, string>,
    activeEdge: s === 2 ? "reasoning" : s === 3 ? "yield" : s === 4 ? "shield" : s === 5 ? "aggregate" : null,
    tokens: {
      atlas:  s < 2 ? 0 : s < 5 ? Math.round(420 + (s - 2) * 280) : 1240,
      yield:  s < 3 ? 0 : s < 4 ? 320 : 642,
      shield: s < 4 ? 0 : s < 5 ? 410 : 891,
    },
    confidence: [
      { key: "intent_parse", value: 98, agent: "atlas",  unlockAt: 2 },
      { key: "yield_data",   value: 94, agent: "yield",  unlockAt: 3 },
      { key: "risk_score",   value: 91, agent: "shield", unlockAt: 4 },
      { key: "allocation",   value: 92, agent: "atlas",  unlockAt: 5 },
    ],
  };
}

const PHASE_LABELS = ["waiting","parsing intent","reasoning","fetching yields","risk scan","composing plans","awaiting approval"];

// ── Sub-components ────────────────────────────────────────────────
function ThinkingDots({ agent }: { agent: string }) {
  return (
    <div className="msg-in" style={{ display:"grid", gridTemplateColumns:"32px 1fr", gap:12, alignItems:"center" }}>
      <AgentMonogram agent={agent as "atlas"} active />
      <div style={{ display:"flex", gap:4, padding:"10px 0" }}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            width:6, height:6, borderRadius:"50%", background:`var(--${agent})`,
            animation:`pulse-dot 1.2s ${i * 0.15}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function TokenRow({ id, color, target, busy }: { id: string; color: string; target: number; busy: boolean }) {
  const v = useCountUp(target, 800);
  const pct = Math.min(100, (v / 1500) * 100);
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, alignItems:"center" }}>
        <span className="mono-sm" style={{ color, display:"flex", alignItems:"center", gap:6 }}>
          {busy && <span style={{ width:6, height:6, borderRadius:"50%", background:color, animation:"pulseDot 1s ease-out infinite" }} />}
          {id}
        </span>
        <span className="mono-sm" style={{ color: busy ? color : "var(--fg-1)" }}>{v} tok</span>
      </div>
      <div style={{ height:4, background:"var(--bg-2)", position:"relative", overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, transition:"width 600ms cubic-bezier(0.4,0,0.2,1)" }} />
        {busy && <div style={{ position:"absolute", inset:0, background:`linear-gradient(90deg,transparent,${color},transparent)`, opacity:0.3, animation:"tokenSweep 1.4s linear infinite" }} />}
      </div>
    </div>
  );
}

function ConfidenceRow({ entry, unlocked, delay }: { entry: { key:string; value:number; agent:string }; unlocked:boolean; delay:number }) {
  const v = useCountUp(unlocked ? entry.value : 0, 800);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 60px 30px", alignItems:"center", gap:8, padding:"6px 0", opacity: unlocked ? 1 : 0.35, transition:`opacity 400ms ${delay}ms ease` }}>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:12, display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background: unlocked ? `var(--${entry.agent})` : "var(--bg-3)", transition:"background 300ms" }} />
        {entry.key}
      </span>
      <div style={{ height:3, background:"var(--bg-2)", position:"relative", overflow:"hidden" }}>
        <div style={{ width:`${v}%`, height:"100%", background: v > 90 ? "var(--accent)" : "var(--warn)", transition:"width 600ms cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
      <span className="mono-sm" style={{ color: unlocked ? "var(--fg-1)" : "var(--fg-3)" }}>{unlocked ? v : "—"}</span>
    </div>
  );
}

function CallGraph({ status, activeEdge, animKey }: { status: Record<string,string>; activeEdge: string|null; animKey: number }) {
  const active = (a: string) => status[a] === "thinking";
  const done   = (a: string) => status[a] === "done";
  const eColor = (a: string) => active(a) ? `var(--${a})` : done(a) ? "var(--accent)" : "var(--line-strong)";
  const edgeOn = (e: string) => activeEdge === e;

  return (
    <svg viewBox="0 0 280 180" width="100%" style={{ display:"block" }}>
      <defs>
        <marker id="arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="var(--fg-3)" />
        </marker>
      </defs>

      <line x1="140" y1="40" x2="60"  y2="120" stroke={eColor("yield")}  strokeWidth="1.5" markerEnd="url(#arr)" strokeDasharray={edgeOn("yield")  ? "4 4" : "none"} style={{ animation: edgeOn("yield")  ? "edgeDash 0.8s linear infinite" : "none" }} />
      <line x1="140" y1="40" x2="220" y2="120" stroke={eColor("shield")} strokeWidth="1.5" markerEnd="url(#arr)" strokeDasharray={edgeOn("shield") ? "4 4" : "none"} style={{ animation: edgeOn("shield") ? "edgeDash 0.8s linear infinite" : "none" }} />
      <line x1="140" y1="40" x2="140" y2="120" stroke="var(--line-strong)" strokeDasharray="3 3" strokeWidth="1.5" />

      {edgeOn("yield") && (
        <circle key={`py-${animKey}`} r="4" fill="var(--yield)">
          <animate attributeName="cx" values="140;60"  dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="cy" values="40;120"  dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}
      {edgeOn("shield") && (
        <circle key={`ps-${animKey}`} r="4" fill="var(--shield)">
          <animate attributeName="cx" values="140;220" dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="cy" values="40;120"  dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}
      {edgeOn("aggregate") && (<>
        <circle r="3" fill="var(--yield)">
          <animate attributeName="cx" values="60;140"  dur="0.9s" repeatCount="indefinite" />
          <animate attributeName="cy" values="120;40"  dur="0.9s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0" dur="0.9s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="var(--shield)">
          <animate attributeName="cx" values="220;140" dur="0.9s" repeatCount="indefinite" />
          <animate attributeName="cy" values="120;40"  dur="0.9s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0" dur="0.9s" repeatCount="indefinite" />
        </circle>
      </>)}

      {/* user */}
      <circle cx="140" cy="20" r="8" fill="var(--bg-3)" stroke="var(--line)" />
      <text x="140" y="23" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill="var(--fg-1)">U</text>

      {/* atlas */}
      {active("atlas") && <circle cx="140" cy="40" r="14" fill="none" stroke="var(--atlas)" strokeWidth="1"><animate attributeName="r" values="14;22" dur="1.4s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.8;0" dur="1.4s" repeatCount="indefinite" /></circle>}
      <circle cx="140" cy="40" r="14" fill="var(--bg-2)" stroke={active("atlas") ? "var(--atlas)" : done("atlas") ? "var(--accent)" : "var(--atlas)"} strokeWidth={active("atlas") ? "2" : "1.5"} style={{ transition:"all 300ms" }} />
      <text x="140" y="45" textAnchor="middle" fontFamily="var(--font-display)" fontStyle="italic" fontSize="18" fill="var(--atlas)">A</text>

      {/* yield */}
      {active("yield") && <circle cx="60" cy="135" r="13" fill="none" stroke="var(--yield)" strokeWidth="1"><animate attributeName="r" values="13;20" dur="1.4s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.8;0" dur="1.4s" repeatCount="indefinite" /></circle>}
      <circle cx="60" cy="135" r="13" fill="var(--bg-2)" stroke={done("yield") ? "var(--accent)" : "var(--yield)"} strokeWidth={active("yield") ? "2" : "1.5"} style={{ transition:"all 300ms" }} />
      <text x="60" y="140" textAnchor="middle" fontFamily="var(--font-display)" fontStyle="italic" fontSize="16" fill="var(--yield)">Y</text>

      {/* shield */}
      {active("shield") && <circle cx="220" cy="135" r="13" fill="none" stroke="var(--shield)" strokeWidth="1"><animate attributeName="r" values="13;20" dur="1.4s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.8;0" dur="1.4s" repeatCount="indefinite" /></circle>}
      <circle cx="220" cy="135" r="13" fill="var(--bg-2)" stroke={done("shield") ? "var(--accent)" : "var(--shield)"} strokeWidth={active("shield") ? "2" : "1.5"} style={{ transition:"all 300ms" }} />
      <text x="220" y="140" textAnchor="middle" fontFamily="var(--font-display)" fontStyle="italic" fontSize="16" fill="var(--shield)">S</text>

      {/* nexus dim */}
      <circle cx="140" cy="135" r="13" fill="var(--bg-1)" stroke="var(--line)" strokeDasharray="3 3" />
      <text x="140" y="140" textAnchor="middle" fontFamily="var(--font-display)" fontStyle="italic" fontSize="16" fill="var(--fg-3)">N</text>

      <text x="60"  y="162" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={active("yield")  ? "var(--yield)"  : "var(--fg-2)"}>{`YIELD${active("yield") ? " · …" : done("yield") ? " · ✓" : ""}`}</text>
      <text x="140" y="162" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-3)">NEXUS · idle</text>
      <text x="220" y="162" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill={active("shield") ? "var(--shield)" : "var(--fg-2)"}>{`SHIELD${active("shield") ? " · …" : done("shield") ? " · ✓" : ""}`}</text>
    </svg>
  );
}

function OrchestrationPanel({ visibleCount, animKey }: { visibleCount: number; animKey: number }) {
  const state = orchState(visibleCount);
  const totalTok = useCountUp(state.tokens.atlas + state.tokens.yield + state.tokens.shield);
  return (
    <aside style={{ borderLeft:"1px solid var(--line)", overflow:"auto", minHeight:0, display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"14px", borderBottom:"1px solid var(--line)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span className="mono">Orchestration · live</span>
        <span className="mono-sm" style={{ color:"var(--accent)", display:"flex", alignItems:"center", gap:6 }}>
          <span className="pulse-dot" />{state.activeEdge ? "ACTIVE" : "IDLE"}
        </span>
      </div>

      <div style={{ padding:"10px 14px", borderBottom:"1px solid var(--line)" }}>
        <div className="mono-sm" style={{ color:"var(--fg-3)", marginBottom:8 }}>step {state.step}/6 · {PHASE_LABELS[state.step] ?? "awaiting approval"}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:3 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ height:3, background: i < state.step ? "var(--accent)" : i === state.step ? "rgba(0,229,160,0.4)" : "var(--bg-2)", transition:"background 400ms ease", animation: i === state.step ? "phasePulse 1.4s ease-in-out infinite" : "none" }} />
          ))}
        </div>
      </div>

      <div style={{ padding:14, borderBottom:"1px solid var(--line)" }}>
        <div className="mono-sm" style={{ marginBottom:12 }}>Active call graph</div>
        <CallGraph status={state.status} activeEdge={state.activeEdge} animKey={animKey} />
      </div>

      <div style={{ padding:14, borderBottom:"1px solid var(--line)" }}>
        <div className="mono-sm" style={{ marginBottom:10, display:"flex", justifyContent:"space-between" }}>
          <span>Token usage · this run</span>
          <span style={{ color:"var(--fg-3)" }}>{totalTok.toLocaleString()} tok</span>
        </div>
        <TokenRow id="atlas"  color="var(--atlas)"  target={state.tokens.atlas}  busy={state.status.atlas  === "thinking"} />
        <TokenRow id="yield"  color="var(--yield)"  target={state.tokens.yield}  busy={state.status.yield  === "thinking"} />
        <TokenRow id="shield" color="var(--shield)" target={state.tokens.shield} busy={state.status.shield === "thinking"} />
      </div>

      <div style={{ padding:14 }}>
        <div className="mono-sm" style={{ marginBottom:10 }}>Confidence ledger</div>
        {state.confidence.map((c, i) => (
          <ConfidenceRow key={c.key} entry={c} unlocked={state.step >= c.unlockAt} delay={i * 80} />
        ))}
      </div>
    </aside>
  );
}

function PlanOptions({ plans }: { plans: Plan[] }) {
  const [selected, setSelected] = useState(plans.find(p => p.recommended)?.id ?? plans[0].id);
  const [approved, setApproved] = useState(false);
  const sel = plans.find(p => p.id === selected)!;

  return (
    <div className="msg-in" style={{ display:"grid", gridTemplateColumns:"32px 1fr", gap:12, maxWidth:920 }}>
      <AgentMonogram agent="atlas" active />
      <div>
        <div className="mono-sm" style={{ marginBottom:8, color:"var(--accent)" }}>● 3 PLANS GENERATED · pick one to approve</div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:12 }}>
          {plans.map((p, i) => {
            const isSel = p.id === selected;
            return (
              <div key={p.id} onClick={() => !approved && setSelected(p.id)}
                className="plan-option-card"
                style={{
                  position:"relative", cursor: approved ? "default" : "pointer", padding:"14px 14px 12px",
                  border: isSel ? "1px solid var(--accent)" : "1px solid var(--line)",
                  background: isSel ? "oklch(0.22 0.04 150 / 0.4)" : "var(--bg-1)",
                  boxShadow: isSel ? "0 0 0 2px oklch(0.85 0.18 150 / 0.18)" : "none",
                  transition:"all 0.2s", animationDelay:`${0.1 + i * 0.12}s`,
                }}>
                {p.recommended && (
                  <div style={{ position:"absolute", top:-8, left:12, background:"var(--accent)", color:"oklch(0.15 0 0)", fontFamily:"var(--font-mono)", fontSize:9, fontWeight:600, padding:"2px 8px", letterSpacing:"0.04em" }}>★ ATLAS PICKS THIS</div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontFamily:"var(--font-display)", fontSize:22 }}>{p.name}</div>
                  <div style={{ width:14, height:14, borderRadius:"50%", border:`1.5px solid ${isSel ? "var(--accent)" : "var(--line-strong)"}`, background: isSel ? "var(--accent)" : "transparent", display:"grid", placeItems:"center" }}>
                    {isSel && <div style={{ width:5, height:5, borderRadius:"50%", background:"var(--bg-0)" }} />}
                  </div>
                </div>
                <div className="mono-sm" style={{ color:"var(--fg-3)", marginBottom:10, minHeight:14 }}>{p.tag}</div>
                <div style={{ display:"flex", height:8, marginBottom:12, border:"1px solid var(--line)" }}>
                  {p.allocation.map(a => (
                    <div key={a.sym} style={{ width:`${a.pct}%`, background: a.sym === "USDY" ? "rgba(0,229,160,0.5)" : a.sym === "MI4" ? "var(--shield)" : "var(--atlas)" }} />
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, fontFamily:"var(--font-mono)", fontSize:11 }}>
                  <div><div style={{ color:"var(--fg-3)", fontSize:10 }}>EXPECTED</div><div style={{ color:"var(--accent)", fontSize:14, marginTop:2 }}>{p.expected}</div></div>
                  <div><div style={{ color:"var(--fg-3)", fontSize:10 }}>CVaR</div><div style={{ color:"var(--fg-0)", fontSize:14, marginTop:2 }}>{p.cvar}</div></div>
                </div>
                <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--line)", display:"flex", flexWrap:"wrap", gap:4 }}>
                  {p.allocation.map(a => (
                    <span key={a.sym} style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"2px 6px", background:"var(--bg-2)", color:"var(--fg-1)" }}>{a.sym} {a.pct}%</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {!approved && (
          <div className="panel" style={{ padding:"12px 14px", marginBottom:10, background:"var(--bg-1)" }}>
            <div className="mono-sm" style={{ marginBottom:8, color:"var(--fg-2)" }}>WHY THIS PLAN — <span style={{ color:"var(--accent)" }}>{sel.name}</span></div>
            {sel.allocation.map(a => (
              <div key={a.sym} style={{ display:"grid", gridTemplateColumns:"60px 40px 60px 1fr", gap:10, padding:"4px 0", fontFamily:"var(--font-mono)", fontSize:11, alignItems:"center" }}>
                <span style={{ color:"var(--fg-0)", fontWeight:500 }}>{a.sym}</span>
                <span style={{ color:"var(--fg-2)" }}>{a.pct}%</span>
                <span style={{ color:"var(--accent)" }}>{a.apy}</span>
                <span style={{ color:"var(--fg-1)", fontFamily:"var(--font-sans)", fontSize:12 }}>{a.reason}</span>
              </div>
            ))}
          </div>
        )}

        {!approved ? (
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", border:"1px solid var(--accent)", background:"oklch(0.22 0.04 150 / 0.25)" }}>
            <div>
              <div style={{ fontSize:13, color:"var(--fg-0)", fontWeight:500 }}>One-click approve · Atlas handles the rest</div>
              <div className="mono-sm" style={{ color:"var(--fg-2)", marginTop:2 }}>Atlas will execute on Mantle, monitor 24/7, and rebalance automatically.</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn btn-sm">Modify</button>
              <button className="btn btn-sm btn-primary" onClick={() => setApproved(true)}>✓ Approve {sel.name}</button>
            </div>
          </div>
        ) : (
          <div className="msg-in" style={{ display:"flex", gap:14, alignItems:"center", padding:"14px 16px", border:"1px solid var(--accent)", background:"oklch(0.22 0.04 150 / 0.35)" }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:"var(--accent)", display:"grid", placeItems:"center", color:"oklch(0.15 0 0)", fontSize:18, fontWeight:700, animation:"checkPop 480ms cubic-bezier(0.34,1.56,0.64,1)" }}>✓</div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"var(--font-display)", fontSize:18 }}>Approved · {sel.name}</div>
              <div className="mono-sm" style={{ color:"var(--fg-2)", marginTop:2 }}>Atlas is now executing on Mantle testnet · monitoring active</div>
            </div>
            <span className="tag tag-accent">● LIVE</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Message({ m, animKey }: { m: Msg; animKey: number }) {
  if (m.kind === "text") {
    const isUser = m.role === "user";
    return (
      <div className="msg-in" style={{ display:"grid", gridTemplateColumns:"32px 1fr", gap:12, alignItems:"flex-start", maxWidth:760 }}>
        {isUser
          ? <div style={{ width:32, height:32, borderRadius:"50%", background:"var(--bg-3)", display:"grid", placeItems:"center", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-1)" }}>YOU</div>
          : <AgentMonogram agent={m.role as "atlas"} active />}
        <div style={{ paddingTop:6 }}>
          <div className="mono-sm" style={{ marginBottom:6 }}>{isUser ? "YOU" : m.role.toUpperCase()}</div>
          <div style={{ fontSize:14, color:"var(--fg-0)", lineHeight:1.55 }}>{m.body}</div>
        </div>
      </div>
    );
  }
  if (m.kind === "reasoning") {
    return (
      <div className="msg-in" style={{ display:"grid", gridTemplateColumns:"32px 1fr", gap:12, maxWidth:760 }}>
        <AgentMonogram agent="atlas" active />
        <div className="panel" style={{ padding:"12px 14px", background:"var(--bg-1)" }}>
          <div className="mono-sm" style={{ color:"var(--accent)", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
            <span className="pulse-dot" /> reasoning · 0.4s
          </div>
          {m.steps!.map((s, i) => (
            <div key={i} className="reason-step" style={{ display:"grid", gridTemplateColumns:"20px 1fr", gap:10, padding:"4px 0", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--fg-1)", animationDelay:`${0.2 + i * 0.18}s` }}>
              <span style={{ color:"var(--fg-3)" }}>{String(i + 1).padStart(2, "0")}</span>
              <span>{s}<span className="caret-blink">_</span></span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (m.kind === "tool") {
    return (
      <div className="msg-in" style={{ display:"grid", gridTemplateColumns:"32px 1fr", gap:12, maxWidth:760 }}>
        <AgentMonogram agent={m.role as "yield"} active />
        <div className="panel tool-shimmer" style={{ padding:0 }}>
          <div style={{ padding:"8px 12px", borderBottom:"1px solid var(--line)", display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:12 }}>
              <span style={{ color:`var(--${m.role})` }}>{m.role}</span>.<span style={{ color:"var(--fg-0)" }}>{m.tool}</span>
              <span style={{ color:"var(--fg-3)" }}>({m.args})</span>
            </span>
            <span className="mono-sm" style={{ color:"var(--accent)" }}>✓ {m.latency}</span>
          </div>
          <div style={{ padding:12, fontFamily:"var(--font-mono)", fontSize:12 }}>
            {Object.entries(m.result!).map(([k, v], i) => (
              <div key={k} className="tool-row" style={{ display:"grid", gridTemplateColumns:"120px 1fr", padding:"3px 0", animationDelay:`${0.3 + i * 0.12}s` }}>
                <span style={{ color:"var(--fg-3)" }}>{k}</span>
                <span style={{ color:"var(--fg-0)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (m.kind === "plan-options") {
    return <PlanOptions plans={m.plans!} />;
  }
  return null;
}

// ── Main page ─────────────────────────────────────────────────────
const HISTORY = [
  ["Conservative $10k plan", "Atlas", "now", true],
  ["Tokenize Manhattan deed", "Nexus + Shield", "2h", false],
  ["MI4 yield drift alert", "Yield", "yest", false],
  ["Portfolio rebalance Q2", "Atlas", "3d", false],
] as const;

const SUGGESTIONS = [
  "Show alternative allocations",
  "Stress-test against -20% MI4",
  "Execute on testnet",
  "Explain CVaR",
];

export default function ChatPage() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [animKey, setAnimKey]           = useState(0);
  const [extraMessages, setExtraMessages] = useState<Msg[]>([]);
  const [input, setInput]   = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = [...TRANSCRIPT.slice(0, visibleCount), ...extraMessages];

  const replay = () => {
    setExtraMessages([]);
    setVisibleCount(0);
    setAnimKey(k => k + 1);
    let i = 0;
    const tick = () => {
      i++;
      setVisibleCount(i);
      if (i < TRANSCRIPT.length) setTimeout(tick, BEATS[i - 1] ?? 800);
    };
    setTimeout(tick, 200);
  };

  useEffect(() => { replay(); }, []); // eslint-disable-line

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || thinking) return;
    const userMessage: Msg = { role:"user", kind:"text", body:q };
    const nextMessages = [...messages, userMessage];
    setInput("");
    setExtraMessages(m => [...m, userMessage]);
    setThinking(true);

    try {
      const chatMessages = nextMessages
        .filter((m): m is Msg & { body: string } => m.kind === "text" && typeof m.body === "string")
        .map(m => ({
          role: m.role === "user" ? "user" : "assistant",
          body: m.body,
        }));
      const data = await agentApi<AgentChatResponse>("/chat", {
        method: "POST",
        body: JSON.stringify({ agentId:"atlas", messages: chatMessages }),
      });
      setExtraMessages(m => [...m, { role:"atlas", kind:"text", body:data.reply ?? "Atlas unavailable." }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Atlas backend unavailable.";
      setExtraMessages(m => [...m, { role:"atlas", kind:"text", body:`Production backend error: ${message}` }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div style={{ height:"calc(100vh - 76px)", display:"grid", gridTemplateColumns:"260px 1fr 300px", position:"relative", overflow:"hidden", minHeight:0 }}>
      {/* particle mesh background */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", opacity:0.28, zIndex:0 }}>
        <MeshBackground />
      </div>

      {/* ── LEFT sidebar — history ── */}
      <aside style={{ borderRight:"1px solid var(--line)", display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden", zIndex:1 }}>
        <div style={{ padding:"14px", borderBottom:"1px solid var(--line)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:500, color:"var(--fg-0)" }}>Chat History</div>
            <div className="mono-sm" style={{ color:"var(--fg-3)", marginTop:2 }}>your conversations with agents</div>
          </div>
          <button className="btn btn-sm">+ New</button>
        </div>
        <div style={{ flex:1, overflow:"auto" }}>
          {HISTORY.map(([t, who, when, active], i) => (
            <div key={i} style={{ padding:"12px 14px", borderBottom:"1px solid var(--line)", borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent", background: active ? "var(--bg-2)" : "transparent", cursor:"pointer" }}>
              <div style={{ fontSize:13, fontWeight:500, color:"var(--fg-0)", marginBottom:4 }}>{t}</div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span className="mono-sm">{who}</span>
                <span className="mono-sm">{when}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:14, borderTop:"1px solid var(--line)" }}>
          <div className="mono-sm" style={{ marginBottom:8 }}>Connected agents</div>
          <div style={{ display:"flex", gap:8 }}>
            {(["nexus","shield","yield","atlas"] as const).map(id => (
              <AgentMonogram key={id} agent={id} active />
            ))}
          </div>
        </div>
      </aside>

      {/* ── CENTER — messages ── */}
      <main style={{ display:"flex", flexDirection:"column", minWidth:0, minHeight:0, overflow:"hidden", zIndex:1 }}>
        <div style={{ padding:"14px 24px", borderBottom:"1px solid var(--line)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <AgentMonogram agent="atlas" size="lg" active />
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:22 }}>Conservative $10k plan</div>
              <div className="mono-sm">Atlas · orchestrating Yield, Shield, Nexus</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <span className="tag tag-accent">● Live</span>
            <button className="btn btn-sm" onClick={replay}>↻ Replay</button>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
          {messages.map((m, i) => <Message key={`${animKey}-${i}`} m={m} animKey={animKey} />)}
          {thinking && <ThinkingDots agent="atlas" />}
        </div>

        <div style={{ padding:"14px 24px", borderTop:"1px solid var(--line)" }}>
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
            {SUGGESTIONS.map(s => (
              <button key={s} className="btn btn-sm" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, alignItems:"center", background:"var(--bg-2)", border:"1px solid var(--line-strong)", borderRadius:2, padding:"4px 4px 4px 14px" }}>
            <input
              style={{ background:"transparent", border:0, outline:"none", color:"var(--fg-0)", fontFamily:"var(--font-sans)", fontSize:13, padding:"10px 0", width:"100%" }}
              placeholder="Ask Atlas to plan, delegate, or execute…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
            />
            <a href="/voice" title="Switch to Atlas voice interface">
              <button className="btn btn-sm" style={{ color:"var(--warn)", borderColor:"rgba(245,158,11,0.3)", padding:"0 10px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="2" width="6" height="11" rx="3"/>
                  <path d="M5 10a7 7 0 0 0 14 0"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8"  y1="22" x2="16" y2="22"/>
                </svg>
              </button>
            </a>
            <button className="btn btn-primary btn-sm" onClick={() => send()}>Send ↵</button>
          </div>
        </div>
      </main>

      {/* ── RIGHT — orchestration panel ── */}
      <div style={{ zIndex:1 }}>
        <OrchestrationPanel visibleCount={visibleCount} animKey={animKey} />
      </div>
    </div>
  );
}
