"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { agentApi } from "@/lib/agent-api";

// ── Types ─────────────────────────────────────────────────────────
type JarvisState = "idle" | "listening" | "thinking" | "speaking" | "executing";

const CFG: Record<JarvisState, { p: string; s: string; label: string }> = {
  idle:      { p: "#00d4ff", s: "#0066ff", label: "STANDBY"    },
  listening: { p: "#00e5a0", s: "#00d4ff", label: "LISTENING"  },
  thinking:  { p: "#a855f7", s: "#6366f1", label: "PROCESSING" },
  speaking:  { p: "#34d399", s: "#10b981", label: "SPEAKING"   },
  executing: { p: "#fbbf24", s: "#f59e0b", label: "EXECUTING"  },
};

interface Log     { id: string; time: string; type: string; text: string; tx?: string }
interface ChatMsg { role: "user" | "atlas"; text: string; time: string }
interface JarvisOverlayProps {
  onClose: () => void;
  onMessage?: (role: "user" | "atlas", text: string) => void;
}

const AGENTS_CFG = [
  { id:"atlas",  name:"Atlas",  rep:75, color:"#a855f7" },
  { id:"shield", name:"Shield", rep:81, color:"#0ea5e9" },
  { id:"yield",  name:"Yield",  rep:72, color:"#eab308" },
  { id:"nexus",  name:"Nexus",  rep:68, color:"#f97316" },
];

const PORTFOLIO = [
  { sym:"USDY", pct:60, apy:4.20, color:"#00e5a0", value:6000 },
  { sym:"MI4",  pct:30, apy:5.81, color:"#0ea5e9", value:3000 },
  { sym:"mETH", pct:10, apy:6.12, color:"#a855f7", value:1000 },
];

const QUICK_CMDS = [
  "Show portfolio breakdown",
  "What is my current APY?",
  "Rebalance to conservative",
  "Execute on Mantle testnet",
];

const TOTAL_VAL = PORTFOLIO.reduce((s, p) => s + p.value, 0);
const TOTAL_APY = PORTFOLIO.reduce((s, p) => s + p.apy * p.pct / 100, 0).toFixed(2);

const DEFAULT_LOG: Log[] = [
  { id:"d1", time:"12:04:01", type:"ALLOCATION",   text:"ATLAS · Portfolio rebalanced · Conservative 60/30/10" },
  { id:"d2", time:"11:58:44", type:"YIELD UPDATE",  text:"YIELD · USDY 4.20% MI4 5.81% mETH 6.12%" },
  { id:"d3", time:"11:55:12", type:"RISK SCAN",     text:"SHIELD · CVaR 1.84% · All positions within bounds" },
  { id:"d4", time:"11:50:30", type:"TOKENIZATION",  text:"NEXUS · RWA token mint validated on Mantle Sepolia" },
  { id:"d5", time:"11:44:18", type:"ALLOCATION",    text:"ATLAS · Yield kicker mETH position opened" },
  { id:"d6", time:"11:30:00", type:"COMPLIANCE",    text:"SHIELD · KYC verification passed · Agent ID #42" },
];

// ── Background starfield ──────────────────────────────────────────
function Starfield({ primary }: { primary: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf: number;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const stars = Array.from({ length: 260 }, () => ({
      x:    Math.random() * window.innerWidth,
      y:    Math.random() * window.innerHeight,
      r:    Math.random() * 1.2 + 0.2,
      vx:   (Math.random() - 0.5) * 0.12,
      vy:   (Math.random() - 0.5) * 0.12,
      a:    Math.random() * 0.45 + 0.08,
      wave: Math.random() * Math.PI * 2,
      freq: Math.random() * 0.008 + 0.003,
    }));

    // A handful of "bright" accent dots
    const accents = Array.from({ length: 18 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.8 + 0.8,
      a: Math.random() * 0.25 + 0.1,
      phase: Math.random() * Math.PI * 2,
    }));

    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t++;

      for (const s of stars) {
        s.x += s.vx + Math.sin(s.wave + t * s.freq) * 0.08;
        s.y += s.vy;
        s.wave += 0.002;
        if (s.x < 0) s.x = canvas.width;
        if (s.x > canvas.width) s.x = 0;
        if (s.y < 0) s.y = canvas.height;
        if (s.y > canvas.height) s.y = 0;

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,220,255,${s.a})`;
        ctx.fill();
      }

      for (const a of accents) {
        const pulse = Math.sin(a.phase + t * 0.018) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r * (0.7 + pulse * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = primary + Math.round((a.a * pulse + 0.05) * 255).toString(16).padStart(2, "0");
        ctx.shadowColor = primary;
        ctx.shadowBlur  = 6;
        ctx.fill();
        ctx.shadowBlur  = 0;
        a.phase += 0.01;
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [primary]);

  return (
    <canvas ref={ref} style={{
      position: "absolute", inset: 0,
      width: "100%", height: "100%",
      pointerEvents: "none", zIndex: 0,
    }} />
  );
}

// ── 3D Fibonacci sphere ───────────────────────────────────────────
function useSphere(ref: React.RefObject<HTMLCanvasElement | null>, state: JarvisState) {
  const yaw = useRef(0);
  const raf = useRef(0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const N = 1100, PHI = Math.PI * (3 - Math.sqrt(5));
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const t = PHI * i;
      return { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
    });
    const mkRing = (tx: number, n = 110) =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return { x: Math.cos(a), y: Math.sin(a) * Math.sin(tx), z: Math.sin(a) * Math.cos(tx) };
      });
    const rings = [mkRing(0.15, 120), mkRing(1.05, 100), mkRing(-0.65, 90)];
    const c = CFG[state];

    const frame = () => {
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.41;
      yaw.current += state==="listening" ? 0.007 : state==="thinking" ? 0.014 : state==="speaking" ? 0.010 : 0.003;
      const cosY = Math.cos(yaw.current), sinY = Math.sin(yaw.current);
      const cosX = Math.cos(0.22), sinX = Math.sin(0.22);
      const fov = 2.6;
      ctx.clearRect(0, 0, W, H);

      // Atmosphere
      const atmo = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.7);
      atmo.addColorStop(0,   c.p + "2e"); atmo.addColorStop(0.4, c.p + "12");
      atmo.addColorStop(0.9, c.s + "06"); atmo.addColorStop(1, "transparent");
      ctx.fillStyle = atmo; ctx.fillRect(0, 0, W, H);

      const proj = (px: number, py: number, pz: number) => {
        const rx = px*cosY - pz*sinY, rz = px*sinY + pz*cosY;
        const ry = py*cosX - rz*sinX, rz2 = py*sinX + rz*cosX;
        const sc = fov / (fov + rz2 + 1.5);
        return { sx: cx + rx*R*sc, sy: cy + ry*R*sc, z: rz2 };
      };

      rings.forEach((rpts, ri) => {
        const pp = rpts.map(p => proj(p.x, p.y, p.z));
        ctx.beginPath(); let pen = false;
        pp.forEach(p => { if (p.z > -0.5) { pen ? ctx.lineTo(p.sx,p.sy):ctx.moveTo(p.sx,p.sy); pen=true; } else pen=false; });
        ctx.strokeStyle = c.p + (ri===0?"55":ri===1?"2e":"18");
        ctx.lineWidth = ri===0?1.5:0.8; ctx.setLineDash(ri===0?[]:[4,5]); ctx.stroke(); ctx.setLineDash([]);
        if (ri===0) {
          for (let t=0; t<36; t++) {
            const p = pp[Math.round((t/36)*pp.length)%pp.length];
            if (p.z<0) continue;
            const dx=p.sx-cx, dy=p.sy-cy, len=Math.hypot(dx,dy); if (len<1) continue;
            const ux=dx/len, uy=dy/len, tl=t%4===0?12:5;
            ctx.beginPath(); ctx.moveTo(p.sx,p.sy); ctx.lineTo(p.sx+ux*tl,p.sy+uy*tl);
            ctx.strokeStyle=c.p+(t%4===0?"90":"44"); ctx.lineWidth=t%4===0?1.5:0.7; ctx.stroke();
          }
        }
      });

      ctx.beginPath(); ctx.arc(cx,cy,R+14,0,Math.PI*2); ctx.strokeStyle=c.p+"28"; ctx.lineWidth=1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx,cy,R+24,0,Math.PI*2); ctx.strokeStyle=c.p+"10"; ctx.lineWidth=0.6; ctx.stroke();

      const pp2 = pts.map(p => proj(p.x,p.y,p.z));
      pp2.sort((a,b) => a.z-b.z);
      const boost = state==="listening"?1.3:1;
      for (const p of pp2) {
        const zN=(p.z+1.5)/3; if (zN<0.06) continue;
        const dist=Math.hypot(p.sx-cx,p.sy-cy)/R, core=Math.max(0,1-dist*1.5);
        const alpha=(0.06+zN*0.82)*boost, size=(0.4+zN*2.1+core*2.2)*boost;
        let fill: string;
        if (core>0.55)     fill=`rgba(255,255,255,${Math.min(1,alpha*1.5).toFixed(2)})`;
        else if (core>0.2) fill=c.p+Math.min(255,Math.round(alpha*285)).toString(16).padStart(2,"0");
        else               fill=c.s+Math.min(200,Math.round(alpha*220)).toString(16).padStart(2,"0");
        if (core>0.45) { ctx.shadowColor=c.p; ctx.shadowBlur=7; }
        ctx.beginPath(); ctx.arc(p.sx,p.sy,size,0,Math.PI*2); ctx.fillStyle=fill; ctx.fill(); ctx.shadowBlur=0;
      }

      const g1=ctx.createRadialGradient(cx,cy,0,cx,cy,R*0.33);
      g1.addColorStop(0,"rgba(255,255,255,0.95)"); g1.addColorStop(0.12,"rgba(255,255,255,0.65)");
      g1.addColorStop(0.35,c.p+"bb"); g1.addColorStop(0.75,c.p+"35"); g1.addColorStop(1,"transparent");
      ctx.fillStyle=g1; ctx.beginPath(); ctx.arc(cx,cy,R*0.33,0,Math.PI*2); ctx.fill();

      ctx.shadowColor="#fff"; ctx.shadowBlur=30;
      const g2=ctx.createRadialGradient(cx,cy,0,cx,cy,17);
      g2.addColorStop(0,"rgba(255,255,255,1)"); g2.addColorStop(0.5,"rgba(200,240,255,0.85)"); g2.addColorStop(1,"transparent");
      ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(cx,cy,17,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;

      raf.current=requestAnimationFrame(frame);
    };
    raf.current=requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
  }, [state]); // eslint-disable-line
}

// ── Radar ─────────────────────────────────────────────────────────
function Radar({ p }: { p: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ang = useRef(0);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf: number;
    const blips = Array.from({ length: 6 }, () => ({
      r: Math.random()*0.65+0.2, a: Math.random()*Math.PI*2,
      sz: Math.random()*2+1,     al: Math.random()*0.5+0.3,
    }));
    const draw = () => {
      const W=canvas.width, H=canvas.height, cx=W/2, cy=H/2, R=Math.min(W,H)*0.44;
      ang.current+=0.025; ctx.clearRect(0,0,W,H);
      [0.25,0.5,0.75,1].forEach(f=>{ctx.beginPath();ctx.arc(cx,cy,R*f,0,Math.PI*2);ctx.strokeStyle=p+"20";ctx.lineWidth=1;ctx.stroke();});
      [0,45,90,135].forEach(deg=>{const rd=deg*Math.PI/180;ctx.beginPath();ctx.moveTo(cx+Math.cos(rd)*R,cy+Math.sin(rd)*R);ctx.lineTo(cx-Math.cos(rd)*R,cy-Math.sin(rd)*R);ctx.strokeStyle=p+"14";ctx.lineWidth=0.5;ctx.stroke();});
      const span=0.7, steps=14;
      for(let s=0;s<steps;s++){const t=s/steps,a0=ang.current-span*(1-t),a1=ang.current-span*(1-(s+1)/steps);const al=Math.round((1-t)*0.45*255).toString(16).padStart(2,"0");ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,a0,a1);ctx.closePath();ctx.fillStyle=p+al;ctx.fill();}
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(ang.current)*R,cy+Math.sin(ang.current)*R);ctx.strokeStyle=p+"88";ctx.lineWidth=1.5;ctx.stroke();
      blips.forEach(b=>{const bx=cx+Math.cos(b.a)*R*b.r,by=cy+Math.sin(b.a)*R*b.r;const diff=((ang.current-b.a)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);const al=diff<1.4?b.al*(1-diff/1.4):0;if(al>0.02){ctx.beginPath();ctx.arc(bx,by,b.sz+1,0,Math.PI*2);ctx.fillStyle=p+Math.round(al*255).toString(16).padStart(2,"0");ctx.fill();}});
      ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.strokeStyle=p+"40";ctx.lineWidth=1.5;ctx.stroke();
      raf=requestAnimationFrame(draw);
    };
    draw(); return ()=>cancelAnimationFrame(raf);
  },[p]);
  return <canvas ref={ref} width={190} height={190} style={{display:"block",width:"100%",height:"auto"}}/>;
}

// ── Chat message bubble ───────────────────────────────────────────
function Bubble({ msg, primary }: { msg: ChatMsg; primary: string }) {
  const isAtlas = msg.role === "atlas";
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: isAtlas ? "flex-start" : "flex-end",
      marginBottom: 10,
    }}>
      <div style={{
        fontSize: 7, color: isAtlas ? primary : "rgba(255,255,255,0.3)",
        letterSpacing: "0.1em", marginBottom: 3,
      }}>
        {isAtlas ? "ATLAS · " : "YOU · "}{msg.time}
      </div>
      <div style={{
        maxWidth: "85%",
        padding: "8px 12px",
        background: isAtlas ? `${primary}12` : "rgba(255,255,255,0.06)",
        border: `1px solid ${isAtlas ? primary + "30" : "rgba(255,255,255,0.1)"}`,
        fontSize: 12, color: isAtlas ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.65)",
        lineHeight: 1.55, letterSpacing: "0.01em",
        borderRadius: isAtlas ? "0 6px 6px 6px" : "6px 0 6px 6px",
        boxShadow: isAtlas ? `0 0 16px ${primary}14` : "none",
      }}>
        {isAtlas && (
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:5 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:primary, boxShadow:`0 0 6px ${primary}` }} />
            <span style={{ fontSize:8, color:primary, letterSpacing:"0.1em" }}>JARVIS · via Atlas</span>
          </div>
        )}
        {msg.text}
      </div>
    </div>
  );
}

// ── Main overlay ──────────────────────────────────────────────────
export function JarvisOverlay({ onClose, onMessage }: JarvisOverlayProps) {
  const { address, isConnected } = useAccount();
  const [jState, setJState]       = useState<JarvisState>("idle");
  const [interim, setInterim]     = useState("");
  const [textInput, setTextInput] = useState("");
  const [chatLog, setChatLog]     = useState<ChatMsg[]>([]);
  const [log, setLog]             = useState<Log[]>(DEFAULT_LOG);
  const [agentRep, setAgentRep]   = useState<Record<string, number>>({});
  const [modelUsed, setModelUsed] = useState("");
  const [history, setHistory]     = useState<{ role: string; body: string }[]>([]);
  const [mounted, setMounted]     = useState(false);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const recRef     = useRef<any>(null);
  const synthRef   = useRef<SpeechSynthesis | null>(null);
  const voicesRef  = useRef<SpeechSynthesisVoice[]>([]);
  const pendingRef = useRef("");
  const sendRef    = useRef<(t: string) => void>(() => {});
  const logRef     = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useSphere(canvasRef, jState);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    synthRef.current = window.speechSynthesis;
    const load = () => { voicesRef.current = synthRef.current?.getVoices() ?? []; };
    load(); synthRef.current?.addEventListener("voiceschanged", load);
    return () => synthRef.current?.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(() => {
    fetch("/api/agents/status", { cache:"no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json) return;
        const map: Record<string, number> = {};
        for (const [k, v] of Object.entries(json as Record<string, { localScore?: number }>))
          map[k] = v.localScore ?? 75;
        setAgentRep(map);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/agents/stats/actions?limit=12", { cache:"no-store" })
      .then(r => r.ok ? r.json() : { actions:[] })
      .then(d => {
        const entries: Log[] = (d.actions ?? []).map((a: any) => ({
          id: String(a.action_id ?? Math.random()),
          time: a.ts ? new Date(a.ts*1000).toLocaleTimeString("en-GB",{hour12:false}) : "--:--",
          type: (a.action_type??"info").toUpperCase().replace(/_/g," "),
          text: `${a.agent_name??"ATLAS"} · Block #${a.block_number??"—"}`,
          tx: a.tx_hash,
        }));
        if (entries.length) setLog(entries);
      }).catch(() => {});
  }, []);

  const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const pick = voicesRef.current.find(v =>
      v.name.includes("Daniel") || v.name.includes("Google UK English Male") ||
      v.name.includes("Alex") || (v.lang.startsWith("en") && !v.name.toLowerCase().includes("female"))
    );
    if (pick) utt.voice = pick;
    utt.rate = 0.84; utt.pitch = 0.72;
    utt.onstart = () => setJState("speaking");
    utt.onend   = () => setJState("idle");
    synthRef.current.speak(utt);
  }, []);

  // Jarvis greeting
  useEffect(() => {
    const greeting = isConnected
      ? `JARVIS online. Atlas agent connected. Wallet ${address?.slice(0,6)} recognized. Portfolio value ${TOTAL_VAL.toLocaleString()} USD, yield-weighted APY ${TOTAL_APY} percent. All four sovereign agents operational on Mantle Sepolia. How can I assist?`
      : `JARVIS online. Atlas agent standing by. Connect your wallet to load portfolio data. All four sovereign agents operational on Mantle Sepolia.`;
    const t = setTimeout(() => {
      setChatLog([{ role:"atlas", text: greeting, time: now() }]);
      speak(greeting);
    }, 700);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog, interim]);

  const pushLog = useCallback((type: string, text: string, tx?: string) => {
    setLog(prev => [{
      id: `${Date.now()}-${Math.random()}`,
      time: now(), type, text: text.slice(0,110), tx,
    }, ...prev].slice(0, 20));
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = 0; }, 50);
  }, []);

  const sendToAtlas = useCallback(async (text: string) => {
    setChatLog(prev => [...prev, { role:"user", text, time: now() }]);
    onMessage?.("user", text);          // sync user msg to chat
    setJState("thinking");
    setTextInput("");
    pushLog("INPUT", text);
    const next = [...history, { role:"user", body:text }];
    setHistory(next);
    try {
      const data = await agentApi<any>("/chat", {
        method:"POST",
        body: JSON.stringify({ agent_id:"atlas", messages:next }),
      });
      const reply = data.reply || data.message || "Understood.";
      const model = data.model_used || data.modelUsed || "";
      setHistory(h => [...h, { role:"atlas", body:reply }]);
      setChatLog(prev => [...prev, { role:"atlas", text:reply, time:now() }]);
      if (model) setModelUsed(model);
      if (data.onChainTx) {
        pushLog("EXECUTE", reply, data.onChainTx);
        setJState("executing");
        setTimeout(() => speak(reply), 400);
      } else {
        pushLog("RESPONSE", reply);
        speak(reply);
      }
      onMessage?.("atlas", reply);      // sync atlas reply to chat
    } catch {
      const msg = "Atlas backend connection failed.";
      setChatLog(prev => [...prev, { role:"atlas", text:msg, time:now() }]);
      pushLog("ERROR", msg); speak(msg); setJState("idle");
    }
  }, [history, pushLog, speak, onMessage]);

  useEffect(() => { sendRef.current = sendToAtlas; }, [sendToAtlas]);

  const toggleListen = useCallback(() => {
    if (jState==="listening") { recRef.current?.stop(); return; }
    if (jState==="thinking" || jState==="executing") return;
    synthRef.current?.cancel();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setChatLog(p=>[...p,{role:"atlas",text:"Voice requires Chrome or Edge.",time:now()}]); return; }
    const rec = new SR();
    recRef.current = rec;
    pendingRef.current = "";
    rec.continuous=false; rec.interimResults=true; rec.lang="en-US";
    rec.onstart  = () => { setJState("listening"); setInterim(""); };
    rec.onresult = (e: any) => { const t=Array.from(e.results).map((r:any)=>r[0].transcript).join(""); pendingRef.current=t; setInterim(t); };
    rec.onend    = () => { setInterim(""); const h=pendingRef.current.trim(); pendingRef.current=""; if(h) sendRef.current(h); else setJState("idle"); };
    rec.onerror  = (e: any) => { setInterim(""); setJState("idle"); if(e.error==="not-allowed") setChatLog(p=>[...p,{role:"atlas",text:"Microphone access denied. Check browser permissions.",time:now()}]); };
    rec.start();
  }, [jState]);

  const submitText = useCallback(() => {
    const t = textInput.trim();
    if (!t || jState==="thinking" || jState==="executing") return;
    sendRef.current(t);
  }, [textInput, jState]);

  const c    = CFG[jState];
  const busy = jState==="thinking" || jState==="executing";
  const repOf = (id: string) => agentRep[id] ?? AGENTS_CFG.find(a=>a.id===id)?.rep ?? 75;

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999,
      background:"#020b14",
      opacity: mounted ? 1 : 0,
      transition:"opacity 0.45s ease",
      display:"grid",
      gridTemplate:`"top top top" 50px "left ctr right" 1fr "bot bot bot" 130px / 258px 1fr 240px`,
      overflow:"hidden",
      fontFamily:"var(--font-mono)",
    }}>

      {/* ── Starfield background ── */}
      <Starfield primary={c.p} />

      {/* Hex grid overlay (very subtle) */}
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.018,pointerEvents:"none",zIndex:1}}>
        <defs>
          <pattern id="jhex" x="0" y="0" width="40" height="46" patternUnits="userSpaceOnUse">
            <polygon points="20,1 39,11.5 39,34.5 20,45 1,34.5 1,11.5" fill="none" stroke={c.p} strokeWidth="0.6"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#jhex)"/>
      </svg>

      {/* HUD corner brackets */}
      {[
        {top:10,left:10,  borderTop:`1.5px solid ${c.p}55`,borderLeft:`1.5px solid ${c.p}55`},
        {top:10,right:10, borderTop:`1.5px solid ${c.p}55`,borderRight:`1.5px solid ${c.p}55`},
        {bottom:10,left:10,  borderBottom:`1.5px solid ${c.p}55`,borderLeft:`1.5px solid ${c.p}55`},
        {bottom:10,right:10, borderBottom:`1.5px solid ${c.p}55`,borderRight:`1.5px solid ${c.p}55`},
      ].map((s,i)=>(
        <div key={i} style={{position:"absolute",width:22,height:22,pointerEvents:"none",zIndex:2,...s}}/>
      ))}

      {/* ─── TOP BAR ──────────────────────────────────────────── */}
      <header style={{
        gridArea:"top", zIndex:2,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 20px",
        borderBottom:`1px solid ${c.p}20`,
        background:`rgba(2,11,20,0.85)`,
        backdropFilter:"blur(8px)",
      }}>
        {/* ← Back button */}
        <button onClick={onClose} style={{
          display:"flex", alignItems:"center", gap:8,
          background:"transparent", border:`1px solid ${c.p}35`,
          color:c.p, cursor:"pointer", fontFamily:"var(--font-mono)",
          fontSize:10, padding:"5px 14px", letterSpacing:"0.1em",
          transition:"all 0.2s",
        }}
        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=`${c.p}15`;}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";}}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
          BACK TO CHAT
        </button>

        {/* Identity */}
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:16,letterSpacing:"0.22em",color:c.p,textShadow:`0 0 20px ${c.p}`}}>JARVIS</span>
          {["ATLAS AGENT","ERC-8004","ID #44","MANTLE SEPOLIA"].map((t,i)=>(
            <span key={i} style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{color:`${c.p}30`}}>·</span>
              <span style={{fontSize:9,color:`${c.p}65`,letterSpacing:"0.1em"}}>{t}</span>
            </span>
          ))}
        </div>

        {/* Right: state pill + model */}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {modelUsed && <span style={{fontSize:9,color:"#a855f7",border:"1px solid #a855f770",padding:"2px 8px"}}>{modelUsed}</span>}
          <span style={{fontSize:9,padding:"3px 11px",color:c.p,border:`1px solid ${c.p}50`,background:`${c.p}10`,letterSpacing:"0.1em"}}>
            {c.label}
          </span>
        </div>
      </header>

      {/* ─── LEFT PANEL ──────────────────────────────────────── */}
      <aside style={{
        gridArea:"left", zIndex:2,
        borderRight:`1px solid ${c.p}15`,
        padding:"16px 14px",
        display:"flex", flexDirection:"column", gap:16,
        overflow:"hidden",
        background:"rgba(2,11,20,0.7)", backdropFilter:"blur(6px)",
      }}>
        <div>
          <div style={{fontSize:7,color:`${c.p}50`,letterSpacing:"0.18em",marginBottom:4}}>J.A.R.V.I.S.</div>
          <div style={{fontSize:7,color:`${c.p}35`,letterSpacing:"0.1em"}}>JUST A RATHER VERY INTELLIGENT SYSTEM</div>
        </div>

        {/* Agent status */}
        <div>
          <div style={{fontSize:8,color:`${c.p}55`,letterSpacing:"0.15em",marginBottom:10}}>SYSTEM TOTALS</div>
          {AGENTS_CFG.map(ag=>{
            const rep=repOf(ag.id);
            return (
              <div key={ag.id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:ag.color,boxShadow:`0 0 5px ${ag.color}`}}/>
                    <span style={{fontSize:9,color:ag.color,letterSpacing:"0.08em"}}>{ag.name.toUpperCase()}</span>
                  </div>
                  <span style={{fontSize:9,color:"rgba(255,255,255,0.35)"}}>{rep.toFixed(0)}</span>
                </div>
                <div style={{height:2,background:"rgba(255,255,255,0.06)"}}>
                  <div style={{width:`${rep}%`,height:"100%",background:ag.color,boxShadow:`0 0 5px ${ag.color}`,transition:"width 1.2s ease"}}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* System metrics */}
        <div>
          <div style={{fontSize:8,color:`${c.p}55`,letterSpacing:"0.15em",marginBottom:8}}>SYSTEM STATUS</div>
          {[["NEURAL CORE","ONLINE"],["MEMORY","8,421 kb"],["EFFICIENCY","87.3%"],["THERMAL","38.2°C"],["THROUGHPUT","1.4Mbit/s"]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontSize:8,color:"rgba(255,255,255,0.28)",letterSpacing:"0.06em"}}>{k}</span>
              <span style={{fontSize:8,color:"rgba(255,255,255,0.55)"}}>{v}</span>
            </div>
          ))}
        </div>

        {/* Telemetry log */}
        <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:8,color:`${c.p}55`,letterSpacing:"0.15em",marginBottom:8,flexShrink:0}}>TELEMETRY · LIVE</div>
          <div ref={logRef} style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
            {log.map(entry=>(
              <div key={entry.id} style={{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:1}}>
                  <span style={{
                    fontSize:7,padding:"1px 5px",
                    background:entry.type.includes("ERROR")?"#ef444415":entry.type.includes("EXEC")?"#fbbf2415":`${c.p}10`,
                    color:entry.type.includes("ERROR")?"#ef4444":entry.type.includes("EXEC")?"#fbbf24":c.p,
                    letterSpacing:"0.06em",
                  }}>{entry.type.slice(0,14)}</span>
                  <span style={{fontSize:7,color:"rgba(255,255,255,0.2)"}}>{entry.time}</span>
                </div>
                <div style={{fontSize:8,color:"rgba(255,255,255,0.4)",marginTop:2}}>{entry.text}</div>
                {entry.tx&&<a href={`https://sepolia.mantlescan.xyz/tx/${entry.tx}`} target="_blank" rel="noreferrer" style={{fontSize:7,color:c.p,textDecoration:"none"}}>{entry.tx.slice(0,8)}…↗</a>}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ─── CENTER ──────────────────────────────────────────── */}
      <main style={{
        gridArea:"ctr", zIndex:2,
        display:"flex", flexDirection:"column", alignItems:"center",
        padding:"12px 24px 12px",
        overflow:"hidden", gap:10,
      }}>
        {/* Sphere */}
        <div style={{position:"relative",width:300,height:300,flexShrink:0}}>
          {(jState==="listening"||jState==="speaking"||jState==="executing")&&
            [1,2,3].map(i=>(
              <div key={i} style={{
                position:"absolute",inset:`${-i*16}px`,borderRadius:"50%",
                border:`1px solid ${c.p}`,pointerEvents:"none",
                animation:`jarvisPulse ${0.9+i*0.35}s ease-out ${i*0.22}s infinite`,
              }}/>
            ))
          }
          <canvas ref={canvasRef} width={300} height={300} style={{display:"block"}}/>
        </div>

        {/* Interim voice text */}
        {interim && (
          <div style={{
            padding:"8px 16px", border:`1px solid ${c.p}40`,
            background:`${c.p}10`, fontSize:13, color:c.p,
            textShadow:`0 0 14px ${c.p}`, maxWidth:420, textAlign:"center",
            letterSpacing:"0.02em", flexShrink:0,
          }}>
            {interim}
            <span style={{display:"inline-block",width:2,height:12,background:c.p,marginLeft:3,verticalAlign:"middle",animation:"jarvisCaret 0.7s step-end infinite"}}/>
          </div>
        )}

        {/* ── Conversation log ── */}
        <div style={{
          flex:1, minHeight:0, width:"100%", maxWidth:520,
          overflowY:"auto", display:"flex", flexDirection:"column",
          padding:"6px 2px",
        }}>
          {chatLog.map((msg, i) => <Bubble key={i} msg={msg} primary={c.p} />)}
          {busy && (
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:c.p,boxShadow:`0 0 6px ${c.p}`}}/>
              <span style={{fontSize:9,color:`${c.p}80`,letterSpacing:"0.1em"}}>ATLAS PROCESSING…</span>
              {[0,1,2].map(i=><span key={i} style={{width:4,height:4,borderRadius:"50%",background:c.p,opacity:0.6,animation:`jarvisDot 1.2s ${i*0.15}s ease-in-out infinite`}}/>)}
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>

        {/* State hint */}
        <div style={{fontSize:8,color:`${c.p}45`,letterSpacing:"0.14em",flexShrink:0}}>
          {jState==="listening"?"LISTENING · CLICK MIC TO STOP"
           :jState==="thinking"?"PROCESSING · PLEASE WAIT"
           :jState==="speaking"?"ATLAS SPEAKING…"
           :jState==="executing"?"EXECUTING ON MANTLE…"
           :"CLICK MIC TO SPEAK · OR TYPE BELOW"}
        </div>

        {/* Mic button */}
        <button onClick={toggleListen} disabled={busy} style={{
          width:54,height:54,borderRadius:"50%",flexShrink:0,
          border:`2px solid ${jState==="listening"?c.p:`${c.p}40`}`,
          background:jState==="listening"?`${c.p}18`:"transparent",
          color:jState==="listening"?c.p:`${c.p}55`,
          cursor:busy?"not-allowed":"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:jState==="listening"?`0 0 28px ${c.p}55`:"none",
          transition:"all 0.25s",
        }}>
          {busy?(
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" strokeDasharray="56" strokeLinecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
              </circle>
            </svg>
          ):(
            <svg width="18" height="18" viewBox="0 0 24 24" fill={jState==="listening"?"currentColor":"none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          )}
        </button>

        {/* Text input */}
        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6,width:"100%",maxWidth:440,flexShrink:0}}>
          <input
            value={textInput}
            onChange={e=>setTextInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&submitText()}
            disabled={busy}
            placeholder="Type a command…"
            style={{
              background:"rgba(255,255,255,0.04)",border:`1px solid ${c.p}25`,
              color:"rgba(255,255,255,0.7)",fontFamily:"var(--font-mono)",fontSize:11,
              padding:"7px 12px",outline:"none",letterSpacing:"0.03em",
            }}
          />
          <button onClick={submitText} disabled={busy||!textInput.trim()} style={{
            background:textInput.trim()&&!busy?`${c.p}18`:"transparent",
            border:`1px solid ${c.p}25`,color:c.p,
            fontFamily:"var(--font-mono)",fontSize:11,
            padding:"7px 14px",cursor:busy||!textInput.trim()?"not-allowed":"pointer",
            transition:"all 0.2s",
          }}>↵</button>
        </div>

        {/* Quick commands */}
        <div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center",maxWidth:460,flexShrink:0}}>
          {QUICK_CMDS.map(cmd=>(
            <button key={cmd} onClick={()=>!busy&&sendRef.current(cmd)} disabled={busy} style={{
              background:"transparent",border:`1px solid ${c.p}1a`,
              color:`${c.p}60`,fontFamily:"var(--font-mono)",fontSize:8,
              padding:"3px 9px",cursor:busy?"not-allowed":"pointer",
              letterSpacing:"0.06em",transition:"all 0.15s",
            }}
            onMouseEnter={e=>{if(!busy){(e.currentTarget as HTMLElement).style.borderColor=`${c.p}55`;(e.currentTarget as HTMLElement).style.color=c.p;}}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=`${c.p}1a`;(e.currentTarget as HTMLElement).style.color=`${c.p}60`;}}
            >{cmd}</button>
          ))}
        </div>
      </main>

      {/* ─── RIGHT PANEL ─────────────────────────────────────── */}
      <aside style={{
        gridArea:"right", zIndex:2,
        borderLeft:`1px solid ${c.p}15`,
        padding:"16px 14px",
        display:"flex",flexDirection:"column",gap:14,overflow:"hidden",
        background:"rgba(2,11,20,0.7)",backdropFilter:"blur(6px)",
      }}>
        <div>
          <div style={{fontSize:8,color:`${c.p}55`,letterSpacing:"0.15em",marginBottom:8}}>SPATIAL RADAR</div>
          <Radar p={c.p}/>
        </div>
        <div>
          <div style={{fontSize:8,color:`${c.p}55`,letterSpacing:"0.15em",marginBottom:6}}>
            PORTFOLIO · {isConnected?address?.slice(0,6)+"…":"DISCONNECTED"}
          </div>
          <div style={{fontSize:18,color:c.p,marginBottom:1,textShadow:`0 0 16px ${c.p}55`}}>${TOTAL_VAL.toLocaleString()}</div>
          <div style={{fontSize:8,color:"rgba(255,255,255,0.35)",marginBottom:10,letterSpacing:"0.06em"}}>{TOTAL_APY}% YIELD-WEIGHTED APY</div>
          {PORTFOLIO.map(({sym,pct,apy,color,value})=>(
            <div key={sym} style={{marginBottom:7}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                <span style={{fontSize:9,color}}>{sym}</span>
                <span style={{fontSize:9,color:"rgba(255,255,255,0.38)"}}>${value.toLocaleString()} · {apy}%</span>
              </div>
              <div style={{height:3,background:"rgba(255,255,255,0.06)",overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",background:color,boxShadow:`0 0 6px ${color}`}}/>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{fontSize:8,color:`${c.p}55`,letterSpacing:"0.15em",marginBottom:7}}>YIELD INTELLIGENCE</div>
          {[{l:"USDY",v:4.20,c:"#00e5a0"},{l:"MI4",v:5.81,c:"#0ea5e9"},{l:"mETH",v:6.12,c:"#a855f7"},{l:"mBTC",v:3.95,c:"#f97316"}].map(({l,v,c:col})=>(
            <div key={l} style={{marginBottom:7}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                <span style={{fontSize:8,color:"rgba(255,255,255,0.4)"}}>{l}</span>
                <span style={{fontSize:8,color:col}}>{v}%</span>
              </div>
              <div style={{height:3,background:"rgba(255,255,255,0.06)",overflow:"hidden"}}>
                <div style={{width:`${(v/8)*100}%`,height:"100%",background:`linear-gradient(90deg,${col}55,${col})`,boxShadow:`0 0 5px ${col}`}}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{marginTop:"auto"}}>
          <div style={{fontSize:8,color:`${c.p}55`,letterSpacing:"0.15em",marginBottom:7}}>RISK METRICS</div>
          {[["CVaR","1.84%","#00e5a0"],["VOL","3.2%","#eab308"],["MAX DD","4.1%","#f97316"],["SHARPE","2.41","#00d4ff"]].map(([k,v,col])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontSize:8,color:"rgba(255,255,255,0.28)"}}>{k}</span>
              <span style={{fontSize:8,color:col as string}}>{v}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ─── BOTTOM ──────────────────────────────────────────── */}
      <footer style={{
        gridArea:"bot", zIndex:2,
        borderTop:`1px solid ${c.p}18`,
        background:"rgba(2,11,20,0.85)",backdropFilter:"blur(8px)",
        padding:"10px 20px",
        display:"flex",flexDirection:"column",gap:7,
      }}>
        <div style={{fontSize:8,color:`${c.p}50`,letterSpacing:"0.18em",flexShrink:0}}>PRIMARY OBJECTIVES · MISSION STATUS</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:1,flexShrink:0}}>
          {[
            {label:"PORTFOLIO VALUE",  val:`$${TOTAL_VAL.toLocaleString()}`, color:c.p},
            {label:"YIELD-WTDAVG APY", val:`${TOTAL_APY}%`,                  color:"#00e5a0"},
            {label:"AGENTS ONLINE",    val:"4 / 4",                           color:"#0ea5e9"},
            {label:"IN PROGRESS",      val:"52",                              color:"#eab308"},
            {label:"OBJECTIVE STATUS", val:"ENGAGED",                         color:"#34d399"},
          ].map(({label,val,color})=>(
            <div key={label} style={{padding:"7px 10px",border:`1px solid ${c.p}12`,background:`${c.p}05`}}>
              <div style={{fontSize:7,color:"rgba(255,255,255,0.3)",letterSpacing:"0.08em",marginBottom:3}}>{label}</div>
              <div style={{fontSize:12,color,letterSpacing:"0.04em"}}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:8,color:`${c.p}38`,overflow:"hidden",flexShrink:0,letterSpacing:"0.06em",whiteSpace:"nowrap"}}>
          <span style={{display:"inline-block",animation:"jarvisMarquee 24s linear infinite"}}>
            {log.slice(0,8).map(e=>`[${e.time}] ${e.type} · ${e.text}`).join("   ·   ")}
          </span>
        </div>
      </footer>

      <style>{`
        @keyframes jarvisPulse {
          0%   { opacity:0.75; transform:scale(1); }
          100% { opacity:0;    transform:scale(1.16); }
        }
        @keyframes jarvisCaret {
          0%,100% { opacity:1; } 50% { opacity:0; }
        }
        @keyframes jarvisMarquee {
          from { transform:translateX(100vw); }
          to   { transform:translateX(-100%); }
        }
        @keyframes jarvisDot {
          0%,100% { transform:scale(1); opacity:0.5; }
          50%     { transform:scale(1.5); opacity:1; }
        }
      `}</style>
    </div>
  );
}
