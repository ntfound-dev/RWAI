import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("HybridVault", function () {
  it("deposit, set allowance, execute on behalf, and withdraw", async function () {
    const [owner, user, agent, recipient] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockERC20");
    const token = await Mock.deploy("Mock", "MCK");
    await token.waitForDeployment();
    await token.connect(owner).mint(user.address, ethers.parseEther("1000"));

    const Vault = await ethers.getContractFactory("HybridVault");
    const vault = await Vault.deploy();
    await vault.waitForDeployment();
    await vault.setAgentApproval(agent.address, true);

    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("100"));
    await vault.connect(user).deposit(await token.getAddress(), ethers.parseEther("100"));

    const balance = await vault.balances(user.address, await token.getAddress());
    expect(balance).to.equal(ethers.parseEther("100"));

    // Whitelist recipient first: propose → advance 48h timelock → commit
    await vault.proposeDestination(recipient.address);
    await network.provider.send("evm_increaseTime", [48 * 3600 + 1]);
    await network.provider.send("evm_mine");
    await vault.commitDestination(recipient.address);

    // Set allowance AFTER timelock advance so expiry is relative to current block
    const block = await ethers.provider.getBlock("latest");
    const expiry = block!.timestamp + 7 * 24 * 3600;
    await vault.connect(user).setAgentAllowance(agent.address, await token.getAddress(), ethers.parseEther("10"), expiry);

    const allowance = await vault.allowances(user.address, agent.address, await token.getAddress());
    expect(allowance.amount).to.equal(ethers.parseEther("10"));

    await vault.connect(agent).executeOnBehalf(
      user.address,
      await token.getAddress(),
      recipient.address,
      ethers.parseEther("5"),
      "0x",
    );

    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("5"));

    const remainingAllowance = await vault.allowances(user.address, agent.address, await token.getAddress());
    expect(remainingAllowance.amount).to.equal(ethers.parseEther("5"));

    await vault.connect(user).withdraw(await token.getAddress(), ethers.parseEther("10"));
    expect(await vault.balances(user.address, await token.getAddress())).to.equal(ethers.parseEther("85"));
  });

  it("sets agent allowance by EIP-712 signature through a relayer", async function () {
    const [owner, user, agent, relayer] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockERC20");
    const token = await Mock.deploy("Mock", "MCK");
    await token.waitForDeployment();
    await token.connect(owner).mint(user.address, ethers.parseEther("1000"));

    const Vault = await ethers.getContractFactory("HybridVault");
    const vault = await Vault.deploy();
    await vault.waitForDeployment();
    await vault.setAgentApproval(agent.address, true);

    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("50"));
    await vault.connect(user).deposit(await token.getAddress(), ethers.parseEther("50"));

    const amount = ethers.parseEther("5");
    const block = await ethers.provider.getBlock("latest");
    const expiry = block!.timestamp + 7 * 24 * 3600;
    const nonce = await vault.nonces(user.address);

    const domain = {
      name: "HybridVault",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await vault.getAddress(),
    };

    const types = {
      AgentConsent: [
        { name: "user", type: "address" },
        { name: "agent", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const value = {
      user: user.address,
      agent: agent.address,
      token: await token.getAddress(),
      amount: amount.toString(),
      expiry: expiry.toString(),
      nonce: nonce.toString(),
    };

    const signature = await user.signTypedData(domain, types, value);

    await vault.connect(relayer).setAgentAllowanceBySig(
      user.address,
      agent.address,
      await token.getAddress(),
      amount,
      expiry,
      nonce,
      signature,
    );

    const allowance = await vault.allowances(user.address, agent.address, await token.getAddress());
    expect(allowance.amount).to.equal(amount);
    expect(await vault.nonces(user.address)).to.equal(nonce + 1n);
  });

  it("blocks unapproved agents and exposure above the default 10 percent cap", async function () {
    const [owner, user, agent] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockERC20");
    const token = await Mock.deploy("Mock", "MCK");
    await token.waitForDeployment();
    await token.connect(owner).mint(user.address, ethers.parseEther("100"));

    const Vault = await ethers.getContractFactory("HybridVault");
    const vault = await Vault.deploy();
    await vault.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");
    const expiry = block!.timestamp + 7 * 24 * 3600;
    await vault.setAgentApproval(agent.address, true);
    await expect(
      vault.connect(user).setAgentAllowance(agent.address, await token.getAddress(), ethers.parseEther("1"), expiry),
    ).to.be.revertedWith("allowance exceeds exposure cap");

    await vault.setAgentApproval(agent.address, false);
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("100"));
    await vault.connect(user).deposit(await token.getAddress(), ethers.parseEther("100"));

    await expect(
      vault.connect(user).setAgentAllowance(agent.address, await token.getAddress(), ethers.parseEther("5"), expiry),
    ).to.be.revertedWith("agent not approved");

    await vault.setAgentApproval(agent.address, true);
    await expect(
      vault.connect(user).setAgentAllowance(agent.address, await token.getAddress(), ethers.parseEther("11"), expiry),
    ).to.be.revertedWith("allowance exceeds exposure cap");
  });
});
