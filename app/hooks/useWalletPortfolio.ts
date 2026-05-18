"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { MANTLE_ASSETS } from "@/lib/contracts";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// Approximate USD prices for Mantle Sepolia mock tokens
const PRICES_USD: Record<string, number> = {
  USDY: 1.00,
  mUSD: 1.00,
  mETH: 2847.00,
  fBTC: 95200.00,
};

const PORTFOLIO_ASSETS = ["USDY", "mETH", "mUSD", "fBTC"] as const;

export interface WalletHolding {
  symbol:   string;
  name:     string;
  address:  string;
  color:    string;
  balance:  number;
  priceUSD: number;
  valueUSD: number;
  pct:      number;
  apy:      number;
}

const STATIC_APY: Record<string, number> = {
  USDY: 4.20, mUSD: 3.90, mETH: 6.12, fBTC: 3.50,
};

export function useWalletPortfolio(address?: `0x${string}`) {
  const assets = PORTFOLIO_ASSETS.map(sym => MANTLE_ASSETS[sym]);

  const { data, isLoading } = useReadContracts({
    contracts: assets.flatMap(a => [
      { address: a.address, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [address!] },
      { address: a.address, abi: ERC20_ABI, functionName: "decimals" as const },
    ]),
    query: { enabled: !!address },
  });

  const holdings: WalletHolding[] = PORTFOLIO_ASSETS.map((sym, i) => {
    const balanceRaw = data?.[i * 2]?.result as bigint | undefined;
    const decimals   = (data?.[i * 2 + 1]?.result as number | undefined) ?? 18;
    const meta       = MANTLE_ASSETS[sym];
    const balance    = balanceRaw != null ? Number(formatUnits(balanceRaw, decimals)) : 0;
    const priceUSD   = PRICES_USD[sym] ?? 1;
    return {
      symbol: sym, name: meta.name, address: meta.address,
      color: meta.color, balance, priceUSD,
      valueUSD: balance * priceUSD,
      pct: 0,
      apy: STATIC_APY[sym] ?? 0,
    };
  });

  const totalValueUSD = holdings.reduce((s, h) => s + h.valueUSD, 0);
  const withPct = holdings.map(h => ({
    ...h,
    pct: totalValueUSD > 0 ? (h.valueUSD / totalValueUSD) * 100 : 0,
  }));

  return {
    holdings: withPct,
    totalValueUSD,
    hasBalance: totalValueUSD > 0,
    isLoading,
  };
}
