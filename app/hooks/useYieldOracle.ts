"use client";

import { useReadContracts } from "wagmi";
import { ADDRESSES, MANTLE_ASSETS } from "@/lib/contracts";

const ORACLE = ADDRESSES.YieldOracle as `0x${string}`;

const SNAPSHOT_ABI = [
  {
    name: "snapshotCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getLatestSnapshot",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "snapshotId",    type: "uint256" },
          { name: "assets",        type: "address[]" },
          { name: "apys",          type: "uint256[]" },
          { name: "marketSummary", type: "string" },
          { name: "timestamp",     type: "uint256" },
          { name: "blockNumber",   type: "uint256" },
        ],
      },
    ],
  },
] as const;

const CURRENT_YIELD_ABI = [
  {
    name: "getCurrentYield",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "apyBps",    type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "agentNote", type: "string" },
      { name: "isActive",  type: "bool" },
    ],
  },
] as const;

// Real on-chain assets only (MI4 has a dummy address, oracle never has data for it)
const PER_ASSET_SYMS = ["USDY", "mETH", "fBTC", "mUSD"] as const;

// Indicative yields used when oracle contract has no on-chain data yet.
// Sourced from each protocol's published rates; updated by backend agents when live.
const INDICATIVE_APY: Record<string, number> = {
  USDY: 4.20,
  mETH: 6.12,
  fBTC: 3.85,
  mUSD: 3.90,
};

export interface OracleSnapshot {
  snapshotId: bigint;
  assets: readonly `0x${string}`[];
  apys: readonly bigint[];
  marketSummary: string;
  timestamp: bigint;
  blockNumber: bigint;
}

// symbol → APY percentage (e.g. 4.2 for 4.2%)
export type OracleApyMap = Record<string, number>;

export function useYieldOracle() {
  // Read snapshot (created by yield scheduler's createMarketSnapshot)
  const { data: snapData, isLoading: snapLoading, isError } = useReadContracts({
    contracts: [
      { address: ORACLE, abi: SNAPSHOT_ABI, functionName: "snapshotCount" },
      { address: ORACLE, abi: SNAPSHOT_ABI, functionName: "getLatestSnapshot" },
    ],
  });

  // Read per-asset getCurrentYield — available as soon as updateYields() is called,
  // even before createMarketSnapshot() runs. Acts as fallback when snapshotCount == 0.
  const { data: perAssetData, isLoading: assetLoading } = useReadContracts({
    contracts: PER_ASSET_SYMS.map(sym => ({
      address: ORACLE,
      abi: CURRENT_YIELD_ABI,
      functionName: "getCurrentYield" as const,
      args: [MANTLE_ASSETS[sym].address] as const,
    })),
  });

  const snapshotCount = snapData?.[0]?.result as bigint | undefined;
  const snapshot      = snapData?.[1]?.result as OracleSnapshot | undefined;

  // address (lowercase) → symbol lookup
  const addrToSymbol: Record<string, string> = {};
  for (const asset of Object.values(MANTLE_ASSETS)) {
    addrToSymbol[asset.address.toLowerCase()] = asset.symbol;
  }

  const apyMap: OracleApyMap = {};

  // Priority 1: snapshot data (most comprehensive, created every 6h by yield scheduler)
  if (snapshot?.assets && snapshot?.apys) {
    snapshot.assets.forEach((addr, i) => {
      const sym = addrToSymbol[addr.toLowerCase()];
      if (sym && snapshot.apys[i] != null) {
        apyMap[sym] = Number(snapshot.apys[i]) / 100; // bps → %
      }
    });
  }

  // Priority 2: per-asset getCurrentYield — fills gaps (e.g. before first snapshot)
  PER_ASSET_SYMS.forEach((sym, i) => {
    if (apyMap[sym] != null) return; // already from snapshot
    const res = perAssetData?.[i]?.result as readonly [bigint, bigint, string, boolean] | undefined;
    if (res && res[3] /* isActive */ && res[0] > BigInt(0) /* apyBps > 0 */) {
      apyMap[sym] = Number(res[0]) / 100;
    }
  });

  // Fill gaps with indicative APYs when oracle has no on-chain data.
  // liveData tracks whether we have real chain data vs indicative fallbacks.
  const liveData = Object.keys(apyMap).length > 0;
  for (const sym of PER_ASSET_SYMS) {
    if (apyMap[sym] == null && INDICATIVE_APY[sym] != null) {
      apyMap[sym] = INDICATIVE_APY[sym];
    }
  }

  // Synthetic MI4 = weighted blend of real assets
  // MI4 (Mantle Index 4) has a dummy address; compute it rather than reading oracle
  if (apyMap["MI4"] == null) {
    apyMap["MI4"] =
      0.30 * (apyMap["USDY"] ?? 0) +
      0.35 * (apyMap["mETH"] ?? 0) +
      0.20 * (apyMap["fBTC"] ?? 0) +
      0.15 * (apyMap["mUSD"] ?? 0);
  }

  return {
    snapshotCount,
    snapshot,
    apyMap,
    isLoading: snapLoading || assetLoading,
    isError,
    hasData: liveData,
  };
}
