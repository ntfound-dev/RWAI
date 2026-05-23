"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { agentApi } from "@/lib/agent-api";
import { useChatMode } from "@/lib/chat-mode-context";

// ── Page context registry ─────────────────────────────────────────
const PAGE_CTX: Record<string, {
  label: string;
  hint: string;
  actions: string[];
}> = {
  "/": {
    label: "HOME",
    hint: "User is on the RWAi home page. RWAi is an AI-native real-world asset platform on Mantle Network. Four ERC-8004 sovereign AI agents (Atlas, Shield, Yield, Nexus) tokenize RWA and manage portfolios.",
    actions: ["What is RWAi?", "How do agents work?", "Get started"],
  },
  "/hub": {
    label: "AGENTS HUB",
    hint: "User is on the Agents Hub page. This page shows the four ERC-8004 sovereign agents: Atlas (orchestrator, ID #44), Shield (risk/compliance, ID #42), Yield (yield optimization, ID #43), Nexus (tokenization, ID #41). Each agent has on-chain reputation.",
    actions: ["Explain each agent", "What is ERC-8004?", "Which agent should I use?"],
  },
  "/chat": {
    label: "ATLAS CHAT",
    hint: "User is on the Atlas Chat page. Atlas is the orchestrator agent that coordinates Yield, Shield, and Nexus to build and execute RWA portfolio strategies on Mantle Network.",
    actions: ["Build me a strategy", "Show portfolio options", "Execute on testnet"],
  },
  "/tokenize": {
    label: "TOKENIZE",
    hint: "User is on the Tokenize page. This page allows users to tokenize real-world assets (real estate, bonds, commodities) as ERC-20 tokens on Mantle Network via the Nexus agent. The process: upload documents → AI compliance check → deploy token → list on market.",
    actions: ["How to tokenize my asset?", "What assets can be tokenized?", "Start tokenization now", "Check compliance requirements"],
  },
  "/market": {
    label: "MARKET",
    hint: "User is on the RWA Market page. Shows tokenized real-world assets available for trading on Mantle: USDY (4.28% APY), MI4 (5.81% APY), mETH (6.12% APY), fBTC (3.98% APY). Users can buy/sell RWA tokens.",
    actions: ["Show best APY assets", "Compare USDY vs MI4", "Buy USDY", "What's the risk level?"],
  },
  "/portfolio": {
    label: "PORTFOLIO",
    hint: "User is on the Portfolio page. Shows their current RWA holdings, yield performance, and allocation breakdown. Atlas agent monitors and rebalances automatically.",
    actions: ["Analyze my portfolio", "Suggest rebalancing", "Show yield performance", "Stress-test my holdings"],
  },
  "/bridge": {
    label: "BRIDGE",
    hint: "User is on the Bridge page. This page bridges assets between Ethereum (Sepolia) and Mantle Network using the L1 Standard Bridge. Users can bridge MNT tokens.",
    actions: ["How to bridge to Mantle?", "Bridge ETH to Mantle", "What are bridge fees?"],
  },
  "/docs": {
    label: "DOCS",
    hint: "User is on the Documentation page. Shows technical docs for RWAi: smart contracts, ERC-8004 spec, agent APIs, integration guides.",
    actions: ["Explain ERC-8004", "Show contract addresses", "How to integrate?"],
  },
};

const DEFAULT_CTX = {
  label: "JARVIS",
  hint: "User is browsing the RWAi platform.",
  actions: ["What can you do?", "Show portfolio", "Help me"],
};

// ── State colors ──────────────────────────────────────────────────
type JState = "idle" | "listening" | "thinking" | "speaking" | "executing";
const C: Record<JState, { p: string; label: string }> = {
  idle:      { p: "#00d4ff", label: "STANDBY"    },
  listening: { p: "#00e5a0", label: "LISTENING"  },
  thinking:  { p: "#a855f7", label: "PROCESSING" },
  speaking:  { p: "#34d399", label: "SPEAKING"   },
  executing: { p: "#fbbf24", label: "EXECUTING"  },
};

interface Msg { role: "user" | "jarvis"; text: string; time: string; isNew?: boolean; }

const TX_MATCH = /^0x[a-fA-F0-9]{64}$/;
function renderWithTxLinks(text: string, color = "#f59e0b") {
  const parts = text.split(/\b(0x[a-fA-F0-9]{64})\b/);
  return parts.map((part, i) =>
    TX_MATCH.test(part)
      ? <a key={i} href={`https://sepolia.mantlescan.xyz/tx/${part}`} target="_blank" rel="noopener noreferrer"
          style={{ color, textDecoration: "underline", wordBreak: "break-all", fontSize: "inherit" }}>
          {part}
        </a>
      : part
  );
}

// ── Typewriter bubble ─────────────────────────────────────────────
function Bubble({ msg, p }: { msg: Msg; p: string }) {
  const isJarvis = msg.role === "jarvis";
  const [shown, setShown] = useState(msg.isNew ? "" : msg.text);
  useEffect(() => {
    if (!msg.isNew) { setShown(msg.text); return; }
    setShown(""); let i = 0;
    const id = setInterval(() => {
      i += 2; setShown(msg.text.slice(0, i));
      if (i >= msg.text.length) { setShown(msg.text); clearInterval(id); }
    }, 18);
    return () => clearInterval(id);
  }, [msg.text, msg.isNew]);

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems: isJarvis ? "flex-start" : "flex-end", marginBottom:8 }}>
      <div style={{ fontSize:8, color: isJarvis ? p : "rgba(255,255,255,0.2)", letterSpacing:"0.08em", marginBottom:2 }}>
        {isJarvis ? `JARVIS · ${msg.time}` : `YOU · ${msg.time}`}
      </div>
      <div style={{
        maxWidth:"92%", padding:"7px 10px",
        background: isJarvis ? `${p}12` : "rgba(255,255,255,0.04)",
        border:`1px solid ${isJarvis ? p+"30" : "rgba(255,255,255,0.07)"}`,
        borderRadius: isJarvis ? "0 6px 6px 6px" : "6px 0 6px 6px",
        fontSize:11, color: isJarvis ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)",
        lineHeight:1.55,
      }}>
        {isJarvis && (
          <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:3 }}>
            <div style={{ width:4, height:4, borderRadius:"50%", background:p, boxShadow:`0 0 4px ${p}` }}/>
            <span style={{ fontSize:7, color:p, letterSpacing:"0.1em" }}>JARVIS · via Atlas</span>
          </div>
        )}
        {isJarvis ? renderWithTxLinks(shown, "#f59e0b") : shown}
        {isJarvis && msg.isNew && shown.length < msg.text.length && (
          <span style={{ display:"inline-block", width:2, height:9, background:p, marginLeft:2, verticalAlign:"middle", animation:"gjCaret 0.6s step-end infinite" }}/>
        )}
      </div>
    </div>
  );
}

// ── Mini sphere (small, 160px) ────────────────────────────────────
function TinySphere({ state }: { state: JState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const yaw = useRef(0);
  const raf = useRef(0);
  const c = C[state];

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const N = 500, PHI = Math.PI * (3 - Math.sqrt(5));
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), t = PHI * i;
      return { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
    });

    const frame = () => {
      const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2, R = Math.min(W,H)*0.38;
      yaw.current += state==="listening"?0.01:state==="thinking"?0.018:state==="executing"?0.014:0.004;
      const cY=Math.cos(yaw.current), sY=Math.sin(yaw.current), cX=Math.cos(0.18), sX=Math.sin(0.18);
      const fov=2.4;
      ctx.clearRect(0,0,W,H);
      const bg=ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.5);
      bg.addColorStop(0,c.p+"15"); bg.addColorStop(1,"transparent");
      ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

      const proj=(px:number,py:number,pz:number)=>{
        const rx=px*cY-pz*sY, rz=px*sY+pz*cY;
        const ry=py*cX-rz*sX, rz2=py*sX+rz*cX;
        const sc=fov/(fov+rz2+1.5);
        return {sx:cx+rx*R*sc, sy:cy+ry*R*sc, z:rz2};
      };

      ctx.beginPath(); ctx.arc(cx,cy,R+6,0,Math.PI*2); ctx.strokeStyle=c.p+"20"; ctx.lineWidth=1; ctx.stroke();

      const pp=pts.map(p=>proj(p.x,p.y,p.z)); pp.sort((a,b)=>a.z-b.z);
      for(const p of pp){
        const zN=(p.z+1.5)/3; if(zN<0.07) continue;
        const dist=Math.hypot(p.sx-cx,p.sy-cy)/R, core=Math.max(0,1-dist*1.5);
        const alpha=0.05+zN*0.75, size=0.3+zN*1.6+core*1.6;
        let fill:string;
        if(core>0.55) fill=`rgba(255,255,255,${Math.min(1,alpha*1.4).toFixed(2)})`;
        else if(core>0.2) fill=c.p+Math.min(255,Math.round(alpha*260)).toString(16).padStart(2,"0");
        else fill=`rgba(0,80,180,${(alpha*0.55).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.sx,p.sy,size,0,Math.PI*2); ctx.fillStyle=fill; ctx.fill();
      }
      const g1=ctx.createRadialGradient(cx,cy,0,cx,cy,R*0.28);
      g1.addColorStop(0,"rgba(255,255,255,0.9)"); g1.addColorStop(0.3,c.p+"80"); g1.addColorStop(1,"transparent");
      ctx.fillStyle=g1; ctx.beginPath(); ctx.arc(cx,cy,R*0.28,0,Math.PI*2); ctx.fill();
      ctx.shadowColor="#fff"; ctx.shadowBlur=16;
      const g2=ctx.createRadialGradient(cx,cy,0,cx,cy,8);
      g2.addColorStop(0,"rgba(255,255,255,1)"); g2.addColorStop(1,"transparent");
      ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(cx,cy,8,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;

      raf.current=requestAnimationFrame(frame);
    };
    raf.current=requestAnimationFrame(frame);
    return ()=>cancelAnimationFrame(raf.current);
  }, [state]); // eslint-disable-line

  return <canvas ref={ref} width={160} height={160} style={{ display:"block", width:"100%", height:"auto" }}/>;
}

// ── Main GlobalJarvisPanel ────────────────────────────────────────
export function GlobalJarvisPanel() {
  const { jarvisOpen, closeJarvis } = useChatMode();
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  const ctx = PAGE_CTX[pathname] ?? DEFAULT_CTX;

  const [jState, setJState]     = useState<JState>("idle");
  const [msgs, setMsgs]         = useState<Msg[]>([]);
  const [input, setInput]       = useState("");
  const [interim, setInterim]   = useState("");
  const [history, setHistory]   = useState<{ role: string; body: string }[]>([]);
  const [onChainTx, setOnChainTx] = useState("");

  const recRef       = useRef<any>(null);
  const synthRef     = useRef<SpeechSynthesis | null>(null);
  const voicesRef    = useRef<SpeechSynthesisVoice[]>([]);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const onChainTxRef = useRef("");
  const pendingRef   = useRef("");
  const sendRef      = useRef<(t: string) => void>(() => {});
  const endRef       = useRef<HTMLDivElement>(null);
  const prevPath     = useRef(pathname);

  const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

  useEffect(() => {
    if (typeof window === "undefined") return;
    synthRef.current = window.speechSynthesis;
    const load = () => { voicesRef.current = synthRef.current?.getVoices() ?? []; };
    load(); synthRef.current?.addEventListener("voiceschanged", load);
    return () => synthRef.current?.removeEventListener("voiceschanged", load);
  }, []);

  const unlockAudio = useCallback(() => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    audioCtxRef.current = new AC();
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume().catch(() => {});
  }, []);

  const speak = useCallback(async (text: string) => {
    const hasTx = () => !!onChainTxRef.current;
    // Backend TTS via Web Audio API
    try {
      const res = await fetch("/api/agents/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const ac = audioCtxRef.current ?? new AC();
        audioCtxRef.current = ac;
        if (ac.state === "suspended") await ac.resume();
        const decoded = await ac.decodeAudioData(buf);
        const source = ac.createBufferSource();
        source.buffer = decoded;
        source.connect(ac.destination);
        if (!hasTx()) setJState("speaking");
        source.onended = () => { if (!hasTx()) setJState("idle"); };
        source.start(0);
        return;
      }
    } catch { /* fall through */ }

    // Browser TTS fallback
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const MALE_HINTS = ["Google UK English Male","Daniel","Aaron","Microsoft David","Microsoft Mark","Alex","Tom","Fred","Gordon"];
    const FEMALE_SKIP = ["female","samantha","karen","moira","victoria","zira","susan","hazel","linda","fiona","tessa","junior","google uk english female"];
    const pick = voicesRef.current.find(v =>
      MALE_HINTS.some(h => v.name.toLowerCase().includes(h.toLowerCase()))
    ) ?? voicesRef.current.find(v =>
      v.lang.startsWith("en") && !FEMALE_SKIP.some(s => v.name.toLowerCase().includes(s))
    );
    if (pick) utt.voice = pick;
    utt.rate = 0.88;
    utt.pitch = 0.65;
    utt.onstart = () => { if (!hasTx()) setJState("speaking"); };
    utt.onend   = () => { if (!hasTx()) setJState("idle"); };
    synthRef.current.speak(utt);
  }, []);

  // Greeting on first open
  useEffect(() => {
    if (!jarvisOpen) return;
    if (msgs.length > 0 && prevPath.current === pathname) return;
    prevPath.current = pathname;
    const walletPart = isConnected ? ` Wallet ${address?.slice(0,6)} recognized.` : "";
    const greeting = `JARVIS online.${walletPart} You're on the ${ctx.label} page. ${ctx.hint.split(".")[0]}. How can I assist?`;
    setTimeout(() => {
      setMsgs([{ role:"jarvis", text: greeting, time: now(), isNew: true }]);
      setHistory([]);
      speak(greeting);
    }, 200);
  }, [jarvisOpen, pathname]); // eslint-disable-line

  // Page change → new context greeting
  useEffect(() => {
    if (!jarvisOpen || prevPath.current === pathname) return;
    prevPath.current = pathname;
    const newCtx = PAGE_CTX[pathname] ?? DEFAULT_CTX;
    const msg = `Switched to ${newCtx.label}. ${newCtx.hint.split(".")[0]}. Ask me anything about this page.`;
    setMsgs(prev => [...prev, { role:"jarvis", text: msg, time: now(), isNew: true }]);
    speak(msg);
  }, [pathname]); // eslint-disable-line

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, interim]);

  const sendToAtlas = useCallback(async (text: string) => {
    const t = now();
    setMsgs(prev => [...prev, { role:"user", text, time: t }]);
    setJState("thinking"); setInput("");
    const systemMsg = { role:"system", body:`Page context: ${ctx.hint} Quick actions available: ${ctx.actions.join(", ")}` };
    const next = [...history, { role:"user", body:text }];
    setHistory(next);
    try {
      const data = await agentApi<any>("/chat", {
        method:"POST",
        body: JSON.stringify({ agent_id:"atlas", messages:[systemMsg, ...next], wallet_address: address || null }),
      });
      const reply = data.reply || "Understood.";
      const tx: string = data.on_chain_tx || "";
      setHistory(h => [...h, { role:"atlas", body:reply }]);
      setMsgs(prev => [...prev, { role:"jarvis", text: reply, time: now(), isNew: true }]);
      if (tx) {
        onChainTxRef.current = tx;
        setOnChainTx(tx);
        setJState("executing");
        speak(reply);
        setTimeout(() => { onChainTxRef.current = ""; setOnChainTx(""); setJState("idle"); }, 15000);
      } else {
        speak(reply);
      }
    } catch {
      setMsgs(prev => [...prev, { role:"jarvis", text:"Atlas connection failed. Try again.", time: now(), isNew: true }]);
      setJState("idle");
    }
  }, [history, ctx, address, speak]);

  useEffect(() => { sendRef.current = sendToAtlas; }, [sendToAtlas]);

  const toggleListen = useCallback(() => {
    unlockAudio();
    if (jState==="listening") { recRef.current?.stop(); return; }
    if (jState==="thinking" || jState==="executing") return;
    synthRef.current?.cancel();
    const SR = (window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec=new SR(); recRef.current=rec; pendingRef.current="";
    rec.continuous=false; rec.interimResults=true; rec.lang="en-US";
    rec.onstart=()=>{setJState("listening");setInterim("");};
    rec.onresult=(e:any)=>{const t=Array.from(e.results).map((r:any)=>r[0].transcript).join("");pendingRef.current=t;setInterim(t);};
    rec.onend=()=>{setInterim("");const h=pendingRef.current.trim();pendingRef.current="";if(h)sendRef.current(h);else setJState("idle");};
    rec.onerror=()=>{setInterim("");setJState("idle");};
    rec.start();
  }, [jState, unlockAudio]);

  const c = C[jState];
  const busy = jState === "thinking" || jState === "executing";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeJarvis}
        style={{
          position:"fixed", inset:0, zIndex:998,
          background:"rgba(0,0,0,0.4)",
          backdropFilter:"blur(2px)",
          opacity: jarvisOpen ? 1 : 0,
          pointerEvents: jarvisOpen ? "all" : "none",
          transition:"opacity 0.25s",
        }}
      />

      {/* Panel */}
      <div style={{
        position:"fixed", top:0, right:0, bottom:0, zIndex:999,
        width:"min(320px, 100vw)", background:"#020c16",
        borderLeft:`1px solid ${c.p}25`,
        display:"flex", flexDirection:"column",
        transform: jarvisOpen ? "translateX(0)" : "translateX(100%)",
        transition:"transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        fontFamily:"var(--font-mono)",
        boxShadow: jarvisOpen ? `-8px 0 40px ${c.p}18` : "none",
      }}>
        {/* Header */}
        <div style={{
          padding:"12px 14px", borderBottom:`1px solid ${c.p}18`,
          background:`${c.p}06`, flexShrink:0,
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:c.p, boxShadow:`0 0 8px ${c.p}`, animation:"gjPulse 2s ease-in-out infinite" }}/>
            <div>
              <div style={{ fontSize:11, letterSpacing:"0.18em", color:c.p }}>JARVIS</div>
              <div style={{ fontSize:7, color:`${c.p}50`, letterSpacing:"0.1em", marginTop:1 }}>
                {ctx.label} · {c.label}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:7, padding:"2px 7px", color:c.p, border:`1px solid ${c.p}35`, background:`${c.p}0c` }}>{c.label}</span>
            <button onClick={closeJarvis} style={{
              width:24, height:24, border:`1px solid rgba(255,255,255,0.1)`,
              background:"transparent", color:"rgba(255,255,255,0.4)",
              cursor:"pointer", display:"grid", placeItems:"center", fontSize:12,
            }}>✕</button>
          </div>
        </div>

        {/* ON-CHAIN TX banner */}
        {onChainTx && (
          <div style={{
            padding:"6px 14px", background:"#fbbf2410", borderBottom:"1px solid #fbbf2430",
            flexShrink:0, display:"flex", alignItems:"center", gap:8,
          }}>
            <span style={{ fontSize:7, color:"#fbbf24", letterSpacing:"0.12em" }}>⬡ ON-CHAIN LOG</span>
            <a href={`https://sepolia.mantlescan.xyz/tx/${onChainTx}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:8, color:"#fbbf24", textDecoration:"underline", wordBreak:"break-all" }}>
              {onChainTx.slice(0,10)}…{onChainTx.slice(-8)} ↗
            </a>
          </div>
        )}

        {/* Sphere */}
        <div style={{ flexShrink:0, padding:"10px 30px 0", position:"relative" }}>
          {(jState==="listening"||jState==="speaking"||jState==="executing") && [1,2].map(i=>(
            <div key={i} style={{
              position:"absolute", top:`${10-i*10}px`, left:`${30-i*10}px`, right:`${30-i*10}px`,
              aspectRatio:"1", borderRadius:"50%", border:`1px solid ${c.p}`,
              pointerEvents:"none", animation:`gjPanelPulse ${0.9+i*0.4}s ease-out ${i*0.25}s infinite`,
            }}/>
          ))}
          <TinySphere state={jState}/>
        </div>

        {/* Status hint */}
        <div style={{ textAlign:"center", fontSize:7, color:`${c.p}40`, letterSpacing:"0.1em", padding:"4px 0 6px", flexShrink:0 }}>
          {jState==="listening" ? "LISTENING — CLICK TO STOP"
           : jState==="thinking" ? "ATLAS PROCESSING…"
           : jState==="speaking" ? "SPEAKING…"
           : jState==="executing" ? "EXECUTING ON MANTLE…"
           : "CLICK MIC · OR TYPE BELOW"}
        </div>

        {/* Conversation log */}
        <div style={{ flex:1, overflowY:"auto", padding:"6px 12px", display:"flex", flexDirection:"column" }}>
          {msgs.map((msg, i) => <Bubble key={i} msg={msg} p={c.p}/>)}
          {busy && (
            <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:6 }}>
              <div style={{ width:4, height:4, borderRadius:"50%", background:c.p }}/>
              {[0,1,2].map(i=>(
                <span key={i} style={{ width:3, height:3, borderRadius:"50%", background:c.p, opacity:0.4, display:"inline-block", animation:`gjDot 1.1s ${i*0.15}s ease-in-out infinite` }}/>
              ))}
            </div>
          )}
          {interim && (
            <div style={{ padding:"5px 8px", border:`1px solid ${c.p}30`, background:`${c.p}08`, fontSize:10, color:c.p, marginBottom:6 }}>
              {interim}<span style={{ display:"inline-block", width:2, height:8, background:c.p, marginLeft:2, verticalAlign:"middle", animation:"gjCaret 0.6s step-end infinite" }}/>
            </div>
          )}
          <div ref={endRef}/>
        </div>

        {/* Quick actions */}
        <div style={{ flexShrink:0, padding:"6px 12px", borderTop:`1px solid ${c.p}10` }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
            {ctx.actions.map(a => (
              <button key={a} onClick={()=>{ if(!busy){ unlockAudio(); sendRef.current(a); } }} disabled={busy} style={{
                background:"transparent", border:`1px solid ${c.p}18`,
                color:`${c.p}55`, fontFamily:"var(--font-mono)", fontSize:7,
                padding:"2px 8px", cursor:busy?"not-allowed":"pointer", letterSpacing:"0.05em",
              }}>{a}</button>
            ))}
          </div>

          {/* Input */}
          <div style={{ display:"grid", gridTemplateColumns:"32px 1fr 32px", gap:4, alignItems:"center" }}>
            <button onClick={toggleListen} disabled={busy} style={{
              width:32, height:32, borderRadius:"50%",
              border:`1.5px solid ${jState==="listening"?c.p:`${c.p}30`}`,
              background: jState==="listening"?`${c.p}15`:"transparent",
              color: jState==="listening"?c.p:`${c.p}45`,
              cursor:busy?"not-allowed":"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:jState==="listening"?`0 0 14px ${c.p}50`:"none",
              transition:"all 0.2s",
            }}>
              {busy ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" strokeDasharray="56" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
                  </circle>
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill={jState==="listening"?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="2" width="6" height="11" rx="3"/>
                  <path d="M5 10a7 7 0 0 0 14 0"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              )}
            </button>
            <input
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!busy&&input.trim()){ unlockAudio(); sendRef.current(input.trim()); } }}
              disabled={busy}
              placeholder={`Ask JARVIS about ${ctx.label}…`}
              style={{
                background:"rgba(255,255,255,0.03)", border:`1px solid ${c.p}18`,
                color:"rgba(255,255,255,0.7)", fontFamily:"var(--font-mono)", fontSize:10,
                padding:"6px 10px", outline:"none",
              }}
            />
            <button onClick={()=>{ if(!busy&&input.trim()){ unlockAudio(); sendRef.current(input.trim()); } }} disabled={busy||!input.trim()} style={{
              background:"transparent", border:`1px solid ${c.p}20`, color:c.p,
              fontFamily:"var(--font-mono)", fontSize:10, padding:"6px 8px",
              cursor:busy||!input.trim()?"not-allowed":"pointer",
            }}>↗</button>
          </div>

          {/* Wallet / page indicator */}
          <div style={{ fontSize:6, color:"rgba(255,255,255,0.15)", textAlign:"right", marginTop:5, letterSpacing:"0.06em" }}>
            {isConnected ? `${address?.slice(0,6)}…${address?.slice(-4)} · MANTLE SEPOLIA` : "WALLET NOT CONNECTED"}
          </div>
        </div>

        <style>{`
          @keyframes gjPulse      { 0%,100%{opacity:1;}50%{opacity:0.4;} }
          @keyframes gjPanelPulse { 0%{opacity:0.7;transform:scale(1);}100%{opacity:0;transform:scale(1.1);} }
          @keyframes gjCaret      { 0%,100%{opacity:1;}50%{opacity:0;} }
          @keyframes gjDot        { 0%,100%{transform:scale(1);opacity:0.4;}50%{transform:scale(1.5);opacity:1;} }
        `}</style>
      </div>
    </>
  );
}
