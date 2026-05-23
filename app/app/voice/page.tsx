"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { useBlockNumber } from "wagmi";
import { mantleTestnet } from "@/lib/wagmi";
import { agentApi } from "@/lib/agent-api";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "executing";

const STATE: Record<OrbState, { color: string; glow: string; ring: string; label: string }> = {
  idle:      { color: "#00d4ff", glow: "0 0 80px rgba(0,212,255,0.2)",        ring: "rgba(0,212,255,0.15)",  label: "STANDBY"    },
  listening: { color: "#00d4ff", glow: "0 0 120px rgba(0,212,255,0.7)",       ring: "rgba(0,212,255,0.6)",   label: "LISTENING"  },
  thinking:  { color: "#a78bfa", glow: "0 0 120px rgba(167,139,250,0.6)",     ring: "rgba(167,139,250,0.5)", label: "PROCESSING" },
  speaking:  { color: "#34d399", glow: "0 0 120px rgba(52,211,153,0.6)",      ring: "rgba(52,211,153,0.5)",  label: "SPEAKING"   },
  executing: { color: "#fbbf24", glow: "0 0 140px rgba(251,191,36,0.75)",     ring: "rgba(251,191,36,0.6)",  label: "EXECUTING"  },
};

const QUICK_ACTIONS = [
  "Invest 100 USDY",
  "Show my portfolio",
  "Best yield right now?",
  "Execute on testnet",
  "Explain CVaR risk",
];

interface Action {
  id: string; time: string;
  type: "INPUT" | "RESPONSE" | "EXECUTE" | "ERROR";
  text: string; tx?: string;
}

export default function VoicePage() {
  const { address, isConnected } = useAccount();
  const { data: blockNumber } = useBlockNumber({ chainId: mantleTestnet.id, watch: true });
  const [orbState, setOrbState]     = useState<OrbState>("idle");
  const [displayed, setDisplayed]   = useState("Tap START SESSION to activate JARVIS.");
  const [interim, setInterim]       = useState("");
  const [actions, setActions]       = useState<Action[]>([]);
  const [history, setHistory]       = useState<{ role: string; body: string }[]>([]);
  const [modelUsed, setModelUsed]   = useState("");
  const [atlasScore, setAtlasScore] = useState<number>(75);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [hasSR, setHasSR]           = useState(true);

  const recRef       = useRef<any>(null);
  const interimRef   = useRef("");
  const synthRef     = useRef<SpeechSynthesis | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const sourceRef    = useRef<AudioBufferSourceNode | null>(null);
  const onChainTxRef = useRef("");

  useEffect(() => {
    fetch("/api/agents/status", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.atlas?.localScore != null) setAtlasScore(d.atlas.localScore); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    synthRef.current = window.speechSynthesis;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setHasSR(!!SR);
  }, []);

  const pushAction = useCallback((type: Action["type"], text: string, tx?: string) => {
    setActions(p => [{
      id: `${Date.now()}-${Math.random()}`,
      time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      type, text: text.slice(0, 90), tx,
    }, ...p].slice(0, 8));
  }, []);

  const unlockAudio = useCallback(() => {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume().catch(() => {});
  }, []);

  const speak = useCallback(async (text: string) => {
    const hasTx = () => !!onChainTxRef.current;
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    synthRef.current?.cancel();

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
          if (!audioCtxRef.current || audioCtxRef.current.state === "closed") audioCtxRef.current = new AC();
          const ac = audioCtxRef.current;
          if (ac.state === "suspended") { try { await ac.resume(); } catch {} }
          const decoded = await ac.decodeAudioData(buf.slice(0));
          const source = ac.createBufferSource();
          source.buffer = decoded;
          source.playbackRate.value = 0.82;
          source.connect(ac.destination);
          sourceRef.current = source;
          if (!hasTx()) setOrbState("speaking");
          source.onended = () => { sourceRef.current = null; if (!hasTx()) setOrbState("idle"); };
          source.start(0);
          return;
        }
      }
    } catch { /* fall through */ }

    if (!synthRef.current) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.9; utt.pitch = 0.1;
    utt.onstart = () => { if (!hasTx()) setOrbState("speaking"); };
    utt.onend   = () => { if (!hasTx()) setOrbState("idle"); };
    synthRef.current.speak(utt);
  }, []);

  const stopSpeaking = useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    synthRef.current?.cancel();
    setOrbState("idle");
  }, []);

  const sendToAtlas = useCallback(async (text: string) => {
    setOrbState("thinking");
    setDisplayed(text);
    pushAction("INPUT", text);
    const next = [...history, { role: "user", body: text }];
    setHistory(next);
    try {
      const data = await agentApi<any>("/chat", {
        method: "POST",
        body: JSON.stringify({ agent_id: "atlas", messages: next, wallet_address: address || null }),
      });
      const reply: string = data.reply || data.message || "Understood.";
      const model: string = data.model_used || data.modelUsed || "";
      setHistory(h => [...h, { role: "atlas", body: reply }]);
      setDisplayed(reply);
      if (model) setModelUsed(model);
      const tx = data.on_chain_tx || data.onChainTx || "";
      if (tx) {
        onChainTxRef.current = tx;
        pushAction("EXECUTE", reply, tx);
        setOrbState("executing");
        speak(reply);
        setTimeout(() => { onChainTxRef.current = ""; setOrbState("idle"); }, 15000);
      } else {
        pushAction("RESPONSE", reply);
        speak(reply);
      }
    } catch {
      const msg = "Connection to Atlas failed.";
      setDisplayed(msg); pushAction("ERROR", msg); speak(msg);
    }
  }, [history, address, speak, pushAction]);

  const startSession = useCallback(() => {
    unlockAudio();
    setSessionStarted(true);
    const greeting = isConnected
      ? `JARVIS online. Atlas agent connected. Wallet ${address?.slice(0,6)} recognized. Ready to execute on Mantle Network.`
      : `JARVIS online. Atlas agent standing by. Connect your wallet to execute on Mantle.`;
    setDisplayed(greeting);
    speak(greeting);
  }, [unlockAudio, isConnected, address, speak]);

  const toggleListen = useCallback(() => {
    if (orbState === "listening") { recRef.current?.stop(); return; }
    if (orbState === "thinking" || orbState === "executing") return;
    // Stop speaking before listening
    stopSpeaking();
    unlockAudio();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setDisplayed("Voice not supported — use text input."); return; }
    const rec = new SR();
    recRef.current = rec;
    rec.continuous = false; rec.interimResults = true; rec.lang = "en-US";
    rec.onstart  = () => { interimRef.current = ""; setOrbState("listening"); setInterim(""); };
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      interimRef.current = t; setInterim(t);
    };
    rec.onend = () => {
      const heard = interimRef.current.trim();
      setInterim(""); interimRef.current = "";
      if (heard) sendToAtlas(heard); else setOrbState("idle");
    };
    rec.onerror = () => { setInterim(""); setOrbState("idle"); };
    rec.start();
  }, [orbState, unlockAudio, stopSpeaking, sendToAtlas]);

  const s    = STATE[orbState];
  const busy = orbState === "thinking" || orbState === "executing";

  return (
    <div className="atlas-shell">
      <div className="atlas-bg-hex" />
      <div className="atlas-bg-radial" style={{ background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${s.color}08 0%, transparent 70%)` }} />
      <div className="atlas-corner atlas-corner-tl" />
      <div className="atlas-corner atlas-corner-tr" />
      <div className="atlas-corner atlas-corner-bl" />
      <div className="atlas-corner atlas-corner-br" />

      {/* Top identity bar */}
      <div className="atlas-topbar">
        <span className="atlas-topbar-item">ATLAS</span>
        <span className="atlas-sep">·</span>
        <span className="atlas-topbar-item">ERC-8004</span>
        <span className="atlas-sep">·</span>
        <span className="atlas-topbar-item">ID 44</span>
        <span className="atlas-sep">·</span>
        <span className="atlas-topbar-item">SOVEREIGN AI AGENT</span>
        <span className="atlas-sep">·</span>
        <span className="atlas-topbar-item">MANTLE NETWORK</span>
      </div>

      {/* State + model badge */}
      <div className="atlas-state-row">
        <span className="atlas-state-pill" style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}0c` }}>
          {s.label}
        </span>
        {modelUsed && <span className="atlas-model-badge">{modelUsed}</span>}
      </div>

      {/* Centre */}
      <div className="atlas-centre">

        {/* Orb */}
        <div className="atlas-orb-wrap" onClick={sessionStarted && orbState === "speaking" ? stopSpeaking : undefined}
          style={{ cursor: orbState === "speaking" ? "pointer" : "default" }}>
          <div className="atlas-deco-ring atlas-deco-ring-1" style={{ borderColor: `${s.color}12` }} />
          <div className="atlas-deco-ring atlas-deco-ring-2" style={{ borderColor: `${s.color}08` }} />
          {(orbState === "listening" || orbState === "speaking" || orbState === "executing") && (
            <>
              <div className="atlas-pulse-ring atlas-pulse-1" style={{ borderColor: s.ring }} />
              <div className="atlas-pulse-ring atlas-pulse-2" style={{ borderColor: s.ring }} />
              <div className="atlas-pulse-ring atlas-pulse-3" style={{ borderColor: s.ring }} />
            </>
          )}
          <div className={`atlas-orb atlas-orb-${orbState}`} style={{
            boxShadow: `${s.glow}, inset 0 0 60px ${s.color}06`,
            border: `1px solid ${s.color}22`,
            background: `
              radial-gradient(circle at 38% 32%, ${s.color}14 0%, transparent 55%),
              radial-gradient(circle at 62% 68%, ${s.color}06 0%, transparent 50%),
              #03070a
            `,
          }}>
            {orbState === "thinking" && <div className="atlas-scan" style={{ background: `linear-gradient(transparent, ${s.color}30, transparent)` }} />}
            <div className="atlas-mark" style={{ color: s.color, textShadow: `0 0 30px ${s.color}, 0 0 60px ${s.color}60` }}>A</div>
            <div className="atlas-inner-arc" style={{ borderColor: `${s.color}18` }} />
          </div>
          {[0,45,90,135,180,225,270,315].map(deg => (
            <div key={deg} className="atlas-tick" style={{ transform: `rotate(${deg}deg) translateX(120px)` }}>
              <div className="atlas-tick-mark" style={{ background: deg % 90 === 0 ? s.color : `${s.color}50` }} />
            </div>
          ))}
          {/* Tap-to-stop hint when speaking */}
          {orbState === "speaking" && (
            <div style={{
              position:"absolute", bottom:-28, left:"50%", transform:"translateX(-50%)",
              fontSize:7, color:`${s.color}80`, letterSpacing:"0.2em", whiteSpace:"nowrap",
            }}>TAP ORB TO STOP</div>
          )}
        </div>

        {/* Text display */}
        <div className="atlas-text" style={{ color: orbState === "idle" ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.82)" }}>
          {interim
            ? <><span style={{ color: s.color }}>{interim}</span><span className="atlas-cursor" style={{ background: s.color }} /></>
            : displayed
          }
        </div>

        {/* Mobile TX banner */}
        {actions.find(a => a.tx) && (
          <a href={`https://sepolia.mantlescan.xyz/tx/${actions.find(a => a.tx)!.tx}`}
            target="_blank" rel="noopener noreferrer"
            className="atlas-mobile-tx"
            style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 14px",
              background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.3)",
              borderRadius:4, color:"#fbbf24", fontSize:10, letterSpacing:"0.08em", textDecoration:"none" }}>
            <span style={{ fontSize:8 }}>⬡ ON-CHAIN LOG</span>
            <span style={{ fontFamily:"monospace", fontSize:9 }}>
              {actions.find(a => a.tx)!.tx!.slice(0,8)}…{actions.find(a => a.tx)!.tx!.slice(-6)} ↗
            </span>
          </a>
        )}

        {/* START SESSION — first time overlay */}
        {!sessionStarted ? (
          <button
            onClick={startSession}
            style={{
              padding:"12px 32px", fontSize:11, letterSpacing:"0.25em",
              background:"transparent",
              border:`1px solid ${s.color}`,
              color: s.color,
              fontFamily:"var(--font-mono)", cursor:"pointer",
              boxShadow:`0 0 24px ${s.color}30`,
              transition:"all 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${s.color}12`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            ▶ START SESSION
          </button>
        ) : (
          <>
            {/* Quick action chips */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center", maxWidth:480 }}>
              {QUICK_ACTIONS.map(action => (
                <button key={action}
                  onClick={() => { if (!busy) { unlockAudio(); sendToAtlas(action); } }}
                  disabled={busy}
                  style={{
                    background:"transparent", border:`1px solid ${s.color}20`,
                    color:`${s.color}55`, fontFamily:"var(--font-mono)",
                    fontSize:8, padding:"3px 10px", letterSpacing:"0.06em",
                    cursor: busy ? "not-allowed" : "pointer",
                    transition:"all 0.15s",
                  }}
                  onMouseEnter={e => { if (!busy) { e.currentTarget.style.borderColor=`${s.color}55`; e.currentTarget.style.color=s.color; }}}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=`${s.color}20`; e.currentTarget.style.color=`${s.color}55`; }}
                >{action}</button>
              ))}
            </div>

            {/* Mic button + stop */}
            <div style={{ display:"flex", alignItems:"center", gap:16 }}>
              {orbState === "speaking" ? (
                <button
                  onClick={stopSpeaking}
                  className="atlas-mic"
                  style={{ borderColor:`${s.color}60`, color: s.color, boxShadow:`0 0 20px ${s.color}40` }}
                  aria-label="Stop speaking"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                </button>
              ) : (
                hasSR && (
                  <button
                    className={`atlas-mic ${orbState === "listening" ? "atlas-mic-active" : ""}`}
                    style={{
                      borderColor: busy ? "rgba(255,255,255,0.12)" : `${s.color}60`,
                      color: busy ? "rgba(255,255,255,0.2)" : s.color,
                      boxShadow: orbState === "listening" ? `0 0 40px ${s.color}50` : "none",
                    }}
                    onClick={toggleListen}
                    disabled={busy}
                    aria-label={orbState === "listening" ? "Stop listening" : "Start listening"}
                  >
                    {busy ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="9" strokeDasharray="56" strokeLinecap="round">
                          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
                        </circle>
                      </svg>
                    ) : orbState === "listening" ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="9" y="2" width="6" height="11" rx="3"/>
                        <path d="M5 10a7 7 0 0 0 14 0" fill="none"/>
                        <line x1="12" y1="19" x2="12" y2="22" fill="none"/>
                        <line x1="8"  y1="22" x2="16" y2="22" fill="none"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="9" y="2" width="6" height="11" rx="3"/>
                        <path d="M5 10a7 7 0 0 0 14 0"/>
                        <line x1="12" y1="19" x2="12" y2="22"/>
                        <line x1="8"  y1="22" x2="16" y2="22"/>
                      </svg>
                    )}
                  </button>
                )
              )}
            </div>

            <p className="atlas-hint">
              {orbState === "listening" ? "LISTENING — TAP MIC TO SEND"
               : orbState === "speaking" ? "TAP ORB OR STOP BUTTON TO INTERRUPT"
               : busy ? "ATLAS PROCESSING…"
               : hasSR ? "TAP MIC TO SPEAK · OR TYPE BELOW"
               : "TYPE COMMAND BELOW · ENTER TO SEND"}
            </p>

            {/* Text input */}
            <div className="atlas-text-input-row" style={{ borderColor:`${s.color}18` }}>
              <input
                className="atlas-text-input"
                placeholder="Or type a command…"
                value={interim || ""}
                onChange={e => { interimRef.current = e.target.value; setInterim(e.target.value); }}
                onKeyDown={e => {
                  if (e.key === "Enter" && interimRef.current.trim()) {
                    unlockAudio();
                    const t = interimRef.current.trim();
                    setInterim(""); interimRef.current = "";
                    sendToAtlas(t);
                  }
                }}
                disabled={busy || orbState === "listening"}
                style={{ borderColor: `${s.color}25`, color: "rgba(255,255,255,0.7)" }}
              />
              <button
                className="atlas-text-send"
                style={{ borderColor: `${s.color}25`, color: s.color }}
                disabled={busy || orbState === "listening" || !interim.trim()}
                onClick={() => {
                  const t = interimRef.current.trim();
                  if (!t) return;
                  unlockAudio();
                  setInterim(""); interimRef.current = "";
                  sendToAtlas(t);
                }}
              >↵</button>
            </div>
          </>
        )}
      </div>

      {/* On-chain log — right panel */}
      {actions.length > 0 && (
        <aside className="atlas-log">
          <div className="atlas-log-head">
            <span>ON-CHAIN LOG</span>
            <span style={{ color: "rgba(0,212,255,0.3)", fontSize: 8 }}>MANTLE · LIVE</span>
          </div>
          {actions.map(a => (
            <div key={a.id} className="atlas-log-row">
              <div className="atlas-log-meta">
                <span className={`atlas-log-badge atlas-log-${a.type.toLowerCase()}`}>{a.type}</span>
                <span className="atlas-log-time">{a.time}</span>
              </div>
              <div className="atlas-log-text">{a.text}</div>
              {a.tx && (
                <a href={`https://sepolia.mantlescan.xyz/tx/${a.tx}`} target="_blank" rel="noreferrer" className="atlas-log-tx">
                  {a.tx.slice(0, 8)}…{a.tx.slice(-6)} ↗
                </a>
              )}
            </div>
          ))}
        </aside>
      )}

      {/* Left HUD panel */}
      <aside className="atlas-hud-left">
        <div className="atlas-hud-row">
          <span className="atlas-hud-label">AGENT</span>
          <span className="atlas-hud-val">ATLAS · 44</span>
        </div>
        <div className="atlas-hud-row">
          <span className="atlas-hud-label">CHAIN</span>
          <span className="atlas-hud-val">MANTLE SEPOLIA</span>
        </div>
        <div className="atlas-hud-row">
          <span className="atlas-hud-label">REPUTATION</span>
          <span className="atlas-hud-val" style={{ color: atlasScore >= 70 ? "#34d399" : "#fbbf24" }}>{atlasScore} / 100</span>
        </div>
        <div className="atlas-hud-row">
          <span className="atlas-hud-label">WALLET</span>
          <span className="atlas-hud-val">{isConnected ? `${address?.slice(0,6)}…${address?.slice(-4)}` : "NOT CONNECTED"}</span>
        </div>
        <div className="atlas-hud-row">
          <span className="atlas-hud-label">STANDARD</span>
          <span className="atlas-hud-val">ERC-8004</span>
        </div>
        {modelUsed && (
          <div className="atlas-hud-row">
            <span className="atlas-hud-label">MODEL</span>
            <span className="atlas-hud-val" style={{ color: "#a78bfa" }}>{modelUsed}</span>
          </div>
        )}
        <div className="atlas-hud-row">
          <span className="atlas-hud-label">SESSION</span>
          <span className="atlas-hud-val" style={{ color: sessionStarted ? "#34d399" : "rgba(255,255,255,0.3)" }}>
            {sessionStarted ? "ACTIVE" : "STANDBY"}
          </span>
        </div>
      </aside>

      {/* Bottom status */}
      <div className="atlas-statusbar">
        <span>RWAI PLATFORM</span>
        <span className="atlas-sep">·</span>
        <span>VOICE INTERFACE v1</span>
        <span className="atlas-sep">·</span>
        <span style={{ color: "#34d399" }}>AGENT ONLINE</span>
        <span className="atlas-sep">·</span>
        <span style={{ color: "#fbbf24" }}>⛽ GASLESS</span>
        <span className="atlas-sep">·</span>
        <span>BLOCK {blockNumber ? blockNumber.toLocaleString() : "—"}</span>
        <span className="atlas-sep">·</span>
        <span style={{ color:"var(--fg-3)" }}>{new Date().toISOString().slice(0, 10)}</span>
      </div>
    </div>
  );
}
