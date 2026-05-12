import { run } from "hardhat";
import * as fs from "fs";

async function main() {
  const deployments = JSON.parse(fs.readFileSync("./deployments.json", "utf8"));
  const c = deployments.contracts;
  const deployer = deployments.deployer;
  const pythContract =
    deployments.pyth?.contract ??
    (deployments.chainId === 5000
      ? "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"
      : "0x98046Bd286715D3B0BC227Dd7a956b83D8978603");

  console.log("Verifying contracts on Mantle Explorer...\n");

  const mockSymbolNames: Record<string, string> = {
    USDY: "Mock USDY", mUSD: "Mock mUSD", mETH: "Mock mETH", fBTC: "Mock fBTC", USDT0: "Mock USDT0",
  };

  const verifications: { name: string; address: string; args: unknown[]; contract?: string }[] = [
    ...(deployments.isTestnet && deployments.assets
      ? Object.entries(deployments.assets as Record<string, string>).map(([symbol, addr]) => ({
          name: `MockERC20 (${symbol})`,
          address: addr,
          args: [mockSymbolNames[symbol] ?? `Mock ${symbol}`, symbol],
          contract: "contracts/MockERC20.sol:MockERC20",
        }))
      : []),
    {
      name: "ComplianceLog",
      address: c.ComplianceLog,
      args: [deployer],
    },
    {
      name: "YieldOracle",
      address: c.YieldOracle,
      args: [deployer, pythContract],
    },
    {
      name: "RWAiRegistry",
      address: c.RWAiRegistry,
      args: [deployer],
    },
    {
      name: "AgentExecutor",
      address: c.AgentExecutor,
      args: [deployer],
    },
    {
      name: "AgentReputationManager",
      address: c.AgentReputationManager,
      args: [
        deployments.erc8004.reputationRegistry,
        deployments.erc8004.identityRegistry,
        deployer,
      ],
    },
    {
      name: "PortfolioVault",
      address: c.PortfolioVault,
      args: [deployer],
    },
    {
      name: "HybridVault",
      address: c.HybridVault,
      args: [],
    },
    {
      name: "AssetToken",
      address: c.AssetToken,
      args: [
        "RWAi Manhattan Tower",
        "MANHATTAN",
        0,
        2_500_000,
        408,
        deployer,
        c.ComplianceLog,
        "ipfs://bafybeihackathon001",
        c.RWAiRegistry,
      ],
    },
  ];

  for (const v of verifications) {
    try {
      console.log(`Verifying ${v.name} at ${v.address}...`);
      await run("verify:verify", {
        address: v.address,
        constructorArguments: v.args,
        ...(v.contract ? { contract: v.contract } : {}),
      });
      console.log(`✅ ${v.name} verified\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("already verified")) {
        console.log(`ℹ️  ${v.name} already verified\n`);
      } else {
        console.error(`❌ ${v.name} failed:`, msg, "\n");
      }
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
