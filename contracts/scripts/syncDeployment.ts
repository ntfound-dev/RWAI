import * as fs from "fs";
import * as path from "path";

type Deployments = {
  network: string;
  chainId: number;
  contracts: Record<string, string>;
  erc8004?: {
    agentIds?: Record<string, number>;
  };
  agentIds?: Record<string, number>;
  pyth?: {
    contract: string;
    maxPriceAgeSeconds: number;
    priceFeeds: Record<string, string>;
  };
};

const REQUIRED_CONTRACTS = [
  "ComplianceLog",
  "YieldOracle",
  "RWAiRegistry",
  "AgentReputationManager",
  "AgentExecutor",
  "PortfolioVault",
  "HybridVault",
  "AssetToken",
];

function readDeployments(): Deployments {
  const deploymentsPath = path.resolve("deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("deployments.json not found. Run npm run deploy:sepolia first.");
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8")) as Deployments;
  for (const name of REQUIRED_CONTRACTS) {
    if (!deployments.contracts?.[name]) {
      throw new Error(`deployments.json is missing contracts.${name}`);
    }
  }
  return deployments;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function writeFrontendDeployment(deployments: Deployments) {
  const agentIds = deployments.erc8004?.agentIds ?? deployments.agentIds ?? {
    nexus: 0,
    shield: 0,
    yield: 0,
    atlas: 0,
  };

  const explorerUrl = deployments.chainId === 5000
    ? "https://mantlescan.xyz"
    : "https://sepolia.mantlescan.xyz";

  const pyth = deployments.pyth ?? {
    contract: "0x0000000000000000000000000000000000000000",
    maxPriceAgeSeconds: 60,
    priceFeeds: {},
  };

  const contents = `export const DEPLOYED_NETWORK = ${stableJson({
    name: deployments.network,
    chainId: deployments.chainId,
    explorerUrl,
  })} as const;

export const DEPLOYED_ADDRESSES = ${stableJson(deployments.contracts)} as const;

export const DEPLOYED_AGENT_IDS = ${stableJson(agentIds)} as const;

export const DEPLOYED_PYTH = ${stableJson(pyth)} as const;
`;

  const outputPath = path.resolve("../app/lib/deployment.ts");
  fs.writeFileSync(outputPath, contents);
  console.log("Updated", outputPath);
}

function writeBackendDeployment(deployments: Deployments) {
  const outputPath = path.resolve("../agents/deployments.json");
  fs.writeFileSync(outputPath, `${stableJson(deployments)}\n`);
  console.log("Updated", outputPath);
}

async function main() {
  const deployments = readDeployments();
  writeFrontendDeployment(deployments);
  writeBackendDeployment(deployments);
  console.log("Deployment sync complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
