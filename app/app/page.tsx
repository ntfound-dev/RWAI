"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentMonogram, AGENTS } from "@/components/agents/AgentMonogram";
import { useAgentStatus } from "@/hooks/useAgentStatus";

const TICKER_STATIC = [
  ["USDY", "4.20%", "+0.02", "var(--accent)"],
  ["MI4",  "5.81%", "+0.14", "var(--accent)"],
  ["mETH", "6.12%", "-0.03", "var(--warn)"],
  ["MNT",  "$0.74", "+1.2%", "var(--accent)"],
  ["fBTC", "4.95%", "+0.08", "var(--accent)"],
];

const TRACE_STEPS = [
  { agent: "atlas",  action: "plan_strategy",    detail: "risk=conservative, horizon=24mo" },
  { agent: "atlas",  action: "delegate → shield", detail: "compliance.scan(asset=MANHATTAN-001)" },
  { agent: "shield", action: "kyc_check",         detail: "jurisdiction=US, status=cleared" },
  { agent: "shield", action: "risk_score",         detail: "returned 87/100" },
  { agent: "atlas",  action: "delegate → yield",  detail: "apy_diff(USDY, MI4, mETH)" },
  { agent: "yield",  action: "yield_feed",         detail: "3 sources, mean=4.71%" },
  { agent: "atlas",  action: "delegate → nexus",  detail: "draft_erc20(supply=2.5M)" },
  { agent: "nexus",  action: "register_rwa",       detail: "tx 0x9af2…3c12 confirmed" },
  { agent: "atlas",  action: "finalize",           detail: "strategy ready · 4.8% expected" },
];

const PIPELINE = [
  ["01","INGEST",    "nexus",  "parse_pdf"],
  ["02","VALUATE",   "nexus",  "price model"],
  ["03","KYC",       "shield", "verify owner"],
  ["04","JURISDICT", "shield", "risk scan"],
  ["05","YIELD",     "yield",  "apy_diff"],
  ["06","STRATEGY",  "atlas",  "allocate"],
  ["07","DEPLOY",    "nexus",  "erc-20 + 8004"],
  ["08","OBSERVE",   "yield",  "rebalance"],
];

type AgentId = "nexus" | "shield" | "yield" | "atlas";

interface ChainStats { assetCount: number; agentRuns: number; agentRuns24h: number; avgCompliance: number; }

export default function LandingPage() {
  const [tracePos, setTracePos] = useState(0);
  const [chainStats, setChainStats] = useState<ChainStats | null>(null);
  const [recentTx, setRecentTx]   = useState<string>("");
  const { data: agentStatus } = useAgentStatus();

  useEffect(() => {
    fetch("/api/agents/stats", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j) {
          setChainStats(j);
          if (j.recentTx) setRecentTx(j.recentTx);
        }
      })
      .catch(() => {});
  }, []);

  const TICKER_DATA = [
    ...TICKER_STATIC,
    ["NEXUS·rep",  agentStatus?.nexus  ? agentStatus.nexus.reputation.toFixed(2)  : "…", `score ${agentStatus?.nexus?.localScore  ?? "…"}/100`, "var(--nexus)"],
    ["SHIELD·rep", agentStatus?.shield ? agentStatus.shield.reputation.toFixed(2) : "…", `score ${agentStatus?.shield?.localScore ?? "…"}/100`, "var(--shield)"],
    ["YIELD·rep",  agentStatus?.yield  ? agentStatus.yield.reputation.toFixed(2)  : "…", `score ${agentStatus?.yield?.localScore  ?? "…"}/100`, "var(--yield)"],
    ["ATLAS·rep",  agentStatus?.atlas  ? agentStatus.atlas.reputation.toFixed(2)  : "…", `score ${agentStatus?.atlas?.localScore  ?? "…"}/100`, "var(--atlas)"],
  ];

  useEffect(() => {
    const t = setInterval(() => setTracePos(p => (p + 1) % TRACE_STEPS.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position:"relative", overflow:"hidden" }}>
      <div style={{ position:"relative", maxWidth:1480, margin:"0 auto", padding:"32px 32px 24px" }}>

        {/* Pre-hero breadcrumb */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
          <div className="mono" style={{ display:"flex", gap:14, color:"var(--fg-2)" }}>
            <span>$ rwai --init</span>
            <span style={{ color:"var(--fg-3)" }}>·</span>
            <span>build 18.04.26</span>
            <span style={{ color:"var(--fg-3)" }}>·</span>
            <span style={{ color:"var(--accent)" }}>● ready</span>
          </div>
          <div className="mono" style={{ color:"var(--fg-2)" }}>DORAHACKS · AI & RWA TRACK</div>
        </div>

        {/* HERO */}
        <section style={{ display:"grid", gridTemplateColumns:"1.15fr 1fr", gap:48, alignItems:"start", marginBottom:56 }}>
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:18 }}>
              <span className="tag tag-accent">● Live · Mantle Testnet</span>
              <span className="tag">ERC-8004 reputation</span>
              <span className="tag">OpenClaw · Mantle</span>
            </div>

            <h1 className="display" style={{ fontSize:96, color:"var(--fg-0)", marginBottom:18 }}>
              Real-world assets,<br/>
              <span style={{ fontStyle:"italic", color:"var(--accent)" }}>orchestrated</span> by<br/>
              four agents in concert.
            </h1>

            <p style={{ fontSize:16, color:"var(--fg-1)", maxWidth:560, marginBottom:28, lineHeight:1.55 }}>
              Tokenize property, treasuries, or commodities through a transparent agent pipeline.
              Every reasoning step, every tool call, every signature is auditable on-chain.
            </p>

            <div style={{ display:"flex", gap:10, marginBottom:36, flexWrap:"wrap" }}>
              <Link href="/tokenize"><button className="btn btn-primary">Start tokenizing →</button></Link>
              <Link href="/bridge"><button className="btn">Bridge MNT</button></Link>
              <Link href="/chat"><button className="btn">Talk to Atlas</button></Link>
              <Link href="/hub"><button className="btn btn-ghost">Meet the agents</button></Link>
            </div>

            {/* Stats — real on-chain data */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0, borderTop:"1px solid var(--line)", borderBottom:"1px solid var(--line)" }}>
              {([
                ["Assets tokenized", chainStats ? chainStats.assetCount.toString() : "…", "on Mantle Sepolia"],
                ["Avg. compliance",  chainStats ? `${chainStats.avgCompliance}/100` : "…/100", "Shield agent"],
                ["Agent runs",       chainStats ? chainStats.agentRuns.toString() : "…", `${chainStats?.agentRuns24h ?? "…"} in 24h`],
                ["Agents online",    "4", "ERC-8004 registered"],
              ] as [string, string, string][]).map(([label, value, sub], i) => (
                <div key={i} style={{ padding:"16px 18px 14px", borderRight: i < 3 ? "1px solid var(--line)" : "none" }}>
                  <div className="mono-sm" style={{ marginBottom:6 }}>{label}</div>
                  <div className="display" style={{ fontSize:32, color:"var(--fg-0)" }}>{value}</div>
                  <div className="mono-sm" style={{ color:"var(--accent)", marginTop:4 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Ecosystem stack badges */}
            <div style={{ display:"flex", gap:8, marginTop:16, flexWrap:"wrap" }}>
              {[
                { label:"Mantle L2",     sub:"~$0.001 gas",       color:"var(--accent)" },
                { label:"Pyth oracles",  sub:"real-time price feeds", color:"var(--yield)" },
                { label:"ERC-8004",      sub:"agent identity",    color:"var(--nexus)" },
                { label:"EIP-712",       sub:"typed consent",     color:"var(--atlas)" },
                { label:"AgentExecutor", sub:"on-chain AI log",   color:"var(--shield)" },
              ].map(b => (
                <div key={b.label} style={{ padding:"6px 10px", border:"1px solid var(--line)", borderRadius:2, background:"var(--bg-1)" }}>
                  <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:b.color, fontWeight:600 }}>{b.label}</div>
                  <div className="mono-sm" style={{ color:"var(--fg-3)", marginTop:1 }}>{b.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Live agent trace */}
          <div className="panel" style={{ background:"var(--bg-1)" }}>
            <div className="panel-header">
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span className="live-dot"/>
                <span className="mono">Live agent trace</span>
              </div>
              <span className="mono-sm">RUN #7,994</span>
            </div>
            <div style={{ padding:"14px 0", maxHeight:460, overflow:"hidden" }}>
              {TRACE_STEPS.map((s, i) => {
                const isActive = i === tracePos;
                const isPast   = i < tracePos;
                return (
                  <div key={i} style={{
                    display:"grid", gridTemplateColumns:"40px 28px 1fr", alignItems:"center", gap:12,
                    padding:"10px 14px",
                    opacity: isPast ? 0.45 : isActive ? 1 : 0.65,
                    background: isActive ? "var(--bg-2)" : "transparent",
                    borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                    transition:"all 240ms",
                  }}>
                    <span className="mono-sm" style={{ color:"var(--fg-3)" }}>{String(i+1).padStart(2,"0")}</span>
                    <AgentMonogram agent={s.agent as AgentId} active={isActive}/>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--fg-0)" }}>
                        {s.agent}.<span style={{ color:"var(--accent)" }}>{s.action}</span>
                      </div>
                      <div className="mono-sm" style={{ color:"var(--fg-2)", textTransform:"none", letterSpacing:0, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {s.detail}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop:"1px solid var(--line)", padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              {recentTx ? (
                <a href={`https://sepolia.mantlescan.xyz/tx/${recentTx}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--fg-2)" }}>
                  tx {recentTx.slice(0,8)}…{recentTx.slice(-6)}
                </a>
              ) : (
                <span className="mono-sm" style={{ color:"var(--fg-3)" }}>tx 0x9af2…3c12</span>
              )}
              <a href="https://sepolia.mantlescan.xyz" target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)", cursor:"pointer" }}>↗ Mantle Explorer</a>
            </div>
          </div>
        </section>

        {/* Ticker */}
        <section style={{ borderTop:"1px solid var(--line)", borderBottom:"1px solid var(--line)", padding:"12px 0", marginBottom:56, overflow:"hidden" }}>
          <div className="ticker">
            {[...TICKER_DATA, ...TICKER_DATA].map((t, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, fontFamily:"var(--font-mono)", fontSize:11 }}>
                <span style={{ color:"var(--fg-3)" }}>◆</span>
                <span className="mono-sm">{t[0]}</span>
                <span style={{ color:"var(--fg-0)", fontWeight:500 }}>{t[1]}</span>
                <span style={{ color:t[3] }}>{t[2]}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Four agents */}
        <section style={{ marginBottom:56 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24 }}>
            <div>
              <div className="mono" style={{ color:"var(--accent)", marginBottom:8 }}>§ 01 · the cast</div>
              <h2 className="display" style={{ fontSize:56 }}>Four roles. <span style={{ fontStyle:"italic", color:"var(--fg-2)" }}>One pipeline.</span></h2>
            </div>
            <Link href="/hub"><button className="btn">Inspect agents →</button></Link>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0, border:"1px solid var(--line)" }}>
            {Object.values(AGENTS).map((a, i) => (
              <Link key={a.id} href="/hub">
                <div style={{ padding:"24px 22px", borderRight: i < 3 ? "1px solid var(--line)" : "none", background:"var(--bg-1)", cursor:"pointer", transition:"background 200ms" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-1)")}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                    <AgentMonogram agent={a.id} size="lg" active/>
                    <span className="mono-sm">AG-{String(i+1).padStart(2,"0")}</span>
                  </div>
                  <div className="display" style={{ fontSize:32, marginBottom:4 }}>{a.name}</div>
                  <div className="mono-sm" style={{ color:`var(--${a.id})`, marginBottom:12 }}>{a.role}</div>
                  <p style={{ fontSize:13, color:"var(--fg-1)", lineHeight:1.5, marginBottom:16 }}>{a.blurb}</p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {a.tools.slice(0,3).map(t => <span key={t} className="tag" style={{ fontSize:9 }}>{t}()</span>)}
                  </div>
                  <div style={{ marginTop:18, paddingTop:14, borderTop:"1px solid var(--line)", display:"flex", justifyContent:"space-between" }}>
                    <span className="mono-sm">REP {a.rep}</span>
                    <span className="mono-sm" style={{ color:"var(--fg-1)" }}>{a.runs.toLocaleString()} runs</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Pipeline diagram */}
        <section style={{ marginBottom:56 }}>
          <div style={{ marginBottom:24 }}>
            <div className="mono" style={{ color:"var(--accent)", marginBottom:8 }}>§ 02 · the pipeline</div>
            <h2 className="display" style={{ fontSize:56 }}>
              From <span style={{ fontStyle:"italic" }}>document</span> to <span style={{ fontStyle:"italic", color:"var(--accent)" }}>tokenized yield</span> in 8 steps.
            </h2>
          </div>
          <div className="panel" style={{ padding:28 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:0, position:"relative" }}>
              {PIPELINE.map(([num, label, agent, fn], i) => (
                <div key={i} style={{ position:"relative", padding:"0 8px" }}>
                  <div className="mono-sm" style={{ color:"var(--fg-3)", marginBottom:6 }}>{num}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <AgentMonogram agent={agent as AgentId}/>
                    {i < 7 && <div style={{ position:"absolute", top:38, left:"60%", right:"-60%", height:1, background:"var(--line-strong)", zIndex:0 }}/>}
                  </div>
                  <div style={{ fontFamily:"var(--font-mono)", fontSize:11, fontWeight:500, letterSpacing:"0.04em", color:"var(--fg-0)" }}>{label}</div>
                  <div className="mono-sm" style={{ textTransform:"none", letterSpacing:0, color:"var(--fg-2)", marginTop:2, fontFamily:"var(--font-mono)" }}>{fn}()</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ border:"1px solid var(--line)", background:"var(--bg-1)", padding:"40px 40px", display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:40, alignItems:"center", marginBottom:32 }}>
          <div>
            <div className="mono" style={{ color:"var(--accent)", marginBottom:12 }}>§ 03 · ready when you are</div>
            <h2 className="display" style={{ fontSize:64, marginBottom:12 }}>
              Bring an asset. <span style={{ fontStyle:"italic", color:"var(--fg-2)" }}>We bring four agents.</span>
            </h2>
            <p style={{ color:"var(--fg-1)", maxWidth:540 }}>
              Open the tokenization flow and watch the pipeline run live, or chat with Atlas first if you&apos;d rather start from a goal.
            </p>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <Link href="/tokenize"><button className="btn btn-primary" style={{ justifyContent:"space-between", padding:"14px 18px", fontSize:12, width:"100%" }}><span>Start tokenizing</span><span>→</span></button></Link>
            <Link href="/bridge"><button className="btn" style={{ justifyContent:"space-between", padding:"14px 18px", fontSize:12, width:"100%" }}><span>Bridge MNT</span><span>→</span></button></Link>
            <Link href="/chat"><button className="btn" style={{ justifyContent:"space-between", padding:"14px 18px", fontSize:12, width:"100%" }}><span>Open Atlas chat</span><span>→</span></button></Link>
            <Link href="/portfolio"><button className="btn btn-ghost" style={{ justifyContent:"space-between", padding:"14px 18px", fontSize:12, width:"100%" }}><span>View demo portfolio</span><span>→</span></button></Link>
          </div>
        </section>

      </div>
    </div>
  );
}
