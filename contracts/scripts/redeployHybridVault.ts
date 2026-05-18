import { ethers, network } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MNT");
  console.log("Network:", network.name);

  const manifest = JSON.parse(fs.readFileSync("./deployments.json", "utf8"));
  const portfolioVaultAddr = manifest.contracts.PortfolioVault;
  const agentExecutorAddr  = manifest.contracts.AgentExecutor;

  console.log("\nDeploying new HybridVault (with destination whitelist)...");
  const HybridVault = await ethers.getContractFactory("HybridVault");
  const hybridVault = await HybridVault.deploy();
  await hybridVault.waitForDeployment();
  const hybridVaultAddr = await hybridVault.getAddress();
  console.log("  New HybridVault:", hybridVaultAddr);
  console.log("  Old HybridVault:", manifest.contracts.HybridVault, "(no longer used)");

  // Grant AgentExecutor as approved agent
  await hybridVault.setAgentApproval(agentExecutorAddr, true);
  console.log("  AgentExecutor approved as agent");

  // Propose PortfolioVault as destination — 48h timelock starts
  await hybridVault.proposeDestination(portfolioVaultAddr);
  console.log("  PortfolioVault proposed as destination (48h timelock started)");

  // On testnet, advance time and commit immediately
  try {
    await ethers.provider.send("evm_increaseTime", [48 * 3600 + 1]);
    await ethers.provider.send("evm_mine", []);
    await hybridVault.commitDestination(portfolioVaultAddr);
    console.log("  PortfolioVault committed as destination (testnet fast-path)");
  } catch {
    console.log("  Live testnet — call commitDestination manually after 48h:");
    console.log(`  hybridVault.commitDestination("${portfolioVaultAddr}")`);
  }

  // Update manifest
  manifest.contracts.HybridVault         = hybridVaultAddr;
  manifest.contracts.HybridVaultOld      = manifest.contracts.HybridVaultOld ?? "0xC6c08db835636Cf40530dDf90Bf3Bb15bc78190D";
  manifest.deployedAt                    = new Date().toISOString();
  fs.writeFileSync("./deployments.json", JSON.stringify(manifest, null, 2));
  console.log("\n  deployments.json updated");

  // Print new deployment.ts snippet
  console.log("\n✅ Update app/lib/deployment.ts:");
  console.log(`  "HybridVault": "${hybridVaultAddr}"`);
}

main().catch((err) => { console.error(err); process.exit(1); });
