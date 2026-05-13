"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { agentApi } from "@/lib/agent-api";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "executing";

const ORB: Record<OrbState, { color: string; glow: string; label: string }> = {
  idle:      { color: "#00d4ff", glow: "rgba(0,212,255,0.25)",  label: "STANDBY"    },
  listening: { color: "#00d4ff", glow: "rgba(0,212,255,0.85)",  label: "LISTENING"  },
  thinking:  { color: "#a78bfa", glow: "rgba(167,139,250,0.7)", label: "PROCESSING" },
  speaking:  { color: "#34d399", glow: "rgba(52,211,153,0.7)",  label: "SPEAKING"   },
  executing: { color: "#fbbf24", glow: "rgba(251,191,36,0.85)", label: "EXECUTING"  },
};

interface Action {
  id: string;
  time: string;
  type: "INPUT" | "RESPONSE" | "EXECUTE" | "ERROR";
  text: string;
  tx?: string;
}

export default function VoicePage() {
  const { address, isConnected } = useAccount();
  const [orbState, setOrbState]   = useState<OrbState>("idle");
  const [displayed, setDisplayed] = useState("Atlas online. Speak your command.");
  const [interim, setInterim]     = useState("");
  const [actions, setActions]     = useState<Action[]>([]);
  const [history, setHistory]     = useState<{ role: string; body: string }[]>([]);

  const recognitionRef = useRef<any>(null);
  const interimRef     = useRef("");
  const synthRef       = useRef<SpeechSynthesis | null>(null);
  const voicesRef      = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    synthRef.current = window.speechSynthesis;
    const load = () => { voicesRef.current = synthRef.current?.getVoices() ?? []; };
    load();
    synthRef.current?.addEventListener("voiceschanged", load);
    return () => synthRef.current?.removeEventListener("voiceschanged", load);
  }, []);

  const pushAction = useCallback((type: Action["type"], text: string, tx?: string) => {
    setActions(prev => [{
      id: `${Date.now()}-${Math.random()}`,
      time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      type, text: text.slice(0, 100), tx,
    }, ...prev].slice(0, 10));
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const voices = voicesRef.current;
    const pick = voices.find(v =>
      v.name.includes("Daniel") ||
      v.name.includes("Google UK English Male") ||
      v.name.includes("Alex") ||
      (v.lang.startsWith("en") && !v.name.toLowerCase().includes("female"))
    );
    if (pick) utt.voice = pick;
    utt.rate  = 0.88;
    utt.pitch = 0.78;
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
        body: JSON.stringify({ agent: "atlas", messages: next, wallet: address ?? "" }),
      });

      const reply: string = data.reply || data.message || "Understood.";
      setHistory(h => [...h, { role: "atlas", body: reply }]);
      setDisplayed(reply);

      if (data.onChainTx) {
        pushAction("EXECUTE", reply, data.onChainTx);
        setOrbState("executing");
        setTimeout(() => speak(reply), 600);
      } else {
        pushAction("RESPONSE", reply);
        speak(reply);
      }
    } catch {
      const msg = "Connection to Atlas failed. Try again.";
      setDisplayed(msg);
      pushAction("ERROR", msg);
      speak(msg);
    }
  }, [history, address, speak, pushAction]);

  const startListen = useCallback(() => {
    if (typeof window === "undefined") return;
    synthRef.current?.cancel();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice requires Chrome or Edge."); return; }

    const rec = new SR();
    recognitionRef.current = rec;
    rec.continuous      = false;
    rec.interimResults  = true;
    rec.lang            = "en-US";

    rec.onstart  = () => { interimRef.current = ""; setOrbState("listening"); };
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      interimRef.current = t;
      setInterim(t);
    };
    rec.onend = () => {
      const heard = interimRef.current.trim();
      setInterim("");
      if (heard) sendToAtlas(heard);
      else setOrbState("idle");
    };
    rec.onerror = () => { setInterim(""); setOrbState("idle"); };
    rec.start();
  }, [sendToAtlas]);

  const stopListen = useCallback(() => recognitionRef.current?.stop(), []);

  const cfg = ORB[orbState];
  const busy = orbState === "thinking";

  return (
    <div className="voice-shell">
      {/* Grid bg */}
      <div className="voice-grid" />

      {/* Header identity */}
      <div className="voice-identity">
        <span>ATLAS</span>
        <span className="voice-dot" />
        <span>ERC-8004 · ID 44</span>
        <span className="voice-dot" />
        <span>SOVEREIGN AI AGENT</span>
        <span className="voice-dot" />
        <span>MANTLE NETWORK</span>
      </div>

      {/* State label */}
      <div className="voice-state-label" style={{ color: cfg.color }}>
        {cfg.label}
      </div>

      {/* Centre column */}
      <div className="voice-centre">

        {/* Orb */}
        <div className="voice-orb-wrap">
          {(orbState === "listening" || orbState === "speaking" || orbState === "executing") && (
            <>
              <div className="voice-ring voice-ring-1" style={{ borderColor: cfg.color }} />
              <div className="voice-ring voice-ring-2" style={{ borderColor: cfg.color }} />
            </>
          )}
          <div
            className={`voice-orb voice-orb-${orbState}`}
            style={{
              background: `radial-gradient(circle at 35% 30%, ${cfg.color}18, #000 68%)`,
              border: `1px solid ${cfg.color}30`,
              boxShadow: `0 0 80px ${cfg.glow}, inset 0 0 40px ${cfg.color}08`,
            }}
          >
            <span className="voice-mark" style={{ color: cfg.color, textShadow: `0 0 24px ${cfg.color}` }}>
              A
            </span>
          </div>
        </div>

        {/* Text display */}
        <div className="voice-text">
          {interim
            ? <><span style={{ color: cfg.color }}>{interim}</span><span className="voice-cursor" /></>
            : displayed
          }
        </div>

        {/* Mic button */}
        <button
          className="voice-mic"
          style={{ borderColor: busy ? "rgba(255,255,255,0.15)" : cfg.color, color: cfg.color }}
          onMouseDown={startListen}
          onMouseUp={stopListen}
          onTouchStart={startListen}
          onTouchEnd={stopListen}
          disabled={busy}
          aria-label="Hold to speak"
        >
          {busy ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeLinecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
              </circle>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="2" width="6" height="12" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>

        <p className="voice-hint">HOLD TO SPEAK · RELEASE TO SEND</p>
      </div>

      {/* On-chain log panel */}
      {actions.length > 0 && (
        <div className="voice-log">
          <div className="voice-log-title">ON-CHAIN LOG</div>
          {actions.map(a => (
            <div key={a.id} className="voice-log-row">
              <div className="voice-log-meta">
                <span className={`voice-log-type voice-log-type-${a.type.toLowerCase()}`}>
                  {a.type}
                </span>
                <span className="voice-log-time">{a.time}</span>
              </div>
              <div className="voice-log-text">{a.text}</div>
              {a.tx && (
                <a
                  href={`https://sepolia.mantlescan.xyz/tx/${a.tx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="voice-log-tx"
                >
                  {a.tx.slice(0, 10)}…{a.tx.slice(-6)} ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Wallet status */}
      <div className="voice-wallet">
        {isConnected
          ? `${address?.slice(0, 6)}…${address?.slice(-4)} · CONNECTED`
          : "CONNECT WALLET TO ENABLE EXECUTION"}
      </div>
    </div>
  );
}
