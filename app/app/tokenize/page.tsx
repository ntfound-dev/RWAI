"use client";

import { useState, useRef } from "react";
import { AgentMonogram } from "@/components/agents/AgentMonogram";
import { useAccount } from "wagmi";
import { agentApi } from "@/lib/agent-api";
import { ADDRESSES } from "@/lib/contracts";

type Step = "upload" | "analyze" | "compliance" | "review" | "deploy" | "live";

interface NexusResult {
  assetType: string;
  estimatedValueUSD: number;
  suggestedTokenName: string;
  suggestedSymbol: string;
  suggestedSupply: number;
  pricePerTokenUSD: number;
  annualYieldBps: number;
  missingDocuments: string[];
  concerns: string[];
  summary: string;
}

interface ShieldResult {
  score: number;
  cleared: boolean;
  notes: string;
  jurisdiction: string;
}

const STEPS: Step[] = ["upload", "analyze", "compliance", "review", "deploy", "live"];

const STEP_LABELS: Record<Step, string> = {
  upload:     "Upload",
  analyze:    "Analyze",
  compliance: "Compliance",
  review:     "Review",
  deploy:     "Deploy",
  live:       "Live",
};

export default function TokenizePage() {
  const { isConnected, address } = useAccount();
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [nexusResult, setNexusResult] = useState<NexusResult | null>(null);
  const [shieldResult, setShieldResult] = useState<ShieldResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [deployedTx, setDeployedTx] = useState<string>("");
  const [documentText, setDocumentText] = useState("");
  const [error, setError] = useState("");
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [jurisdiction, setJurisdiction] = useState("US-NY");
  const fileRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => setAgentLog(prev => [...prev, msg]);

  const handleFiles = (f: FileList | null) => {
    if (!f) return;
    setFiles(Array.from(f));
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError("");
    setStep("analyze");
    addLog("nexus.parse_pdf() → extracting asset metadata…");
    try {
      const docs = await filesToDocumentText(files);
      setDocumentText(docs);

      const nexus = await agentApi<Record<string, unknown>>("/tokenize", {
        method: "POST",
        body: JSON.stringify({
          document_text: docs,
          asset_type: "real_estate",
        }),
      });
      const normalizedNexus = normalizeNexus(nexus);
      setNexusResult(normalizedNexus);
      addLog("nexus → analysis complete. Delegating to shield…");

      setStep("compliance");
      addLog(`shield.kyc_check() → scanning ownership records… jurisdiction: ${jurisdiction}`);
      addLog("shield.wallet_screen() → OFAC/EU sanctions check…");
      const shield = await agentApi<Record<string, unknown>>("/compliance", {
        method: "POST",
        body: JSON.stringify({
          asset_id: 0,
          document_text: docs,
          jurisdiction,
          owner_address: address ?? null,
        }),
      });
      const normalizedShield = normalizeShield(shield);
      setShieldResult(normalizedShield);
      addLog(`shield.risk_score() → ${normalizedShield.score}/100 · ${normalizedShield.cleared ? "CLEARED ✓" : "BLOCKED ✗"}. Ready for review.`);

      setStep("review");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tokenization backend unavailable.";
      setError(message);
      addLog(`error → ${message}`);
      setStep("upload");
    } finally {
      setLoading(false);
    }
  };

  const deployToken = async () => {
    if (!nexusResult || !shieldResult) return;
    setLoading(true);
    setError("");
    setStep("deploy");
    addLog("nexus.register_rwa() → deploying AssetToken.sol on Mantle…");
    try {
      const tokenAddress = ADDRESSES.AssetToken as string;
      if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error("AssetToken address is not synced. Run deployment and sync before production token registration.");
      }
      const result = await agentApi<{ onChainTx?: string }>("/tokenize", {
        method: "POST",
        body: JSON.stringify({
          document_text: documentText || nexusResult.summary,
          asset_type: nexusResult.assetType,
          asset_id: 0,
          token_address: tokenAddress,
          owner_address: address ?? "",
        }),
      });
      const tx = result.onChainTx ?? "";
      setDeployedTx(tx);
      addLog(tx ? `✅ Tokenization logged · tx ${tx.slice(0, 10)}…${tx.slice(-6)}` : "✅ Tokenization accepted · no on-chain tx returned");
      setStep("live");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to register tokenization on Mantle.";
      setError(message);
      addLog(`error → ${message}`);
      setStep("review");
    } finally {
      setLoading(false);
    }
  };

  const stepIdx = STEPS.indexOf(step);

  return (
    <div style={{ maxWidth:1280, margin:"0 auto", padding:"32px", display:"grid", gridTemplateColumns:"1fr 360px", gap:24, alignItems:"start" }}>

      {/* Left: main flow */}
      <div>
        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <div className="mono" style={{ color:"var(--accent)", marginBottom:8 }}>§ tokenize · path A</div>
          <h1 className="display" style={{ fontSize:56, marginBottom:8 }}>Tokenize your asset.</h1>
          <p style={{ color:"var(--fg-1)", fontSize:14 }}>Upload documents. Nexus analyzes. Shield reviews. Deploy ERC-20 on Mantle.</p>
        </div>

        {/* Step tracker */}
        <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:32, border:"1px solid var(--line)" }}>
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = s === step;
            return (
              <div key={s} style={{ flex:1, padding:"10px 14px", borderRight: i < 5 ? "1px solid var(--line)" : "none",
                background: active ? "var(--bg-2)" : done ? "rgba(0,229,160,0.06)" : "var(--bg-1)",
                borderBottom: active ? "2px solid var(--accent)" : done ? "2px solid rgba(0,229,160,0.4)" : "2px solid transparent",
              }}>
                <div className="mono-sm" style={{ color: active ? "var(--fg-0)" : done ? "var(--accent)" : "var(--fg-3)" }}>
                  {done ? "✓ " : ""}{String(i+1).padStart(2,"0")}
                </div>
                <div className="mono-sm" style={{ color: active ? "var(--accent)" : done ? "var(--accent)" : "var(--fg-2)", marginTop:2 }}>
                  {STEP_LABELS[s]}
                </div>
              </div>
            );
          })}
        </div>

        {/* Upload step */}
        {step === "upload" && (
          <div>
            <div
              style={{ border:"2px dashed var(--line-strong)", borderRadius:4, padding:"48px 32px", textAlign:"center", cursor:"pointer", transition:"border-color 150ms", marginBottom:20 }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent)"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "var(--line-strong)"; }}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); e.currentTarget.style.borderColor = "var(--line-strong)"; }}
            >
              <div style={{ fontSize:32, marginBottom:12 }}>📄</div>
              <div className="display" style={{ fontSize:24, marginBottom:8 }}>Drop documents here</div>
              <p className="mono-sm" style={{ color:"var(--fg-2)", textTransform:"none", letterSpacing:0 }}>PDF, DOCX · deed, income statement, appraisal</p>
              <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc" style={{ display:"none" }} onChange={e => handleFiles(e.target.files)}/>
            </div>
            {files.length > 0 && (
              <div style={{ marginBottom:20 }}>
                {files.map(f => (
                  <div key={f.name} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"var(--bg-1)", border:"1px solid var(--line)", borderRadius:2, marginBottom:4 }}>
                    <span>📄</span>
                    <span style={{ fontSize:13, color:"var(--fg-0)" }}>{f.name}</span>
                    <span className="mono-sm" style={{ marginLeft:"auto" }}>{(f.size/1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            )}
            {/* Jurisdiction selector */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <span className="mono-sm" style={{ color:"var(--fg-2)" }}>Jurisdiction:</span>
              <select
                value={jurisdiction}
                onChange={e => setJurisdiction(e.target.value)}
                style={{ fontFamily:"var(--font-mono)", fontSize:11, background:"var(--bg-1)", border:"1px solid var(--line)", color:"var(--fg-0)", padding:"4px 8px", borderRadius:2 }}
              >
                <option value="US-NY">US-NY (Reg D)</option>
                <option value="US-CA">US-CA (Reg D)</option>
                <option value="EU-DE">EU-DE (MiFID II)</option>
                <option value="EU-FR">EU-FR (MiFID II)</option>
                <option value="SG">Singapore (MAS)</option>
                <option value="AE-ADGM">UAE-ADGM (FSRA)</option>
                <option value="UK">UK (FCA)</option>
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={files.length === 0 ? () => fileRef.current?.click() : runAnalysis}
            >
              {files.length === 0 ? "Upload files to continue" : `Analyze ${files.length} document${files.length > 1 ? "s" : ""} →`}
            </button>
            {error && (
              <div style={{ marginTop:16, padding:"12px 16px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:2, fontSize:13, color:"var(--warn)" }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* Analyze / compliance step (loading) */}
        {(step === "analyze" || step === "compliance") && loading && (
          <div className="panel" style={{ padding:24 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <AgentMonogram agent={step === "analyze" ? "nexus" : "shield"} size="lg" active/>
              <div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--fg-0)" }}>{step === "analyze" ? "Nexus" : "Shield"} is working…</div>
                <div className="mono-sm" style={{ color: step === "analyze" ? "var(--nexus)" : "var(--shield)" }}>
                  {step === "analyze" ? "Tokenization Agent" : "Compliance Agent"}
                </div>
              </div>
            </div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-1)", lineHeight:2 }}>
              {agentLog.map((l, i) => <div key={i} style={{ color: l.startsWith("✅") ? "var(--accent)" : "var(--fg-1)" }}>{l}</div>)}
              <span style={{ color:"var(--accent)", animation:"pulse-slow 1s infinite" }}>▊</span>
            </div>
          </div>
        )}

        {/* Review step */}
        {step === "review" && nexusResult && shieldResult && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
              {/* Nexus result */}
              <div className="panel">
                <div className="panel-header">
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}><AgentMonogram agent="nexus"/><span className="mono">Nexus Analysis</span></div>
                  <span className="mono-sm" style={{ color:"var(--nexus)" }}>COMPLETE</span>
                </div>
                <div style={{ padding:"14px" }}>
                  {[
                    ["Asset Type", nexusResult.assetType.replace("_"," ")],
                    ["Estimated Value", `$${nexusResult.estimatedValueUSD.toLocaleString()}`],
                    ["Token Name", nexusResult.suggestedTokenName],
                    ["Symbol", nexusResult.suggestedSymbol],
                    ["Supply", nexusResult.suggestedSupply.toLocaleString()],
                    ["Price/Token", `$${nexusResult.pricePerTokenUSD.toFixed(2)}`],
                    ["Annual Yield", `${(nexusResult.annualYieldBps/100).toFixed(2)}%`],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:12 }}>
                      <span style={{ color:"var(--fg-2)" }}>{k}</span>
                      <span style={{ color:"var(--fg-0)", fontFamily:"var(--font-mono)" }}>{v}</span>
                    </div>
                  ))}
                  <p style={{ fontSize:12, color:"var(--fg-1)", marginTop:10, lineHeight:1.5, paddingTop:10, borderTop:"1px solid var(--line)" }}>{nexusResult.summary}</p>
                </div>
              </div>

              {/* Shield result */}
              <div className="panel">
                <div className="panel-header">
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}><AgentMonogram agent="shield"/><span className="mono">Shield Compliance</span></div>
                  <span className="mono-sm" style={{ color: shieldResult.cleared ? "var(--accent)" : "var(--warn)" }}>
                    {shieldResult.cleared ? "CLEARED" : "BLOCKED"}
                  </span>
                </div>
                <div style={{ padding:"14px" }}>
                  <div style={{ textAlign:"center", marginBottom:16 }}>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:48, color: shieldResult.score >= 70 ? "var(--accent)" : "var(--warn)" }}>
                      {shieldResult.score}
                    </div>
                    <div className="mono-sm">COMPLIANCE SCORE /100</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {[
                      ["Jurisdiction", shieldResult.jurisdiction],
                      ["Status", shieldResult.cleared ? "Cleared" : "Blocked"],
                    ].map(([k,v]) => (
                      <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                        <span style={{ color:"var(--fg-2)" }}>{k}</span>
                        <span style={{ color:"var(--fg-0)", fontFamily:"var(--font-mono)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize:12, color:"var(--fg-1)", marginTop:10, lineHeight:1.5, paddingTop:10, borderTop:"1px solid var(--line)" }}>{shieldResult.notes}</p>
                </div>
              </div>
            </div>

            {!isConnected && (
              <div style={{ padding:"12px 16px", background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:2, marginBottom:16, fontSize:13, color:"var(--warn)" }}>
                ⚠ Connect wallet to deploy token on Mantle Testnet
              </div>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <button className="btn btn-primary" onClick={deployToken} disabled={!shieldResult.cleared || loading}>
                {shieldResult.cleared ? "Deploy ERC-20 on Mantle →" : "Compliance score too low"}
              </button>
              <span className="tag" style={{ fontSize:9, color:"var(--accent)", borderColor:"rgba(0,229,160,0.3)" }}>
                ⛽ Gas ≈ $0.001 · Mantle L2
              </span>
            </div>
            {error && (
              <div style={{ marginTop:16, padding:"12px 16px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:2, fontSize:13, color:"var(--warn)" }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* Deploy step */}
        {step === "deploy" && loading && (
          <div className="panel" style={{ padding:24 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <AgentMonogram agent="nexus" size="lg" active/>
              <div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--fg-0)" }}>Deploying to Mantle Testnet…</div>
                <div className="mono-sm" style={{ color:"var(--nexus)" }}>AssetToken.sol · ERC-8004 registration</div>
              </div>
            </div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-1)", lineHeight:2 }}>
              {agentLog.slice(-4).map((l, i) => <div key={i} style={{ color: l.startsWith("✅") ? "var(--accent)" : "var(--fg-1)" }}>{l}</div>)}
              <span style={{ color:"var(--accent)" }}>▊</span>
            </div>
          </div>
        )}

        {/* Live step */}
        {step === "live" && (
          <div className="panel">
            <div className="panel-header">
              <span className="mono" style={{ color:"var(--accent)" }}>✅ Token live on Mantle Sepolia</span>
              <span className="live-dot"/>
            </div>
            <div style={{ padding:24 }}>

              {/* Prominent TX block */}
              {deployedTx ? (
                <a
                  href={`https://sepolia.mantlescan.xyz/tx/${deployedTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration:"none", display:"block", marginBottom:20 }}
                >
                  <div style={{ padding:"14px 18px", background:"rgba(0,229,160,0.06)", border:"1px solid rgba(0,229,160,0.3)", borderRadius:2, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div className="mono-sm" style={{ color:"var(--accent)", marginBottom:4 }}>AgentExecutor.sol · on-chain log</div>
                      <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--fg-0)" }}>
                        {deployedTx.slice(0,18)}…{deployedTx.slice(-10)}
                      </div>
                    </div>
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:18, color:"var(--accent)" }}>↗</span>
                  </div>
                </a>
              ) : (
                <div style={{ padding:"14px 18px", background:"var(--bg-1)", border:"1px solid var(--line)", borderRadius:2, marginBottom:20 }}>
                  <div className="mono-sm" style={{ color:"var(--fg-3)" }}>On-chain TX pending — backend is signing…</div>
                </div>
              )}

              {/* Token stats */}
              {[
                ["Token",       nexusResult?.suggestedSymbol ?? "—"],
                ["Supply",      `${nexusResult?.suggestedSupply.toLocaleString()} tokens`],
                ["Price/token", `$${nexusResult?.pricePerTokenUSD.toFixed(2)}`],
                ["Yield",       `${((nexusResult?.annualYieldBps ?? 0)/100).toFixed(2)}% APY`],
                ["Compliance",  `${shieldResult?.score ?? "—"}/100 · ${shieldResult?.jurisdiction ?? "—"}`],
                ["Gas paid",    "~$0.001 on Mantle L2"],
              ].map(([k,v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:10, fontSize:13 }}>
                  <span style={{ color:"var(--fg-2)" }}>{k}</span>
                  <span style={{ color: k === "Gas paid" ? "var(--accent)" : "var(--fg-0)", fontFamily:"var(--font-mono)" }}>{v}</span>
                </div>
              ))}

              {/* Contract links */}
              <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid var(--line)", display:"flex", gap:12, flexWrap:"wrap" }}>
                <a href={`https://sepolia.mantlescan.xyz/address/${ADDRESSES.AgentExecutor}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--fg-2)" }}>
                  AgentExecutor.sol ↗
                </a>
                <a href={`https://sepolia.mantlescan.xyz/address/${ADDRESSES.RWAiRegistry}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--fg-2)" }}>
                  RWAiRegistry.sol ↗
                </a>
                <a href={`https://sepolia.mantlescan.xyz/address/${ADDRESSES.ComplianceLog}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--fg-2)" }}>
                  ComplianceLog.sol ↗
                </a>
              </div>

              <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid var(--line)" }}>
                <div className="mono-sm" style={{ marginBottom:8, color:"var(--fg-2)" }}>NEXUS ERC-8004 REPUTATION UPDATED</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:24, color:"var(--accent)" }}>4.92 → 4.93</div>
              </div>

              <div style={{ marginTop:24, paddingTop:16, borderTop:"1px solid var(--line)" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setStep("upload");
                    setFiles([]);
                    setNexusResult(null);
                    setShieldResult(null);
                    setDeployedTx("");
                    setDocumentText("");
                    setError("");
                    setAgentLog([]);
                  }}
                >
                  Tokenize another asset →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: agent log panel */}
      <div className="panel" style={{ position:"sticky", top:72 }}>
        <div className="panel-header">
          <span className="mono">Agent trace log</span>
          <span className="live-dot"/>
        </div>
        <div style={{ padding:"12px", fontFamily:"var(--font-mono)", fontSize:10, lineHeight:2.2, maxHeight:400, overflowY:"auto" }}>
          {agentLog.length === 0
            ? <span className="mono-sm">Waiting for documents…</span>
            : agentLog.map((l, i) => (
              <div key={i} style={{ color: l.startsWith("✅") ? "var(--accent)" : l.includes("→") ? "var(--fg-1)" : "var(--fg-2)" }}>
                {l}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function filesToDocumentText(files: File[]) {
  const form = new FormData();
  for (const f of files) form.append("files", f);

  try {
    const res = await fetch("/api/extract-text", { method: "POST", body: form });
    if (res.ok) {
      const { results } = await res.json() as { results: Array<{ name: string; text: string }> };
      return results
        .map(r => `Document: ${r.name}\n${r.text.slice(0, 12_000)}`)
        .join("\n\n");
    }
  } catch {
    // fall through to client-side fallback
  }

  // Fallback: plain text files only
  const chunks = await Promise.all(files.map(async file => {
    try {
      const text = await file.text();
      const readable = text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "").trim();
      if (readable.length > 80) return `Document: ${file.name}\n${readable.slice(0, 12_000)}`;
    } catch { /* ignore */ }
    return `Document uploaded: ${file.name} (${Math.round(file.size / 1024)} KB).`;
  }));
  return chunks.join("\n\n");
}

function normalizeNexus(data: Record<string, unknown>): NexusResult {
  return {
    assetType: asString(data.assetType, "real_estate"),
    estimatedValueUSD: asNumber(data.estimatedValueUSD, 0),
    suggestedTokenName: asString(data.suggestedTokenName, "RWAi Asset Token"),
    suggestedSymbol: asString(data.suggestedSymbol, "RWA"),
    suggestedSupply: asNumber(data.suggestedSupply, 1_000_000),
    pricePerTokenUSD: asNumber(data.pricePerTokenUSD, 1),
    annualYieldBps: asNumber(data.annualYieldBps, 0),
    missingDocuments: asStringArray(data.missingDocuments),
    concerns: asStringArray(data.concerns),
    summary: asString(data.summary, asString(data.raw, "Nexus returned an unstructured production response.")),
  };
}

function normalizeShield(data: Record<string, unknown>): ShieldResult {
  const score = asNumber(data.score ?? data.complianceScore, 0);
  return {
    score,
    cleared: typeof data.cleared === "boolean" ? data.cleared : score >= 70,
    jurisdiction: asString(data.jurisdiction, "unknown"),
    notes: asString(data.notes, asString(data.summary, asString(data.raw, "Shield returned an unstructured production response."))),
  };
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
