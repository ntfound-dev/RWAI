// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ntfound-dev (https://github.com/ntfound-dev)
// Modified versions must retain this notice. See LICENSE in root.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IYieldOracle {
    function getCurrentYield(address asset) external view returns (
        uint256 apyBps, uint256 timestamp, string memory agentNote, bool isActive
    );
}

contract PortfolioVault is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant ATLAS_ROLE = keccak256("ATLAS_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // External oracle
    IYieldOracle public yieldOracle;

    // ── Strategy-layer portfolio (Atlas bps allocations, frontend display) ──
    struct Portfolio {
        address[] assets;
        uint256[] allocations;    // basis points, sum = 10000
        uint256   riskScore;      // 1–10
        string    strategyType;   // "conservative" | "balanced" | "aggressive"
        uint256   createdAt;
        uint256   lastRebalanced;
        string    atlasReasoning; // last AI reasoning stored on-chain
    }

    mapping(address => Portfolio) private portfolioData;
    mapping(address => bool)      public  hasPortfolio;

    // ── Execution-layer allocations (AgentExecutor absolute amounts) ──
    struct AllocationRecord {
        address[] assets;
        uint256[] amounts;
        uint256   totalValue;
        uint256   timestamp;
    }

    mapping(address => mapping(address => uint256)) public vaultAllocations; // user => asset => amount
    mapping(uint256 => AllocationRecord)            public allocationRecords;
    uint256 public allocationCount;
    uint256 public rebalanceCount;

    // ── Supported assets (Mantle native RWAs) ─────────────────────
    mapping(address => bool) public supportedAssets;
    address[] public supportedAssetList;

    uint256 public constant MIN_REBALANCE_INTERVAL = 1 hours;
    mapping(address => uint256) public lastRebalance;

    // Events
    event PortfolioCreated(address indexed user, string strategyType, uint256 riskScore);
    event PortfolioRebalanced(address indexed user, uint256 timestamp, string reasoning);
    event AllocationExecuted(address indexed user, uint256 allocationId, uint256 totalValue);
    event RebalanceExecuted(address indexed user, uint256 rebalanceId);
    event AssetDeposited(address indexed user, address indexed asset, uint256 amount);
    event AssetWithdrawn(address indexed user, address indexed asset, uint256 amount);
    event SupportedAssetAdded(address indexed asset);
    event SupportedAssetRemoved(address indexed asset);

    constructor(address adminAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
        _grantRole(ADMIN_ROLE,         adminAddress);
    }

    // ── Strategy layer (Atlas bps) ─────────────────────────────────
    function createPortfolio(
        address          user,
        address[] calldata assets,
        uint256[] calldata allocations,
        uint256          riskScore,
        string  calldata strategyType,
        string  calldata atlasReasoning
    ) external onlyRole(ATLAS_ROLE) whenNotPaused {
        require(assets.length == allocations.length, "Length mismatch");
        require(riskScore >= 1 && riskScore <= 10, "Risk score 1-10");
        uint256 total;
        for (uint256 i = 0; i < allocations.length; i++) total += allocations[i];
        require(total == 10_000, "Allocations must sum to 10000 bps");

        portfolioData[user] = Portfolio({
            assets:         assets,
            allocations:    allocations,
            riskScore:      riskScore,
            strategyType:   strategyType,
            createdAt:      block.timestamp,
            lastRebalanced: block.timestamp,
            atlasReasoning: atlasReasoning
        });
        hasPortfolio[user] = true;
        emit PortfolioCreated(user, strategyType, riskScore);
    }

    function updatePortfolio(
        address          user,
        address[] calldata newAssets,
        uint256[] calldata newAllocations,
        string  calldata atlasReasoning
    ) external onlyRole(ATLAS_ROLE) whenNotPaused {
        require(hasPortfolio[user], "No portfolio");
        require(newAssets.length == newAllocations.length, "Length mismatch");
        uint256 total;
        for (uint256 i = 0; i < newAllocations.length; i++) total += newAllocations[i];
        require(total == 10_000, "Allocations must sum to 10000 bps");

        portfolioData[user].assets         = newAssets;
        portfolioData[user].allocations    = newAllocations;
        portfolioData[user].lastRebalanced = block.timestamp;
        portfolioData[user].atlasReasoning = atlasReasoning;

        emit PortfolioRebalanced(user, block.timestamp, atlasReasoning);
    }

    function getPortfolio(address user) external view returns (Portfolio memory) {
        return portfolioData[user];
    }

    // ── Execution layer (AgentExecutor absolute amounts) ───────────
    function executeAllocation(
        address   user,
        address[] calldata assets,
        uint256[] calldata amounts
    ) external onlyRole(AGENT_ROLE) whenNotPaused nonReentrant returns (uint256 allocationId) {
        require(user != address(0), "Invalid user");
        require(assets.length == amounts.length, "Length mismatch");

        uint256 totalValue;
        for (uint256 i = 0; i < assets.length; i++) {
            vaultAllocations[user][assets[i]] = amounts[i];
            totalValue += amounts[i];
        }

        allocationId = allocationCount++;
        allocationRecords[allocationId] = AllocationRecord({
            assets:     assets,
            amounts:    amounts,
            totalValue: totalValue,
            timestamp:  block.timestamp
        });

        emit AllocationExecuted(user, allocationId, totalValue);
    }

    function executeRebalance(
        address   user,
        address[] calldata fromAssets,
        address[] calldata toAssets,
        uint256[] calldata amounts
    ) external onlyRole(AGENT_ROLE) whenNotPaused nonReentrant returns (uint256 rebalanceId) {
        require(user != address(0), "Invalid user");
        require(
            fromAssets.length == toAssets.length && toAssets.length == amounts.length,
            "Length mismatch"
        );
        require(
            block.timestamp >= lastRebalance[user] + MIN_REBALANCE_INTERVAL,
            "Rebalance too frequent"
        );

        for (uint256 i = 0; i < fromAssets.length; i++) {
            vaultAllocations[user][fromAssets[i]] -= amounts[i];
            vaultAllocations[user][toAssets[i]]   += amounts[i];
        }

        lastRebalance[user] = block.timestamp;
        rebalanceId = rebalanceCount++;

        emit RebalanceExecuted(user, rebalanceId);
    }

    // ── User deposit / withdraw (real ERC20 transfers) ─────────────
    function deposit(address asset, uint256 amount)
        external whenNotPaused nonReentrant
    {
        require(supportedAssets[asset], "Asset not supported");
        require(amount > 0, "Amount must be > 0");

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        vaultAllocations[msg.sender][asset] += amount;

        emit AssetDeposited(msg.sender, asset, amount);
    }

    function withdraw(address asset, uint256 amount)
        external whenNotPaused nonReentrant
    {
        require(supportedAssets[asset], "Asset not supported");
        require(vaultAllocations[msg.sender][asset] >= amount, "Insufficient balance");

        vaultAllocations[msg.sender][asset] -= amount;
        IERC20(asset).safeTransfer(msg.sender, amount);

        emit AssetWithdrawn(msg.sender, asset, amount);
    }

    // ── Admin ──────────────────────────────────────────────────────
    function setYieldOracle(address _oracle) external onlyRole(ADMIN_ROLE) {
        require(_oracle != address(0), "Invalid oracle");
        yieldOracle = IYieldOracle(_oracle);
    }

    function addSupportedAsset(address asset) external onlyRole(ADMIN_ROLE) {
        require(asset != address(0), "Invalid asset");
        require(!supportedAssets[asset], "Already supported");
        supportedAssets[asset] = true;
        supportedAssetList.push(asset);
        emit SupportedAssetAdded(asset);
    }

    function removeSupportedAsset(address asset) external onlyRole(ADMIN_ROLE) {
        require(supportedAssets[asset], "Not supported");
        supportedAssets[asset] = false;
        for (uint256 i = 0; i < supportedAssetList.length; i++) {
            if (supportedAssetList[i] == asset) {
                supportedAssetList[i] = supportedAssetList[supportedAssetList.length - 1];
                supportedAssetList.pop();
                break;
            }
        }
        emit SupportedAssetRemoved(asset);
    }

    function getSupportedAssets() external view returns (address[] memory) {
        return supportedAssetList;
    }

    function grantAtlasRole(address atlas) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(ATLAS_ROLE, atlas);
    }

    function grantAgentRole(address agent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(AGENT_ROLE, agent);
    }

    function pause()   external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    function emergencyWithdraw(address asset, address to, uint256 amount)
        external onlyRole(ADMIN_ROLE)
    {
        IERC20(asset).safeTransfer(to, amount);
    }
}
