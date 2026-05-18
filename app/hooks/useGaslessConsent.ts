"use client";

/**
 * Gasless EIP-712 consent for HybridVault.
 *
 * Flow: user signs typed data (no blockchain tx) → backend relays
 * setAgentAllowanceBySig() and pays the gas → user spends zero MNT.
 *
 * This is a meta-transaction pattern, equivalent to AA sponsorship for
 * the consent step. All other actions (~$0.001 gas on Mantle L2) are
 * near-zero and can proceed as normal EOA tx.
 */

import { useState } from "react";
import { getWalletClient } from "wagmi/actions";
import { parseEther, type Address } from "viem";
import { agentApi } from "@/lib/agent-api";
import { MANTLE_ASSETS } from "@/lib/contracts";
import { mantleTestnet, wagmiConfig } from "@/lib/wagmi";

export type ConsentStatus =
  | "idle"
  | "preparing"
  | "awaiting_signature"
  | "relaying"
  | "success"
  | "error";

export interface ConsentResult {
  status:    ConsentStatus;
  tx:        string;
  error:     string;
  agentAddr: string;
  vaultAddr: string;
  grant: (opts: { userAddress: Address; amountUsdy: string; days: number }) => Promise<void>;
  reset: () => void;
}

export function useGaslessConsent(): ConsentResult {
  const [status,    setStatus]    = useState<ConsentStatus>("idle");
  const [tx,        setTx]        = useState("");
  const [error,     setError]     = useState("");
  const [agentAddr, setAgentAddr] = useState("");
  const [vaultAddr, setVaultAddr] = useState("");

  const reset = () => { setStatus("idle"); setTx(""); setError(""); };

  const grant = async ({ userAddress, amountUsdy, days }: { userAddress: Address; amountUsdy: string; days: number }) => {
    setStatus("preparing");
    setTx(""); setError("");

    try {
      const amountWei = parseEther(amountUsdy || "0").toString();
      const expiry    = Math.floor(Date.now() / 1000) + Math.max(1, days) * 86400;
      const token     = MANTLE_ASSETS.USDY.address;

      // Step 1: get typed data from backend (zero gas)
      const consent = await agentApi<{
        typedData: Record<string, unknown>;
        agent: string;
        vault: string;
        nonce: string | number;
      }>("/vault/consent", {
        method: "POST",
        body: JSON.stringify({ user_address: userAddress, token, amount_wei: amountWei, expiry }),
      });

      setAgentAddr(consent.agent);
      setVaultAddr(consent.vault);

      // Step 2: wallet signs only — no ETH spent, no broadcast
      setStatus("awaiting_signature");
      const walletClient = await getWalletClient(wagmiConfig, { chainId: mantleTestnet.id });
      const signature = await walletClient.request({
        method: "eth_signTypedData_v4",
        params: [userAddress, JSON.stringify(consent.typedData)],
      });

      // Step 3: backend relays + pays gas (gasless for user)
      setStatus("relaying");
      const relay = await agentApi<{ onChainTx: string }>("/vault/relay-allowance", {
        method: "POST",
        body: JSON.stringify({
          user_address:  userAddress,
          token,
          amount_wei:    amountWei,
          expiry,
          nonce:         consent.nonce,
          signature,
          agent_address: consent.agent,
        }),
      });

      setTx(relay.onChainTx);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gasless consent failed.");
      setStatus("error");
    }
  };

  return { status, tx, error, agentAddr, vaultAddr, grant, reset };
}
