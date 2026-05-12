"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicClient, getWalletClient } from "wagmi/actions";
import { ArrowRightLeft, Check, ExternalLink, Network, ShieldCheck, SkipForward, Wallet, Zap } from "lucide-react";
import { formatEther, parseEther, type Address, type Hash } from "viem";
import { useAccount, useBalance, useConnect, useSwitchChain } from "wagmi";
import {
  MANTLE_BRIDGE_DOC_URL,
  MANTLE_FAUCET_URL,
  MANTLE_VIEM_DOC_URL,
  OFFICIAL_MANTLE_TESTNET_BRIDGE_URL,
  erc20Abi,
  getL1StandardBridgeAddress,
  l1BridgeAbi,
  mantleL1Source,
  mantleTestnet,
  publicActionsL1,
  walletActionsL1,
} from "@/lib/mantle";
import { wagmiConfig } from "@/lib/wagmi";

type BridgeStage = "idle" | "checking" | "approving" | "depositing" | "confirming" | "done" | "error";

const STEPS = [
  { key: "connect", label: "Connect", detail: "Wallet ready" },
  { key: "approve", label: "Approve", detail: "Bridge can pull L1 MNT" },
  { key: "deposit", label: "Deposit", detail: "Mantle Viem submits tx" },
  { key: "relay", label: "Relay", detail: "MNT arrives on L2" },
] as const;

const ZERO = BigInt(0);

function formatAmount(value: bigint | null | undefined, digits = 4) {
  if (value == null) return "-";
  const n = Number(formatEther(value));
  if (n > 0 && n < 0.0001) return "<0.0001";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function shortHash(hash: Hash | "") {
  return hash ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : "-";
}

function stepClass(stage: BridgeStage, index: number, isConnected: boolean, hasAllowance: boolean) {
  if (index === 0 && isConnected) return "done";
  if (index === 1 && hasAllowance) return "done";
  if (stage === "depositing" && index < 3) return index === 2 ? "active" : "done";
  if (stage === "confirming" && index < 4) return index === 3 ? "active" : "done";
  if (stage === "done") return "done";
  if (stage === "approving" && index === 1) return "active";
  if (stage === "checking" && index === 0) return "active";
  return "";
}

export default function BridgePage() {
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const [amount, setAmount] = useState("0.05");
  const [stage, setStage] = useState<BridgeStage>("idle");
  const [l1MntAddress, setL1MntAddress] = useState<Address | null>(null);
  const [l1MntBalance, setL1MntBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [estimatedGas, setEstimatedGas] = useState<bigint | null>(null);
  const [approveHash, setApproveHash] = useState<Hash | "">("");
  const [depositHash, setDepositHash] = useState<Hash | "">("");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<string[]>([
    "atlas.preflight -> L2 gas missing? Bridge MNT from Sepolia L1 before tokenization.",
    "mantle.viem -> ready for depositMNT() via @mantleio/viem.",
  ]);

  const l1BridgeAddress = getL1StandardBridgeAddress();
  const l1EthBalance = useBalance({ address, chainId: mantleL1Source.id });
  const l2MntBalance = useBalance({ address, chainId: mantleTestnet.id });

  const parsedAmount = useMemo(() => {
    try {
      return amount.trim() ? parseEther(amount.trim()) : null;
    } catch {
      return null;
    }
  }, [amount]);

  const hasValidAmount = parsedAmount != null && parsedAmount > ZERO;
  const hasAllowance = allowance != null && parsedAmount != null && allowance >= parsedAmount;
  const hasEnoughL1Mnt = l1MntBalance != null && parsedAmount != null && l1MntBalance >= parsedAmount;
  const hasL2Mnt = l2MntBalance.data != null && l2MntBalance.data.value > ZERO;
  const noL1Mnt = isConnected && l1MntBalance != null && l1MntBalance === ZERO;

  const pushLog = useCallback((line: string) => {
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setLogs(prev => [...prev.slice(-7), `${at} · ${line}`]);
  }, []);

  const refreshBridgeState = useCallback(async () => {
    if (!address) return;
    const publicClient = getPublicClient(wagmiConfig, { chainId: mantleL1Source.id });
    if (!publicClient) return;

    try {
      const token = await publicClient.readContract({
        address: l1BridgeAddress,
        abi: l1BridgeAbi,
        functionName: "L1_MNT_ADDRESS",
      }) as Address;

      const [balance, currentAllowance] = await Promise.all([
        publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, l1BridgeAddress],
        }) as Promise<bigint>,
      ]);

      setL1MntAddress(token);
      setL1MntBalance(balance);
      setAllowance(currentAllowance);

      if (parsedAmount && parsedAmount > ZERO && currentAllowance >= parsedAmount) {
        const l1Public = publicClient.extend(publicActionsL1());
        const gas = await l1Public.estimateDepositMNTGas({
          account: address,
          targetChain: mantleTestnet,
          request: { amount: parsedAmount, to: address },
        });
        setEstimatedGas(gas);
      } else {
        setEstimatedGas(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to read bridge state.";
      // Don't hard-fail on preflight read errors — user can still attempt the bridge manually.
      setError(`Bridge preflight: ${msg}`);
    }
  }, [address, l1BridgeAddress, parsedAmount]);

  useEffect(() => {
    void refreshBridgeState();
  }, [refreshBridgeState]);

  const handleConnect = async () => {
    setError("");
    setStage("checking");
    const connector = connectors.find(item => item.id === "injected") ?? connectors[0];
    if (!connector) throw new Error("No wallet connector available.");
    await connectAsync({ connector });
    pushLog("wallet.connect -> connected.");
    setStage("idle");
  };

  const handleBridge = async () => {
    setError("");
    setApproveHash("");
    setDepositHash("");

    try {
      if (!hasValidAmount || !parsedAmount) {
        throw new Error("Enter a valid MNT amount.");
      }

      setStage("checking");
      let activeAddress = address;
      if (!activeAddress || !isConnected) {
        const connector = connectors.find(item => item.id === "injected") ?? connectors[0];
        if (!connector) throw new Error("No wallet connector available.");
        const connected = await connectAsync({ connector });
        activeAddress = connected.accounts[0];
        pushLog("wallet.connect -> connected.");
      }
      if (!activeAddress) throw new Error("Wallet address not found.");

      if (chainId !== mantleL1Source.id) {
        pushLog(`wallet.switchChain -> ${mantleL1Source.name}.`);
        await switchChainAsync({ chainId: mantleL1Source.id });
      }

      const publicClient = getPublicClient(wagmiConfig, { chainId: mantleL1Source.id });
      if (!publicClient) throw new Error("Sepolia public client is unavailable.");
      const walletClient = await getWalletClient(wagmiConfig, { chainId: mantleL1Source.id });

      const token = await publicClient.readContract({
        address: l1BridgeAddress,
        abi: l1BridgeAbi,
        functionName: "L1_MNT_ADDRESS",
      }) as Address;
      setL1MntAddress(token);

      const [balance, currentAllowance] = await Promise.all([
        publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [activeAddress],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [activeAddress, l1BridgeAddress],
        }) as Promise<bigint>,
      ]);

      setL1MntBalance(balance);
      setAllowance(currentAllowance);

      if (balance < parsedAmount) {
        throw new Error(
          balance === ZERO
            ? "No MNT on L1 Sepolia. Get testnet MNT from the Mantle faucet (L2 direct) or the official bridge UI."
            : `L1 MNT balance ${formatAmount(balance)} is below requested ${amount} MNT.`
        );
      }

      if (currentAllowance < parsedAmount) {
        setStage("approving");
        pushLog("erc20.approve -> granting L1 Standard Bridge allowance.");
        const hash = await walletClient.writeContract({
          account: activeAddress,
          chain: mantleL1Source,
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [l1BridgeAddress, parsedAmount],
        });
        setApproveHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        pushLog(`erc20.approve -> confirmed ${shortHash(hash)}.`);
      } else {
        pushLog("erc20.allowance -> already approved.");
      }

      setStage("depositing");
      const l1Public = publicClient.extend(publicActionsL1());
      const gas = await l1Public.estimateDepositMNTGas({
        account: activeAddress,
        targetChain: mantleTestnet,
        request: { amount: parsedAmount, to: activeAddress },
      });
      setEstimatedGas(gas);

      pushLog("mantle.depositMNT -> submitting L1 bridge transaction.");
      const l1Wallet = walletClient.extend(walletActionsL1());
      const hash = await l1Wallet.depositMNT({
        account: activeAddress,
        targetChain: mantleTestnet,
        request: { amount: parsedAmount, to: activeAddress },
        gas,
      });

      setDepositHash(hash);
      setStage("confirming");
      await publicClient.waitForTransactionReceipt({ hash });
      pushLog(`mantle.depositMNT -> L1 confirmed ${shortHash(hash)}.`);
      pushLog("relay.watch -> L2 balance updates after Mantle relayer finalizes.");
      setStage("done");
      await refreshBridgeState();
      void l2MntBalance.refetch();
      void l1EthBalance.refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bridge transaction failed.";
      setError(message);
      setStage("error");
      pushLog(`error -> ${message}`);
    }
  };

  const primaryLabel = !isConnected
    ? "Connect wallet"
    : stage === "approving"
      ? "Approving..."
      : stage === "depositing" || stage === "confirming"
        ? "Bridge running..."
        : "Bridge MNT to L2";

  return (
    <div className="bridge-page">
      <div className="bridge-hero">
        <section>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="tag tag-accent">L1 Sepolia to Mantle Sepolia</span>
            <span className="tag">@mantleio/viem</span>
            <span className="tag">depositMNT()</span>
          </div>
          <h1 className="display bridge-title">
            Bridge MNT before the agents start signing.
          </h1>
          <p style={{ color: "var(--fg-1)", maxWidth: 620, fontSize: 15, lineHeight: 1.65, marginBottom: 22 }}>
            Faucet MNT often lands on Ethereum Sepolia first. This flow moves that L1 MNT into Mantle Sepolia so the RWAi app has native L2 MNT for gas.
          </p>
          <div className="bridge-actions">
            <a href={MANTLE_VIEM_DOC_URL} target="_blank" rel="noopener noreferrer">
              <button className="btn">
                <Network size={14} />
                Mantle Viem
              </button>
            </a>
            <a href={MANTLE_BRIDGE_DOC_URL} target="_blank" rel="noopener noreferrer">
              <button className="btn btn-ghost">
                <ExternalLink size={14} />
                SDK guide
              </button>
            </a>
            <a href={MANTLE_FAUCET_URL} target="_blank" rel="noopener noreferrer">
              <button className="btn btn-ghost">
                <Zap size={14} />
                Get testnet MNT
              </button>
            </a>
          </div>

          {isConnected && hasL2Mnt && (
            <div style={{ marginTop: 16, padding: "10px 14px", border: "1px solid rgba(99,211,170,0.35)", background: "rgba(99,211,170,0.08)", fontSize: 12, color: "var(--accent)" }}>
              <strong>Already have {formatAmount(l2MntBalance.data?.value)} MNT on Mantle Sepolia.</strong>
              {" "}You can skip the bridge and go straight to tokenize.
              <div style={{ marginTop: 8 }}>
                <Link href="/tokenize">
                  <button className="btn btn-primary" style={{ fontSize: 12 }}>
                    <SkipForward size={12} />
                    Skip bridge — go to Tokenize
                  </button>
                </Link>
              </div>
            </div>
          )}

          {noL1Mnt && !hasL2Mnt && (
            <div style={{ marginTop: 16, padding: "10px 14px", border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)", fontSize: 12, color: "var(--warn)" }}>
              No MNT on L1 Sepolia. Use the Mantle testnet faucet to get MNT directly on Mantle Sepolia (no bridge needed), or use the Official Bridge UI to bridge from L1.
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <a href={MANTLE_FAUCET_URL} target="_blank" rel="noopener noreferrer">
                  <button className="btn" style={{ fontSize: 12 }}><Zap size={12} /> Mantle Faucet (L2)</button>
                </a>
                <a href={OFFICIAL_MANTLE_TESTNET_BRIDGE_URL} target="_blank" rel="noopener noreferrer">
                  <button className="btn" style={{ fontSize: 12 }}><ExternalLink size={12} /> Official Bridge UI</button>
                </a>
              </div>
            </div>
          )}

          <div className="bridge-card-grid">
            <div>
              <div className="mono-sm" style={{ marginBottom: 6 }}>L1 MNT</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, color: hasEnoughL1Mnt ? "var(--accent)" : "var(--fg-0)" }}>
                {formatAmount(l1MntBalance)}
              </div>
              <div className="mono-sm" style={{ color: "var(--fg-2)", marginTop: 4 }}>Sepolia token</div>
            </div>
            <div>
              <div className="mono-sm" style={{ marginBottom: 6 }}>L1 gas</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, color: "var(--fg-0)" }}>
                {l1EthBalance.data ? formatAmount(l1EthBalance.data.value, 5) : "-"} ETH
              </div>
              <div className="mono-sm" style={{ color: "var(--fg-2)", marginTop: 4 }}>Needed for bridge tx</div>
            </div>
            <div>
              <div className="mono-sm" style={{ marginBottom: 6 }}>L2 MNT</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, color: "var(--fg-0)" }}>
                {l2MntBalance.data ? formatAmount(l2MntBalance.data.value) : "-"}
              </div>
              <div className="mono-sm" style={{ color: "var(--fg-2)", marginTop: 4 }}>Mantle Sepolia gas</div>
            </div>
          </div>
        </section>

        <section className="panel bracket-corner">
          <div className="panel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="live-dot" />
              <span className="mono">Guided MNT Bridge</span>
            </div>
            <span className="mono-sm" style={{ color: stage === "done" ? "var(--accent)" : "var(--fg-2)" }}>
              {stage === "idle" ? "READY" : stage.toUpperCase()}
            </span>
          </div>

          <div style={{ padding: 18 }}>
            <div className="bridge-route">
              <div className="bridge-route-node">
                <div className="mono-sm" style={{ marginBottom: 8 }}>FROM</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--fg-0)" }}>{mantleL1Source.name}</div>
                <div className="mono-sm" style={{ color: "var(--fg-2)", marginTop: 4 }}>MNT ERC-20</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                <ArrowRightLeft size={22} />
              </div>
              <div className="bridge-route-node">
                <div className="mono-sm" style={{ marginBottom: 8 }}>TO</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--fg-0)" }}>{mantleTestnet.name}</div>
                <div className="mono-sm" style={{ color: "var(--fg-2)", marginTop: 4 }}>native gas MNT</div>
              </div>
            </div>

            <label className="mono-sm" htmlFor="bridge-amount" style={{ display: "block", marginBottom: 6 }}>
              Amount
            </label>
            <div className="bridge-input-row">
              <input
                id="bridge-amount"
                className="input-field"
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.05"
                aria-invalid={!hasValidAmount}
              />
              <button
                className="btn"
                type="button"
                onClick={() => l1MntBalance != null && setAmount(formatEther(l1MntBalance))}
                disabled={l1MntBalance == null || l1MntBalance === ZERO}
              >
                Max
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              {STEPS.map((step, index) => {
                const cls = stepClass(stage, index, isConnected, hasAllowance);
                return (
                  <div key={step.key} className={`bridge-step ${cls}`}>
                    <span className="bridge-step-index">{cls === "done" ? <Check size={13} /> : index + 1}</span>
                    <div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-0)" }}>{step.label}</div>
                      <div className="mono-sm" style={{ textTransform: "none", letterSpacing: 0, color: "var(--fg-2)" }}>{step.detail}</div>
                    </div>
                    <span className="mono-sm" style={{ color: cls === "done" ? "var(--accent)" : cls === "active" ? "var(--fg-0)" : "var(--fg-3)" }}>
                      {cls === "done" ? "OK" : cls === "active" ? "..." : "WAIT"}
                    </span>
                  </div>
                );
              })}
            </div>

            {error && (
              <div role="alert" style={{ padding: "10px 12px", border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)", color: "var(--warn)", fontSize: 12, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div className="bridge-actions">
              {!isConnected ? (
                <button className="btn btn-primary" onClick={handleConnect}>
                  <Wallet size={14} />
                  {primaryLabel}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleBridge}
                  disabled={!hasValidAmount || stage === "approving" || stage === "depositing" || stage === "confirming"}
                >
                  <Zap size={14} />
                  {primaryLabel}
                </button>
              )}
              <a href={OFFICIAL_MANTLE_TESTNET_BRIDGE_URL} target="_blank" rel="noopener noreferrer">
                <button className="btn">
                  <ExternalLink size={14} />
                  Official bridge
                </button>
              </a>
              {stage === "done" && (
                <button className="btn" onClick={() => switchChainAsync({ chainId: mantleTestnet.id })}>
                  <Network size={14} />
                  Switch L2
                </button>
              )}
            </div>
          </div>

          <div className="bridge-log" aria-live="polite">
            {logs.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        </section>
      </div>

      <section className="bridge-meta">
        {[
          ["L1 bridge", l1BridgeAddress],
          ["L1 MNT token", l1MntAddress ?? "-"],
          ["Deposit tx", depositHash ? shortHash(depositHash) : approveHash ? `approve ${shortHash(approveHash)}` : estimatedGas ? `gas ${estimatedGas.toLocaleString()}` : "-"],
        ].map(([label, value], index) => (
          <div key={label} style={{ padding: 14, borderRight: index < 2 ? "1px solid var(--line)" : "none", background: "rgba(13,13,26,0.64)" }}>
            <div className="mono-sm" style={{ marginBottom: 8 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-1)", overflowWrap: "anywhere" }}>{value}</div>
          </div>
        ))}
      </section>

      {stage === "done" && (
        <section className="panel" style={{ marginTop: 20, padding: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldCheck size={18} color="var(--accent)" />
            <div>
              <div style={{ fontFamily: "var(--font-mono)", color: "var(--fg-0)", fontSize: 13 }}>L1 deposit confirmed</div>
              <div className="mono-sm" style={{ textTransform: "none", letterSpacing: 0 }}>Wait for relay, then continue tokenization on Mantle Sepolia.</div>
            </div>
          </div>
          <Link href="/tokenize">
            <button className="btn btn-primary">Continue to Tokenize</button>
          </Link>
        </section>
      )}
    </div>
  );
}
