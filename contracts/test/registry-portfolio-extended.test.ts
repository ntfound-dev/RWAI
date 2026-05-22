import { expect } from "chai";
import { ethers } from "hardhat";

describe("RWAiRegistry — Extended", function () {
  async function deploy() {
    const [owner, user1, user2, token1, token2, token3] = await ethers.getSigners();
    const C = await ethers.getContractFactory("RWAiRegistry");
    const reg = await C.deploy(owner.address);
    await reg.waitForDeployment();
    return { owner, user1, user2, token1, token2, token3, reg };
  }

  it("emits AssetRegistered on register", async function () {
    const { owner, token1, reg } = await deploy();
    await expect(reg.registerAsset(token1.address, "real_estate", "ipfs://a", owner.address))
      .to.emit(reg, "AssetRegistered");
  });

  it("emits ComplianceUpdated on updateCompliance", async function () {
    const { owner, token1, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://a", owner.address);
    await expect(reg.updateCompliance(0, 80, ethers.ZeroHash))
      .to.emit(reg, "ComplianceUpdated").withArgs(0n, 80n, ethers.ZeroHash);
  });

  it("emits AssetDeactivated on deactivate", async function () {
    const { owner, token1, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://a", owner.address);
    await expect(reg.deactivateAsset(0)).to.emit(reg, "AssetDeactivated").withArgs(0n);
  });

  it("multiple assets have sequential IDs", async function () {
    const { owner, token1, token2, token3, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://1", owner.address);
    await reg.registerAsset(token2.address, "bond", "ipfs://2", owner.address);
    await reg.registerAsset(token3.address, "commodity", "ipfs://3", owner.address);
    expect(await reg.assetCount()).to.equal(3n);
  });

  it("getOwnerAssets returns correct IDs for owner", async function () {
    const { owner, user1, token1, token2, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://1", user1.address);
    await reg.registerAsset(token2.address, "bond", "ipfs://2", user1.address);
    const ids = await reg.getOwnerAssets(user1.address);
    expect(ids.length).to.equal(2);
    expect(ids[0]).to.equal(0n);
    expect(ids[1]).to.equal(1n);
  });

  it("getOwnerAssets returns empty for address with no assets", async function () {
    const { user2, reg } = await deploy();
    const ids = await reg.getOwnerAssets(user2.address);
    expect(ids.length).to.equal(0);
  });

  it("different owners have separate asset lists", async function () {
    const { user1, user2, token1, token2, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://1", user1.address);
    await reg.registerAsset(token2.address, "bond", "ipfs://2", user2.address);
    expect((await reg.getOwnerAssets(user1.address)).length).to.equal(1);
    expect((await reg.getOwnerAssets(user2.address)).length).to.equal(1);
  });

  it("compliance < 70 keeps asset inactive", async function () {
    const { owner, token1, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://a", owner.address);
    await reg.updateCompliance(0, 69, ethers.ZeroHash);
    expect((await reg.assets(0)).active).to.equal(false);
  });

  it("compliance = 70 activates asset", async function () {
    const { owner, token1, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://a", owner.address);
    await reg.updateCompliance(0, 70, ethers.ZeroHash);
    expect((await reg.assets(0)).active).to.equal(true);
  });

  it("compliance 100 activates asset", async function () {
    const { owner, token1, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://a", owner.address);
    await reg.updateCompliance(0, 100, ethers.ZeroHash);
    expect((await reg.assets(0)).active).to.equal(true);
  });

  it("deactivate then re-activate via updateCompliance", async function () {
    const { owner, token1, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://a", owner.address);
    await reg.updateCompliance(0, 80, ethers.ZeroHash);
    expect((await reg.assets(0)).active).to.equal(true);
    await reg.deactivateAsset(0);
    expect((await reg.assets(0)).active).to.equal(false);
    await reg.updateCompliance(0, 90, ethers.ZeroHash);
    expect((await reg.assets(0)).active).to.equal(true);
  });

  it("stores assetType correctly", async function () {
    const { owner, token1, reg } = await deploy();
    await reg.registerAsset(token1.address, "private_equity", "ipfs://a", owner.address);
    expect((await reg.assets(0)).assetType).to.equal("private_equity");
  });

  it("pause blocks registerAsset", async function () {
    const { owner, token1, reg } = await deploy();
    await reg.pause();
    await expect(reg.registerAsset(token1.address, "type", "ipfs://a", owner.address)).to.be.reverted;
  });

  it("unpause restores registerAsset", async function () {
    const { owner, token1, reg } = await deploy();
    await reg.pause();
    await reg.unpause();
    await expect(reg.registerAsset(token1.address, "type", "ipfs://a", owner.address)).to.not.be.reverted;
  });

  it("non-owner cannot deactivateAsset", async function () {
    const { owner, user1, token1, reg } = await deploy();
    await reg.registerAsset(token1.address, "real_estate", "ipfs://a", owner.address);
    await expect(reg.connect(user1).deactivateAsset(0)).to.be.reverted;
  });

  it("assetCount starts at zero", async function () {
    const { reg } = await deploy();
    expect(await reg.assetCount()).to.equal(0n);
  });
});

describe("PortfolioVault — Extended", function () {
  async function deploy() {
    const [owner, atlas, agent, user1, user2, a1, a2, a3] = await ethers.getSigners();
    const C = await ethers.getContractFactory("PortfolioVault");
    const vault = await C.deploy(owner.address);
    await vault.waitForDeployment();
    await vault.grantAtlasRole(atlas.address);
    await vault.grantAgentRole(agent.address);
    return { owner, atlas, agent, user1, user2, a1, a2, a3, vault };
  }

  it("emits PortfolioCreated on createPortfolio", async function () {
    const { atlas, user1, a1, a2, vault } = await deploy();
    await expect(vault.connect(atlas).createPortfolio(user1.address, [a1.address, a2.address], [7000, 3000], 2, "aggressive", "ok"))
      .to.emit(vault, "PortfolioCreated").withArgs(user1.address, "aggressive", 2n);
  });

  it("emits PortfolioRebalanced on updatePortfolio", async function () {
    const { atlas, user1, a1, a2, vault } = await deploy();
    await vault.connect(atlas).createPortfolio(user1.address, [a1.address, a2.address], [6000, 4000], 3, "conservative", "init");
    await expect(vault.connect(atlas).updatePortfolio(user1.address, [a1.address, a2.address], [5000, 5000], "rebalance"))
      .to.emit(vault, "PortfolioRebalanced");
  });

  it("emits AllocationExecuted on executeAllocation", async function () {
    const { agent, user1, a1, a2, vault } = await deploy();
    await expect(vault.connect(agent).executeAllocation(user1.address, [a1.address, a2.address], [6000, 4000]))
      .to.emit(vault, "AllocationExecuted");
  });

  it("two users can have independent portfolios", async function () {
    const { atlas, user1, user2, a1, a2, vault } = await deploy();
    await vault.connect(atlas).createPortfolio(user1.address, [a1.address, a2.address], [6000, 4000], 3, "conservative", "u1");
    await vault.connect(atlas).createPortfolio(user2.address, [a1.address, a2.address], [3000, 7000], 5, "aggressive", "u2");
    const p1 = await vault.getPortfolio(user1.address);
    const p2 = await vault.getPortfolio(user2.address);
    expect(p1.strategyType).to.equal("conservative");
    expect(p2.strategyType).to.equal("aggressive");
  });

  it("hasPortfolio returns false before creation", async function () {
    const { user1, vault } = await deploy();
    expect(await vault.hasPortfolio(user1.address)).to.equal(false);
  });

  it("hasPortfolio returns true after creation", async function () {
    const { atlas, user1, a1, a2, vault } = await deploy();
    await vault.connect(atlas).createPortfolio(user1.address, [a1.address, a2.address], [6000, 4000], 3, "conservative", "ok");
    expect(await vault.hasPortfolio(user1.address)).to.equal(true);
  });

  it("riskScore 1-5 stored correctly", async function () {
    const { atlas, user1, a1, a2, vault } = await deploy();
    await vault.connect(atlas).createPortfolio(user1.address, [a1.address, a2.address], [5000, 5000], 5, "aggressive", "ok");
    const p = await vault.getPortfolio(user1.address);
    expect(p.riskScore).to.equal(5n);
  });

  it("three-asset allocation with 10000 bps sum works", async function () {
    const { atlas, user1, a1, a2, a3, vault } = await deploy();
    await expect(vault.connect(atlas).createPortfolio(
      user1.address, [a1.address, a2.address, a3.address], [3000, 4000, 3000], 3, "balanced", "ok"
    )).to.not.be.reverted;
  });

  it("addSupportedAsset then removeSupportedAsset works", async function () {
    const { owner, a1, vault } = await deploy();
    await vault.addSupportedAsset(a1.address);
    expect(await vault.supportedAssets(a1.address)).to.equal(true);
    await vault.removeSupportedAsset(a1.address);
    expect(await vault.supportedAssets(a1.address)).to.equal(false);
  });

  it("getSupportedAssets returns all added assets", async function () {
    const { a1, a2, a3, vault } = await deploy();
    await vault.addSupportedAsset(a1.address);
    await vault.addSupportedAsset(a2.address);
    await vault.addSupportedAsset(a3.address);
    const list = await vault.getSupportedAssets();
    expect(list.length).to.equal(3);
  });

  it("non-atlas cannot createPortfolio", async function () {
    const { user1, a1, a2, vault } = await deploy();
    await expect(vault.connect(user1).createPortfolio(
      user1.address, [a1.address, a2.address], [6000, 4000], 3, "conservative", "hack"
    )).to.be.reverted;
  });

  it("non-agent cannot executeAllocation", async function () {
    const { user1, a1, a2, vault } = await deploy();
    await expect(vault.connect(user1).executeAllocation(user1.address, [a1.address], [10000])).to.be.reverted;
  });

  it("vaultAllocations tracks values per user and asset", async function () {
    const { agent, user1, user2, a1, vault } = await deploy();
    await vault.connect(agent).executeAllocation(user1.address, [a1.address], [10000]);
    await vault.connect(agent).executeAllocation(user2.address, [a1.address], [5000]);
    expect(await vault.vaultAllocations(user1.address, a1.address)).to.equal(10000n);
    expect(await vault.vaultAllocations(user2.address, a1.address)).to.equal(5000n);
  });

  it("pause blocks createPortfolio", async function () {
    const { owner, atlas, user1, a1, a2, vault } = await deploy();
    await vault.pause();
    await expect(vault.connect(atlas).createPortfolio(
      user1.address, [a1.address, a2.address], [6000, 4000], 3, "conservative", "ok"
    )).to.be.reverted;
  });

  it("updatePortfolio stores new allocations", async function () {
    const { atlas, user1, a1, a2, vault } = await deploy();
    await vault.connect(atlas).createPortfolio(user1.address, [a1.address, a2.address], [6000, 4000], 3, "conservative", "init");
    await vault.connect(atlas).updatePortfolio(user1.address, [a1.address, a2.address], [4000, 6000], "flipped");
    const p = await vault.getPortfolio(user1.address);
    expect(p.atlasReasoning).to.equal("flipped");
  });

  it("bps not summing to 10000 reverts with two assets", async function () {
    const { atlas, user1, a1, a2, vault } = await deploy();
    await expect(vault.connect(atlas).createPortfolio(
      user1.address, [a1.address, a2.address], [5000, 6000], 3, "bad", "fail"
    )).to.be.revertedWith("Allocations must sum to 10000 bps");
  });

  it("single asset with 10000 bps is valid", async function () {
    const { atlas, user1, a1, vault } = await deploy();
    await expect(vault.connect(atlas).createPortfolio(
      user1.address, [a1.address], [10000], 1, "single", "ok"
    )).to.not.be.reverted;
  });

  it("emits SupportedAssetAdded when adding asset", async function () {
    const { a1, vault } = await deploy();
    await expect(vault.addSupportedAsset(a1.address))
      .to.emit(vault, "SupportedAssetAdded").withArgs(a1.address);
  });

  it("emits SupportedAssetRemoved when removing asset", async function () {
    const { a1, vault } = await deploy();
    await vault.addSupportedAsset(a1.address);
    await expect(vault.removeSupportedAsset(a1.address))
      .to.emit(vault, "SupportedAssetRemoved").withArgs(a1.address);
  });
});
