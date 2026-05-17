import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];
const MANTLE_RPC = process.env.MANTLE_RPC_URL || "https://rpc.sepolia.mantle.xyz";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    mantleSepolia: {
      url: MANTLE_RPC,
      chainId: 5003,
      accounts,
    },
    mantleTestnet: {
      url: MANTLE_RPC,
      chainId: 5003,
      accounts,
    },
    mantle: {
      url: "https://rpc.mantle.xyz",
      chainId: 5000,
      accounts,
    },
  },
  etherscan: {
    // Mantlescan now uses Etherscan V2 — requires a single Etherscan.io API key
    // Get one at: https://etherscan.io/myapikey
    apiKey: process.env.ETHERSCAN_API_KEY ?? process.env.MANTLE_API_KEY ?? "placeholder",
    customChains: [
      {
        network: "mantleSepolia",
        chainId: 5003,
        urls: {
          apiURL:     "https://api.etherscan.io/v2/api?chainid=5003",
          browserURL: "https://sepolia.mantlescan.xyz",
        },
      },
      {
        network: "mantleTestnet",
        chainId: 5003,
        urls: {
          apiURL:     "https://api.etherscan.io/v2/api?chainid=5003",
          browserURL: "https://sepolia.mantlescan.xyz",
        },
      },
      {
        network: "mantle",
        chainId: 5000,
        urls: {
          apiURL:     "https://api.etherscan.io/v2/api?chainid=5000",
          browserURL: "https://mantlescan.xyz",
        },
      },
    ],
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
