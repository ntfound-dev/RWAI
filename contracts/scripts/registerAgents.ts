import { ethers, network } from "hardhat";
import * as fs from "fs";

// ERC-8004 Identity Registry ABI (minimal)
const IDENTITY_ABI = [
  "function register(string calldata metadataURI) external returns (uint256 agentId)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
];

const IDENTITY_REGISTRIES: Record<string, string> = {
  mantleSepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  mantleTestnet: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
};

const AGENT_CARDS = [
  {
    key: "nexus",
    card: {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "Nexus",
      description: "RWAi Tokenization Agent — analyzes real-world asset documents and deploys ERC-20 tokens on Mantle Network.",
      services: [{ name: "web", endpoint: "https://rwai.xyz/agents/nexus" }],
      active: true,
    },
  },
  {
    key: "shield",
    card: {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "Shield",
      description: "RWAi Compliance Agent — automated KYC, compliance scoring, and wallet screening for RWA tokenization on Mantle.",
      services: [{ name: "web", endpoint: "https://rwai.xyz/agents/shield" }],
      active: true,
    },
  },
  {
    key: "yield",
    card: {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "Yield",
      description: "RWAi Market Monitor Agent — tracks APY across all Mantle RWA assets and publishes on-chain yield oracle every 6 hours.",
      services: [{ name: "web", endpoint: "https://rwai.xyz/agents/yield" }],
      active: true,
    },
  },
  {
    key: "atlas",
    card: {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "Atlas",
      description: "RWAi Portfolio Management Agent — autonomously manages RWA portfolios with AI reasoning stored on-chain on Mantle.",
      services: [{ name: "web", endpoint: "https://rwai.xyz/agents/atlas" }],
      active: true,
    },
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployments = JSON.parse(fs.readFileSync("./deployments.json", "utf8"));
  const identityRegistry = deployments.erc8004?.identityRegistry ?? IDENTITY_REGISTRIES[network.name];
  if (!identityRegistry) {
    throw new Error(`No ERC-8004 identity registry configured for ${network.name}`);
  }

  console.log("Registering 4 RWAi agents on ERC-8004 Identity Registry...");
  console.log("Registry:", identityRegistry);

  const registry = new ethers.Contract(identityRegistry, IDENTITY_ABI, deployer);
  const agentIds: Record<string, number> = {};

  for (const agent of AGENT_CARDS) {
    // Inline the card JSON as the metadataURI (in production: upload to IPFS first)
    const metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify(agent.card))}`;

    console.log(`\nRegistering ${agent.card.name}...`);
    const tx = await registry.register(metadataURI);
    const receipt = await tx.wait();

    // Parse agentId from Transfer event (ERC-721 mint)
    const transferEvent = receipt?.logs.find((log: { topics: string[] }) =>
      log.topics[0] === ethers.id("Transfer(address,address,uint256)")
    );
    const agentId = transferEvent
      ? parseInt(transferEvent.topics[3], 16)
      : 0;

    agentIds[agent.key] = agentId;
    console.log(`✅ ${agent.card.name} registered — agentId: ${agentId}`);
    console.log(`   tx: ${tx.hash}`);
  }

  // Update AgentExecutor with the registered agent IDs
  console.log("\nUpdating AgentExecutor with agent IDs...");
  const AgentExecutor = await ethers.getContractAt("AgentExecutor", deployments.contracts.AgentExecutor);
  await AgentExecutor.setAgentIds(
    agentIds.nexus,
    agentIds.shield,
    agentIds.yield,
    agentIds.atlas,
  );
  console.log("✅ AgentExecutor configured");

  console.log("\nUpdating AgentReputationManager with agent IDs...");
  const AgentReputationManager = await ethers.getContractAt(
    "AgentReputationManager",
    deployments.contracts.AgentReputationManager,
  );
  await AgentReputationManager.setAgentIds(
    agentIds.nexus,
    agentIds.shield,
    agentIds.yield,
    agentIds.atlas,
  );
  console.log("✅ AgentReputationManager configured");

  // Set transaction + daily limits per agent
  console.log("\nSetting agent transaction limits...");
  const TX_LIMIT    = ethers.parseEther("100000");
  const DAILY_LIMIT = ethers.parseEther("500000");
  for (const [name, id] of Object.entries(agentIds)) {
    await AgentExecutor.setAgentLimits(id, TX_LIMIT, DAILY_LIMIT);
    console.log(`  ✅ Limits set for ${name} (ID: ${id})`);
  }

  // Save agent IDs to deployments.json
  deployments.erc8004 = {
    ...(deployments.erc8004 ?? {}),
    identityRegistry,
    agentIds,
  };
  fs.writeFileSync("./deployments.json", JSON.stringify(deployments, null, 2));
  console.log("\n✅ Agent IDs saved to deployments.json");
  console.log(agentIds);
}

main().catch((err) => { console.error(err); process.exit(1); });
