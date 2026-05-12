// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IERC8004IdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IERC8004ReputationRegistry {
    function postFeedback(
        uint256 agentId,
        address agentRegistry,
        int256  score,
        string  calldata tag,
        string  calldata feedbackURI
    ) external;
}

contract AgentReputationManager is AccessControl, Pausable {

    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN_ROLE");

    // ERC-8004 official Mantle Testnet addresses
    IERC8004ReputationRegistry public immutable ERC8004_REPUTATION;
    address                     public immutable ERC8004_IDENTITY;

    // Agent IDs on ERC-8004
    uint256 public nexusAgentId;
    uint256 public shieldAgentId;
    uint256 public yieldAgentId;
    uint256 public atlasAgentId;

    // Autonomy levels: 1=restricted, 2=limited, 3=medium, 4=full
    uint256 public constant REPUTATION_FULL    = 90;
    uint256 public constant REPUTATION_MEDIUM  = 70;
    uint256 public constant REPUTATION_LIMITED = 50;

    // On-chain reputation score (mirrored from ERC-8004 for gas efficiency)
    mapping(uint256 => uint256) public localScore;    // agentId => score (0-100, starts at 75)
    mapping(uint256 => uint256) public actionCount;   // agentId => total actions

    // Reputation deltas per action type
    mapping(bytes32 => int256) public actionDelta;

    event ReputationUpdated(uint256 indexed agentId, string action, int256 delta, uint256 newScore);
    event AutonomyLevelChanged(uint256 indexed agentId, uint8 oldLevel, uint8 newLevel);
    event AgentIdsSet(uint256 nexus, uint256 shield, uint256 yield_, uint256 atlas);

    constructor(address reputationRegistry, address identityRegistry, address admin) {
        ERC8004_REPUTATION = IERC8004ReputationRegistry(reputationRegistry);
        ERC8004_IDENTITY   = identityRegistry;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE,         admin);

        // Initialize action deltas
        actionDelta[keccak256("tokenize_success")]    = 10;
        actionDelta[keccak256("compliance_check")]    = 8;
        actionDelta[keccak256("yield_update")]        = 5;
        actionDelta[keccak256("portfolio_created")]   = 10;
        actionDelta[keccak256("portfolio_rebalance")] = 15;
        actionDelta[keccak256("transaction_failure")] = -20;
        actionDelta[keccak256("compliance_violation")]= -50;
    }

    // ── Agent setup ───────────────────────────────────────────────
    function setAgentIds(uint256 _nexus, uint256 _shield, uint256 _yield, uint256 _atlas)
        external onlyRole(ADMIN_ROLE)
    {
        nexusAgentId  = _nexus;
        shieldAgentId = _shield;
        yieldAgentId  = _yield;
        atlasAgentId  = _atlas;

        // Initialize starting scores
        localScore[_nexus]  = 75;
        localScore[_shield] = 75;
        localScore[_yield]  = 75;
        localScore[_atlas]  = 75;

        emit AgentIdsSet(_nexus, _shield, _yield, _atlas);
    }

    // ── Reputation update (called by AgentExecutor) ───────────────
    function updateReputation(uint256 agentId, string calldata action)
        external onlyRole(AGENT_ROLE) whenNotPaused
    {
        int256 delta = actionDelta[keccak256(abi.encodePacked(action))];

        uint8 oldLevel = getAutonomyLevel(agentId);

        // Update local score (clamped 0–100)
        int256 current = int256(localScore[agentId]);
        int256 updated = current + delta;
        if (updated < 0)   updated = 0;
        if (updated > 100) updated = 100;
        localScore[agentId]  = uint256(updated);
        actionCount[agentId] += 1;

        uint8 newLevel = getAutonomyLevel(agentId);
        if (newLevel != oldLevel) {
            emit AutonomyLevelChanged(agentId, oldLevel, newLevel);
        }

        emit ReputationUpdated(agentId, action, delta, uint256(updated));

        // Mirror to ERC-8004 (silent fail — local state already updated)
        if (agentId != 0) {
            bytes memory data = abi.encodeWithSelector(
                IERC8004ReputationRegistry.postFeedback.selector,
                agentId, ERC8004_IDENTITY, delta, action, ""
            );
            (bool _ok,) = address(ERC8004_REPUTATION).call(data);
            if (_ok) {} // silence unused warning
        }
    }

    // ── Autonomy levels ───────────────────────────────────────────
    function getAutonomyLevel(uint256 agentId) public view returns (uint8) {
        uint256 score = localScore[agentId];
        if (score >= REPUTATION_FULL)    return 4; // full autonomy
        if (score >= REPUTATION_MEDIUM)  return 3; // medium autonomy
        if (score >= REPUTATION_LIMITED) return 2; // limited
        return 1;                                   // restricted
    }

    function canActAutonomously(uint256 agentId, uint256 valueWei, uint256 limitWei)
        external view returns (bool)
    {
        uint8 level = getAutonomyLevel(agentId);
        if (level == 1) return false;
        if (level == 2) return valueWei <= limitWei / 4;
        if (level == 3) return valueWei <= limitWei / 2;
        return valueWei <= limitWei;
    }

    function grantAgentRole(address agent) external onlyRole(ADMIN_ROLE) {
        _grantRole(AGENT_ROLE, agent);
    }

    function pause()   external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }
}
