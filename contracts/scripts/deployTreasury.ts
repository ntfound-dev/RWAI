/**
 * Deploy RWAiToken ($RWAI) + ProtocolTreasury on Mantle Sepolia.
 * - Pre-mints 10,000,000 RWAI to agent wallet for demo fee payments
 * - Grants COLLECTOR_ROLE to agent wallet so backend can collect fees
 * - Approves ProtocolTreasury to spend agent wallet's RWAI (max)
 * - Updates deployments.json with new addresses
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";

const DEPLOYMENTS_PATH = "./deployments.json";
const DEMO_MINT = ethers.parseEther("10000000"); // 10M RWAI for demo

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MNT");
  console.log("Network:", network.name);

  // ── 1. Deploy RWAiToken ──────────────────────────────────────
  console.log("\n[1/3] Deploying RWAiToken ($RWAI)...");
  const RWAiToken = await ethers.getContractFactory("RWAiToken");
  const rwaiToken = await RWAiToken.deploy(deployer.address);
  await rwaiToken.waitForDeployment();
  const rwaiTokenAddr = await rwaiToken.getAddress();
  console.log("  RWAiToken:", rwaiTokenAddr);

  // ── 2. Deploy ProtocolTreasury ───────────────────────────────
  console.log("\n[2/3] Deploying ProtocolTreasury...");
  const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
  const treasury = await ProtocolTreasury.deploy(rwaiTokenAddr, deployer.address);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log("  ProtocolTreasury:", treasuryAddr);

  // ── 3. Setup roles + mint demo tokens ───────────────────────
  console.log("\n[3/3] Setup roles + mint demo RWAI...");

  // Mint 10M RWAI to deployer (agent wallet) for demo fee payments
  const MINTER_ROLE = await (rwaiToken as any).MINTER_ROLE();
  await (rwaiToken as any).grantRole(MINTER_ROLE, deployer.address);
  await (rwaiToken as any).mint(deployer.address, DEMO_MINT);
  console.log("  Minted 10,000,000 RWAI to agent wallet:", deployer.address);

  // Grant COLLECTOR_ROLE on treasury to deployer (agent wallet)
  const COLLECTOR_ROLE = await treasury.COLLECTOR_ROLE();
  await treasury.grantRole(COLLECTOR_ROLE, deployer.address);
  console.log("  COLLECTOR_ROLE granted to agent wallet");

  // Agent wallet pre-approves treasury to spend its RWAI (for demo fee collection)
  await (rwaiToken as any).approve(treasuryAddr, ethers.MaxUint256);
  console.log("  Agent wallet approved ProtocolTreasury for max RWAI spend");

  // ── Update deployments.json ──────────────────────────────────
  let manifest: any = {};
  if (fs.existsSync(DEPLOYMENTS_PATH)) {
    manifest = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
  }
  manifest.contracts = manifest.contracts || {};
  manifest.contracts.RWAiToken         = rwaiTokenAddr;
  manifest.contracts.ProtocolTreasury  = treasuryAddr;
  manifest.treasury = {
    rwaiToken:   rwaiTokenAddr,
    treasury:    treasuryAddr,
    agentWallet: deployer.address,
    demoBal:     "10000000",
    feeBps: {
      tokenization: 50,
      market:       15,
      aumPerYear:   30,
    },
  };
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(manifest, null, 2));
  console.log("\n✅ Treasury deployed:");
  console.log("   RWAiToken:        ", rwaiTokenAddr);
  console.log("   ProtocolTreasury: ", treasuryAddr);
  console.log("   https://sepolia.mantlescan.xyz/address/" + treasuryAddr);
  console.log("\n📌 Next: update RWAI_TOKEN_ADDRESS + TREASURY_ADDRESS in Railway env vars");
}

main().catch(err => { console.error(err); process.exit(1); });
