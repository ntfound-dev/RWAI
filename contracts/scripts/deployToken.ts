import { ethers, network } from "hardhat";
import * as fs from "fs";

// Allocation (100M RWAI, all in wei handled by parseEther)
const TOTAL_SUPPLY       = 100_000_000n;
const ALLOC_ECOSYSTEM    =  25_000_000n; // 4yr linear, no cliff
const ALLOC_TREASURY     =  20_000_000n; // direct to treasury multisig
const ALLOC_TEAM         =  18_000_000n; // 1yr cliff + 3yr linear  (revocable)
const ALLOC_COMMUNITY    =  15_000_000n; // 6mo cliff + to TGE+3yr  (revocable)
const ALLOC_INVESTORS    =  12_000_000n; // 6mo cliff + 2yr linear  (revocable)
const ALLOC_LIQUIDITY    =  10_000_000n; // unlocked at TGE

const ONE_MONTH  = 30 * 24 * 3600;
const ONE_YEAR   = 365 * 24 * 3600;

async function main() {
  const [deployer] = await ethers.getSigners();
  const chain      = await ethers.provider.getNetwork();
  const isTestnet  = ["mantleSepolia", "mantleTestnet", "localhost", "hardhat"].includes(network.name);

  console.log("Deploying $RWAI token suite with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MNT");
  console.log("Network:", network.name, `(chainId ${chain.chainId})`);

  const tge = Math.floor(Date.now() / 1000); // TGE = now (testnet) or a future timestamp on mainnet
  console.log("\nTGE timestamp:", tge, `(${new Date(tge * 1000).toISOString()})`);

  // ── 1. RWAiToken ──────────────────────────────────────────────
  console.log("\n[1/3] Deploying RWAiToken...");
  const RWAiToken = await ethers.getContractFactory("RWAiToken");
  const token = await RWAiToken.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("  RWAiToken:", tokenAddr);

  // ── 2. RWAiVesting ────────────────────────────────────────────
  console.log("\n[2/3] Deploying RWAiVesting...");
  const RWAiVesting = await ethers.getContractFactory("RWAiVesting");
  const vesting = await RWAiVesting.deploy(tokenAddr, deployer.address);
  await vesting.waitForDeployment();
  const vestingAddr = await vesting.getAddress();
  console.log("  RWAiVesting:", vestingAddr);

  // ── 3. ProtocolTreasury ───────────────────────────────────────
  console.log("\n[3/3] Deploying ProtocolTreasury...");
  const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
  const treasury = await ProtocolTreasury.deploy(tokenAddr, deployer.address);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log("  ProtocolTreasury:", treasuryAddr);

  // ── Roles ──────────────────────────────────────────────────────
  console.log("\n⚙  Wiring roles...");

  // Vesting contract gets MINTER_ROLE so it can create schedules
  const MINTER_ROLE   = await token.MINTER_ROLE();
  const TREASURY_ROLE = await token.TREASURY_ROLE();
  await token.grantRole(MINTER_ROLE,   vestingAddr);
  await token.grantRole(TREASURY_ROLE, treasuryAddr);
  console.log("  MINTER_ROLE → RWAiVesting");
  console.log("  TREASURY_ROLE → ProtocolTreasury");

  // ── Mint allocations ───────────────────────────────────────────
  console.log("\n💰 Minting allocations...");

  const toWei = (n: bigint) => ethers.parseEther(n.toString());

  // Mint total supply to deployer, then distribute
  await token.mint(deployer.address, toWei(TOTAL_SUPPLY));
  console.log("  Minted 100M RWAI to deployer");

  // Treasury allocation → direct transfer (DAO controls it)
  await token.transfer(treasuryAddr, toWei(ALLOC_TREASURY));
  console.log(`  Treasury: ${ALLOC_TREASURY}M RWAI → ProtocolTreasury`);

  // Liquidity → direct transfer (unlocked at TGE for DEX pool)
  await token.transfer(deployer.address, 0n); // stays with deployer for DEX seeding
  console.log(`  Liquidity: ${ALLOC_LIQUIDITY}M RWAI → deployer (seed DEX pool)`);

  // Approve vesting contract to pull tokens for schedules
  const vestingTotal = toWei(ALLOC_ECOSYSTEM + ALLOC_TEAM + ALLOC_COMMUNITY + ALLOC_INVESTORS);
  await token.approve(vestingAddr, vestingTotal);
  console.log("  Approved RWAiVesting to pull:", ethers.formatEther(vestingTotal), "RWAI");

  // ── Create vesting schedules ───────────────────────────────────
  console.log("\n📅 Creating vesting schedules...");

  // Ecosystem & grants — 4yr linear, no cliff, not revocable
  await vesting.createSchedule(
    deployer.address,        // beneficiary (replace with ecosystem multisig on mainnet)
    toWei(ALLOC_ECOSYSTEM),
    tge,
    0,                       // no cliff
    4 * ONE_YEAR,
    "ecosystem",
    false
  );
  console.log(`  Ecosystem: ${ALLOC_ECOSYSTEM}M — 4yr linear`);

  // Team & contributors — 1yr cliff + 3yr linear, revocable
  await vesting.createSchedule(
    deployer.address,        // replace with team multisig on mainnet
    toWei(ALLOC_TEAM),
    tge,
    1 * ONE_YEAR,            // 1yr cliff
    4 * ONE_YEAR,            // 4yr total (cliff + 3yr linear)
    "team",
    true
  );
  console.log(`  Team: ${ALLOC_TEAM}M — 1yr cliff + 3yr linear (revocable)`);

  // Community & airdrops — 6mo cliff + ~2.5yr linear, revocable
  await vesting.createSchedule(
    deployer.address,        // replace with community gnosis safe
    toWei(ALLOC_COMMUNITY),
    tge,
    6 * ONE_MONTH,
    3 * ONE_YEAR,
    "community",
    true
  );
  console.log(`  Community: ${ALLOC_COMMUNITY}M — 6mo cliff + 2.5yr linear (revocable)`);

  // Investors — 6mo cliff + 2yr linear, revocable
  await vesting.createSchedule(
    deployer.address,        // replace with investor address on mainnet
    toWei(ALLOC_INVESTORS),
    tge,
    6 * ONE_MONTH,
    2 * ONE_YEAR + 6 * ONE_MONTH,
    "investors",
    true
  );
  console.log(`  Investors: ${ALLOC_INVESTORS}M — 6mo cliff + 2yr linear (revocable)`);

  // ── Verify supply distribution ─────────────────────────────────
  const deployerBal = await token.balanceOf(deployer.address);
  const treasuryBal = await token.balanceOf(treasuryAddr);
  const vestingBal  = await token.balanceOf(vestingAddr);
  const totalMinted = await token.totalSupply();

  console.log("\n📊 Supply distribution:");
  console.log("  Total minted:       ", ethers.formatEther(totalMinted));
  console.log("  Deployer (liquidity):", ethers.formatEther(deployerBal));
  console.log("  Protocol treasury:  ", ethers.formatEther(treasuryBal));
  console.log("  Vesting contract:   ", ethers.formatEther(vestingBal));

  // ── Save manifest ──────────────────────────────────────────────
  const existingRaw = fs.existsSync("./deployments.json")
    ? JSON.parse(fs.readFileSync("./deployments.json", "utf-8"))
    : {};

  const manifest = {
    ...existingRaw,
    token: {
      RWAiToken:        tokenAddr,
      RWAiVesting:      vestingAddr,
      ProtocolTreasury: treasuryAddr,
      tge:              tge,
      totalSupplyRwai:  TOTAL_SUPPLY.toString(),
      isTestnet,
      vestingSchedules: {
        ecosystem: { id: 0, amount: ALLOC_ECOSYSTEM.toString(), cliff: 0,          duration: 4 * ONE_YEAR },
        team:      { id: 1, amount: ALLOC_TEAM.toString(),      cliff: ONE_YEAR,    duration: 4 * ONE_YEAR },
        community: { id: 2, amount: ALLOC_COMMUNITY.toString(), cliff: 6*ONE_MONTH, duration: 3 * ONE_YEAR },
        investors: { id: 3, amount: ALLOC_INVESTORS.toString(), cliff: 6*ONE_MONTH, duration: 2*ONE_YEAR + 6*ONE_MONTH },
      },
    },
  };

  fs.writeFileSync("./deployments.json", JSON.stringify(manifest, null, 2));
  console.log("\n✅ Token deployment complete — saved to deployments.json");

  console.log("\n📋 Contracts:");
  console.log(`   RWAiToken        ${tokenAddr}`);
  console.log(`   RWAiVesting      ${vestingAddr}`);
  console.log(`   ProtocolTreasury ${treasuryAddr}`);
  console.log(`   https://sepolia.mantlescan.xyz/address/${tokenAddr}`);

  console.log("\n📌 Next steps:");
  console.log("   1. npx hardhat run scripts/deployToken.ts --network mantleSepolia");
  console.log("   2. Update mainnet beneficiary addresses before production deploy");
  console.log("   3. npm run verify:sepolia -- --contract RWAiToken");
}

main().catch((err) => { console.error(err); process.exit(1); });
