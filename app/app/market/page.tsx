"use client";

import { useState, useEffect } from "react";
import { AgentMonogram } from "@/components/agents/AgentMonogram";
import { useAccount } from "wagmi";
import { agentApi } from "@/lib/agent-api";
import { useYieldOracle } from "@/hooks/useYieldOracle";
import { ADDRESSES } from "@/lib/contracts";

interface Listing {
  asset_id: number | null;
  token_address: string;
  owner: string;
  asset_type: string;
  compliance_score: number;
  tx_hash: string;
  ts: number;
  token_name: string;
  token_symbol: string;
  apy_bps: number;
  value_usd: number;
  price_usd: number;
  supply: number;
  ipfs_cid?: string;
  _source: string;
}

const TYPE_COLOR: Record<string, string> = {
  real_estate:    "var(--nexus)",
  bond:           "var(--accent)",
  commodity:      "var(--warn)",
  liquid_staking: "var(--atlas)",
  stablecoin:     "var(--fg-2)",
  btc_wrapper:    "var(--warn)",
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "var(--accent)" : score >= 50 ? "var(--warn)" : "rgba(239,68,68,0.7)";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:3, background:"var(--bg-2)", borderRadius:2, overflow:"hidden" }}>
        <div style={{ width:`${score}%`, height:"100%", background:color, borderRadius:2 }}/>
      </div>
      <span className="mono-sm" style={{ color, minWidth:28 }}>{score}</span>
    </div>
  );
}

const GAS_BADGE = (
  <span className="tag" style={{ fontSize:9, color:"var(--accent)", borderColor:"rgba(0,229,160,0.3)" }}>
    ⛽ ~$0.001 gas · Mantle L2
  </span>
);

export default function MarketPage() {
  const { address, isConnected } = useAccount();
  const { snapshotCount, apyMap, hasData, isLoading: oracleLoading } = useYieldOracle();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [selling, setSelling] = useState<string | null>(null);
  const [buyAmount, setBuyAmount] = useState("1000");
  const [sellAmount, setSellAmount] = useState("500");
  const [buyTx, setBuyTx] = useState<Record<string, string>>({});
  const [sellTx, setSellTx] = useState<Record<string, string>>({});
  const [buyError, setBuyError] = useState<Record<string, string>>({});
  const [sellError, setSellError] = useState<Record<string, string>>({});
  const [buyStatus, setBuyStatus] = useState<Record<string, string>>({});
  const [sellStatus, setSellStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    agentApi<{ listings: Listing[] }>("/market/listings")
      .then(d => setListings(d.listings ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const listingKey = (l: Listing) => `${l.token_symbol}-${l.ts}`;

  const executeBuy = async (listing: Listing) => {
    if (!address || !isConnected) return;
    const usd = parseFloat(buyAmount);
    if (!usd || usd <= 0) return;
    const key = listingKey(listing);
    setBuyStatus(s => ({ ...s, [key]: "Atlas is pricing your order…" }));
    setBuyError(s => ({ ...s, [key]: "" }));
    setBuyTx(s => ({ ...s, [key]: "" }));
    try {
      const d = await agentApi<{ success: boolean; onChainTx: string; tokens: number; reasoning: string }>("/market/buy", {
        method: "POST",
        body: JSON.stringify({
          buyer_address:   address,
          token_address:   listing.token_address,
          token_symbol:    listing.token_symbol,
          token_name:      listing.token_name,
          amount_usd:      usd,
          price_per_token: listing.price_usd,
          apy_bps:         listing.apy_bps,
        }),
      });
      if (d.onChainTx) {
        setBuyTx(s => ({ ...s, [key]: d.onChainTx }));
        setBuyStatus(s => ({ ...s, [key]: `✅ ${d.tokens.toLocaleString(undefined, { maximumFractionDigits:2 })} ${listing.token_symbol} — logged by Atlas` }));
      } else {
        setBuyStatus(s => ({ ...s, [key]: "Order logged. Waiting for on-chain confirmation." }));
      }
    } catch (err) {
      setBuyError(s => ({ ...s, [key]: err instanceof Error ? err.message : "Buy failed." }));
      setBuyStatus(s => ({ ...s, [key]: "" }));
    }
  };

  const executeSell = async (listing: Listing) => {
    if (!address || !isConnected) return;
    const tokens = parseFloat(sellAmount);
    if (!tokens || tokens <= 0) return;
    const key = listingKey(listing);
    setSellStatus(s => ({ ...s, [key]: "Atlas is processing your sell order…" }));
    setSellError(s => ({ ...s, [key]: "" }));
    setSellTx(s => ({ ...s, [key]: "" }));
    try {
      const d = await agentApi<{ success: boolean; onChainTx: string; usd_value: number; reasoning: string }>("/market/sell", {
        method: "POST",
        body: JSON.stringify({
          seller_address:  address,
          token_address:   listing.token_address,
          token_symbol:    listing.token_symbol,
          token_name:      listing.token_name,
          amount_tokens:   tokens,
          price_per_token: listing.price_usd,
          apy_bps:         listing.apy_bps,
        }),
      });
      if (d.onChainTx) {
        setSellTx(s => ({ ...s, [key]: d.onChainTx }));
        setSellStatus(s => ({ ...s, [key]: `✅ Sold ${tokens.toLocaleString()} ${listing.token_symbol} → $${d.usd_value.toLocaleString(undefined,{maximumFractionDigits:2})} — Atlas logged on-chain` }));
      } else {
        setSellStatus(s => ({ ...s, [key]: "Sell logged. Waiting for on-chain confirmation." }));
      }
    } catch (err) {
      setSellError(s => ({ ...s, [key]: err instanceof Error ? err.message : "Sell failed." }));
      setSellStatus(s => ({ ...s, [key]: "" }));
    }
  };

  const totalListings = listings.length;
  const totalValue = listings.reduce((s, l) => s + (l.value_usd || 0), 0);
  const avgApy = listings.length
    ? listings.reduce((s, l) => s + (l.apy_bps || 0), 0) / listings.length / 100
    : 0;

  return (
    <div style={{ maxWidth:1480, margin:"0 auto", padding:"32px" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:24 }}>
        <div>
          <div className="mono" style={{ color:"var(--nexus)", marginBottom:8 }}>§ market · nexus listed</div>
          <h1 className="display" style={{ fontSize:64 }}>RWA Market.</h1>
          <p style={{ color:"var(--fg-1)", fontSize:14, marginTop:8 }}>
            Buy fractions of tokenized real-world assets. Every trade logged on Mantle by Atlas.
          </p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end" }}>
          <a href="/tokenize" className="btn btn-primary" style={{ textDecoration:"none" }}>List your asset →</a>
          <a href="https://faucet.sepolia.mantle.xyz" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ textDecoration:"none", fontSize:11 }}>⛽ Get testnet MNT ↗</a>
        </div>
      </div>

      {/* Gasless banner */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", background:"rgba(0,229,160,0.04)", border:"1px solid rgba(0,229,160,0.2)", borderRadius:2, marginBottom:24 }}>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--accent)", letterSpacing:"0.08em" }}>⚡ NEAR-ZERO GAS</span>
        <span className="mono-sm" style={{ color:"var(--fg-2)", textTransform:"none", letterSpacing:0 }}>Every trade costs ~$0.001 on Mantle L2 — 1000× cheaper than Ethereum mainnet. Web3 is effectively free here.</span>
        <a href="https://faucet.sepolia.mantle.xyz" target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)", marginLeft:"auto", whiteSpace:"nowrap" }}>Get testnet MNT ↗</a>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:0, border:"1px solid var(--line)", marginBottom:32 }}>
        {[
          { label:"Listings",    value: totalListings.toString(),                         sub:"Tokenized RWAs" },
          { label:"Total Value", value: `$${totalValue.toLocaleString()}`,                sub:"Combined asset value" },
          { label:"Avg APY",     value: `${avgApy.toFixed(2)}%`,                         sub:"Yield across all listings" },
        ].map(({ label, value, sub }, i) => (
          <div key={i} style={{ padding:"16px 18px", borderRight: i < 2 ? "1px solid var(--line)" : "none" }}>
            <div className="mono-sm" style={{ marginBottom:6 }}>{label}</div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:28, color:"var(--fg-0)" }}>{value}</div>
            <div className="mono-sm" style={{ color:"var(--nexus)", marginTop:4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Live YieldOracle banner */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"var(--bg-1)", border:"1px solid var(--line)", borderRadius:2, marginBottom:24, flexWrap:"wrap" }}>
        <span className="live-dot"/>
        <span className="mono-sm" style={{ color:"var(--accent)" }}>LIVE · YieldOracle.sol on Mantle</span>
        <span className="mono-sm" style={{ color:"var(--fg-3)" }}>·</span>
        {oracleLoading ? (
          <span className="mono-sm" style={{ color:"var(--fg-3)" }}>reading chain…</span>
        ) : hasData ? (
          <span className="mono-sm" style={{ color:"var(--fg-1)", textTransform:"none", letterSpacing:0 }}>
            {Number(snapshotCount).toLocaleString()} on-chain snapshot{Number(snapshotCount) !== 1 ? "s" : ""} · APY sourced from Yield agent
          </span>
        ) : (
          <span className="mono-sm" style={{ color:"var(--fg-3)" }}>no snapshots yet — Yield agent will post shortly</span>
        )}
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <span className="tag" style={{ fontSize:9 }}>Pyth oracle feed</span>
          <a
            href={`https://sepolia.mantlescan.xyz/address/${ADDRESSES.YieldOracle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mono-sm"
            style={{ color:"var(--accent)" }}
          >
            YieldOracle ↗
          </a>
        </div>
      </div>

      {/* Listings */}
      {loading ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--fg-3)", fontFamily:"var(--font-mono)", fontSize:12 }}>
          Loading listings…
        </div>
      ) : listings.length === 0 ? (
        <div style={{ textAlign:"center", padding:"80px 0" }}>
          <div style={{ fontSize:32, marginBottom:16 }}>📋</div>
          <div className="display" style={{ fontSize:28, marginBottom:8 }}>No listings yet.</div>
          <p style={{ color:"var(--fg-2)", fontSize:14, marginBottom:24 }}>
            Tokenize your first real-world asset to list it here.
          </p>
          <a href="/tokenize" className="btn btn-primary" style={{ textDecoration:"none" }}>Tokenize an asset →</a>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(380px,1fr))", gap:16 }}>
          {listings.map(listing => {
            const key = listingKey(listing);
            const isOwner = listing.owner?.toLowerCase() === address?.toLowerCase() && listing.owner !== "unknown";
            const color = TYPE_COLOR[listing.asset_type] ?? "var(--fg-2)";
            const symbol = listing.token_symbol || "RWA";
            const name = listing.token_name || listing.asset_type?.replace(/_/g," ") || "Real World Asset";
            const liveApy = apyMap[symbol];
            const apy = (liveApy ?? (listing.apy_bps / 100)).toFixed(2);
            const apyIsLive = liveApy != null;
            const price = listing.price_usd;
            const usd = parseFloat(buyAmount) || 0;
            const tokens = price > 0 ? usd / price : 0;
            const txForThis = buyTx[key];
            const statusForThis = buyStatus[key];
            const errorForThis = buyError[key];
            const isBuying = buying === key;
            const date = new Date(listing.ts * 1000).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });

            return (
              <div key={key} className="panel" style={{ display:"flex", flexDirection:"column" }}>
                {/* Card header */}
                <div style={{ padding:"16px", borderBottom:"1px solid var(--line)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:40, height:40, borderRadius:2, background:"var(--bg-2)", border:`1px solid ${color}33`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color, fontWeight:700 }}>{symbol.slice(0,5)}</span>
                      </div>
                      <div>
                        <div style={{ fontFamily:"var(--font-mono)", fontSize:14, color:"var(--fg-0)", marginBottom:2 }}>{symbol}</div>
                        <div className="mono-sm" style={{ color:"var(--fg-3)" }}>{name}</div>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <span className="tag" style={{ fontSize:9, color, borderColor:`${color}44` }}>
                        {listing.asset_type.replace(/_/g," ")}
                      </span>
                      {isOwner && (
                        <div className="mono-sm" style={{ color:"var(--nexus)", marginTop:4 }}>Your listing</div>
                      )}
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                    {[
                      { label:"Price/Token", value: price > 0 ? `$${price.toFixed(2)}` : "—", accent:false, live:false },
                      { label:"APY",         value: `${apy}%`,  accent:true,  live:apyIsLive },
                      { label:"Total Value", value: listing.value_usd ? `$${Number(listing.value_usd).toLocaleString()}` : "—", accent:false, live:false },
                    ].map(({ label, value, accent, live }) => (
                      <div key={label} style={{ background:"var(--bg-1)", padding:"8px", borderRadius:2 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:4 }}>
                          <span className="mono-sm">{label}</span>
                          {live && <span className="live-dot" style={{ width:5, height:5 }}/>}
                        </div>
                        <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color: accent ? "var(--accent)" : "var(--fg-0)" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compliance + meta */}
                <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--line)", background:"var(--bg-1)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <span className="mono-sm">Compliance</span>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {listing.ipfs_cid && (
                        <a
                          href={`https://ipfs.io/ipfs/${listing.ipfs_cid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono-sm"
                          style={{ color:"var(--accent)", fontSize:9 }}
                        >
                          📄 IPFS ↗
                        </a>
                      )}
                      <span className="mono-sm" style={{ color:"var(--fg-3)" }}>Listed {date}</span>
                    </div>
                  </div>
                  <ScoreBar score={listing.compliance_score} />
                </div>

                {/* Buy panel */}
                <div style={{ padding:"14px 16px", marginTop:"auto" }}>
                  {isOwner ? (
                    selling === key ? (
                      <div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, marginBottom:8, alignItems:"end" }}>
                          <label style={{ display:"grid", gap:4 }}>
                            <span className="mono-sm">Tokens to sell</span>
                            <input
                              className="input-field"
                              value={sellAmount}
                              onChange={e => setSellAmount(e.target.value.replace(/[^\d.]/g,""))}
                              style={{ fontSize:12 }}
                              autoFocus
                            />
                          </label>
                          <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => setSelling(null)}>✕</button>
                        </div>
                        {listing.price_usd > 0 && (
                          <div className="mono-sm" style={{ color:"var(--fg-2)", marginBottom:8, textTransform:"none", letterSpacing:0 }}>
                            = ${((parseFloat(sellAmount)||0) * listing.price_usd).toLocaleString(undefined,{maximumFractionDigits:2})} USD
                          </div>
                        )}
                        {sellStatus[key] && !sellTx[key] && (
                          <div className="mono-sm" style={{ color:"var(--warn)", marginBottom:8, textTransform:"none", letterSpacing:0 }}>{sellStatus[key]}</div>
                        )}
                        {sellError[key] && (
                          <div className="mono-sm" style={{ color:"var(--warn)", marginBottom:8, textTransform:"none", letterSpacing:0 }}>{sellError[key]}</div>
                        )}
                        {sellTx[key] ? (
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span className="mono-sm" style={{ color:"var(--accent)", textTransform:"none", letterSpacing:0 }}>{sellStatus[key]}</span>
                            <a href={`https://sepolia.mantlescan.xyz/tx/${sellTx[key]}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>
                              ↗ {sellTx[key].slice(0,8)}…{sellTx[key].slice(-6)}
                            </a>
                          </div>
                        ) : (
                          <div style={{ display:"flex", gap:8 }}>
                            <button className="btn btn-primary" style={{ flex:1, fontSize:11, background:"var(--warn)", borderColor:"var(--warn)" }} onClick={() => executeSell(listing)} disabled={!(parseFloat(sellAmount) > 0)}>
                              Confirm sell →
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setSelling(null)}>Cancel</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div>
                          <div className="mono-sm" style={{ color:"var(--nexus)", marginBottom:2 }}>Your listing</div>
                          {sellTx[key] && (
                            <div className="mono-sm" style={{ color:"var(--accent)", textTransform:"none", letterSpacing:0 }}>{sellStatus[key]}</div>
                          )}
                        </div>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize:11, borderColor:"var(--warn)", color:"var(--warn)" }}
                          onClick={() => { setSelling(key); setSellAmount("500"); }}
                          disabled={!isConnected}
                        >
                          Sell →
                        </button>
                      </div>
                    )
                  ) : !isBuying ? (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      {txForThis ? (
                        <span className="mono-sm" style={{ color:"var(--accent)", textTransform:"none", letterSpacing:0 }}>{statusForThis}</span>
                      ) : (
                        <span className="mono-sm" style={{ color:"var(--fg-3)" }}>
                          {listing.supply > 0 ? `${Number(listing.supply).toLocaleString()} tokens available` : "Fractional ownership"}
                        </span>
                      )}
                      <button
                        className="btn btn-primary"
                        style={{ fontSize:11 }}
                        onClick={() => { setBuying(key); setBuyAmount("1000"); }}
                        disabled={!isConnected}
                      >
                        {isConnected ? "Buy →" : "Connect wallet"}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, marginBottom:8, alignItems:"end" }}>
                        <label style={{ display:"grid", gap:4 }}>
                          <span className="mono-sm">Amount (USD)</span>
                          <input
                            className="input-field"
                            value={buyAmount}
                            onChange={e => setBuyAmount(e.target.value.replace(/[^\d.]/g,""))}
                            style={{ fontSize:12 }}
                            autoFocus
                          />
                        </label>
                        <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => setBuying(null)}>✕</button>
                      </div>
                      {price > 0 && (
                        <div className="mono-sm" style={{ color:"var(--fg-2)", marginBottom:8, textTransform:"none", letterSpacing:0 }}>
                          = {tokens.toLocaleString(undefined, { maximumFractionDigits:2 })} {symbol} tokens
                        </div>
                      )}
                      {statusForThis && !txForThis && (
                        <div className="mono-sm" style={{ color:"var(--nexus)", marginBottom:8, textTransform:"none", letterSpacing:0 }}>
                          {statusForThis}
                        </div>
                      )}
                      {errorForThis && (
                        <div className="mono-sm" style={{ color:"var(--warn)", marginBottom:8, textTransform:"none", letterSpacing:0 }}>
                          {errorForThis}
                        </div>
                      )}
                      {txForThis ? (
                        <div>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                            <span className="mono-sm" style={{ color:"var(--accent)", textTransform:"none", letterSpacing:0 }}>{statusForThis}</span>
                            <a href={`https://sepolia.mantlescan.xyz/tx/${txForThis}`} target="_blank" rel="noopener noreferrer" className="mono-sm" style={{ color:"var(--accent)" }}>
                              ↗ {txForThis.slice(0,8)}…{txForThis.slice(-6)}
                            </a>
                          </div>
                          <a href="/portfolio" style={{ display:"block", textDecoration:"none" }}>
                            <button className="btn btn-primary" style={{ width:"100%", fontSize:11 }}>View in Portfolio →</button>
                          </a>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                            <button
                              className="btn btn-primary"
                              style={{ flex:1, fontSize:11 }}
                              onClick={() => executeBuy(listing)}
                              disabled={!(parseFloat(buyAmount) > 0)}
                            >
                              Confirm purchase →
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setBuying(null)}>Cancel</button>
                          </div>
                          {GAS_BADGE}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Agent monogram footer */}
                <div style={{ padding:"8px 16px", borderTop:"1px solid var(--line)", background:"var(--bg-1)", display:"flex", alignItems:"center", gap:6 }}>
                  <AgentMonogram agent="nexus"/>
                  <span className="mono-sm" style={{ color:"var(--fg-3)" }}>Nexus verified</span>
                  <span className="mono-sm" style={{ color:"var(--fg-3)", marginLeft:"auto" }}>
                    {listing.token_address.slice(0,10)}…{listing.token_address.slice(-6)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isConnected && listings.length > 0 && (
        <div style={{ marginTop:24, padding:"14px 18px", background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:2, fontSize:13, color:"var(--warn)" }}>
          ⚠ Connect wallet to buy tokens
        </div>
      )}
    </div>
  );
}
