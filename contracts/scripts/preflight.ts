import { ethers, network } from "hardhat";

const MIN_DEPLOYER_MNT = process.env.MIN_DEPLOYER_MNT ?? "0.05";

async function main() {
  if (!["mantleSepolia", "mantleTestnet"].includes(network.name)) {
    throw new Error(`Production testnet preflight must target mantleSepolia, got ${network.name}`);
  }

  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required for Mantle Sepolia deploys");
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available");
  }

  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== 5003n) {
    throw new Error(`Expected Mantle Sepolia chainId 5003, got ${chain.chainId}`);
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  const minBalance = ethers.parseEther(MIN_DEPLOYER_MNT);

  console.log("Mantle Sepolia production-testnet preflight");
  console.log("Network:", network.name, `(chainId ${chain.chainId})`);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "MNT");
  console.log("Required minimum:", MIN_DEPLOYER_MNT, "MNT");

  if (balance < minBalance) {
    throw new Error(
      "Insufficient L2 MNT. If your faucet only gave L1 Sepolia MNT, bridge it to Mantle Sepolia first."
    );
  }

  if (!process.env.MANTLE_API_KEY) {
    console.warn("Warning: MANTLE_API_KEY is not set, verification will fail until it is configured.");
  }

  console.log("Preflight passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
