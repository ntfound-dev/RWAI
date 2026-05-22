import { expect } from "chai";
import { ethers } from "hardhat";

describe("AgentExecutor — Extended", function () {
  async function deploy() {
    const [owner, agent, user, nexus, shield, yieldA, atlas, a1, a2] = await ethers.getSigners();
    const C = await ethers.getContractFactory("AgentExecutor");
    const exec = await C.deploy(owner.address);
    await exec.waitForDeployment();
    await exec.grantAgentRole(agent.address);
    await exec.setAgentIds(1, 2, 3, 4);
    return { owner, agent, user, nexus, shield, yieldA, atlas, a1, a2, exec };
  }

  it("actionCount starts at zero", async function () {
    const { exec } = await deploy();
    expect(await exec.actionCount()).to.equal(0n);
  });

  it("logTokenization increments actionCount", async function () {
    const { agent, a1, exec } = await deploy();
    await exec.connect(agent).logTokenization(1, 0, a1.address, "nexus tokenized asset A");
    await exec.connect(agent).logTokenization(1, 1, a1.address, "nexus tokenized asset B");
    expect(await exec.actionCount()).to.equal(2n);
  });

  it("logTokenization stores agentId and actionType", async function () {
    const { agent, a1, exec } = await deploy();
    await exec.connect(agent).logTokenization(1, 0, a1.address, "test");
    const entry = await exec.actionLog(0);
    expect(entry.agentId).to.equal(1n);
    expect(entry.actionType).to.equal("tokenize");
  });

  it("logComplianceReview stores correct data", async function () {
    const { agent, exec } = await deploy();
    await exec.connect(agent).logComplianceReview(2, 0, 85, "Shield: all clear");
    const entry = await exec.actionLog(0);
    expect(entry.agentId).to.equal(2n);
    expect(entry.actionType).to.equal("compliance_review");
    expect(entry.aiReasoning).to.include("Shield");
  });

  it("logComplianceReview emits AgentActionExecuted", async function () {
    const { agent, exec } = await deploy();
    await expect(exec.connect(agent).logComplianceReview(2, 0, 85, "cleared"))
      .to.emit(exec, "AgentActionExecuted");
  });

  it("recordYieldSnapshot stores yield agent action", async function () {
    const { agent, a1, a2, exec } = await deploy();
    await exec.connect(agent).recordYieldSnapshot(3, [a1.address, a2.address], [500, 650], "yield stable");
    const entry = await exec.actionLog(0);
    expect(entry.agentId).to.equal(3n);
    expect(entry.actionType).to.equal("yield_snapshot");
  });

  it("executeAllocation without vault still logs action", async function () {
    const { agent, user, a1, a2, exec } = await deploy();
    await exec.connect(agent).executeAllocation(4, user.address, [a1.address, a2.address], [6000, 4000], "atlas balanced");
    expect(await exec.actionCount()).to.equal(1n);
  });

  it("emits PortfolioAllocated on executeAllocation", async function () {
    const { agent, user, a1, exec } = await deploy();
    await expect(exec.connect(agent).executeAllocation(4, user.address, [a1.address], [10000], "ok"))
      .to.emit(exec, "PortfolioAllocated");
  });

  it("approveHighValueAction marks action approved", async function () {
    const { owner, agent, user, a1, exec } = await deploy();
    const bigAmount = ethers.parseEther("10001");
    await exec.connect(agent).executeRebalance(4, user.address, [a1.address], [a1.address], [bigAmount], "big");
    await exec.connect(owner).approveHighValueAction(0);
    expect(await exec.highValueActionApproved(0)).to.equal(true);
  });

  it("high value action queued emits HighValueActionQueued", async function () {
    const { agent, user, a1, exec } = await deploy();
    const bigAmount = ethers.parseEther("10001");
    await expect(exec.connect(agent).executeRebalance(4, user.address, [a1.address], [a1.address], [bigAmount], "big"))
      .to.emit(exec, "HighValueActionQueued");
  });

  it("small rebalance emits PortfolioRebalanced not HighValueActionQueued", async function () {
    const { agent, user, a1, a2, exec } = await deploy();
    const smallAmount = ethers.parseEther("100");
    const tx = await exec.connect(agent).executeRebalance(4, user.address, [a1.address], [a2.address], [smallAmount], "small");
    const receipt = await tx.wait();
    const hvEvent = receipt!.logs.find((l: any) => {
      try { return exec.interface.parseLog(l)?.name === "HighValueActionQueued"; } catch { return false; }
    });
    expect(hvEvent).to.be.undefined;
  });

  it("setAgentLimits updates tx and daily limits", async function () {
    const { owner, exec } = await deploy();
    await expect(exec.connect(owner).setAgentLimits(1, ethers.parseEther("500"), ethers.parseEther("5000")))
      .to.not.be.reverted;
  });

  it("non-admin cannot grantAgentRole", async function () {
    const { user, a1, exec } = await deploy();
    await expect(exec.connect(user).grantAgentRole(a1.address)).to.be.reverted;
  });

  it("non-agent cannot logTokenization", async function () {
    const { user, a1, exec } = await deploy();
    await expect(exec.connect(user).logTokenization(1, 0, a1.address, "hack")).to.be.reverted;
  });

  it("pause blocks logTokenization", async function () {
    const { owner, agent, a1, exec } = await deploy();
    await exec.connect(owner).pause();
    await expect(exec.connect(agent).logTokenization(1, 0, a1.address, "blocked")).to.be.reverted;
  });

  it("unpause restores logTokenization", async function () {
    const { owner, agent, a1, exec } = await deploy();
    await exec.connect(owner).pause();
    await exec.connect(owner).unpause();
    await expect(exec.connect(agent).logTokenization(1, 0, a1.address, "restored")).to.not.be.reverted;
  });

  it("setPortfolioVault wires vault correctly", async function () {
    const { owner, agent, user, a1, a2, exec } = await deploy();
    const VC = await ethers.getContractFactory("PortfolioVault");
    const vault = await VC.deploy(owner.address);
    await vault.waitForDeployment();
    await vault.grantAgentRole(await exec.getAddress());
    await exec.connect(owner).setPortfolioVault(await vault.getAddress());
    await exec.connect(agent).executeAllocation(4, user.address, [a1.address, a2.address], [6000, 4000], "wired");
    expect(await vault.vaultAllocations(user.address, a1.address)).to.equal(6000n);
  });

  it("setAgentIds emits AgentIdsSet with correct values", async function () {
    const { owner, exec } = await deploy();
    await expect(exec.connect(owner).setAgentIds(10, 20, 30, 40))
      .to.emit(exec, "AgentIdsSet").withArgs(10n, 20n, 30n, 40n);
  });

  it("multiple logTokenization actions all stored in log", async function () {
    const { agent, a1, exec } = await deploy();
    for (let i = 0; i < 5; i++) {
      await exec.connect(agent).logTokenization(1, i, a1.address, `asset ${i}`);
    }
    expect(await exec.actionCount()).to.equal(5n);
    const entry4 = await exec.actionLog(4);
    expect(entry4.aiReasoning).to.equal("asset 4");
  });

  it("logComplianceReview with score 0 succeeds", async function () {
    const { agent, exec } = await deploy();
    await expect(exec.connect(agent).logComplianceReview(2, 0, 0, "blocked asset")).to.not.be.reverted;
  });

  it("logComplianceReview with score 100 succeeds", async function () {
    const { agent, exec } = await deploy();
    await expect(exec.connect(agent).logComplianceReview(2, 0, 100, "perfect asset")).to.not.be.reverted;
  });

  it("resetDailyLimits accessible by admin", async function () {
    const { owner, exec } = await deploy();
    await expect(exec.connect(owner).resetDailyLimits(1)).to.not.be.reverted;
  });
});

describe("AgentReputationManager — Extended", function () {
  async function deploy() {
    const [owner, agent, staker, a1, a2, a3, a4] = await ethers.getSigners();
    const C = await ethers.getContractFactory("AgentReputationManager");
    const rm = await C.deploy(ethers.ZeroAddress, ethers.ZeroAddress, owner.address);
    await rm.waitForDeployment();
    await rm.grantAgentRole(agent.address);
    await rm.setAgentIds(1, 2, 3, 4);
    return { owner, agent, staker, a1, a2, a3, a4, rm };
  }

  it("all four agents initialized at score 75", async function () {
    const { rm } = await deploy();
    for (const id of [1, 2, 3, 4]) {
      expect(await rm.localScore(id)).to.equal(75n);
    }
  });

  it("yield_update increases score", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(3, "yield_update");
    expect(await rm.localScore(3)).to.be.gt(75n);
  });

  it("compliance_check increases score", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(2, "compliance_check");
    expect(await rm.localScore(2)).to.be.gt(75n);
  });

  it("tokenize_success + yield_update stacks correctly", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(1, "tokenize_success"); // 75+10=85
    await rm.connect(agent).updateReputation(1, "yield_update");     // 85+5=90
    expect(await rm.localScore(1)).to.be.gt(85n);
  });

  it("compliance_violation drops score by 50", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(1, "compliance_violation");
    expect(await rm.localScore(1)).to.equal(25n);
  });

  it("multiple violations clamp at 0", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(1, "compliance_violation");
    await rm.connect(agent).updateReputation(1, "compliance_violation");
    await rm.connect(agent).updateReputation(1, "compliance_violation");
    expect(await rm.localScore(1)).to.equal(0n);
  });

  it("multiple successes clamp at 100", async function () {
    const { agent, rm } = await deploy();
    for (let i = 0; i < 10; i++) {
      await rm.connect(agent).updateReputation(1, "tokenize_success");
    }
    expect(await rm.localScore(1)).to.be.lte(100n);
  });

  it("level 4 at score 90+", async function () {
    const { agent, rm } = await deploy();
    // 75 + 10 + 10 = 95 → level 4
    await rm.connect(agent).updateReputation(1, "tokenize_success");
    await rm.connect(agent).updateReputation(1, "tokenize_success");
    expect(await rm.getAutonomyLevel(1)).to.equal(4);
  });

  it("level 3 between 70-89", async function () {
    const { rm } = await deploy();
    // starts at 75 → level 3
    expect(await rm.getAutonomyLevel(1)).to.equal(3);
  });

  it("level 2 between 50-69", async function () {
    const { agent, rm } = await deploy();
    // 75 - 20 = 55 → level 2 (use a small negative action)
    // need to find what gives -20... use unknown action which should give 0 or small penalty
    // Instead, manually check: drop to ~55
    // compliance_violation: -50 → 25 (level 1), so we need different approach
    // Let's just verify level 2 range via canActAutonomously at score 55
    await rm.connect(agent).updateReputation(1, "compliance_violation"); // 75→25, level 1
    await rm.connect(agent).updateReputation(1, "tokenize_success"); // 25→35, level 1
    await rm.connect(agent).updateReputation(1, "tokenize_success"); // 35→45, level 1
    await rm.connect(agent).updateReputation(1, "tokenize_success"); // 45→55, level 2
    expect(await rm.getAutonomyLevel(1)).to.equal(2);
  });

  it("level 1 below 50 restricts all autonomous actions", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(1, "compliance_violation"); // 75 → 25
    const limit = ethers.parseEther("100");
    expect(await rm.canActAutonomously(1, 1n, limit)).to.equal(false);
  });

  it("canActAutonomously level 4: full limit allowed", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(1, "tokenize_success");
    await rm.connect(agent).updateReputation(1, "tokenize_success"); // 95 → level 4
    const limit = ethers.parseEther("100");
    expect(await rm.canActAutonomously(1, ethers.parseEther("100"), limit)).to.equal(true);
  });

  it("emits AutonomyLevelChanged when crossing threshold downward", async function () {
    const { agent, rm } = await deploy();
    // 75 (level 3) → 25 (level 1): crosses level 2 threshold → event emitted
    await expect(rm.connect(agent).updateReputation(1, "compliance_violation"))
      .to.emit(rm, "AutonomyLevelChanged");
  });

  it("emits AutonomyLevelChanged when crossing threshold upward", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(1, "compliance_violation"); // 75→25, level 1
    await rm.connect(agent).updateReputation(1, "tokenize_success"); // 35
    await rm.connect(agent).updateReputation(1, "tokenize_success"); // 45
    // Next success crosses 50 → level 2
    await expect(rm.connect(agent).updateReputation(1, "tokenize_success"))
      .to.emit(rm, "AutonomyLevelChanged");
  });

  it("four agents have independent scores", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(1, "tokenize_success");
    await rm.connect(agent).updateReputation(2, "compliance_violation");
    expect(await rm.localScore(1)).to.equal(85n);
    expect(await rm.localScore(2)).to.equal(25n);
    expect(await rm.localScore(3)).to.equal(75n);
    expect(await rm.localScore(4)).to.equal(75n);
  });

  it("compliance_check gives +8 score delta", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(2, "compliance_check");
    expect(await rm.localScore(2)).to.equal(83n); // 75 + 8
  });

  it("yield_update gives +5 score delta", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(3, "yield_update");
    expect(await rm.localScore(3)).to.equal(80n); // 75 + 5
  });

  it("unknown action does not revert — scores unchanged or small delta", async function () {
    const { agent, rm } = await deploy();
    const before = await rm.localScore(1);
    await expect(rm.connect(agent).updateReputation(1, "unknown_action")).to.not.be.reverted;
    const after = await rm.localScore(1);
    // unknown action should not change score by ≥50
    expect(Math.abs(Number(after) - Number(before))).to.be.lt(50);
  });

  it("only AGENT_ROLE can updateReputation", async function () {
    const { a1, rm } = await deploy();
    await expect(rm.connect(a1).updateReputation(1, "tokenize_success")).to.be.reverted;
  });

  it("setAgentIds can be called again to update IDs", async function () {
    const { owner, rm } = await deploy();
    await expect(rm.connect(owner).setAgentIds(10, 20, 30, 40)).to.not.be.reverted;
    expect(await rm.localScore(10)).to.equal(75n);
  });

  it("tokenize_success +10 then compliance_violation -50 lands at 35", async function () {
    const { agent, rm } = await deploy();
    await rm.connect(agent).updateReputation(1, "tokenize_success"); // 75+10=85
    await rm.connect(agent).updateReputation(1, "compliance_violation"); // 85-50=35
    expect(await rm.localScore(1)).to.equal(35n);
  });
});
