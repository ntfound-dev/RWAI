import { expect } from "chai";
import hre from "hardhat";
import { ethers } from "hardhat";

describe("RWAi Contracts", function () {

  // ── ComplianceLog ──────────────────────────────────────────────
  describe("ComplianceLog", function () {
    it("blocks wallet by default, clears after grantShieldRole + clearWallet", async function () {
      const [owner, shield, user] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("ComplianceLog");
      const log = await C.deploy(owner.address);
      await log.waitForDeployment();

      expect(await log.isWalletAllowed(user.address)).to.equal(false);

      await log.grantShieldRole(shield.address);
      await log.connect(shield).clearWallet(user.address, "KYC passed");
      expect(await log.isWalletAllowed(user.address)).to.equal(true);
    });

    it("blockWallet revokes access", async function () {
      const [owner, shield, user] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("ComplianceLog");
      const log = await C.deploy(owner.address);
      await log.waitForDeployment();
      await log.grantShieldRole(shield.address);
      await log.connect(shield).clearWallet(user.address, "ok");
      await log.connect(shield).blockWallet(user.address, "sanctions");
      expect(await log.isWalletAllowed(user.address)).to.equal(false);
    });

    it("only SHIELD_ROLE can clear wallets", async function () {
      const [owner, nobody, user] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("ComplianceLog");
      const log = await C.deploy(owner.address);
      await log.waitForDeployment();
      await expect(
        log.connect(nobody).clearWallet(user.address, "hack")
      ).to.be.reverted;
    });

    it("updateWalletCompliance stores riskScore and evidenceHash", async function () {
      const [owner, shield, user] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("ComplianceLog");
      const log = await C.deploy(owner.address);
      await log.waitForDeployment();
      await log.grantShieldRole(shield.address);

      const evidence = ethers.keccak256(ethers.toUtf8Bytes("ipfs://kyc-doc"));
      await log.connect(shield).updateWalletCompliance(user.address, true, 25, "KYC passed", evidence);

      expect(await log.isWalletAllowed(user.address)).to.equal(true);
      const [isAllowed, riskScore, , , ] = await log.getWalletRiskProfile(user.address);
      expect(isAllowed).to.equal(true);
      expect(riskScore).to.equal(25n);
    });

    it("sanctioned wallet is blocked regardless of compliance status", async function () {
      const [owner, shield, user] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("ComplianceLog");
      const log = await C.deploy(owner.address);
      await log.waitForDeployment();
      await log.grantShieldRole(shield.address);
      await log.connect(shield).clearWallet(user.address, "ok");
      expect(await log.isWalletAllowed(user.address)).to.equal(true);

      // admin has COMPLIANCE_ROLE by default
      await log.updateSanctionsList(user.address, true);
      expect(await log.isWalletAllowed(user.address)).to.equal(false);
    });

    it("reviewAssetCompliance stores report and sets requiresReview flag", async function () {
      const [owner, shield] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("ComplianceLog");
      const log = await C.deploy(owner.address);
      await log.waitForDeployment();
      await log.grantShieldRole(shield.address);

      const docHash = ethers.keccak256(ethers.toUtf8Bytes("docs"));
      await log.connect(shield).reviewAssetCompliance(0, 65, docHash, "Below threshold — manual review needed");
      const ac = await log.getAssetCompliance(0);
      expect(ac.complianceScore).to.equal(65n);
      expect(ac.requiresReview).to.equal(true);   // score < 70

      await log.connect(shield).reviewAssetCompliance(0, 80, docHash, "All good");
      const ac2 = await log.getAssetCompliance(0);
      expect(ac2.requiresReview).to.equal(false);  // 70 ≤ 80 ≤ 95
    });

    it("monitoredWallets tracks new addresses", async function () {
      const [owner, shield, user] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("ComplianceLog");
      const log = await C.deploy(owner.address);
      await log.waitForDeployment();
      await log.grantShieldRole(shield.address);

      await log.connect(shield).updateWalletCompliance(user.address, true, 10, "ok", ethers.ZeroHash);
      const monitored = await log.getMonitoredWallets();
      expect(monitored).to.include(user.address);
    });
  });

  // ── YieldOracle ────────────────────────────────────────────────
  describe("YieldOracle", function () {
    it("stores yield snapshot and returns latest", async function () {
      const [owner, mockAsset] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("YieldOracle");
      const oracle = await C.deploy(owner.address, ethers.ZeroAddress);
      await oracle.waitForDeployment();
      await oracle.grantYieldRole(owner.address);

      await oracle.updateYields([mockAsset.address], [420], "USDY at 4.2% — stable");

      const [apy, , note] = await oracle.getLatestYield(mockAsset.address);
      expect(apy).to.equal(420n);
      expect(note).to.equal("USDY at 4.2% — stable");
    });

    it("tracks multiple assets", async function () {
      const [owner, asset1, asset2] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("YieldOracle");
      const oracle = await C.deploy(owner.address, ethers.ZeroAddress);
      await oracle.waitForDeployment();
      await oracle.grantYieldRole(owner.address);

      await oracle.updateYields([asset1.address, asset2.address], [420, 612], "multi-asset");

      const tracked = await oracle.getTrackedAssets();
      expect(tracked.length).to.equal(2);
    });

    it("only YIELD_AGENT_ROLE can update yields", async function () {
      const [owner, nobody, asset] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("YieldOracle");
      const oracle = await C.deploy(owner.address, ethers.ZeroAddress);
      await oracle.waitForDeployment();
      await expect(
        oracle.connect(nobody).updateYields([asset.address], [420], "hack")
      ).to.be.reverted;
    });

    it("createMarketSnapshot stores AI market summary on-chain", async function () {
      const [owner, asset1, asset2] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("YieldOracle");
      const oracle = await C.deploy(owner.address, ethers.ZeroAddress);
      await oracle.waitForDeployment();
      await oracle.grantYieldRole(owner.address);

      await oracle.createMarketSnapshot(
        [asset1.address, asset2.address],
        [420, 650],
        "Yield Agent: USDY 4.2%, mETH 6.5% — risk-adjusted Mantle portfolio favors mETH this week"
      );

      expect(await oracle.snapshotCount()).to.equal(1n);
      const snap = await oracle.getLatestSnapshot();
      expect(snap.snapshotId).to.equal(0n);
      expect(snap.apys.length).to.equal(2);
      expect(snap.marketSummary).to.include("Mantle");
    });

    it("getMarketSnapshot retrieves by id", async function () {
      const [owner, asset1] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("YieldOracle");
      const oracle = await C.deploy(owner.address, ethers.ZeroAddress);
      await oracle.waitForDeployment();
      await oracle.grantYieldRole(owner.address);

      await oracle.createMarketSnapshot([asset1.address], [300], "snapshot-0");
      await oracle.createMarketSnapshot([asset1.address], [310], "snapshot-1");

      const s0 = await oracle.getMarketSnapshot(0);
      expect(s0.marketSummary).to.equal("snapshot-0");
      const s1 = await oracle.getMarketSnapshot(1);
      expect(s1.marketSummary).to.equal("snapshot-1");
    });

    it("stores Pyth price updates normalized to 18 decimals", async function () {
      const [owner, asset] = await ethers.getSigners();
      const block = await ethers.provider.getBlock("latest");
      const publishTime = block?.timestamp ?? 0;

      const MockPyth = await hre.ethers.getContractFactory("MockPyth");
      const pyth = await MockPyth.deploy(65_000_000, 100_000, -8, publishTime);
      await pyth.waitForDeployment();

      const C = await hre.ethers.getContractFactory("YieldOracle");
      const oracle = await C.deploy(owner.address, await pyth.getAddress());
      await oracle.waitForDeployment();
      await oracle.grantYieldRole(owner.address);

      const feedId = ethers.keccak256(ethers.toUtf8Bytes("MNT/USD"));
      await oracle.setAssetPriceFeed(asset.address, feedId);
      await pyth.setUpdateFee(1_000);

      await oracle.updatePrice(asset.address, ["0x1234"], "MNT/USD via Pyth", { value: 1_000 });

      const [price, confidence, exponent, storedPublishTime, , note, isActive] =
        await oracle.getCurrentPrice(asset.address);
      expect(price).to.equal(ethers.parseUnits("0.65", 18));
      expect(confidence).to.equal(ethers.parseUnits("0.001", 18));
      expect(exponent).to.equal(-8n);
      expect(storedPublishTime).to.equal(BigInt(publishTime));
      expect(note).to.equal("MNT/USD via Pyth");
      expect(isActive).to.equal(true);
    });
  });

  // ── RWAiRegistry ───────────────────────────────────────────────
  describe("RWAiRegistry", function () {
    it("registers asset and increments assetCount", async function () {
      const [owner, tokenAddr, assetOwner] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("RWAiRegistry");
      const reg = await C.deploy(owner.address);
      await reg.waitForDeployment();

      await reg.registerAsset(tokenAddr.address, "real_estate", "ipfs://test", assetOwner.address);
      expect(await reg.assetCount()).to.equal(1n);
    });

    it("updateCompliance activates asset when score >= 70", async function () {
      const [owner, tokenAddr] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("RWAiRegistry");
      const reg = await C.deploy(owner.address);
      await reg.waitForDeployment();
      await reg.registerAsset(tokenAddr.address, "real_estate", "ipfs://test", owner.address);

      await reg.updateCompliance(0, 50, ethers.ZeroHash);
      expect((await reg.assets(0)).active).to.equal(false);

      await reg.updateCompliance(0, 70, ethers.ZeroHash);
      expect((await reg.assets(0)).active).to.equal(true);
    });

    it("deactivateAsset sets active to false", async function () {
      const [owner, tokenAddr] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("RWAiRegistry");
      const reg = await C.deploy(owner.address);
      await reg.waitForDeployment();
      await reg.registerAsset(tokenAddr.address, "real_estate", "ipfs://test", owner.address);
      await reg.updateCompliance(0, 80, ethers.ZeroHash);
      expect((await reg.assets(0)).active).to.equal(true);
      await reg.deactivateAsset(0);
      expect((await reg.assets(0)).active).to.equal(false);
    });
  });

  // ── PortfolioVault ─────────────────────────────────────────────
  describe("PortfolioVault", function () {
    it("creates portfolio with valid bps sum", async function () {
      const [owner, atlas, user, asset1, asset2] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("PortfolioVault");
      const vault = await C.deploy(owner.address);
      await vault.waitForDeployment();
      await vault.grantAtlasRole(atlas.address);

      await vault.connect(atlas).createPortfolio(
        user.address, [asset1.address, asset2.address], [6000, 4000],
        3, "conservative", "Atlas reasoning on-chain"
      );
      expect(await vault.hasPortfolio(user.address)).to.equal(true);
      const p = await vault.getPortfolio(user.address);
      expect(p.strategyType).to.equal("conservative");
      expect(p.riskScore).to.equal(3n);
    });

    it("rejects portfolio when bps do not sum to 10000", async function () {
      const [owner, atlas, user, asset1] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("PortfolioVault");
      const vault = await C.deploy(owner.address);
      await vault.waitForDeployment();
      await vault.grantAtlasRole(atlas.address);

      await expect(
        vault.connect(atlas).createPortfolio(
          user.address, [asset1.address], [5000], 3, "conservative", ""
        )
      ).to.be.revertedWith("Allocations must sum to 10000 bps");
    });

    it("updatePortfolio stores new atlas reasoning", async function () {
      const [owner, atlas, user, a1, a2] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("PortfolioVault");
      const vault = await C.deploy(owner.address);
      await vault.waitForDeployment();
      await vault.grantAtlasRole(atlas.address);

      await vault.connect(atlas).createPortfolio(
        user.address, [a1.address, a2.address], [6000, 4000], 3, "conservative", "initial"
      );
      await vault.connect(atlas).updatePortfolio(
        user.address, [a1.address, a2.address], [5000, 5000], "rebalance: mETH drift"
      );
      const p = await vault.getPortfolio(user.address);
      expect(p.atlasReasoning).to.equal("rebalance: mETH drift");
    });

    it("executeAllocation stores vault allocations (AGENT_ROLE)", async function () {
      const [owner, agent, user, asset1, asset2] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("PortfolioVault");
      const vault = await C.deploy(owner.address);
      await vault.waitForDeployment();
      await vault.grantAgentRole(agent.address);

      await vault.connect(agent).executeAllocation(
        user.address, [asset1.address, asset2.address], [6000, 4000]
      );

      expect(await vault.vaultAllocations(user.address, asset1.address)).to.equal(6000n);
      expect(await vault.vaultAllocations(user.address, asset2.address)).to.equal(4000n);
    });

    it("addSupportedAsset / getSupportedAssets works", async function () {
      const [owner, asset1] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("PortfolioVault");
      const vault = await C.deploy(owner.address);
      await vault.waitForDeployment();

      await vault.addSupportedAsset(asset1.address);
      expect(await vault.supportedAssets(asset1.address)).to.equal(true);
      const list = await vault.getSupportedAssets();
      expect(list).to.include(asset1.address);
    });
  });

  // ── AssetToken ─────────────────────────────────────────────────
  describe("AssetToken", function () {
    async function deployToken() {
      const [owner, agent, shield, user1, user2] = await ethers.getSigners();

      const CompC = await hre.ethers.getContractFactory("ComplianceLog");
      const comp = await CompC.deploy(owner.address);
      await comp.waitForDeployment();
      await comp.grantShieldRole(shield.address);
      // Owner (deployer) is pre-cleared — holds initial supply
      await comp.connect(shield).clearWallet(owner.address, "deployer");

      const TC = await hre.ethers.getContractFactory("AssetToken");
      const token = await TC.deploy(
        "Test RWA", "TRWA", 0, 1_000_000, 420,
        agent.address, await comp.getAddress(), "ipfs://test",
        ethers.ZeroAddress  // no registry check
      );
      await token.waitForDeployment();

      return { owner, agent, shield, user1, user2, comp, token };
    }

    it("mints total supply to deployer on construction", async function () {
      const { owner, token } = await deployToken();
      const supply = await token.totalSupply();
      expect(supply).to.be.gt(0n);
      expect(await token.balanceOf(owner.address)).to.equal(supply);
    });

    it("blocks transfer to non-cleared recipient", async function () {
      const { user1, token } = await deployToken();
      await expect(
        token.transfer(user1.address, 100n)
      ).to.be.revertedWith("RWAi: recipient not compliance-cleared");
    });

    it("blocks transfer from non-cleared sender", async function () {
      const { owner, shield, user1, user2, comp, token } = await deployToken();
      await comp.connect(shield).clearWallet(user1.address, "ok");
      await token.transfer(user1.address, 1000n);

      // user2 not cleared → fails
      await expect(
        token.connect(user1).transfer(user2.address, 100n)
      ).to.be.revertedWith("RWAi: recipient not compliance-cleared");

      // clear user2 → succeeds
      await comp.connect(shield).clearWallet(user2.address, "ok");
      await token.connect(user1).transfer(user2.address, 100n);
      expect(await token.balanceOf(user2.address)).to.equal(100n);
    });

    it("allows burn without compliance check on sender", async function () {
      const { owner, token } = await deployToken();
      const before = await token.balanceOf(owner.address);
      await token.burn(100n);
      expect(await token.balanceOf(owner.address)).to.equal(before - 100n);
    });

    it("cleared sender blocked wallet cannot transfer out", async function () {
      const { owner, shield, user1, user2, comp, token } = await deployToken();
      await comp.connect(shield).clearWallet(user1.address, "ok");
      await comp.connect(shield).clearWallet(user2.address, "ok");
      await token.transfer(user1.address, 1000n);

      await comp.connect(shield).blockWallet(user1.address, "sanctioned");
      await expect(
        token.connect(user1).transfer(user2.address, 100n)
      ).to.be.revertedWith("RWAi: sender not compliance-cleared");
    });

    it("setBlacklist blocks a wallet at token level", async function () {
      const { owner, agent, shield, user1, comp, token } = await deployToken();
      await comp.connect(shield).clearWallet(user1.address, "ok");
      await token.transfer(user1.address, 1000n);

      // blacklist user1 at token level
      await token.connect(agent).setBlacklist(user1.address, true);
      expect(await token.blacklisted(user1.address)).to.equal(true);

      // user1 cannot send
      await comp.connect(shield).clearWallet(owner.address, "ok"); // ensure owner still clear
      await expect(
        token.connect(user1).transfer(owner.address, 100n)
      ).to.be.revertedWith("RWAi: sender blacklisted");
    });

    it("setTransfersEnabled = false blocks all secondary transfers", async function () {
      const { owner, shield, user1, comp, token } = await deployToken();
      await comp.connect(shield).clearWallet(user1.address, "ok");
      await token.transfer(user1.address, 1000n);

      await token.setTransfersEnabled(false);
      await comp.connect(shield).clearWallet(owner.address, "ok");
      await expect(
        token.connect(user1).transfer(owner.address, 100n)
      ).to.be.revertedWith("RWAi: transfers disabled");
    });
  });

  // ── AgentExecutor ──────────────────────────────────────────────
  describe("AgentExecutor", function () {
    it("logs tokenization action and stores AI reasoning", async function () {
      const [owner, agent, tokenAddr] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("AgentExecutor");
      const exec = await C.deploy(owner.address);
      await exec.waitForDeployment();
      await exec.grantAgentRole(agent.address);

      // agentId=1 as first param; no reputationManager → autonomy bypassed
      await exec.connect(agent).logTokenization(
        1, 0, tokenAddr.address,
        "Nexus: MANHATTAN-001 deployed, 2.5M tokens at $1.60 → 4.08% yield"
      );

      expect(await exec.actionCount()).to.equal(1n);
      const entry = await exec.actionLog(0);
      expect(entry.agentName).to.equal("nexus");
      expect(entry.aiReasoning).to.include("MANHATTAN-001");
      expect(entry.agentId).to.equal(1n);
      expect(entry.success).to.equal(true);
    });

    it("setAgentIds emits AgentIdsSet event", async function () {
      const [owner] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("AgentExecutor");
      const exec = await C.deploy(owner.address);
      await exec.waitForDeployment();

      await expect(exec.setAgentIds(1, 2, 3, 4))
        .to.emit(exec, "AgentIdsSet")
        .withArgs(1n, 2n, 3n, 4n);
    });

    it("reputation call is skipped when reputationManager not set", async function () {
      const [owner, agent, tokenAddr] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("AgentExecutor");
      const exec = await C.deploy(owner.address);
      await exec.waitForDeployment();
      await exec.grantAgentRole(agent.address);

      await expect(
        exec.connect(agent).logTokenization(1, 0, tokenAddr.address, "no-rm test")
      ).to.not.be.reverted;
      expect(await exec.actionCount()).to.equal(1n);
    });

    it("executeAllocation stores portfolio allocations via PortfolioVault", async function () {
      const [owner, agent, user, asset1, asset2] = await ethers.getSigners();

      const VC = await hre.ethers.getContractFactory("PortfolioVault");
      const vault = await VC.deploy(owner.address);
      await vault.waitForDeployment();

      const EC = await hre.ethers.getContractFactory("AgentExecutor");
      const exec = await EC.deploy(owner.address);
      await exec.waitForDeployment();
      await exec.grantAgentRole(agent.address);
      await exec.setPortfolioVault(await vault.getAddress());

      // Grant AGENT_ROLE on vault to executor
      await vault.grantAgentRole(await exec.getAddress());

      await exec.connect(agent).executeAllocation(
        1, user.address,
        [asset1.address, asset2.address],
        [6000, 4000],
        "Conservative: 60% USDY / 40% MI4 — low risk profile"
      );

      expect(await vault.vaultAllocations(user.address, asset1.address)).to.equal(6000n);
      expect(await vault.vaultAllocations(user.address, asset2.address)).to.equal(4000n);
    });

    it("wires reputationManager and updates score on action", async function () {
      const [owner, agent, tokenAddr] = await ethers.getSigners();

      const RC = await hre.ethers.getContractFactory("AgentReputationManager");
      const rm = await RC.deploy(ethers.ZeroAddress, ethers.ZeroAddress, owner.address);
      await rm.waitForDeployment();

      const EC = await hre.ethers.getContractFactory("AgentExecutor");
      const exec = await EC.deploy(owner.address);
      await exec.waitForDeployment();
      await exec.grantAgentRole(agent.address);
      await exec.setReputationManager(await rm.getAddress());
      await rm.grantAgentRole(await exec.getAddress());
      await rm.setAgentIds(1, 0, 0, 0); // init score 75 for agentId=1

      await exec.connect(agent).logTokenization(1, 0, tokenAddr.address, "wired rm test");

      // score starts 75, tokenize_success +10 → 85
      expect(await rm.localScore(1)).to.equal(85n);
    });

    it("autonomy gate blocks level-1 agent (score < 50)", async function () {
      const [owner, agent, tokenAddr] = await ethers.getSigners();

      const RC = await hre.ethers.getContractFactory("AgentReputationManager");
      const rm = await RC.deploy(ethers.ZeroAddress, ethers.ZeroAddress, owner.address);
      await rm.waitForDeployment();

      const EC = await hre.ethers.getContractFactory("AgentExecutor");
      const exec = await EC.deploy(owner.address);
      await exec.waitForDeployment();
      await exec.grantAgentRole(agent.address);
      await exec.setReputationManager(await rm.getAddress());
      await rm.grantAgentRole(await exec.getAddress());
      await rm.setAgentIds(1, 0, 0, 0); // score 75 → level 3

      // Drop score below 50 → level 1 (restricted)
      // compliance_violation = -50 → 75 - 50 = 25 → level 1
      await rm.grantAgentRole(owner.address);
      await rm.updateReputation(1, "compliance_violation"); // 25

      await expect(
        exec.connect(agent).logTokenization(1, 0, tokenAddr.address, "should fail")
      ).to.be.revertedWith("Insufficient autonomy");
    });

    it("high-value rebalance is queued for approval instead of executing", async function () {
      const [owner, agent, user, a1, a2] = await ethers.getSigners();
      const EC = await hre.ethers.getContractFactory("AgentExecutor");
      const exec = await EC.deploy(owner.address);
      await exec.waitForDeployment();
      await exec.grantAgentRole(agent.address);

      // Use amount >= HIGH_VALUE_THRESHOLD (10000 * 1e18)
      const bigAmount = ethers.parseEther("10001");

      const tx = await exec.connect(agent).executeRebalance(
        1, user.address, [a1.address], [a2.address], [bigAmount], "big rebalance"
      );
      const receipt = await tx.wait();

      // Should emit HighValueActionQueued, not PortfolioRebalanced
      const event = receipt!.logs.find((l: any) => {
        try { return exec.interface.parseLog(l)?.name === "HighValueActionQueued"; } catch { return false; }
      });
      expect(event).to.not.be.undefined;
      expect(await exec.highValueActionApproved(0)).to.equal(false);
    });
  });

  // ── AgentReputationManager ─────────────────────────────────────
  describe("AgentReputationManager", function () {
    async function deployRM() {
      const [owner, agent] = await ethers.getSigners();
      const C = await hre.ethers.getContractFactory("AgentReputationManager");
      const rm = await C.deploy(ethers.ZeroAddress, ethers.ZeroAddress, owner.address);
      await rm.waitForDeployment();
      await rm.grantAgentRole(agent.address);
      await rm.setAgentIds(1, 2, 3, 4);
      return { owner, agent, rm };
    }

    it("initializes score at 75 after setAgentIds", async function () {
      const { rm } = await deployRM();
      expect(await rm.localScore(1)).to.equal(75n);
      expect(await rm.localScore(4)).to.equal(75n);
    });

    it("tokenize_success +10 raises score to 85", async function () {
      const { agent, rm } = await deployRM();
      await rm.connect(agent).updateReputation(1, "tokenize_success");
      expect(await rm.localScore(1)).to.equal(85n);
    });

    it("compliance_violation -50 drops score and triggers autonomy level change event", async function () {
      const { agent, rm } = await deployRM();
      // score 75 → level 3 (medium); after -50 → 25 → level 1 (restricted)
      await expect(
        rm.connect(agent).updateReputation(1, "compliance_violation")
      ).to.emit(rm, "AutonomyLevelChanged").withArgs(1n, 3, 1);
      expect(await rm.localScore(1)).to.equal(25n);
    });

    it("score clamps at 100 on repeated positive actions", async function () {
      const { agent, rm } = await deployRM();
      for (let i = 0; i < 5; i++) {
        await rm.connect(agent).updateReputation(1, "tokenize_success");
      }
      expect(await rm.localScore(1)).to.be.lte(100n);
    });

    it("score clamps at 0 on repeated negative actions", async function () {
      const { agent, rm } = await deployRM();
      for (let i = 0; i < 5; i++) {
        await rm.connect(agent).updateReputation(1, "compliance_violation");
      }
      expect(await rm.localScore(1)).to.equal(0n);
    });

    it("getAutonomyLevel returns correct tier", async function () {
      const { agent, rm } = await deployRM();
      // 75 ≥ 70 (REPUTATION_MEDIUM) → level 3 (medium)
      expect(await rm.getAutonomyLevel(1)).to.equal(3);
      await rm.connect(agent).updateReputation(1, "tokenize_success"); // 85 → still 3
      expect(await rm.getAutonomyLevel(1)).to.equal(3);
      await rm.connect(agent).updateReputation(1, "tokenize_success"); // 95 → ≥90 → level 4
      expect(await rm.getAutonomyLevel(1)).to.equal(4);
    });

    it("canActAutonomously respects level limits", async function () {
      const { agent, rm } = await deployRM();
      const limit = ethers.parseEther("100");
      // score=75 → level 3: can act up to 50% of limit
      expect(await rm.canActAutonomously(1, ethers.parseEther("50"), limit)).to.equal(true);
      expect(await rm.canActAutonomously(1, ethers.parseEther("51"), limit)).to.equal(false);

      // drop to level 1 → always false
      await rm.connect(agent).updateReputation(1, "compliance_violation"); // 75→25 → level 1
      expect(await rm.canActAutonomously(1, ethers.parseEther("1"), limit)).to.equal(false);
    });

    it("only AGENT_ROLE can call updateReputation", async function () {
      const { rm } = await deployRM();
      const [, , nobody] = await ethers.getSigners();
      await expect(
        rm.connect(nobody).updateReputation(1, "tokenize_success")
      ).to.be.reverted;
    });
  });
});
