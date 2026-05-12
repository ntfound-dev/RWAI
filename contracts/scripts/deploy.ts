import { ethers, network } from "hardhat";
import * as fs from "fs";

// ERC-8004 official Mantle Testnet addresses
const ERC8004_REPUTATION = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
const ERC8004_IDENTITY   = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

// Mantle mainnet RWA asset addresses (for reference / future mainnet deploy)
// USDY:  0x5bE26527e817998A7206475496fDE1E68957c5A6
// mUSD:  0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3
// mETH:  0xcDA86A272531e8640cD7F1a92c01839911B90bb0
// fBTC:  0xc96de26018a54d51c097160568752c4e3bd6c364
// USDT0: 0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE

const PYTH_CONTRACTS: Record<string, string> = {
  mantleTestnet: "0x98046Bd286715D3B0BC227Dd7a956b83D8978603",
  mantleSepolia: "0x98046Bd286715D3B0BC227Dd7a956b83D8978603",
  mantle:        "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
};

// Pyth price feed IDs (same feed IDs work on testnet via Pyth Hermes)
const MANTLE_ASSET_PRICE_FEEDS: Record<string, string> = {
  USDY: "0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326",
  mUSD: "0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326", // same as USDY (USD peg)
  mETH: "0xfbc9c3a716650b6e24ab22ab85b1c0ef4141b18f4590cc0b986e2f9064cf73d6",
  fBTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
};

// Per-agent daily / transaction limits (in wei — adjust for production)
const TX_LIMIT    = ethers.parseEther("100000");  // $100k per tx
const DAILY_LIMIT = ethers.parseEther("500000");  // $500k per day

async function main() {
  const [deployer] = await ethers.getSigners();
  const chain = await ethers.provider.getNetwork();
  const isTestnet = ["mantleSepolia", "mantleTestnet", "localhost", "hardhat"].includes(network.name);
  const pythContract = PYTH_CONTRACTS[network.name] ?? PYTH_CONTRACTS.mantleTestnet;
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MNT");
  console.log("Network:", network.name, `(chainId ${chain.chainId})`);
  console.log("Pyth:", pythContract);

  // ── 0. Mock RWA tokens (testnet only) ────────────────────────
  let MANTLE_ASSETS: Record<string, string>;
  if (isTestnet) {
    console.log("\n[0/7] Deploying mock RWA tokens (testnet)...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");

    const mockUSDY = await MockERC20.deploy("Mock USDY", "USDY");
    await mockUSDY.waitForDeployment();
    const mockUSDYAddr = await mockUSDY.getAddress();

    const mockMUSD = await MockERC20.deploy("Mock mUSD", "mUSD");
    await mockMUSD.waitForDeployment();
    const mockMUSDAddr = await mockMUSD.getAddress();

    const mockMETH = await MockERC20.deploy("Mock mETH", "mETH");
    await mockMETH.waitForDeployment();
    const mockMETHAddr = await mockMETH.getAddress();

    const mockFBTC = await MockERC20.deploy("Mock fBTC", "fBTC");
    await mockFBTC.waitForDeployment();
    const mockFBTCAddr = await mockFBTC.getAddress();

    MANTLE_ASSETS = { USDY: mockUSDYAddr, mUSD: mockMUSDAddr, mETH: mockMETHAddr, fBTC: mockFBTCAddr };
    console.log("  Mock USDY:", mockUSDYAddr);
    console.log("  Mock mUSD:", mockMUSDAddr);
    console.log("  Mock mETH:", mockMETHAddr);
    console.log("  Mock fBTC:", mockFBTCAddr);
  } else {
    // Mainnet — use real deployed addresses
    MANTLE_ASSETS = {
      USDY:  "0x5bE26527e817998A7206475496fDE1E68957c5A6",
      mUSD:  "0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3",
      mETH:  "0xcDA86A272531e8640cD7F1a92c01839911B90bb0",
      fBTC:  "0xc96de26018a54d51c097160568752c4e3bd6c364",
      USDT0: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
    };
  }

  // ── 1. ComplianceLog ──────────────────────────────────────────
  console.log("\n[1/7] Deploying ComplianceLog...");
  const ComplianceLog = await ethers.getContractFactory("ComplianceLog");
  const complianceLog = await ComplianceLog.deploy(deployer.address);
  await complianceLog.waitForDeployment();
  const complianceLogAddr = await complianceLog.getAddress();
  console.log("  ComplianceLog:", complianceLogAddr);

  // ── 2. YieldOracle ────────────────────────────────────────────
  console.log("\n[2/7] Deploying YieldOracle...");
  const YieldOracle = await ethers.getContractFactory("YieldOracle");
  const yieldOracle = await YieldOracle.deploy(deployer.address, pythContract);
  await yieldOracle.waitForDeployment();
  const yieldOracleAddr = await yieldOracle.getAddress();
  console.log("  YieldOracle:", yieldOracleAddr);

  const pythAssets = Object.keys(MANTLE_ASSET_PRICE_FEEDS)
    .filter((symbol) => MANTLE_ASSETS[symbol] !== undefined)
    .map((symbol) => MANTLE_ASSETS[symbol]);
  const pythFeedIds = Object.keys(MANTLE_ASSET_PRICE_FEEDS)
    .filter((symbol) => MANTLE_ASSETS[symbol] !== undefined)
    .map((symbol) => MANTLE_ASSET_PRICE_FEEDS[symbol]);
  await yieldOracle.setAssetPriceFeeds(pythAssets, pythFeedIds);
  console.log("  YieldOracle: Pyth price feeds configured");

  // ── 3. RWAiRegistry ───────────────────────────────────────────
  console.log("\n[3/7] Deploying RWAiRegistry...");
  const RWAiRegistry = await ethers.getContractFactory("RWAiRegistry");
  const registry = await RWAiRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("  RWAiRegistry:", registryAddr);

  // ── 4. AgentReputationManager ─────────────────────────────────
  console.log("\n[4/7] Deploying AgentReputationManager...");
  const AgentReputationManager = await ethers.getContractFactory("AgentReputationManager");
  const reputationManager = await AgentReputationManager.deploy(
    ERC8004_REPUTATION, ERC8004_IDENTITY, deployer.address
  );
  await reputationManager.waitForDeployment();
  const reputationManagerAddr = await reputationManager.getAddress();
  console.log("  AgentReputationManager:", reputationManagerAddr);

  // ── 5. AgentExecutor ──────────────────────────────────────────
  console.log("\n[5/7] Deploying AgentExecutor...");
  const AgentExecutor = await ethers.getContractFactory("AgentExecutor");
  const agentExecutor = await AgentExecutor.deploy(deployer.address);
  await agentExecutor.waitForDeployment();
  const agentExecutorAddr = await agentExecutor.getAddress();
  console.log("  AgentExecutor:", agentExecutorAddr);

  // ── 6. PortfolioVault ─────────────────────────────────────────
  console.log("\n[6/8] Deploying PortfolioVault...");
  const PortfolioVault = await ethers.getContractFactory("PortfolioVault");
  const portfolioVault = await PortfolioVault.deploy(deployer.address);
  await portfolioVault.waitForDeployment();
  const portfolioVaultAddr = await portfolioVault.getAddress();
  console.log("  PortfolioVault:", portfolioVaultAddr);

  // ── 7. HybridVault (agentic autonomy + user escape hatch) ─────
  console.log("\n[7/8] Deploying HybridVault...");
  const HybridVault = await ethers.getContractFactory("HybridVault");
  const hybridVault = await HybridVault.deploy();
  await hybridVault.waitForDeployment();
  const hybridVaultAddr = await hybridVault.getAddress();
  await hybridVault.setAgentApproval(deployer.address, true);
  console.log("  HybridVault:", hybridVaultAddr);

  // ── 8. Demo AssetToken (Manhattan real estate) ────────────────
  console.log("\n[8/8] Deploying demo AssetToken (MANHATTAN-001)...");
  const AssetToken = await ethers.getContractFactory("AssetToken");
  const assetToken = await AssetToken.deploy(
    "RWAi Manhattan Tower",     // name
    "MANHATTAN",                 // symbol
    0,                           // assetId
    2_500_000,                   // totalSupply (2.5M tokens)
    408,                         // annualYieldBps (4.08%)
    deployer.address,            // agentAddress
    complianceLogAddr,           // complianceLog
    "ipfs://bafybeihackathon001",// metadataURI
    registryAddr                 // rwaiRegistry
  );
  await assetToken.waitForDeployment();
  const assetTokenAddr = await assetToken.getAddress();
  console.log("  AssetToken (MANHATTAN):", assetTokenAddr);

  // ── Wiring ────────────────────────────────────────────────────
  console.log("\n⚙  Wiring contracts...");

  // AgentExecutor ← reputationManager + portfolioVault
  await agentExecutor.setReputationManager(reputationManagerAddr);
  await agentExecutor.setPortfolioVault(portfolioVaultAddr);
  console.log("  AgentExecutor: reputationManager + portfolioVault set");

  // PortfolioVault ← yieldOracle
  await portfolioVault.setYieldOracle(yieldOracleAddr);
  console.log("  PortfolioVault: yieldOracle set");

  // PortfolioVault: add Mantle native RWAs as supported assets
  for (const [symbol, addr] of Object.entries(MANTLE_ASSETS)) {
    await portfolioVault.addSupportedAsset(addr);
    console.log(`  PortfolioVault: added ${symbol} (${addr})`);
  }

  // Roles: grant AgentExecutor AGENT_ROLE on everything
  await reputationManager.grantAgentRole(agentExecutorAddr);
  await complianceLog.grantShieldRole(agentExecutorAddr);
  await yieldOracle.grantYieldRole(agentExecutorAddr);
  await portfolioVault.grantAgentRole(agentExecutorAddr);
  await portfolioVault.grantAtlasRole(agentExecutorAddr);
  await agentExecutor.grantAgentRole(agentExecutorAddr); // self for demo backend calls
  console.log("  Domain roles granted to AgentExecutor");

  // Agent limits are set in registerAgents.ts after ERC-8004 IDs are known
  console.log("  Agent limits: pending ERC-8004 registration (run make register)");

  // Register Manhattan asset in registry
  await registry.registerAsset(assetTokenAddr, "real_estate", "ipfs://bafybeihackathon001", deployer.address);
  await registry.updateCompliance(0, 85, ethers.ZeroHash); // activates asset
  console.log("  MANHATTAN-001 registered and activated in RWAiRegistry");

  // Clear deployer wallet in compliance log (for demo transfers)
  await complianceLog.grantShieldRole(deployer.address);
  await complianceLog.clearWallet(deployer.address, "deployer");
  console.log("  Deployer wallet cleared in ComplianceLog");

  // ── Save deployment manifest ──────────────────────────────────
  const manifest = {
    network:     network.name,
    chainId:     Number(chain.chainId),
    deployer:    deployer.address,
    deployedAt:  new Date().toISOString(),
    contracts: {
      ComplianceLog:          complianceLogAddr,
      YieldOracle:            yieldOracleAddr,
      RWAiRegistry:           registryAddr,
      AgentReputationManager: reputationManagerAddr,
      AgentExecutor:          agentExecutorAddr,
      PortfolioVault:         portfolioVaultAddr,
      HybridVault:            hybridVaultAddr,
      AssetToken:             assetTokenAddr,
    },
    erc8004: {
      identityRegistry:   ERC8004_IDENTITY,
      reputationRegistry: ERC8004_REPUTATION,
      agentIds: {
        nexus:  0,  // update after ERC-8004 registration
        shield: 0,
        yield:  0,
        atlas:  0,
      },
    },
    isTestnet,
    assets: MANTLE_ASSETS,
    pyth: {
      contract: pythContract,
      maxPriceAgeSeconds: 60,
      priceFeeds: MANTLE_ASSET_PRICE_FEEDS,
    },
  };

  fs.writeFileSync("./deployments.json", JSON.stringify(manifest, null, 2));
  console.log("\n✅ Deployment complete — addresses saved to deployments.json");
  console.log("\n📋 Contracts:");
  Object.entries(manifest.contracts).forEach(([name, addr]) => {
    console.log(`   ${name.padEnd(24)} ${addr}`);
    console.log(`   ${"".padEnd(24)} https://sepolia.mantlescan.xyz/address/${addr}`);
  });

  console.log("\n📌 Next steps:");
  console.log("   1. npx hardhat run scripts/registerAgents.ts --network mantleSepolia");
  console.log("      → registers 4 ERC-8004 identities, updates deployments.json agentIds");
  console.log("   2. npm run verify:sepolia");
  console.log("   3. Update app/lib/contracts.ts with addresses from deployments.json");
}

main().catch((err) => { console.error(err); process.exit(1); });
