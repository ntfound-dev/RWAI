import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("ComplianceLog — Extended", function () {
  async function deploy() {
    const [owner, shield, compliance, user1, user2, user3] = await ethers.getSigners();
    const C = await ethers.getContractFactory("ComplianceLog");
    const log = await C.deploy(owner.address);
    await log.waitForDeployment();
    await log.grantShieldRole(shield.address);
    await log.grantComplianceRole(compliance.address);
    return { owner, shield, compliance, user1, user2, user3, log };
  }

  it("emits WalletCleared event on clearWallet", async function () {
    const { shield, user1, log } = await deploy();
    await expect(log.connect(shield).clearWallet(user1.address, "KYC passed"))
      .to.emit(log, "WalletCleared").withArgs(user1.address, "KYC passed");
  });

  it("emits WalletBlocked event on blockWallet", async function () {
    const { shield, user1, log } = await deploy();
    await log.connect(shield).clearWallet(user1.address, "ok");
    await expect(log.connect(shield).blockWallet(user1.address, "fraud"))
      .to.emit(log, "WalletBlocked").withArgs(user1.address, "fraud");
  });

  it("emits WalletComplianceUpdated on updateWalletCompliance", async function () {
    const { shield, user1, log } = await deploy();
    await expect(log.connect(shield).updateWalletCompliance(user1.address, true, 30, "clear", ethers.ZeroHash))
      .to.emit(log, "WalletComplianceUpdated").withArgs(user1.address, true, 30n);
  });

  it("emits SanctionsListUpdated when flagging a wallet", async function () {
    const { user1, log } = await deploy();
    await expect(log.updateSanctionsList(user1.address, true))
      .to.emit(log, "SanctionsListUpdated").withArgs(user1.address, true);
  });

  it("emits AssetComplianceReviewed event", async function () {
    const { shield, log } = await deploy();
    await expect(log.connect(shield).reviewAssetCompliance(1, 80, ethers.ZeroHash, "all good"))
      .to.emit(log, "AssetComplianceReviewed").withArgs(1n, 80n, false);
  });

  it("multiple clears and blocks track state correctly", async function () {
    const { shield, user1, log } = await deploy();
    await log.connect(shield).clearWallet(user1.address, "first clear");
    expect(await log.isWalletAllowed(user1.address)).to.equal(true);
    await log.connect(shield).blockWallet(user1.address, "blocked");
    expect(await log.isWalletAllowed(user1.address)).to.equal(false);
    await log.connect(shield).clearWallet(user1.address, "re-cleared");
    expect(await log.isWalletAllowed(user1.address)).to.equal(true);
  });

  it("three wallets managed independently", async function () {
    const { shield, user1, user2, user3, log } = await deploy();
    await log.connect(shield).clearWallet(user1.address, "ok");
    await log.connect(shield).clearWallet(user2.address, "ok");
    // user3 stays blocked
    expect(await log.isWalletAllowed(user1.address)).to.equal(true);
    expect(await log.isWalletAllowed(user2.address)).to.equal(true);
    expect(await log.isWalletAllowed(user3.address)).to.equal(false);
  });

  it("risk score zero is stored correctly", async function () {
    const { shield, user1, log } = await deploy();
    await log.connect(shield).updateWalletCompliance(user1.address, true, 0, "low risk", ethers.ZeroHash);
    const [, riskScore] = await log.getWalletRiskProfile(user1.address);
    expect(riskScore).to.equal(0n);
  });

  it("max risk score 100 stores correctly", async function () {
    const { shield, user1, log } = await deploy();
    await log.connect(shield).updateWalletCompliance(user1.address, false, 100, "max risk", ethers.ZeroHash);
    const [, riskScore] = await log.getWalletRiskProfile(user1.address);
    expect(riskScore).to.equal(100n);
  });

  it("sanctioning sets walletRecord.allowed=false; must re-clear to restore access", async function () {
    const { shield, user1, log } = await deploy();
    await log.connect(shield).clearWallet(user1.address, "cleared");
    expect(await log.isWalletAllowed(user1.address)).to.equal(true);
    // sanctioning flips walletRecord.allowed to false
    await log.updateSanctionsList(user1.address, true);
    expect(await log.isWalletAllowed(user1.address)).to.equal(false);
    // removing sanction alone is not enough — walletRecord.allowed is still false
    await log.updateSanctionsList(user1.address, false);
    expect(await log.isWalletAllowed(user1.address)).to.equal(false);
    // must re-clear to restore
    await log.connect(shield).clearWallet(user1.address, "re-cleared after sanction removed");
    expect(await log.isWalletAllowed(user1.address)).to.equal(true);
  });

  it("getMonitoredWallets returns all compliance-updated wallets", async function () {
    const { shield, user1, user2, log } = await deploy();
    await log.connect(shield).updateWalletCompliance(user1.address, true, 10, "ok", ethers.ZeroHash);
    await log.connect(shield).updateWalletCompliance(user2.address, true, 20, "ok", ethers.ZeroHash);
    const monitored = await log.getMonitoredWallets();
    expect(monitored).to.include(user1.address);
    expect(monitored).to.include(user2.address);
  });

  it("asset compliance requiresReview=true for score exactly 69", async function () {
    const { shield, log } = await deploy();
    await log.connect(shield).reviewAssetCompliance(5, 69, ethers.ZeroHash, "just under threshold");
    const ac = await log.getAssetCompliance(5);
    expect(ac.requiresReview).to.equal(true);
  });

  it("asset compliance requiresReview=false for score exactly 70", async function () {
    const { shield, log } = await deploy();
    await log.connect(shield).reviewAssetCompliance(5, 70, ethers.ZeroHash, "at threshold");
    const ac = await log.getAssetCompliance(5);
    expect(ac.requiresReview).to.equal(false);
  });

  it("asset compliance score 95 sets requiresReview=false", async function () {
    const { shield, log } = await deploy();
    await log.connect(shield).reviewAssetCompliance(7, 95, ethers.ZeroHash, "excellent");
    const ac = await log.getAssetCompliance(7);
    expect(ac.requiresReview).to.equal(false);
  });

  it("pause blocks updateWalletCompliance", async function () {
    const { owner, shield, user1, log } = await deploy();
    await log.connect(owner).pause();
    await expect(log.connect(shield).updateWalletCompliance(user1.address, true, 20, "blocked", ethers.ZeroHash)).to.be.reverted;
  });

  it("unpause restores updateWalletCompliance", async function () {
    const { owner, shield, user1, log } = await deploy();
    await log.connect(owner).pause();
    await log.connect(owner).unpause();
    await expect(log.connect(shield).updateWalletCompliance(user1.address, true, 20, "ok", ethers.ZeroHash)).to.not.be.reverted;
  });

  it("COMPLIANCE_ROLE can updateSanctionsList", async function () {
    const { compliance, user1, log } = await deploy();
    await expect(log.connect(compliance).updateSanctionsList(user1.address, true)).to.not.be.reverted;
  });

  it("non-SHIELD_ROLE cannot reviewAssetCompliance", async function () {
    const { user1, log } = await deploy();
    await expect(
      log.connect(user1).reviewAssetCompliance(0, 80, ethers.ZeroHash, "hack")
    ).to.be.reverted;
  });

  it("documentHash is stored with asset compliance", async function () {
    const { shield, log } = await deploy();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://doc123"));
    await log.connect(shield).reviewAssetCompliance(3, 85, hash, "stored");
    const ac = await log.getAssetCompliance(3);
    expect(ac.documentHash).to.equal(hash);
  });

  it("multiple asset reviews for different asset IDs are independent", async function () {
    const { shield, log } = await deploy();
    await log.connect(shield).reviewAssetCompliance(10, 90, ethers.ZeroHash, "asset 10");
    await log.connect(shield).reviewAssetCompliance(11, 40, ethers.ZeroHash, "asset 11");
    expect((await log.getAssetCompliance(10)).complianceScore).to.equal(90n);
    expect((await log.getAssetCompliance(11)).complianceScore).to.equal(40n);
    expect((await log.getAssetCompliance(10)).requiresReview).to.equal(false);
    expect((await log.getAssetCompliance(11)).requiresReview).to.equal(true);
  });
});

describe("YieldOracle — Extended", function () {
  async function deploy() {
    const [owner, yieldAgent, user, asset1, asset2, asset3] = await ethers.getSigners();
    const C = await ethers.getContractFactory("YieldOracle");
    const oracle = await C.deploy(owner.address, ethers.ZeroAddress);
    await oracle.waitForDeployment();
    await oracle.grantYieldRole(yieldAgent.address);
    return { owner, yieldAgent, user, asset1, asset2, asset3, oracle };
  }

  it("updateYield (single) stores correct APY", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await oracle.connect(yieldAgent).updateYield(asset1.address, 500, "USDY 5%");
    const [apy, , note] = await oracle.getLatestYield(asset1.address);
    expect(apy).to.equal(500n);
    expect(note).to.equal("USDY 5%");
  });

  it("emits YieldUpdated event", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await expect(oracle.connect(yieldAgent).updateYield(asset1.address, 420, "test"))
      .to.emit(oracle, "YieldUpdated").withArgs(asset1.address, 420n, "test");
  });

  it("emits AssetTrackingStarted on first update", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await expect(oracle.connect(yieldAgent).updateYield(asset1.address, 420, "first"))
      .to.emit(oracle, "AssetTrackingStarted").withArgs(asset1.address);
  });

  it("no duplicate AssetTrackingStarted on second update", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await oracle.connect(yieldAgent).updateYield(asset1.address, 420, "first");
    await network.provider.send("evm_increaseTime", [6 * 3600 + 1]);
    await network.provider.send("evm_mine");
    await expect(oracle.connect(yieldAgent).updateYield(asset1.address, 430, "second"))
      .to.not.emit(oracle, "AssetTrackingStarted");
  });

  it("yield history grows with each update", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await oracle.connect(yieldAgent).updateYield(asset1.address, 400, "t1");
    await network.provider.send("evm_increaseTime", [6 * 3600 + 1]);
    await network.provider.send("evm_mine");
    await oracle.connect(yieldAgent).updateYield(asset1.address, 420, "t2");
    await network.provider.send("evm_increaseTime", [6 * 3600 + 1]);
    await network.provider.send("evm_mine");
    await oracle.connect(yieldAgent).updateYield(asset1.address, 450, "t3");
    const history = await oracle.getYieldHistory(asset1.address);
    expect(history.length).to.equal(3);
    expect(history[0].apyBps).to.equal(400n);
    expect(history[2].apyBps).to.equal(450n);
  });

  it("updateYields batch tracks all assets", async function () {
    const { yieldAgent, asset1, asset2, asset3, oracle } = await deploy();
    await oracle.connect(yieldAgent).updateYields(
      [asset1.address, asset2.address, asset3.address], [300, 600, 900], "batch"
    );
    const tracked = await oracle.getTrackedAssets();
    expect(tracked.length).to.equal(3);
  });

  it("createMarketSnapshot emits MarketSnapshotCreated", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await expect(oracle.connect(yieldAgent).createMarketSnapshot([asset1.address], [500], "snap"))
      .to.emit(oracle, "MarketSnapshotCreated").withArgs(0n, 1n);
  });

  it("snapshot count increments correctly", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    expect(await oracle.snapshotCount()).to.equal(0n);
    await oracle.connect(yieldAgent).createMarketSnapshot([asset1.address], [500], "1");
    expect(await oracle.snapshotCount()).to.equal(1n);
    await oracle.connect(yieldAgent).createMarketSnapshot([asset1.address], [510], "2");
    expect(await oracle.snapshotCount()).to.equal(2n);
  });

  it("getLatestSnapshot returns the most recent snapshot", async function () {
    const { yieldAgent, asset1, asset2, oracle } = await deploy();
    await oracle.connect(yieldAgent).createMarketSnapshot([asset1.address], [400], "first");
    await oracle.connect(yieldAgent).createMarketSnapshot([asset1.address, asset2.address], [410, 600], "second");
    const snap = await oracle.getLatestSnapshot();
    expect(snap.marketSummary).to.equal("second");
    expect(snap.apys.length).to.equal(2);
  });

  it("zero APY is valid", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await oracle.connect(yieldAgent).updateYield(asset1.address, 0, "zero yield");
    const [apy] = await oracle.getLatestYield(asset1.address);
    expect(apy).to.equal(0n);
  });

  it("high APY 10000 bps (100%) stores correctly", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await oracle.connect(yieldAgent).updateYield(asset1.address, 10000, "100% APY");
    const [apy] = await oracle.getLatestYield(asset1.address);
    expect(apy).to.equal(10000n);
  });

  it("only YIELD_AGENT_ROLE can createMarketSnapshot", async function () {
    const { user, asset1, oracle } = await deploy();
    await expect(
      oracle.connect(user).createMarketSnapshot([asset1.address], [400], "hack")
    ).to.be.reverted;
  });

  it("mismatched arrays revert in updateYields", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await expect(
      oracle.connect(yieldAgent).updateYields([asset1.address], [400, 500], "bad")
    ).to.be.reverted;
  });

  it("getCurrentYield returns same as getLatestYield after update", async function () {
    const { yieldAgent, asset1, oracle } = await deploy();
    await oracle.connect(yieldAgent).updateYield(asset1.address, 750, "latest");
    const [apy1] = await oracle.getLatestYield(asset1.address);
    const [apy2] = await oracle.getCurrentYield(asset1.address);
    expect(apy1).to.equal(apy2);
  });

  it("snapshot stores asset addresses correctly", async function () {
    const { yieldAgent, asset1, asset2, oracle } = await deploy();
    await oracle.connect(yieldAgent).createMarketSnapshot(
      [asset1.address, asset2.address], [300, 600], "multi"
    );
    const snap = await oracle.getMarketSnapshot(0);
    expect(snap.assets[0].toLowerCase()).to.equal(asset1.address.toLowerCase());
    expect(snap.assets[1].toLowerCase()).to.equal(asset2.address.toLowerCase());
  });
});
