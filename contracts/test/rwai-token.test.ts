import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE_DAY    = 86_400;
const ONE_MONTH  = 30 * ONE_DAY;
const ONE_YEAR   = 365 * ONE_DAY;
const toWei      = (n: number) => ethers.parseEther(n.toString());

describe("RWAi Token Suite", function () {

  // ── RWAiToken ──────────────────────────────────────────────────
  describe("RWAiToken", function () {

    async function deploy() {
      const [admin, alice, bob, treasury] = await ethers.getSigners();
      const T = await ethers.getContractFactory("RWAiToken");
      const token = await T.deploy(admin.address);
      await token.waitForDeployment();
      return { token, admin, alice, bob, treasury };
    }

    it("has correct name, symbol, decimals", async function () {
      const { token } = await deploy();
      expect(await token.name()).to.equal("RWAi Protocol Token");
      expect(await token.symbol()).to.equal("RWAI");
      expect(await token.decimals()).to.equal(18);
    });

    it("starts with zero supply", async function () {
      const { token } = await deploy();
      expect(await token.totalSupply()).to.equal(0n);
    });

    it("admin can mint up to MAX_SUPPLY", async function () {
      const { token, admin, alice } = await deploy();
      const MAX = await token.MAX_SUPPLY();
      await token.mint(alice.address, MAX);
      expect(await token.totalSupply()).to.equal(MAX);
    });

    it("reverts if mint exceeds MAX_SUPPLY", async function () {
      const { token, alice } = await deploy();
      const MAX = await token.MAX_SUPPLY();
      await expect(token.mint(alice.address, MAX + 1n)).to.be.revertedWith("RWAI: exceeds max supply");
    });

    it("non-minter cannot mint", async function () {
      const { token, alice } = await deploy();
      await expect(token.connect(alice).mint(alice.address, toWei(1))).to.be.reverted;
    });

    it("stake → claimFees → unstake after lock", async function () {
      const { token, admin, alice, treasury } = await deploy();
      await token.mint(alice.address, toWei(1000));
      await token.connect(alice).stake(toWei(500));
      expect(await token.stakedBalance(alice.address)).to.equal(toWei(500));

      // Deposit fees as treasury role
      await token.mint(treasury.address, toWei(100));
      await token.connect(treasury).approve(await token.getAddress(), toWei(100));
      await token.grantRole(await token.TREASURY_ROLE(), treasury.address);
      await token.connect(treasury).depositFees(toWei(100));

      // Pending fees should be 100 (alice is the only staker)
      expect(await token.pendingFees(alice.address)).to.equal(toWei(100));

      await token.connect(alice).claimFees();
      expect(await token.pendingFees(alice.address)).to.equal(0n);

      // Unstake after 7-day lock
      await time.increase(7 * ONE_DAY + 1);
      await token.connect(alice).unstake(toWei(500));
      expect(await token.stakedBalance(alice.address)).to.equal(0n);
    });

    it("cannot unstake before lock period", async function () {
      const { token, alice } = await deploy();
      await token.mint(alice.address, toWei(100));
      await token.connect(alice).stake(toWei(100));
      await expect(token.connect(alice).unstake(toWei(100))).to.be.revertedWith("RWAI: lock period active");
    });

    it("bondAgent locks AGENT_BOND_AMOUNT and sets reputationBoost=10", async function () {
      const { token, alice } = await deploy();
      const bond = await token.AGENT_BOND_AMOUNT();
      await token.mint(alice.address, bond);
      await token.connect(alice).bondAgent();
      expect(await token.bondedAgents(alice.address)).to.equal(true);
      expect(await token.reputationBoost(alice.address)).to.equal(10);
    });

    it("cannot bond twice", async function () {
      const { token, alice } = await deploy();
      const bond = await token.AGENT_BOND_AMOUNT();
      await token.mint(alice.address, bond * 2n);
      await token.connect(alice).bondAgent();
      await expect(token.connect(alice).bondAgent()).to.be.revertedWith("RWAI: already bonded");
    });

    it("unbondAgent returns tokens and clears boost", async function () {
      const { token, alice } = await deploy();
      const bond = await token.AGENT_BOND_AMOUNT();
      await token.mint(alice.address, bond);
      const before = await token.balanceOf(alice.address);
      await token.connect(alice).bondAgent();
      await token.connect(alice).unbondAgent();
      expect(await token.balanceOf(alice.address)).to.equal(before);
      expect(await token.reputationBoost(alice.address)).to.equal(0);
    });

    it("slashAgent reduces bond and boosts fee pool", async function () {
      const { token, admin, alice, bob } = await deploy();
      const bond = await token.AGENT_BOND_AMOUNT();
      await token.mint(alice.address, bond);
      await token.mint(bob.address, toWei(100));

      // Bob stakes so feePool redistribution works
      await token.connect(bob).stake(toWei(100));

      await token.connect(alice).bondAgent();
      await token.grantRole(await token.TREASURY_ROLE(), admin.address);
      await token.slashAgent(alice.address, bond / 2n, "test slash");
      expect(await token.agentBonds(alice.address)).to.equal(bond / 2n);
    });

    it("protocolFee returns correct bps", async function () {
      const { token } = await deploy();
      const value = toWei(10_000);
      const normal = await token.protocolFee(value, false);
      const rwai   = await token.protocolFee(value, true);
      expect(normal).to.equal(toWei(50));  // 0.5%
      expect(rwai).to.equal(toWei(20));    // 0.2%
    });

    it("pause prevents stake", async function () {
      const { token, admin, alice } = await deploy();
      await token.mint(alice.address, toWei(100));
      await token.pause();
      await expect(token.connect(alice).stake(toWei(100))).to.be.reverted;
      await token.unpause();
      await token.connect(alice).stake(toWei(100)); // ok after unpause
    });
  });

  // ── RWAiVesting ────────────────────────────────────────────────
  describe("RWAiVesting", function () {

    async function deploy() {
      const [admin, alice, bob] = await ethers.getSigners();
      const T = await ethers.getContractFactory("RWAiToken");
      const token = await T.deploy(admin.address);
      await token.waitForDeployment();

      const V = await ethers.getContractFactory("RWAiVesting");
      const vesting = await V.deploy(await token.getAddress(), admin.address);
      await vesting.waitForDeployment();

      await token.mint(admin.address, toWei(100_000_000));
      await token.approve(await vesting.getAddress(), toWei(100_000_000));

      return { token, vesting, admin, alice, bob };
    }

    it("creates schedule and locks tokens", async function () {
      const { token, vesting, alice } = await deploy();
      const vestingAddr = await vesting.getAddress();
      const before = await token.balanceOf(vestingAddr);

      const now = await time.latest();
      await vesting.createSchedule(alice.address, toWei(1000), now, 0, ONE_YEAR, "ecosystem", false);
      expect(await token.balanceOf(vestingAddr)).to.equal(before + toWei(1000));
    });

    it("nothing vested before cliff", async function () {
      const { vesting, alice } = await deploy();
      const now = await time.latest();
      await vesting.createSchedule(alice.address, toWei(1000), now, ONE_YEAR, 4 * ONE_YEAR, "team", true);
      expect(await vesting.vestedAmount(0n)).to.equal(0n);
    });

    it("linear vesting after cliff", async function () {
      const { vesting, alice } = await deploy();
      const now = await time.latest();
      await vesting.createSchedule(alice.address, toWei(1200), now, 0, ONE_YEAR, "ecosystem", false);
      await time.increase(ONE_YEAR / 2);
      const vested = await vesting.vestedAmount(0n);
      // ~50% should be vested (allow 1-block tolerance)
      expect(vested).to.be.closeTo(toWei(600), toWei(2));
    });

    it("fully vested after duration", async function () {
      const { vesting, alice } = await deploy();
      const now = await time.latest();
      await vesting.createSchedule(alice.address, toWei(500), now, 0, ONE_YEAR, "liquidity", false);
      await time.increase(ONE_YEAR + 1);
      expect(await vesting.vestedAmount(0n)).to.equal(toWei(500));
    });

    it("beneficiary can claim vested tokens", async function () {
      const { token, vesting, alice } = await deploy();
      const now = await time.latest();
      await vesting.createSchedule(alice.address, toWei(1000), now, 0, ONE_YEAR, "community", false);
      await time.increase(ONE_YEAR);
      const before = await token.balanceOf(alice.address);
      await vesting.connect(alice).claim(0n);
      expect(await token.balanceOf(alice.address)).to.equal(before + toWei(1000));
    });

    it("non-beneficiary cannot claim", async function () {
      const { vesting, alice, bob } = await deploy();
      const now = await time.latest();
      await vesting.createSchedule(alice.address, toWei(1000), now, 0, ONE_YEAR, "team", true);
      await time.increase(ONE_YEAR);
      await expect(vesting.connect(bob).claim(0n)).to.be.revertedWith("Vesting: not beneficiary");
    });

    it("admin can revoke revocable schedule, returns unvested", async function () {
      const { token, vesting, admin, alice } = await deploy();
      const now = await time.latest();
      await vesting.createSchedule(alice.address, toWei(1000), now, 0, ONE_YEAR, "investors", true);
      await time.increase(ONE_YEAR / 2); // 50% vested
      const adminBefore = await token.balanceOf(admin.address);
      await vesting.revoke(0n);
      // ~500 returned to admin
      expect(await token.balanceOf(admin.address)).to.be.closeTo(adminBefore + toWei(500), toWei(2));
    });

    it("cannot revoke non-revocable schedule", async function () {
      const { vesting, alice } = await deploy();
      const now = await time.latest();
      await vesting.createSchedule(alice.address, toWei(1000), now, 0, ONE_YEAR, "ecosystem", false);
      await expect(vesting.revoke(0n)).to.be.revertedWith("Vesting: not revocable");
    });
  });

  // ── ProtocolTreasury ───────────────────────────────────────────
  describe("ProtocolTreasury", function () {

    async function deploy() {
      const [admin, collector, alice] = await ethers.getSigners();
      const T = await ethers.getContractFactory("RWAiToken");
      const token = await T.deploy(admin.address);
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();

      const P = await ethers.getContractFactory("ProtocolTreasury");
      const treasury = await P.deploy(tokenAddr, admin.address);
      await treasury.waitForDeployment();
      const treasuryAddr = await treasury.getAddress();

      // Wire roles
      const TREASURY_ROLE   = await token.TREASURY_ROLE();
      const COLLECTOR_ROLE  = await treasury.COLLECTOR_ROLE();
      await token.grantRole(TREASURY_ROLE, treasuryAddr);
      await treasury.grantRole(COLLECTOR_ROLE, collector.address);

      // Mint tokens to alice for fee payment
      await token.mint(alice.address, toWei(100_000));

      return { token, treasury, admin, collector, alice, treasuryAddr };
    }

    it("collectTokenizationFee stores fee and emits event", async function () {
      const { token, treasury, collector, alice, treasuryAddr } = await deploy();
      const tokenAddr = await token.getAddress();
      const fee = toWei(50); // 0.5% of 10k RWAI
      await token.connect(alice).approve(treasuryAddr, fee);
      await expect(
        treasury.connect(collector).collectTokenizationFee(toWei(10_000), false, alice.address)
      ).to.emit(treasury, "FeeCollected").withArgs("tokenization", alice.address, fee);
      expect(await treasury.pendingDistribution()).to.equal(fee);
    });

    it("RWAI discount applies correct rate (0.2%)", async function () {
      const { treasury, collector, alice, treasuryAddr, token } = await deploy();
      const fee = toWei(20); // 0.2% of 10k
      await token.connect(alice).approve(treasuryAddr, fee);
      await treasury.connect(collector).collectTokenizationFee(toWei(10_000), true, alice.address);
      expect(await treasury.pendingDistribution()).to.equal(fee);
    });

    it("distributeFees splits 70/30 and calls depositFees on token", async function () {
      const { token, treasury, collector, alice, treasuryAddr } = await deploy();

      // Stake alice first so depositFees works (token needs stakers)
      await token.mint(alice.address, toWei(1000));
      await token.connect(alice).stake(toWei(1000));

      // tradeValue = 10_000 RWAI → marketFee = 0.15% = 15 RWAI
      const marketFee = toWei(15);
      await token.connect(alice).approve(treasuryAddr, marketFee);
      await treasury.connect(collector).collectMarketFee(toWei(10_000), alice.address);
      expect(await treasury.pendingDistribution()).to.equal(marketFee);

      const before = await token.balanceOf(treasuryAddr);
      await treasury.distributeFees();
      const after = await token.balanceOf(treasuryAddr);
      // 70% of 15 RWAI (10.5) went to stakers; 30% (4.5) stays
      expect(before - after).to.be.closeTo(toWei(10.5), toWei(0.1));
    });

    it("governor can update fee params within caps", async function () {
      const { treasury } = await deploy();
      await treasury.setTokenizationFee(100, 50); // 1% / 0.5%
      const [t] = await treasury.feeParams();
      expect(t).to.equal(100n);
    });

    it("governor cannot set tokenization fee above 2%", async function () {
      const { treasury } = await deploy();
      await expect(treasury.setTokenizationFee(201, 100)).to.be.revertedWith("Treasury: exceeds cap");
    });

    it("non-collector cannot collect fees", async function () {
      const { treasury, alice } = await deploy();
      await expect(
        treasury.connect(alice).collectMarketFee(toWei(1000), alice.address)
      ).to.be.reverted;
    });
  });
});
