"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { agentApi } from "@/lib/agent-api";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "executing";

const STATE: Record<OrbState, { color: string; glow: string; ring: string; label: string }> = {
  idle:      { color: "#00d4ff", glow: "0 0 80px rgba(0,212,255,0.2)",        ring: "rgba(0,212,255,0.15)",  label: "STANDBY"    },
  listening: { color: "#00d4ff", glow: "0 0 120px rgba(0,212,255,0.7)",       ring: "rgba(0,212,255,0.6)",   label: "LISTENING"  },
  thinking:  { color: "#a78bfa", glow: "0 0 120px rgba(167,139,250,0.6)",     ring: "rgba(167,139,250,0.5)", label: "PROCESSING" },
  speaking:  { color: "#34d399", glow: "0 0 120px rgba(52,211,153,0.6)",      ring: "rgba(52,211,153,0.5)",  label: "SPEAKING"   },
  executing: { color: "#fbbf24", glow: "0 0 140px rgba(251,191,36,0.75)",     ring: "rgba(251,191,36,0.6)",  label: "EXECUTING"  },
};

interface Action {
  id: string; time: string;
  type: "INPUT" | "RESPONSE" | "EXECUTE" | "ERROR";
  text: string; tx?: string;
}

export default function VoicePage() {
  const { address, isConnected } = useAccount();
  const [orbState, setOrbState]   = useState<OrbState>("idle");
  const [displayed, setDisplayed] = useState("Atlas online. Speak your command.");
  const [interim, setInterim]     = useState("");
  const [actions, setActions]     = useState<Action[]>([]);
  const [history, setHistory]     = useState<{ role: string; body: string }[]>([]);
  const [modelUsed, setModelUsed] = useState("");

  const recRef     = useRef<any>(null);
  const interimRef = useRef("");
  const synthRef   = useRef<SpeechSynthesis | null>(null);
  const voicesRef  = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    synthRef.current = window.speechSynthesis;
    const load = () => { voicesRef.current = synthRef.current?.getVoices() ?? []; };
    load();
    synthRef.current?.addEventListener("voiceschanged", load);
    return () => synthRef.current?.removeEventListener("voiceschanged", load);
  }, []);

  const pushAction = useCallback((type: Action["type"], text: string, tx?: string) => {
    setActions(p => [{
      id: `${Date.now()}-${Math.random()}`,
      time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      type, text: text.slice(0, 90), tx,
    }, ...p].slice(0, 8));
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const pick = voicesRef.current.find(v =>
      v.name.includes("Daniel") || v.name.includes("Google UK English Male") ||
      v.name.includes("Alex") || (v.lang.startsWith("en") && !v.name.toLowerCase().includes("female"))
    );
    if (pick) utt.voice = pick;
    utt.rate = 0.87; utt.pitch = 0.76;
    utt.onstart = () => setOrbState("speaking");
    utt.onend   = () => setOrbState("idle");
    synthRef.current.speak(utt);
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
        body: JSON.stringify({ agent_id: "atlas", messages: next }),
      });
      const reply: string = data.reply || data.message || "Understood.";
      const model: string = data.model_used || data.modelUsed || "";
      setHistory(h => [...h, { role: "atlas", body: reply }]);
      setDisplayed(reply);
      setModelUsed(model);
      if (data.onChainTx) {
        pushAction("EXECUTE", reply, data.onChainTx);
        setOrbState("executing");
        setTimeout(() => speak(reply), 600);
      } else {
        pushAction("RESPONSE", reply);
        speak(reply);
      }
    } catch {
      const msg = "Connection to Atlas failed.";
      setDisplayed(msg); pushAction("ERROR", msg); speak(msg);
    }
  }, [history, address, speak, pushAction]);

  const startListen = useCallback(() => {
    if (typeof window === "undefined") return;
    synthRef.current?.cancel();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice requires Chrome or Edge."); return; }
    const rec = new SR();
    recRef.current = rec;
    rec.continuous = false; rec.interimResults = true; rec.lang = "en-US";
    rec.onstart  = () => { interimRef.current = ""; setOrbState("listening"); };
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
  }, [sendToAtlas]);

  const stopListen = useCallback(() => recRef.current?.stop(), []);

  const s   = STATE[orbState];
  const busy = orbState === "thinking";

  return (
    <div className="atlas-shell">
      {/* Layered background */}
      <div className="atlas-bg-hex" />
      <div className="atlas-bg-radial" style={{ background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${s.color}08 0%, transparent 70%)` }} />

      {/* HUD corner brackets */}
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
        {modelUsed && (
          <span className="atlas-model-badge">{modelUsed}</span>
        )}
      </div>

      {/* Centre */}
      <div className="atlas-centre">

        {/* Orb container */}
        <div className="atlas-orb-wrap">
          {/* Static decorative rings */}
          <div className="atlas-deco-ring atlas-deco-ring-1" style={{ borderColor: `${s.color}12` }} />
          <div className="atlas-deco-ring atlas-deco-ring-2" style={{ borderColor: `${s.color}08` }} />

          {/* Pulse rings — active states */}
          {(orbState === "listening" || orbState === "speaking" || orbState === "executing") && (
            <>
              <div className="atlas-pulse-ring atlas-pulse-1" style={{ borderColor: s.ring }} />
              <div className="atlas-pulse-ring atlas-pulse-2" style={{ borderColor: s.ring }} />
              <div className="atlas-pulse-ring atlas-pulse-3" style={{ borderColor: s.ring }} />
            </>
          )}

          {/* Core orb */}
          <div
            className={`atlas-orb atlas-orb-${orbState}`}
            style={{
              boxShadow: `${s.glow}, inset 0 0 60px ${s.color}06`,
              border: `1px solid ${s.color}22`,
              background: `
                radial-gradient(circle at 38% 32%, ${s.color}14 0%, transparent 55%),
                radial-gradient(circle at 62% 68%, ${s.color}06 0%, transparent 50%),
                #03070a
              `,
            }}
          >
            {/* Scan line */}
            {orbState === "thinking" && <div className="atlas-scan" style={{ background: `linear-gradient(transparent, ${s.color}30, transparent)` }} />}

            {/* Monogram */}
            <div className="atlas-mark" style={{ color: s.color, textShadow: `0 0 30px ${s.color}, 0 0 60px ${s.color}60` }}>
              A
            </div>

            {/* Inner arc */}
            <div className="atlas-inner-arc" style={{ borderColor: `${s.color}18` }} />
          </div>

          {/* Tick marks around orb */}
          {[0,45,90,135,180,225,270,315].map(deg => (
            <div key={deg} className="atlas-tick" style={{ transform: `rotate(${deg}deg) translateX(120px)` }}>
              <div className="atlas-tick-mark" style={{ background: deg % 90 === 0 ? s.color : `${s.color}50` }} />
            </div>
          ))}
        </div>

        {/* Text display */}
        <div className="atlas-text" style={{ color: orbState === "idle" ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.82)" }}>
          {interim
            ? <><span style={{ color: s.color }}>{interim}</span><span className="atlas-cursor" style={{ background: s.color }} /></>
            : displayed
          }
        </div>

        {/* Mic button */}
        <button
          className={`atlas-mic ${orbState === "listening" ? "atlas-mic-active" : ""}`}
          style={{
            borderColor: busy ? "rgba(255,255,255,0.12)" : `${s.color}60`,
            color: busy ? "rgba(255,255,255,0.2)" : s.color,
            boxShadow: orbState === "listening" ? `0 0 40px ${s.color}50` : "none",
          }}
          onMouseDown={startListen}
          onMouseUp={stopListen}
          onTouchStart={startListen}
          onTouchEnd={stopListen}
          disabled={busy}
          aria-label="Hold to speak"
        >
          {busy ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" strokeDasharray="56" strokeLinecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
              </circle>
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

        <p className="atlas-hint">HOLD TO SPEAK · RELEASE TO SEND</p>
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
          <span className="atlas-hud-val" style={{ color: "#34d399" }}>75 / 100</span>
        </div>
        <div className="atlas-hud-row">
          <span className="atlas-hud-label">WALLET</span>
          <span className="atlas-hud-val">
            {isConnected ? `${address?.slice(0,6)}…${address?.slice(-4)}` : "NOT CONNECTED"}
          </span>
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
      </aside>

      {/* Bottom status */}
      <div className="atlas-statusbar">
        <span>RWAI PLATFORM</span>
        <span className="atlas-sep">·</span>
        <span>VOICE INTERFACE v1</span>
        <span className="atlas-sep">·</span>
        <span style={{ color: "#34d399" }}>AGENT ONLINE</span>
        <span className="atlas-sep">·</span>
        <span>{new Date().toISOString().slice(0, 10)}</span>
      </div>
    </div>
  );
}
