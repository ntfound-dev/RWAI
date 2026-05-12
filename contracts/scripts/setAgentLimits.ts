import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const deployments = JSON.parse(fs.readFileSync("./deployments.json", "utf8"));
  const agentIds = deployments.erc8004.agentIds as Record<string, number>;
  const TX_LIMIT    = ethers.parseEther("100000");
  const DAILY_LIMIT = ethers.parseEther("500000");

  const AgentExecutor = await ethers.getContractAt("AgentExecutor", deployments.contracts.AgentExecutor);

  for (const [name, id] of Object.entries(agentIds)) {
    await AgentExecutor.setAgentLimits(id, TX_LIMIT, DAILY_LIMIT);
    console.log(`✅ Limits set for ${name} (ID: ${id})`);
  }
  console.log("Done.");
}
main().catch((err) => { console.error(err); process.exit(1); });
