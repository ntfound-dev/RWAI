import { publicActionsL1, walletActionsL1 } from "@mantleio/viem";
import { mantle, mantleSepoliaTestnet } from "@mantleio/viem/chains";
import type { Address } from "viem";
import { sepolia } from "viem/chains";

export const mantleMainnet = mantle;
export const mantleTestnet = mantleSepoliaTestnet;
export const mantleL1Source = sepolia;

export const MANTLE_BRIDGE_DOC_URL =
  "https://docs.mantle.xyz/network/for-developers/how-to-guides/how-to-use-mantle-sdk/bridging-mnt-with-the-mantle-sdk";
export const MANTLE_VIEM_DOC_URL = "https://viem.mantle.xyz/";
export const OFFICIAL_MANTLE_TESTNET_BRIDGE_URL = "https://bridge.testnet.mantle.xyz/";
export const MANTLE_FAUCET_URL = "https://faucet.testnet.mantle.xyz/";

export const l1BridgeAbi = [
  {
    type: "function",
    name: "L1_MNT_ADDRESS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export function getL1StandardBridgeAddress() {
  return mantleTestnet.contracts.l1StandardBridge[mantleL1Source.id].address as Address;
}

export { publicActionsL1, walletActionsL1 };
