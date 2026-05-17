// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ntfound-dev (https://github.com/ntfound-dev)
// Modified versions must retain this notice. See LICENSE in root.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title RWAiToken ($RWAI)
 * @notice Protocol governance and fee-capture token.
 *
 * Utility:
 *  1. Governance — ERC20Votes snapshot for on-chain proposals
 *  2. Fee sharing — stake to earn 70% of protocol fees pro-rata
 *  3. Agent licensing — bond 10k RWAI to register ERC-8004 agent; slashed on malicious action
 *  4. Fee discount — tokenization fee: 0.5% → 0.2% when paid in RWAI
 *  5. Reputation boost — bonded agents start with up to +10 reputation points
 *
 * Supply: 100,000,000 RWAI — fixed, no inflation.
 * Minting is gated by MINTER_ROLE held by the Vesting + Treasury contracts.
 */
contract RWAiToken is ERC20, ERC20Permit, ERC20Votes, AccessControl, ReentrancyGuard, Pausable {

    bytes32 public constant MINTER_ROLE   = keccak256("MINTER_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    uint256 public constant MAX_SUPPLY        = 100_000_000 * 1e18;
    uint256 public constant AGENT_BOND_AMOUNT =      10_000 * 1e18;
    uint256 public constant MIN_STAKE_DURATION = 7 days;

    // Fee rates (basis points)
    uint256 public constant FEE_NORMAL_BPS = 50; // 0.5%
    uint256 public constant FEE_RWAI_BPS   = 20; // 0.2%

    // ── Staking state ──────────────────────────────────────────────
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public stakeTimestamp;
    mapping(address => uint256) public lastFeeIndex;
    uint256 public totalStaked;
    uint256 public cumulativeFeePerToken; // scaled by 1e18
    uint256 public feePool;

    // ── Agent bond state ───────────────────────────────────────────
    mapping(address => uint256) public agentBonds;
    mapping(address => bool)    public bondedAgents;
    mapping(address => uint8)   public reputationBoost; // 0–10

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event FeesClaimed(address indexed user, uint256 amount);
    event FeeDeposited(uint256 toStakers);
    event AgentBonded(address indexed agent, uint256 amount);
    event AgentUnbonded(address indexed agent, uint256 amount);
    event AgentSlashed(address indexed agent, uint256 slashed, string reason);

    constructor(address admin)
        ERC20("RWAi Protocol Token", "RWAI")
        ERC20Permit("RWAi Protocol Token")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);
    }

    // ── Supply ─────────────────────────────────────────────────────

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "RWAI: exceeds max supply");
        _mint(to, amount);
    }

    // ── Staking ────────────────────────────────────────────────────

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "RWAI: zero amount");
        _settleRewards(msg.sender);
        _transfer(msg.sender, address(this), amount);
        stakedBalance[msg.sender] += amount;
        stakeTimestamp[msg.sender] = block.timestamp;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(stakedBalance[msg.sender] >= amount, "RWAI: insufficient stake");
        require(
            block.timestamp >= stakeTimestamp[msg.sender] + MIN_STAKE_DURATION,
            "RWAI: lock period active"
        );
        _settleRewards(msg.sender);
        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;
        _transfer(address(this), msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimFees() external nonReentrant {
        _settleRewards(msg.sender);
    }

    function pendingFees(address user) external view returns (uint256) {
        if (stakedBalance[user] == 0) return 0;
        return (stakedBalance[user] * (cumulativeFeePerToken - lastFeeIndex[user])) / 1e18;
    }

    function _settleRewards(address user) internal {
        if (stakedBalance[user] == 0) {
            lastFeeIndex[user] = cumulativeFeePerToken;
            return;
        }
        uint256 pending = (stakedBalance[user] * (cumulativeFeePerToken - lastFeeIndex[user])) / 1e18;
        lastFeeIndex[user] = cumulativeFeePerToken;
        if (pending > 0 && pending <= feePool) {
            feePool -= pending;
            _transfer(address(this), user, pending);
            emit FeesClaimed(user, pending);
        }
    }

    // Called by ProtocolTreasury — deposits staker share of collected fees
    function depositFees(uint256 amount) external onlyRole(TREASURY_ROLE) {
        require(totalStaked > 0, "RWAI: no stakers");
        require(amount > 0, "RWAI: zero amount");
        _transfer(msg.sender, address(this), amount);
        feePool += amount;
        cumulativeFeePerToken += (amount * 1e18) / totalStaked;
        emit FeeDeposited(amount);
    }

    // ── Agent licensing bond ───────────────────────────────────────

    function bondAgent() external nonReentrant whenNotPaused {
        require(!bondedAgents[msg.sender], "RWAI: already bonded");
        require(balanceOf(msg.sender) >= AGENT_BOND_AMOUNT, "RWAI: insufficient balance");
        _transfer(msg.sender, address(this), AGENT_BOND_AMOUNT);
        agentBonds[msg.sender] = AGENT_BOND_AMOUNT;
        bondedAgents[msg.sender] = true;
        reputationBoost[msg.sender] = 10;
        emit AgentBonded(msg.sender, AGENT_BOND_AMOUNT);
    }

    function unbondAgent() external nonReentrant {
        require(bondedAgents[msg.sender], "RWAI: not bonded");
        uint256 amount = agentBonds[msg.sender];
        agentBonds[msg.sender] = 0;
        bondedAgents[msg.sender] = false;
        reputationBoost[msg.sender] = 0;
        _transfer(address(this), msg.sender, amount);
        emit AgentUnbonded(msg.sender, amount);
    }

    function slashAgent(address agent, uint256 slashAmount, string calldata reason)
        external onlyRole(TREASURY_ROLE)
    {
        require(agentBonds[agent] >= slashAmount, "RWAI: slash exceeds bond");
        agentBonds[agent] -= slashAmount;
        if (agentBonds[agent] == 0) {
            bondedAgents[agent] = false;
            reputationBoost[agent] = 0;
        }
        // Slashed tokens boost the staker fee pool
        if (totalStaked > 0) {
            feePool += slashAmount;
            cumulativeFeePerToken += (slashAmount * 1e18) / totalStaked;
        }
        emit AgentSlashed(agent, slashAmount, reason);
    }

    // ── Fee discount helper ────────────────────────────────────────

    function protocolFee(uint256 value, bool payInRwai) external pure returns (uint256) {
        return (value * (payInRwai ? FEE_RWAI_BPS : FEE_NORMAL_BPS)) / 10_000;
    }

    // ── Admin ──────────────────────────────────────────────────────

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ── OZ overrides ───────────────────────────────────────────────

    function _update(address from, address to, uint256 value)
        internal override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public view override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
