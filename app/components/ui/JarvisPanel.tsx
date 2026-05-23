"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { agentApi } from "@/lib/agent-api";

type JState = "idle" | "listening" | "thinking" | "speaking" | "executing";

const C: Record<JState, { p: string; label: string }> = {
  idle:      { p: "#00d4ff", label: "STANDBY"    },
  listening: { p: "#00e5a0", label: "LISTENING"  },
  thinking:  { p: "#a855f7", label: "PROCESSING" },
  speaking:  { p: "#34d399", label: "SPEAKING"   },
  executing: { p: "#fbbf24", label: "EXECUTING"  },
};

interface ChatMsg { role: "user" | "atlas"; text: string; time: string; isNew?: boolean }
interface JarvisPanelProps {
  onMessage?: (role: "user" | "atlas", text: string) => void;
  messages?: { role: string; body: string }[]; // atlas chat history context
}

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
function Bubble({ msg, p, activeWordIdx }: { msg: ChatMsg; p: string; activeWordIdx?: number }) {
  const isAtlas = msg.role === "atlas";
  const [shown, setShown] = useState(msg.isNew ? "" : msg.text);
  const words = msg.text.split(/\s+/).filter(Boolean);

  useEffect(() => {
    if (!msg.isNew) { setShown(msg.text); return; }
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setShown(msg.text.slice(0, i));
      if (i >= msg.text.length) { setShown(msg.text); clearInterval(id); }
    }, 18);
    return () => clearInterval(id);
  }, [msg.text, msg.isNew]);

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems: isAtlas ? "flex-start" : "flex-end", marginBottom:8 }}>
      <div style={{ fontSize:8, color: isAtlas ? p : "rgba(255,255,255,0.25)", letterSpacing:"0.08em", marginBottom:2 }}>
        {isAtlas ? `JARVIS · ${msg.time}` : `YOU · ${msg.time}`}
      </div>
      <div style={{
        maxWidth:"90%", padding:"7px 10px",
        background: isAtlas ? `${p}10` : "rgba(255,255,255,0.05)",
        border:`1px solid ${isAtlas ? p+"28" : "rgba(255,255,255,0.08)"}`,
        borderRadius: isAtlas ? "0 6px 6px 6px" : "6px 0 6px 6px",
        fontSize:11, color: isAtlas ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
        lineHeight:1.55,
        boxShadow: isAtlas ? `0 0 12px ${p}10` : "none",
      }}>
        {isAtlas && (
          <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:4 }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:p, boxShadow:`0 0 5px ${p}` }}/>
            <span style={{ fontSize:7, color:p, letterSpacing:"0.1em" }}>JARVIS · via Atlas</span>
          </div>
        )}
        {isAtlas && activeWordIdx !== undefined && activeWordIdx >= 0 ? (
          words.map((w, i) => (
            <span key={i} style={{
              color: i === activeWordIdx ? p : "rgba(255,255,255,0.85)",
              textShadow: i === activeWordIdx ? `0 0 12px ${p}` : "none",
              fontWeight: i === activeWordIdx ? 600 : 400,
              transition: "color 0.06s, text-shadow 0.06s",
              marginRight: "0.28em",
              display: "inline-block",
            }}>{w}</span>
          ))
        ) : isAtlas ? renderWithTxLinks(shown, "#f59e0b") : shown}
        {isAtlas && msg.isNew && shown.length < msg.text.length && activeWordIdx === undefined && (
          <span style={{ display:"inline-block", width:2, height:10, background:p, marginLeft:2, verticalAlign:"middle", animation:"jPanelCaret 0.6s step-end infinite" }}/>
        )}
      </div>
    </div>
  );
}

// ── Mini sphere canvas ────────────────────────────────────────────
function MiniSphere({ state }: { state: JState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const yaw = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    const N = 600, PHI = Math.PI * (3 - Math.sqrt(5));
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), t = PHI * i;
      return { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
    });
    const mkRing = (tx: number, n = 80) =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return { x: Math.cos(a), y: Math.sin(a) * Math.sin(tx), z: Math.sin(a) * Math.cos(tx) };
      });
    const rings = [mkRing(0.15, 90), mkRing(1.0, 70), mkRing(-0.7, 60)];
    const c = C[state];

    const frame = () => {
      const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.40;
      yaw.current += state==="listening"?0.008:state==="thinking"?0.015:state==="executing"?0.012:state==="speaking"?0.011:0.003;
      const cY=Math.cos(yaw.current), sY=Math.sin(yaw.current), cX=Math.cos(0.2), sX=Math.sin(0.2);
      const fov = 2.4;
      ctx.clearRect(0, 0, W, H);

      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.4);
      g.addColorStop(0,c.p+"22"); g.addColorStop(0.5,c.p+"0a"); g.addColorStop(1,"transparent");
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

      const proj=(px:number,py:number,pz:number)=>{
        const rx=px*cY-pz*sY, rz=px*sY+pz*cY;
        const ry=py*cX-rz*sX, rz2=py*sX+rz*cX;
        const sc=fov/(fov+rz2+1.5);
        return {sx:cx+rx*R*sc,sy:cy+ry*R*sc,z:rz2};
      };

      rings.forEach((rpts,ri)=>{
        const pp=rpts.map(p=>proj(p.x,p.y,p.z));
        ctx.beginPath(); let pen=false;
        pp.forEach(p=>{if(p.z>-0.5){pen?ctx.lineTo(p.sx,p.sy):ctx.moveTo(p.sx,p.sy);pen=true;}else pen=false;});
        ctx.strokeStyle=c.p+(ri===0?"50":ri===1?"28":"15");
        ctx.lineWidth=ri===0?1.2:0.6; ctx.setLineDash(ri===0?[]:[3,4]); ctx.stroke(); ctx.setLineDash([]);
        if(ri===0){
          for(let t=0;t<24;t++){
            const p=pp[Math.round((t/24)*pp.length)%pp.length];
            if(p.z<0) continue;
            const dx=p.sx-cx,dy=p.sy-cy,len=Math.hypot(dx,dy); if(len<1) continue;
            const tl=t%4===0?9:4;
            ctx.beginPath();ctx.moveTo(p.sx,p.sy);ctx.lineTo(p.sx+(dx/len)*tl,p.sy+(dy/len)*tl);
            ctx.strokeStyle=c.p+(t%4===0?"80":"38");ctx.lineWidth=t%4===0?1.2:0.6;ctx.stroke();
          }
        }
      });

      ctx.beginPath();ctx.arc(cx,cy,R+8,0,Math.PI*2);ctx.strokeStyle=c.p+"22";ctx.lineWidth=1;ctx.stroke();

      const pp2=pts.map(p=>proj(p.x,p.y,p.z)); pp2.sort((a,b)=>a.z-b.z);
      const boost=state==="listening"?1.3:state==="executing"?1.2:1;
      for(const p of pp2){
        const zN=(p.z+1.5)/3; if(zN<0.07) continue;
        const dist=Math.hypot(p.sx-cx,p.sy-cy)/R, core=Math.max(0,1-dist*1.5);
        const alpha=(0.06+zN*0.8)*boost, size=(0.35+zN*1.8+core*1.8)*boost;
        let fill:string;
        if(core>0.55)     fill=`rgba(255,255,255,${Math.min(1,alpha*1.4).toFixed(2)})`;
        else if(core>0.2) fill=c.p+Math.min(255,Math.round(alpha*270)).toString(16).padStart(2,"0");
        else              fill=`rgba(0,80,180,${(alpha*0.6).toFixed(2)})`;
        if(core>0.5){ctx.shadowColor=c.p;ctx.shadowBlur=5;}
        ctx.beginPath();ctx.arc(p.sx,p.sy,size,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.shadowBlur=0;
      }

      const g1=ctx.createRadialGradient(cx,cy,0,cx,cy,R*0.3);
      g1.addColorStop(0,"rgba(255,255,255,0.9)"); g1.addColorStop(0.2,"rgba(255,255,255,0.5)");
      g1.addColorStop(0.4,c.p+"99"); g1.addColorStop(1,"transparent");
      ctx.fillStyle=g1; ctx.beginPath();ctx.arc(cx,cy,R*0.3,0,Math.PI*2);ctx.fill();

      ctx.shadowColor="#fff";ctx.shadowBlur=20;
      const g2=ctx.createRadialGradient(cx,cy,0,cx,cy,11);
      g2.addColorStop(0,"rgba(255,255,255,1)"); g2.addColorStop(0.5,"rgba(200,240,255,0.8)"); g2.addColorStop(1,"transparent");
      ctx.fillStyle=g2;ctx.beginPath();ctx.arc(cx,cy,11,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;

      raf.current=requestAnimationFrame(frame);
    };
    raf.current=requestAnimationFrame(frame);
    return ()=>cancelAnimationFrame(raf.current);
  }, [state]); // eslint-disable-line

  return <canvas ref={ref} width={260} height={260} style={{display:"block",width:"100%",height:"auto"}}/>;
}

const SENSITIVE_RE = /\b(private[_\s.]?key|AGENT_PRIVATE_KEY|mnemonic|seed[_\s.]?phrase|secret[_\s.]?key|priv[_\s.]?key)\b/i;
const SENSITIVE_REFUSAL = "I cannot share private keys, mnemonics, or backend credentials — those stay in the server environment and are never exposed through this interface.";

// ── Main panel ────────────────────────────────────────────────────
export function JarvisPanel({ onMessage, messages: chatContext = [] }: JarvisPanelProps) {
  const { address, isConnected } = useAccount();
  const [jState, setJState]     = useState<JState>("idle");
  const [interim, setInterim]   = useState("");
  const [textInput, setTextInput] = useState("");
  const [chatLog, setChatLog]   = useState<ChatMsg[]>([]);
  const [modelUsed, setModelUsed] = useState("");
  const [history, setHistory]   = useState<{ role: string; body: string }[]>([]);
  const [onChainTx, setOnChainTx] = useState("");
  const [speakWordIdx, setSpeakWordIdx] = useState(-1);

  const recRef       = useRef<any>(null);
  const synthRef     = useRef<SpeechSynthesis | null>(null);
  const voicesRef    = useRef<SpeechSynthesisVoice[]>([]);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const sourceRef    = useRef<AudioBufferSourceNode | null>(null);
  const onChainTxRef = useRef("");
  const speakWordsRef = useRef<string[]>([]);
  const pendingRef   = useRef("");
  const sendRef      = useRef<(t: string) => void>(() => {});
  const chatEndRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    synthRef.current = window.speechSynthesis;
    const load = () => { voicesRef.current = synthRef.current?.getVoices() ?? []; };
    load(); synthRef.current?.addEventListener("voiceschanged", load);
    return () => synthRef.current?.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(() => {
    const el = document.createElement("style");
    el.id = "jarvis-panel-styles";
    if (!document.getElementById("jarvis-panel-styles")) {
      el.textContent = `
        @keyframes jPanelPulse { 0%{opacity:0.7;transform:scale(1);}100%{opacity:0;transform:scale(1.12);} }
        @keyframes jPanelCaret { 0%,100%{opacity:1;}50%{opacity:0;} }
        @keyframes jPanelDot   { 0%,100%{transform:scale(1);opacity:0.4;}50%{transform:scale(1.6);opacity:1;} }
      `;
      document.head.appendChild(el);
    }
    return () => { document.getElementById("jarvis-panel-styles")?.remove(); };
  }, []);

  const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

  // Unlock AudioContext on first user interaction (mobile autoplay policy)
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
    // Stop previous audio to prevent double playback
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    synthRef.current?.cancel();

    // Primary: backend TTS via Web Audio API
    try {
      const res = await fetch("/api/agents/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 100) {
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
            audioCtxRef.current = new AC();
          }
          const ac = audioCtxRef.current;
          if (ac.state === "suspended") { try { await ac.resume(); } catch {} }
          const decoded = await ac.decodeAudioData(buf.slice(0));
          const source = ac.createBufferSource();
          source.buffer = decoded;
          source.playbackRate.value = 0.82; // lower pitch → masculine voice
          source.connect(ac.destination);
          sourceRef.current = source;
          if (!hasTx()) setJState("speaking");
          source.onended = () => { sourceRef.current = null; if (!hasTx()) setJState("idle"); setSpeakWordIdx(-1); };
          source.start(0);
          return;
        }
      }
    } catch { /* fall through to browser TTS */ }

    // Fallback: browser TTS — pitch 0.1 forces deep robotic voice (not female)
    if (!synthRef.current) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.9;
    utt.pitch = 0.1;
    utt.onstart = () => { if (!hasTx()) setJState("speaking"); };
    utt.onend   = () => { if (!hasTx()) setJState("idle"); setSpeakWordIdx(-1); };
    synthRef.current.speak(utt);
  }, []);

  // Greeting on mount
  useEffect(() => {
    const greeting = isConnected
      ? `JARVIS online. Atlas agent connected. Wallet ${address?.slice(0,6)} recognized. How can I assist?`
      : `JARVIS online. Atlas agent standing by. Connect wallet to load portfolio.`;
    const t = setTimeout(() => {
      setChatLog([{ role:"atlas", text: greeting, time: now(), isNew: true }]);
      speak(greeting);
    }, 500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [chatLog, interim]);

  const sendToAtlas = useCallback(async (text: string) => {
    setChatLog(prev => [...prev, { role:"user", text, time: now() }]);
    onMessage?.("user", text);
    setTextInput("");

    if (SENSITIVE_RE.test(text)) {
      setChatLog(prev => [...prev, { role:"atlas", text: SENSITIVE_REFUSAL, time: now(), isNew: true }]);
      onMessage?.("atlas", SENSITIVE_REFUSAL);
      speak(SENSITIVE_REFUSAL);
      return;
    }

    setJState("thinking");
    const next = [...history, { role:"user", body:text }];
    setHistory(next);
    try {
      // Include atlas chat session context so JARVIS shares Atlas's conversation
      const apiMessages = [...chatContext, ...next];
      const data = await agentApi<any>("/chat", {
        method:"POST",
        body: JSON.stringify({ agent_id:"atlas", messages: apiMessages, wallet_address: address || null }),
      });
      const reply = data.reply || data.message || "Understood.";
      const model = data.model_used || data.modelUsed || "";
      const tx: string = data.on_chain_tx || "";
      setHistory(h => [...h, { role:"atlas", body:reply }]);
      if (model) setModelUsed(model);
      setChatLog(prev => [...prev, { role:"atlas", text: reply, time: now(), isNew: true }]);
      onMessage?.("atlas", reply);
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
      const msg = "Atlas connection failed.";
      setChatLog(prev => [...prev, { role:"atlas", text: msg, time: now(), isNew: true }]);
      onMessage?.("atlas", msg);
      speak(msg); setJState("idle");
    }
  }, [history, chatContext, address, speak, onMessage]);

  useEffect(() => { sendRef.current = sendToAtlas; }, [sendToAtlas]);

  const toggleListen = useCallback(() => {
    unlockAudio();
    if (jState==="listening") { recRef.current?.stop(); return; }
    if (jState==="thinking" || jState==="executing") return;
    synthRef.current?.cancel();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setChatLog(p=>[...p,{role:"atlas",text:"Voice requires Chrome or Edge.",time:now(),isNew:true}]); return; }
    const rec = new SR();
    recRef.current = rec; pendingRef.current = "";
    rec.continuous=false; rec.interimResults=true; rec.lang="en-US";
    rec.onstart  = ()=>{ setJState("listening"); setInterim(""); };
    rec.onresult = (e:any)=>{ const t=Array.from(e.results).map((r:any)=>r[0].transcript).join(""); pendingRef.current=t; setInterim(t); };
    rec.onend    = ()=>{ setInterim(""); const h=pendingRef.current.trim(); pendingRef.current=""; if(h) sendRef.current(h); else setJState("idle"); };
    rec.onerror  = (e:any)=>{ setInterim(""); setJState("idle"); if(e.error==="not-allowed") setChatLog(p=>[...p,{role:"atlas",text:"Mic access denied.",time:now(),isNew:true}]); };
    rec.start();
  }, [jState, unlockAudio]);

  const c    = C[jState];
  const busy = jState==="thinking"||jState==="executing";

  return (
    <div style={{
      height:"100%", display:"flex", flexDirection:"column",
      background:"#020c16", overflow:"hidden",
      fontFamily:"var(--font-mono)",
    }}>
      {/* Header */}
      <div style={{
        padding:"10px 14px", borderBottom:`1px solid ${c.p}20`,
        background:`${c.p}06`, flexShrink:0,
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:c.p, boxShadow:`0 0 8px ${c.p}` }}/>
          <span style={{ fontSize:11, letterSpacing:"0.18em", color:c.p }}>JARVIS</span>
          <span style={{ fontSize:8, color:`${c.p}50` }}>· Atlas Agent</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {modelUsed && <span style={{ fontSize:8, color:"#a855f7", border:"1px solid #a855f760", padding:"1px 6px" }}>{modelUsed}</span>}
          <span style={{ fontSize:8, padding:"2px 8px", color:c.p, border:`1px solid ${c.p}45`, background:`${c.p}10` }}>
            {c.label}
          </span>
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

      {/* Mini sphere */}
      <div style={{ flexShrink:0, padding:"10px 20px 0", position:"relative" }}>
        {(jState==="listening"||jState==="speaking"||jState==="executing") && (
          [1,2].map(i=>(
            <div key={i} style={{
              position:"absolute", top: `${10 - i*12}px`, left:`${20 - i*12}px`, right:`${20 - i*12}px`,
              bottom: `${0 - i*12}px`, borderRadius:"50%",
              border:`1px solid ${c.p}`, pointerEvents:"none",
              animation:`jPanelPulse ${0.9+i*0.4}s ease-out ${i*0.25}s infinite`,
            }}/>
          ))
        )}
        <MiniSphere state={jState}/>
      </div>

      {/* Interim (live voice text) */}
      {interim && (
        <div style={{
          margin:"6px 12px 0", padding:"6px 10px",
          border:`1px solid ${c.p}35`, background:`${c.p}0c`,
          fontSize:11, color:c.p, textShadow:`0 0 10px ${c.p}`,
          flexShrink:0,
        }}>
          {interim}
          <span style={{ display:"inline-block", width:2, height:10, background:c.p, marginLeft:2, verticalAlign:"middle", animation:"jPanelCaret 0.7s step-end infinite" }}/>
        </div>
      )}

      {/* Status hint */}
      <div style={{ textAlign:"center", fontSize:7, color:`${c.p}45`, letterSpacing:"0.12em", padding:"4px 0", flexShrink:0 }}>
        {jState==="listening"?"LISTENING · CLICK TO STOP"
         :jState==="thinking"?"ATLAS PROCESSING…"
         :jState==="speaking"?"SPEAKING…"
         :jState==="executing"?"EXECUTING ON MANTLE…"
         :"CLICK MIC TO SPEAK"}
      </div>

      {/* Conversation log */}
      <div style={{ flex:1, overflowY:"auto", padding:"8px 12px", display:"flex", flexDirection:"column" }}>
        {chatLog.map((msg, i) => (
          <Bubble key={i} msg={msg} p={c.p}
            activeWordIdx={jState === "speaking" && i === chatLog.length - 1 ? speakWordIdx : undefined}
          />
        ))}
        {busy && (
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:6 }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:c.p, boxShadow:`0 0 5px ${c.p}` }}/>
            {[0,1,2].map(i=>(
              <span key={i} style={{ width:4, height:4, borderRadius:"50%", background:c.p, opacity:0.5, display:"inline-block", animation:`jPanelDot 1.1s ${i*0.15}s ease-in-out infinite` }}/>
            ))}
          </div>
        )}
        <div ref={chatEndRef}/>
      </div>

      {/* Controls — mic + text input + SEND */}
      <div style={{ flexShrink:0, padding:"8px 10px 10px", borderTop:`1px solid ${c.p}18`, display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ display:"grid", gridTemplateColumns:"36px 1fr auto", gap:5, alignItems:"center", border:`1px solid ${c.p}25`, background:`${c.p}05`, padding:"3px 3px 3px 0" }}>
          <button onClick={toggleListen} disabled={busy} style={{
            width:36, height:36, borderRadius:0,
            border:"none", borderRight:`1px solid ${c.p}20`,
            background: jState==="listening"?`${c.p}15`:"transparent",
            color: jState==="listening"?c.p:`${c.p}50`,
            cursor: busy?"not-allowed":"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow: jState==="listening"?`0 0 16px ${c.p}50`:"none",
            transition:"all 0.2s",
          }}>
            {busy?(
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" strokeDasharray="56" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
                </circle>
              </svg>
            ):(
              <svg width="13" height="13" viewBox="0 0 24 24" fill={jState==="listening"?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
            )}
          </button>
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !busy && textInput.trim()) { unlockAudio(); sendRef.current(textInput.trim()); } }}
            disabled={busy}
            placeholder='Try: "invest 100 dollars in USDY"'
            style={{
              background:"transparent", border:"none", outline:"none",
              color:"rgba(255,255,255,0.75)", fontFamily:"var(--font-mono)", fontSize:10,
              padding:"6px 8px",
            }}
          />
          <button
            onClick={() => { if (!busy && textInput.trim()) { unlockAudio(); sendRef.current(textInput.trim()); } }}
            disabled={busy || !textInput.trim()}
            style={{
              background:"transparent", border:`1px solid ${c.p}30`, color:c.p,
              fontFamily:"var(--font-mono)", fontSize:8, padding:"5px 10px",
              cursor: busy||!textInput.trim()?"not-allowed":"pointer",
              marginRight:3, letterSpacing:"0.1em",
              opacity: textInput.trim() ? 1 : 0.4, transition:"opacity 0.2s",
            }}
          >SEND ↗</button>
        </div>
        <div style={{ fontSize:7, color:"rgba(255,255,255,0.18)", letterSpacing:"0.06em", textAlign:"center" }}>
          {isConnected ? `${address?.slice(0,6)}…${address?.slice(-4)} · MANTLE SEPOLIA` : "WALLET NOT CONNECTED"}
        </div>
      </div>

    </div>
  );
}
