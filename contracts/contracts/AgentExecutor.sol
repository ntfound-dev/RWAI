// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ntfound-dev (https://github.com/ntfound-dev)
// Modified versions must retain this notice. See LICENSE in root.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IAgentReputationManager {
    function updateReputation(uint256 agentId, string calldata action) external;
    function getAutonomyLevel(uint256 agentId) external view returns (uint8);
}

interface IPortfolioVault {
    function executeAllocation(address user, address[] calldata assets, uint256[] calldata amounts)
        external returns (uint256 allocationId);
    function executeRebalance(address user, address[] calldata fromAssets, address[] calldata toAssets, uint256[] calldata amounts)
        external returns (uint256 rebalanceId);
}

contract AgentExecutor is AccessControl, ReentrancyGuard, Pausable {

    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // External contracts
    IAgentReputationManager public reputationManager;
    IPortfolioVault         public portfolioVault;

    // Per-agent autonomy limits (set by admin after deployment)
    mapping(uint256 => uint256) public agentTransactionLimits; // max value per tx
    mapping(uint256 => uint256) public agentDailyLimits;       // max value per day
    mapping(uint256 => uint256) public agentDailyUsage;        // current day usage
    mapping(uint256 => uint256) public agentLastResetDay;      // last day usage was reset

    // High-value action approval flow
    uint256 public constant HIGH_VALUE_THRESHOLD = 10_000 * 1e18; // $10k equivalent
    mapping(uint256 => bool) public highValueActionApproved;

    struct AgentAction {
        uint256 agentId;
        string  agentName;    // "nexus" | "shield" | "yield" | "atlas"
        string  actionType;
        string  aiReasoning;  // stored permanently on Mantle
        bytes   actionData;
        address triggeredBy;
        uint256 timestamp;
        uint256 blockNumber;
        bool    success;
        string  errorMessage;
    }

    mapping(uint256 => AgentAction) public actionLog;
    uint256 public actionCount;

    event AgentActionExecuted(uint256 indexed actionId, uint256 indexed agentId, string agentName, string actionType, bool success);
    event PortfolioAllocated(address indexed user, uint256 actionId);
    event PortfolioRebalanced(address indexed user, uint256 actionId);
    event HighValueActionQueued(uint256 indexed actionId, uint256 agentId, uint256 value);
    event AgentIdsSet(uint256 nexus, uint256 shield, uint256 yield_, uint256 atlas);
    event AutonomyLimitExceeded(uint256 indexed agentId, uint256 attempted, uint256 limit);

    constructor(address adminAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
        _grantRole(ADMIN_ROLE,         adminAddress);
    }

    // ── NEXUS ──────────────────────────────────────────────────────
    function logTokenization(
        uint256 agentId,
        uint256 assetId,
        address tokenAddress,
        string calldata aiReasoning
    ) external onlyRole(AGENT_ROLE) whenNotPaused returns (uint256 actionId) {
        require(_checkAutonomy(agentId, 0), "Insufficient autonomy");
        actionId = _log(agentId, "nexus", "tokenize", aiReasoning, abi.encode(assetId, tokenAddress), true, "");
        _reputation(agentId, "tokenize_success");
    }

    // ── SHIELD ─────────────────────────────────────────────────────
    function logComplianceReview(
        uint256 agentId,
        uint256 assetId,
        uint256 score,
        string calldata aiReasoning
    ) external onlyRole(AGENT_ROLE) whenNotPaused returns (uint256 actionId) {
        require(_checkAutonomy(agentId, 0), "Insufficient autonomy");
        actionId = _log(agentId, "shield", "compliance_review", aiReasoning, abi.encode(assetId, score), true, "");
        _reputation(agentId, "compliance_check");
    }

    // ── YIELD ──────────────────────────────────────────────────────
    function recordYieldSnapshot(
        uint256 agentId,
        address[] calldata assetAddresses,
        uint256[] calldata apysBps,
        string calldata agentSummary
    ) external onlyRole(AGENT_ROLE) whenNotPaused returns (uint256 actionId) {
        require(assetAddresses.length == apysBps.length, "Length mismatch");
        require(_checkAutonomy(agentId, 0), "Insufficient autonomy");
        actionId = _log(agentId, "yield", "yield_snapshot", agentSummary, abi.encode(assetAddresses, apysBps), true, "");
        _reputation(agentId, "yield_update");
    }

    // ── ATLAS ──────────────────────────────────────────────────────
    function executeAllocation(
        uint256 agentId,
        address user,
        address[] calldata assets,
        uint256[] calldata amounts,
        string calldata aiReasoning
    ) external onlyRole(AGENT_ROLE) whenNotPaused nonReentrant returns (uint256 actionId) {
        require(assets.length == amounts.length, "Length mismatch");
        uint256 totalValue = _sum(amounts);
        require(_checkAutonomy(agentId, totalValue), "Insufficient autonomy");
        _checkDailyLimit(agentId, totalValue);

        if (address(portfolioVault) != address(0)) {
            try portfolioVault.executeAllocation(user, assets, amounts) returns (uint256) {
                actionId = _log(agentId, "atlas", "initial_allocation", aiReasoning, abi.encode(user, assets, amounts), true, "");
                _reputation(agentId, "portfolio_created");
                agentDailyUsage[agentId] += totalValue;
            } catch Error(string memory reason) {
                actionId = _log(agentId, "atlas", "initial_allocation", aiReasoning, abi.encode(user, assets, amounts), false, reason);
                _reputation(agentId, "transaction_failure");
            }
        } else {
            actionId = _log(agentId, "atlas", "initial_allocation", aiReasoning, abi.encode(user, assets, amounts), true, "");
            _reputation(agentId, "portfolio_created");
            agentDailyUsage[agentId] += totalValue;
        }

        emit PortfolioAllocated(user, actionId);
    }

    function executeRebalance(
        uint256 agentId,
        address user,
        address[] calldata fromAssets,
        address[] calldata toAssets,
        uint256[] calldata amounts,
        string calldata aiReasoning
    ) external onlyRole(AGENT_ROLE) whenNotPaused nonReentrant returns (uint256 actionId) {
        require(
            fromAssets.length == toAssets.length && toAssets.length == amounts.length,
            "Length mismatch"
        );
        uint256 totalValue = _sum(amounts);
        require(_checkAutonomy(agentId, totalValue), "Insufficient autonomy");

        // Queue high-value rebalances for admin approval
        if (totalValue >= HIGH_VALUE_THRESHOLD) {
            actionId = _log(agentId, "atlas", "high_value_rebalance", aiReasoning, abi.encode(user, fromAssets, toAssets, amounts), false, "Awaiting approval");
            highValueActionApproved[actionId] = false;
            emit HighValueActionQueued(actionId, agentId, totalValue);
            return actionId;
        }

        _checkDailyLimit(agentId, totalValue);

        if (address(portfolioVault) != address(0)) {
            try portfolioVault.executeRebalance(user, fromAssets, toAssets, amounts) returns (uint256) {
                actionId = _log(agentId, "atlas", "rebalance", aiReasoning, abi.encode(user, fromAssets, toAssets, amounts), true, "");
                _reputation(agentId, "portfolio_rebalance");
                agentDailyUsage[agentId] += totalValue;
            } catch Error(string memory reason) {
                actionId = _log(agentId, "atlas", "rebalance", aiReasoning, abi.encode(user, fromAssets, toAssets, amounts), false, reason);
                _reputation(agentId, "transaction_failure");
            }
        } else {
            actionId = _log(agentId, "atlas", "rebalance", aiReasoning, abi.encode(user, fromAssets, toAssets, amounts), true, "");
            _reputation(agentId, "portfolio_rebalance");
            agentDailyUsage[agentId] += totalValue;
        }

        emit PortfolioRebalanced(user, actionId);
    }

    function approveHighValueAction(uint256 actionId) external onlyRole(ADMIN_ROLE) {
        require(!highValueActionApproved[actionId], "Already approved");
        AgentAction storage action = actionLog[actionId];
        require(!action.success, "Already executed");
        highValueActionApproved[actionId] = true;

        if (address(portfolioVault) != address(0)) {
            (address user, address[] memory fromAssets, address[] memory toAssets, uint256[] memory amounts) =
                abi.decode(action.actionData, (address, address[], address[], uint256[]));
            try portfolioVault.executeRebalance(user, fromAssets, toAssets, amounts) {
                action.success = true;
                action.errorMessage = "";
            } catch Error(string memory reason) {
                action.errorMessage = reason;
            }
        }
    }

    // ── INTERNAL ───────────────────────────────────────────────────
    function _log(
        uint256 agentId,
        string memory agentName,
        string memory actionType,
        string memory reasoning,
        bytes  memory data,
        bool   success,
        string memory errorMsg
    ) internal returns (uint256 actionId) {
        actionId = actionCount++;
        actionLog[actionId] = AgentAction({
            agentId:      agentId,
            agentName:    agentName,
            actionType:   actionType,
            aiReasoning:  reasoning,
            actionData:   data,
            triggeredBy:  msg.sender,
            timestamp:    block.timestamp,
            blockNumber:  block.number,
            success:      success,
            errorMessage: errorMsg
        });
        emit AgentActionExecuted(actionId, agentId, agentName, actionType, success);
    }

    // When reputationManager is not set, bypass autonomy check (unrestricted)
    function _checkAutonomy(uint256 agentId, uint256 value) internal view returns (bool) {
        if (address(reputationManager) == address(0)) return true;
        uint8 level = reputationManager.getAutonomyLevel(agentId);
        if (level == 1) return false;
        uint256 limit = agentTransactionLimits[agentId];
        if (level == 2) return value <= limit / 4;
        if (level == 3) return value <= limit / 2;
        return value <= limit;
    }

    function _checkDailyLimit(uint256 agentId, uint256 value) internal {
        uint256 today = block.timestamp / 1 days;
        if (agentLastResetDay[agentId] < today) {
            agentDailyUsage[agentId]    = 0;
            agentLastResetDay[agentId]  = today;
        }
        uint256 dailyLimit = agentDailyLimits[agentId];
        if (dailyLimit > 0) {
            require(agentDailyUsage[agentId] + value <= dailyLimit, "Daily limit exceeded");
        }
    }

    function _reputation(uint256 agentId, string memory action) internal {
        if (address(reputationManager) == address(0)) return;
        bytes memory data = abi.encodeWithSelector(
            IAgentReputationManager.updateReputation.selector,
            agentId, action
        );
        (bool _ok, ) = address(reputationManager).call(data);
        if (_ok) {}
    }

    function _sum(uint256[] calldata amounts) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < amounts.length; i++) total += amounts[i];
    }

    // ── ADMIN ──────────────────────────────────────────────────────
    function setReputationManager(address _rm) external onlyRole(ADMIN_ROLE) {
        reputationManager = IAgentReputationManager(_rm);
    }

    function setPortfolioVault(address _vault) external onlyRole(ADMIN_ROLE) {
        require(_vault != address(0), "Invalid vault");
        portfolioVault = IPortfolioVault(_vault);
    }

    function setAgentLimits(uint256 agentId, uint256 txLimit, uint256 dailyLimit)
        external onlyRole(ADMIN_ROLE)
    {
        agentTransactionLimits[agentId] = txLimit;
        agentDailyLimits[agentId]       = dailyLimit;
    }

    function resetDailyLimits(uint256 agentId) external onlyRole(ADMIN_ROLE) {
        agentDailyUsage[agentId] = 0;
    }

    function setAgentIds(uint256 _nexus, uint256 _shield, uint256 _yield, uint256 _atlas)
        external onlyRole(ADMIN_ROLE)
    {
        emit AgentIdsSet(_nexus, _shield, _yield, _atlas);
    }

    function grantAgentRole(address agent) external onlyRole(ADMIN_ROLE) {
        _grantRole(AGENT_ROLE, agent);
    }

    function pause()   external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }
}
