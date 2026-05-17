"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { agentApi } from "@/lib/agent-api";
import { useChatMode } from "@/lib/chat-mode-context";

// ── Types ─────────────────────────────────────────────────────────
type JState = "idle" | "listening" | "thinking" | "speaking" | "executing";
const C: Record<JState, { p: string; label: string }> = {
  idle:      { p: "#00d4ff", label: "STANDBY"    },
  listening: { p: "#00e5a0", label: "LISTENING"  },
  thinking:  { p: "#a855f7", label: "PROCESSING" },
  speaking:  { p: "#34d399", label: "SPEAKING"   },
  executing: { p: "#fbbf24", label: "EXECUTING"  },
};

interface ChatMsg { role: "user" | "atlas"; text: string; time: string; isNew?: boolean; }

// ── Large Sphere ──────────────────────────────────────────────────
function BridgeSphere({ state, onClick }: { state: JState; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const yaw = useRef(0);
  const raf = useRef(0);
  const c = C[state];

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const N = 1100, PHI = Math.PI * (3 - Math.sqrt(5));
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), t = PHI * i;
      return { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
    });
    const mkRing = (tx: number, n = 90) =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return { x: Math.cos(a), y: Math.sin(a) * Math.sin(tx), z: Math.sin(a) * Math.cos(tx) };
      });
    const rings = [mkRing(0.15, 100), mkRing(1.0, 80), mkRing(-0.7, 70)];

    const frame = () => {
      const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.38;
      yaw.current += state === "listening" ? 0.009 : state === "thinking" ? 0.016 : state === "speaking" ? 0.012 : 0.004;
      const cY = Math.cos(yaw.current), sY = Math.sin(yaw.current);
      const cX = Math.cos(0.18), sX = Math.sin(0.18);
      const fov = 2.4;
      ctx.clearRect(0, 0, W, H);

      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
      bg.addColorStop(0, c.p + "18"); bg.addColorStop(0.5, c.p + "08"); bg.addColorStop(1, "transparent");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      const proj = (px: number, py: number, pz: number) => {
        const rx = px * cY - pz * sY, rz = px * sY + pz * cY;
        const ry = py * cX - rz * sX, rz2 = py * sX + rz * cX;
        const sc = fov / (fov + rz2 + 1.5);
        return { sx: cx + rx * R * sc, sy: cy + ry * R * sc, z: rz2 };
      };

      rings.forEach((rpts, ri) => {
        const pp = rpts.map(p => proj(p.x, p.y, p.z));
        ctx.beginPath(); let pen = false;
        pp.forEach(p => { if (p.z > -0.5) { pen ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); pen = true; } else pen = false; });
        ctx.strokeStyle = c.p + (ri === 0 ? "55" : ri === 1 ? "28" : "15");
        ctx.lineWidth = ri === 0 ? 1.4 : 0.7; ctx.setLineDash(ri === 0 ? [] : [3, 4]); ctx.stroke(); ctx.setLineDash([]);
        if (ri === 0) {
          for (let t = 0; t < 32; t++) {
            const p = pp[Math.round((t / 32) * pp.length) % pp.length];
            if (p.z < 0) continue;
            const dx = p.sx - cx, dy = p.sy - cy, len = Math.hypot(dx, dy); if (len < 1) continue;
            const tl = t % 4 === 0 ? 12 : 5;
            ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx + (dx / len) * tl, p.sy + (dy / len) * tl);
            ctx.strokeStyle = c.p + (t % 4 === 0 ? "90" : "40"); ctx.lineWidth = t % 4 === 0 ? 1.5 : 0.7; ctx.stroke();
          }
        }
      });

      ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, Math.PI * 2); ctx.strokeStyle = c.p + "20"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R + 18, 0, Math.PI * 2); ctx.strokeStyle = c.p + "0c"; ctx.lineWidth = 1; ctx.stroke();

      const pp2 = pts.map(p => proj(p.x, p.y, p.z)); pp2.sort((a, b) => a.z - b.z);
      for (const p of pp2) {
        const zN = (p.z + 1.5) / 3; if (zN < 0.07) continue;
        const dist = Math.hypot(p.sx - cx, p.sy - cy) / R, core = Math.max(0, 1 - dist * 1.5);
        const alpha = 0.06 + zN * 0.8, size = 0.4 + zN * 2.0 + core * 2.0;
        let fill: string;
        if (core > 0.55) fill = `rgba(255,255,255,${Math.min(1, alpha * 1.4).toFixed(2)})`;
        else if (core > 0.2) fill = c.p + Math.min(255, Math.round(alpha * 270)).toString(16).padStart(2, "0");
        else fill = `rgba(0,80,180,${(alpha * 0.6).toFixed(2)})`;
        if (core > 0.5) { ctx.shadowColor = c.p; ctx.shadowBlur = 6; }
        ctx.beginPath(); ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.shadowBlur = 0;
      }

      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.32);
      g1.addColorStop(0, "rgba(255,255,255,0.95)"); g1.addColorStop(0.2, "rgba(255,255,255,0.55)");
      g1.addColorStop(0.4, c.p + "99"); g1.addColorStop(1, "transparent");
      ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(cx, cy, R * 0.32, 0, Math.PI * 2); ctx.fill();

      ctx.shadowColor = "#fff"; ctx.shadowBlur = 24;
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 13);
      g2.addColorStop(0, "rgba(255,255,255,1)"); g2.addColorStop(0.5, "rgba(200,240,255,0.85)"); g2.addColorStop(1, "transparent");
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
  }, [state]); // eslint-disable-line

  return (
    <canvas
      ref={ref} width={400} height={400}
      onClick={onClick}
      style={{ display: "block", width: "100%", height: "auto", maxWidth: 400, cursor: "pointer" }}
    />
  );
}

// ── Session timer ─────────────────────────────────────────────────
function SessionTimer() {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT(v => v + 1), 1000); return () => clearInterval(id); }, []);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return <span>{String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</span>;
}

// ── Telemetry log entry ───────────────────────────────────────────
interface TeleEntry { kind: "INPUT" | "RESPONSE"; text: string; time: string; }

// ── Main BridgeView ───────────────────────────────────────────────
interface BridgeViewProps {
  messages?: { role: string; body: string }[];
  onMessage?: (role: "user" | "atlas", text: string) => void;
}

export function BridgeView({ messages: chatContext = [], onMessage }: BridgeViewProps) {
  const { closeBridge } = useChatMode();
  const { address, isConnected } = useAccount();

  const [jState, setJState]   = useState<JState>("idle");
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const [teleLog, setTeleLog] = useState<TeleEntry[]>([]);
  const [textInput, setTextInput] = useState("");
  const [history, setHistory] = useState<{ role: string; body: string }[]>([]);
  const [interim, setInterim] = useState("");

  const recRef   = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const pendingRef = useRef("");
  const sendRef  = useRef<(t: string) => void>(() => {});
  const scrollRef = useRef<HTMLDivElement>(null);

  const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
  const short = (addr?: string) => addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";

  useEffect(() => {
    if (typeof window === "undefined") return;
    synthRef.current = window.speechSynthesis;
    const load = () => { voicesRef.current = synthRef.current?.getVoices() ?? []; };
    load(); synthRef.current?.addEventListener("voiceschanged", load);
    return () => synthRef.current?.removeEventListener("voiceschanged", load);
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const pick = voicesRef.current.find(v =>
      v.name.includes("Daniel") || v.name.includes("Google UK English Male") || (v.lang.startsWith("en") && !v.name.toLowerCase().includes("female"))
    );
    if (pick) utt.voice = pick;
    utt.rate = 0.85; utt.pitch = 0.74;
    utt.onstart = () => setJState("speaking");
    utt.onend   = () => setJState("idle");
    synthRef.current.speak(utt);
  }, []);

  // Greeting
  useEffect(() => {
    const t = now();
    const greeting = isConnected
      ? `JARVIS online. Atlas agent connected. Wallet ${short(address)} recognized. How can I assist?`
      : "JARVIS online. Atlas agent standing by. Connect wallet to load portfolio.";
    const t2 = setTimeout(() => {
      setChatLog([{ role: "atlas", text: greeting, time: t, isNew: true }]);
      setTeleLog([{ kind: "RESPONSE", text: greeting.slice(0, 60) + "…", time: t }]);
      speak(greeting);
    }, 300);
    return () => clearTimeout(t2);
  }, []); // eslint-disable-line

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  const sendToAtlas = useCallback(async (text: string) => {
    const t = now();
    setChatLog(prev => [...prev, { role: "user", text, time: t }]);
    setTeleLog(prev => [...prev, { kind: "INPUT", text: text.slice(0, 60), time: t }]);
    onMessage?.("user", text);
    setJState("thinking"); setTextInput("");
    const next = [...history, { role: "user", body: text }];
    setHistory(next);
    try {
      const data = await agentApi<any>("/chat", {
        method: "POST",
        body: JSON.stringify({ agent_id: "atlas", messages: next }),
      });
      const reply = data.reply || "Understood.";
      setHistory(h => [...h, { role: "atlas", body: reply }]);
      const t2 = now();
      setChatLog(prev => [...prev, { role: "atlas", text: reply, time: t2, isNew: true }]);
      setTeleLog(prev => [...prev, { kind: "RESPONSE", text: reply.slice(0, 60) + "…", time: t2 }]);
      onMessage?.("atlas", reply);
      speak(reply);
    } catch {
      const msg = "Atlas connection failed.";
      setChatLog(prev => [...prev, { role: "atlas", text: msg, time: now(), isNew: true }]);
      setJState("idle");
    }
  }, [history, speak, onMessage]);

  useEffect(() => { sendRef.current = sendToAtlas; }, [sendToAtlas]);

  const toggleListen = useCallback(() => {
    if (jState === "listening") { recRef.current?.stop(); return; }
    if (jState === "thinking" || jState === "executing") return;
    synthRef.current?.cancel();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR(); recRef.current = rec; pendingRef.current = "";
    rec.continuous = false; rec.interimResults = true; rec.lang = "en-US";
    rec.onstart  = () => { setJState("listening"); setInterim(""); };
    rec.onresult = (e: any) => { const t = Array.from(e.results).map((r: any) => r[0].transcript).join(""); pendingRef.current = t; setInterim(t); };
    rec.onend    = () => { setInterim(""); const h = pendingRef.current.trim(); pendingRef.current = ""; if (h) sendRef.current(h); else setJState("idle"); };
    rec.onerror  = () => { setInterim(""); setJState("idle"); };
    rec.start();
  }, [jState]);

  const c = C[jState];
  const busy = jState === "thinking" || jState === "executing";
  const addrShort = short(address);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "#020c16",
      display: "grid",
      gridTemplateRows: "auto auto 1fr auto auto",
      fontFamily: "var(--font-mono)",
      overflow: "hidden",
    }}>
      {/* ── Row 1: J.A.R.V.I.S. header ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "280px 1fr 280px",
        padding: "10px 20px", borderBottom: `1px solid ${c.p}22`,
        background: `${c.p}06`, alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 16, letterSpacing: "0.3em", color: c.p, fontWeight: 600 }}>J.A.R.V.I.S.</div>
          <div style={{ fontSize: 8, color: `${c.p}60`, letterSpacing: "0.15em", marginTop: 2 }}>JUST A RATHER VERY INTELLIGENT SYSTEM</div>
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: c.p, letterSpacing: "0.12em" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.p, boxShadow: `0 0 8px ${c.p}`, display: "inline-block", marginRight: 8, verticalAlign: "middle", animation: "bvPulse 1.4s ease-in-out infinite" }} />
          SESSION · <SessionTimer /> · ATLAS-LINKED
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, color: c.p, border: `1px solid ${c.p}40`, padding: "2px 8px" }}>{c.label}</span>
          <button onClick={closeBridge} style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono)", fontSize: 9,
            padding: "4px 12px", cursor: "pointer", letterSpacing: "0.1em",
          }}>↙ EXIT BRIDGE</button>
        </div>
      </div>

      {/* ── Row 2: status badges ── */}
      <div style={{ padding: "6px 20px", borderBottom: `1px solid ${c.p}14`, display: "flex", gap: 8 }}>
        {["ONLINE", "SECURE", "ENCRYPTED", "AUTO-RELAY"].map(badge => (
          <span key={badge} style={{
            fontSize: 8, padding: "2px 10px", letterSpacing: "0.1em",
            border: `1px solid ${c.p}40`, color: c.p, background: `${c.p}0c`,
          }}>● {badge}</span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 8, color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em" }}>
          {isConnected ? `WALLET · ${addrShort}` : "WALLET NOT CONNECTED"}
        </span>
      </div>

      {/* ── Row 3: 3-column main content ── */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 240px", minHeight: 0, overflow: "hidden" }}>

        {/* LEFT: portfolio + telemetry */}
        <div style={{ borderRight: `1px solid ${c.p}18`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Portfolio */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${c.p}14` }}>
            <div style={{ fontSize: 8, color: `${c.p}60`, letterSpacing: "0.1em", marginBottom: 8 }}>
              PORTFOLIO · {isConnected ? addrShort : "NOT CONNECTED"}
            </div>
            <div style={{ fontSize: 28, color: "#fff", fontFamily: "var(--font-display)", marginBottom: 4 }}>$10,000</div>
            <div style={{ fontSize: 9, color: "#00e5a0", marginBottom: 10 }}>+$148 · LAST 7D · APY <span style={{ color: "#fbbf24" }}>4.88%</span></div>
            {[
              { sym: "USDY", pct: 60, color: "#00e5a0" },
              { sym: "MI4",  pct: 30, color: "#a855f7" },
              { sym: "mETH", pct: 10, color: "#00d4ff" },
            ].map(a => (
              <div key={a.sym} style={{ display: "grid", gridTemplateColumns: "40px 1fr 30px", gap: 6, alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{a.sym}</span>
                <div style={{ height: 3, background: "rgba(255,255,255,0.08)" }}>
                  <div style={{ width: `${a.pct}%`, height: "100%", background: a.color }} />
                </div>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>{a.pct}%</span>
              </div>
            ))}
          </div>
          {/* Telemetry */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${c.p}14`, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 8, color: `${c.p}70`, letterSpacing: "0.1em" }}>TELEMETRY · LIVE</span>
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>JARVIS VIA ATLAS</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
              {teleLog.map((e, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 50px 1fr", gap: 6, padding: "3px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                  <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)" }}>{e.time}</span>
                  <span style={{ fontSize: 7, color: e.kind === "INPUT" ? "#fbbf24" : c.p, letterSpacing: "0.06em" }}>{e.kind}</span>
                  <span style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{e.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER: sphere + latest message + plan cards area */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden", position: "relative" }}>
          {/* Crosshair deco */}
          <div style={{ position: "absolute", top: 16, left: 16, right: 16, bottom: 16, pointerEvents: "none", border: `1px solid ${c.p}08`, borderRadius: 2 }} />
          {[{ t: 8, l: 8 }, { t: 8, r: 8 }, { b: 8, l: 8 }, { b: 8, r: 8 }].map((pos, i) => (
            <div key={i} style={{
              position: "absolute", width: 12, height: 12, pointerEvents: "none",
              top: (pos as any).t, bottom: (pos as any).b, left: (pos as any).l, right: (pos as any).r,
              borderTop: (pos as any).t !== undefined ? `1px solid ${c.p}50` : "none",
              borderBottom: (pos as any).b !== undefined ? `1px solid ${c.p}50` : "none",
              borderLeft: (pos as any).l !== undefined ? `1px solid ${c.p}50` : "none",
              borderRight: (pos as any).r !== undefined ? `1px solid ${c.p}50` : "none",
            }} />
          ))}

          {/* Sphere */}
          <div style={{ width: "min(380px, 90%)", padding: "12px 0 4px", flexShrink: 0 }}>
            <BridgeSphere state={jState} onClick={closeBridge} />
          </div>

          {/* Neural core label */}
          <div style={{ fontSize: 8, color: `${c.p}50`, letterSpacing: "0.15em", marginBottom: 8, flexShrink: 0 }}>
            ── NEURAL CORE ONLINE · {c.label === "STANDBY" ? "89.3% EFFICIENCY · 38.2°C" : c.label + "…"} ──
          </div>

          {/* Latest JARVIS message */}
          {chatLog.filter(m => m.role === "atlas").slice(-1).map((msg, i) => (
            <div key={i} style={{
              width: "calc(100% - 32px)", maxWidth: 460,
              padding: "10px 14px", marginBottom: 8, flexShrink: 0,
              border: `1px solid ${c.p}35`, background: `${c.p}0c`,
              fontSize: 11, color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 8, color: c.p, letterSpacing: "0.1em" }}>● JARVIS · via Atlas</span>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>{msg.time}</span>
              </div>
              {msg.text}
            </div>
          ))}

          {/* Interim voice */}
          {interim && (
            <div style={{ width: "calc(100% - 32px)", maxWidth: 460, padding: "6px 12px", marginBottom: 8, flexShrink: 0, border: `1px solid ${c.p}35`, background: `${c.p}0c`, fontSize: 11, color: c.p }}>
              {interim}<span style={{ display: "inline-block", width: 2, height: 10, background: c.p, marginLeft: 2, verticalAlign: "middle", animation: "bvCaret 0.6s step-end infinite" }} />
            </div>
          )}

          {/* Plan cards slot — scroll */}
          <div style={{ flex: 1, overflowY: "auto", width: "100%", padding: "0 16px 12px" }}>
            {/* Plan cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 8 }}>
              {[
                { name: "Conservative", tag: "ATLAS PICKS", exp: "4.78%", cvar: "1.84%", active: true, col: "#00e5a0" },
                { name: "Balanced",     tag: "MODEST UPSIDE", exp: "5.41%", cvar: "3.20%", active: false, col: "#a855f7" },
                { name: "Aggressive",   tag: "HIGHER CVAR",   exp: "5.92%", cvar: "5.40%", active: false, col: "#fbbf24" },
              ].map(p => (
                <div key={p.name} style={{
                  padding: "10px 12px", border: `1px solid ${p.active ? p.col + "80" : "rgba(255,255,255,0.08)"}`,
                  background: p.active ? `${p.col}10` : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                }}>
                  {p.active && <div style={{ fontSize: 7, color: p.col, letterSpacing: "0.1em", marginBottom: 4 }}>★ {p.tag}</div>}
                  {!p.active && <div style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em", marginBottom: 4 }}>{p.tag}</div>}
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: p.active ? "#fff" : "rgba(255,255,255,0.6)", marginBottom: 6 }}>{p.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    <div><div style={{ fontSize: 7, color: "rgba(255,255,255,0.25)" }}>EXPECTED</div><div style={{ fontSize: 14, color: p.col }}>{p.exp}</div></div>
                    <div><div style={{ fontSize: 7, color: "rgba(255,255,255,0.25)" }}>CVAR</div><div style={{ fontSize: 14, color: "#f87171" }}>{p.cvar}</div></div>
                  </div>
                </div>
              ))}
            </div>
            <div ref={scrollRef} />
          </div>
        </div>

        {/* RIGHT: agent mesh + yield intelligence */}
        <div style={{ borderLeft: `1px solid ${c.p}18`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Agent mesh */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${c.p}14` }}>
            <div style={{ fontSize: 8, color: `${c.p}60`, letterSpacing: "0.1em", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>AGENT MESH</span><span style={{ color: "#00e5a0" }}>4 / 4</span>
            </div>
            {[
              { id: "A", name: "ATLAS",  status: "ENGAGED",  rep: 93, col: "#00d4ff" },
              { id: "J", name: "JARVIS", status: "STANDBY",  rep: 42, col: "#a855f7" },
              { id: "S", name: "SHIELD", status: "MONITOR",  rep: 100, col: "#00e5a0" },
              { id: "N", name: "NEXUS",  status: "SYNCED",   rep: 188, col: "#fbbf24" },
            ].map(a => (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 2, border: `1px solid ${a.col}60`, background: `${a.col}10`, display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: 12, color: a.col }}>{a.id}</div>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em" }}>{a.name}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 1 }}>
                    <span style={{ fontSize: 7, color: a.col }}>{a.status}</span>
                    <span style={{ fontSize: 7, color: "rgba(255,255,255,0.2)" }}>{a.rep}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Yield intelligence */}
          <div style={{ padding: "10px 14px", flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: 8, color: `${c.p}60`, letterSpacing: "0.1em", marginBottom: 10 }}>YIELD INTELLIGENCE</div>
            {[
              { sym: "USDY", apy: "4.28%", w: 68, col: "#00e5a0" },
              { sym: "MI4",  apy: "5.81%", w: 92, col: "#a855f7" },
              { sym: "mETH", apy: "6.12%", w: 100, col: "#00d4ff" },
              { sym: "fBTC", apy: "3.98%", w: 63, col: "#fbbf24" },
            ].map(a => (
              <div key={a.sym} style={{ display: "grid", gridTemplateColumns: "36px 1fr 36px", gap: 6, alignItems: "center", marginBottom: 7 }}>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>{a.sym}</span>
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
                  <div style={{ width: `${a.w}%`, height: "100%", background: a.col }} />
                </div>
                <span style={{ fontSize: 8, color: a.col, textAlign: "right" }}>{a.apy}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {[["CVAR", "1.84"], ["VOL", "3.20"], ["MAX DD", "4.10"], ["SHARPE", "2.41"]].map(([k, v]) => (
                <div key={k} style={{ padding: "5px 8px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>{k}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 4: objectives bar ── */}
      <div style={{ borderTop: `1px solid ${c.p}18`, display: "grid", gridTemplateColumns: "repeat(5,1fr)", background: `${c.p}04` }}>
        {[
          { label: "PRIMARY OBJECTIVE", val: "$10,000 CONSERVE + 4.88%" },
          { label: "STATUS", val: "● ENGAGED · CONSERVATIVE", accent: true },
          { label: "BLOCK", val: "38,600,472 · GAS 0.012 GWEI" },
          { label: "AGENTS ONLINE", val: "4 / 4" },
          { label: "ERC-8004", val: "ATLAS · ID #44 · MANTLE" },
        ].map(obj => (
          <div key={obj.label} style={{ padding: "8px 14px", borderRight: `1px solid ${c.p}10` }}>
            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", marginBottom: 3 }}>{obj.label}</div>
            <div style={{ fontSize: 9, color: obj.accent ? "#00e5a0" : "rgba(255,255,255,0.6)", letterSpacing: "0.05em" }}>{obj.val}</div>
          </div>
        ))}
      </div>

      {/* ── Row 5: command input ── */}
      <div style={{ padding: "10px 20px", borderTop: `1px solid ${c.p}18`, display: "flex", gap: 10, alignItems: "center", background: "#010a12" }}>
        {/* Quick commands */}
        <div style={{ display: "flex", gap: 5 }}>
          {["Show alternative allocations", "Stress-test against -20% MI4", "Execute on testnet", "Explain CVaR"].map(cmd => (
            <button key={cmd} onClick={() => !busy && sendRef.current(cmd)} disabled={busy} style={{
              background: "transparent", border: `1px solid ${c.p}20`,
              color: `${c.p}55`, fontFamily: "var(--font-mono)", fontSize: 7,
              padding: "4px 10px", cursor: busy ? "not-allowed" : "pointer", letterSpacing: "0.05em",
              whiteSpace: "nowrap",
            }}>{cmd}</button>
          ))}
        </div>
        {/* Mic + input */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 6, alignItems: "center", border: `1px solid ${c.p}25`, background: `${c.p}05`, padding: "4px 4px 4px 0" }}>
          <button onClick={toggleListen} disabled={busy} style={{
            width: 36, height: 36, borderRadius: 0,
            border: "none", borderRight: `1px solid ${c.p}20`,
            background: jState === "listening" ? `${c.p}15` : "transparent",
            color: jState === "listening" ? c.p : `${c.p}50`,
            cursor: busy ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: jState === "listening" ? `0 0 16px ${c.p}50` : "none",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill={jState === "listening" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          </button>
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !busy && textInput.trim() && sendRef.current(textInput.trim())}
            disabled={busy}
            placeholder="Speak or type — JARVIS will route to Atlas…"
            style={{
              background: "transparent", border: "none", outline: "none",
              color: "rgba(255,255,255,0.75)", fontFamily: "var(--font-mono)", fontSize: 11,
              padding: "8px 10px",
            }}
          />
          <button
            onClick={() => !busy && textInput.trim() && sendRef.current(textInput.trim())}
            disabled={busy || !textInput.trim()}
            style={{
              background: "transparent", border: `1px solid ${c.p}30`, color: c.p,
              fontFamily: "var(--font-mono)", fontSize: 9, padding: "6px 14px",
              cursor: busy || !textInput.trim() ? "not-allowed" : "pointer",
              marginRight: 4, letterSpacing: "0.1em",
            }}
          >SEND ↗</button>
        </div>
      </div>

      <style>{`
        @keyframes bvPulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(0.85);} }
        @keyframes bvCaret { 0%,100%{opacity:1;}50%{opacity:0;} }
      `}</style>
    </div>
  );
}
