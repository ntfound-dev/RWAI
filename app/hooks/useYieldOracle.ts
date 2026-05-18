"use client";

import { useReadContracts } from "wagmi";
import { ADDRESSES, MANTLE_ASSETS } from "@/lib/contracts";

const ORACLE = ADDRESSES.YieldOracle as `0x${string}`;

const ABI = [
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
          { name: "snapshotId", type: "uint256" },
          { name: "assets",     type: "address[]" },
          { name: "apys",       type: "uint256[]" },
          { name: "marketSummary", type: "string" },
          { name: "timestamp",  type: "uint256" },
          { name: "blockNumber",type: "uint256" },
        ],
      },
    ],
  },
] as const;

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
  const { data, isLoading, isError } = useReadContracts({
    contracts: [
      { address: ORACLE, abi: ABI, functionName: "snapshotCount" },
      { address: ORACLE, abi: ABI, functionName: "getLatestSnapshot" },
    ],
  });

  const snapshotCount = data?.[0]?.result as bigint | undefined;
  const snapshot      = data?.[1]?.result as OracleSnapshot | undefined;

  // Build address→symbol lookup
  const addrToSymbol: Record<string, string> = {};
  for (const asset of Object.values(MANTLE_ASSETS)) {
    addrToSymbol[asset.address.toLowerCase()] = asset.symbol;
  }

  const apyMap: OracleApyMap = {};
  if (snapshot?.assets && snapshot?.apys) {
    snapshot.assets.forEach((addr, i) => {
      const sym = addrToSymbol[addr.toLowerCase()];
      if (sym && snapshot.apys[i] != null) {
        apyMap[sym] = Number(snapshot.apys[i]) / 100; // bps → %
      }
    });
  }

  return {
    snapshotCount,
    snapshot,
    apyMap,
    isLoading,
    isError,
    hasData: snapshotCount != null && snapshotCount > BigInt(0),
  };
}
