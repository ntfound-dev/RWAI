// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ntfound-dev (https://github.com/ntfound-dev)
// Modified versions must retain this notice. See LICENSE in root.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
// Minimal EIP-712 helpers implemented locally to avoid heavy OZ utils

/// @title HybridVault
/// @notice Hybrid vault for autonomous agents with user-owned deposits, EIP-712 consent, and capped agent execution.
contract HybridVault is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct Allowance {
        uint256 amount;
        uint256 expiry;
        uint256 dailySpent;
        uint256 dailyWindowStart;
    }

    // user => token => balance
    mapping(address => mapping(address => uint256)) public balances;

    // user => agent => token => allowance
    mapping(address => mapping(address => mapping(address => Allowance))) public allowances;

    // nonces for EIP-712 replay protection
    mapping(address => uint256) public nonces;

    // Governance-approved autonomous agent signer addresses.
    mapping(address => bool) public approvedAgents;

    // Risk controls. Max uint means "no fixed cap"; percent cap remains enabled by default.
    uint256 public perTxCap = type(uint256).max;
    uint256 public perAgentDailyCap = type(uint256).max;
    uint256 public perUserPercentCapBps = 1_000; // 10%

    bytes32 private constant _AGENT_CONSENT_TYPEHASH = keccak256("AgentConsent(address user,address agent,address token,uint256 amount,uint256 expiry,uint256 nonce)");

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event AgentAllowanceSet(address indexed user, address indexed agent, address indexed token, uint256 amount, uint256 expiry);
    event AgentAllowanceRevoked(address indexed user, address indexed agent, address indexed token);
    event AgentExecuted(address indexed user, address indexed agent, address indexed to, address token, uint256 amount, bytes32 dataHash);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event EmergencyWithdrawn(address indexed user, address indexed token, uint256 amount);
    event AgentApprovalSet(address indexed agent, bool approved);
    event RiskLimitsUpdated(uint256 perTxCap, uint256 perAgentDailyCap, uint256 perUserPercentCapBps);

    // EIP-712 domain
    bytes32 private constant _EIP712_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _NAME_HASH = keccak256("HybridVault");
    bytes32 private constant _VERSION_HASH = keccak256("1");
    bytes32 public DOMAIN_SEPARATOR;

    constructor() Ownable(msg.sender) {
        DOMAIN_SEPARATOR = keccak256(abi.encode(_EIP712_DOMAIN_TYPEHASH, _NAME_HASH, _VERSION_HASH, block.chainid, address(this)));
        approvedAgents[msg.sender] = true;
        emit AgentApprovalSet(msg.sender, true);
    }

    /// @notice Deposit ERC20 tokens into the vault
    function deposit(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(token != address(0), "zero token");
        require(amount > 0, "zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Set allowance for an agent (callable by user)
    function setAgentAllowance(address agent, address token, uint256 amount, uint256 expiry) external whenNotPaused {
        _setAllowance(msg.sender, agent, token, amount, expiry);
    }

    /// @notice Set allowance by EIP-712 signature (relayer)
    function setAgentAllowanceBySig(
        address user,
        address agent,
        address token,
        uint256 amount,
        uint256 expiry,
        uint256 nonce,
        bytes calldata signature
    ) external whenNotPaused {
        require(nonce == nonces[user], "invalid nonce");

        bytes32 structHash = keccak256(abi.encode(
            _AGENT_CONSENT_TYPEHASH,
            user,
            agent,
            token,
            amount,
            expiry,
            nonce
        ));

        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = _recoverSigner(hash, signature);
        require(signer == user, "invalid signature");

        nonces[user]++;

        _setAllowance(user, agent, token, amount, expiry);
    }

    /// @notice Revoke allowance (callable by user)
    function revokeAllowance(address agent, address token) external whenNotPaused {
        delete allowances[msg.sender][agent][token];
        emit AgentAllowanceRevoked(msg.sender, agent, token);
    }

    /// @notice Execute a token transfer on behalf of a user, subject to allowance
    /// @dev Simplified: only supports direct ERC20 transfer from vault to `to`.
    function executeOnBehalf(address user, address token, address to, uint256 amount, bytes calldata data) external nonReentrant whenNotPaused {
        require(approvedAgents[msg.sender], "agent not approved");
        require(user != address(0), "zero user");
        require(token != address(0), "zero token");
        require(to != address(0), "zero recipient");
        require(amount > 0, "zero amount");

        Allowance storage a = allowances[user][msg.sender][token];
        require(a.amount >= amount, "insufficient allowance");
        require(a.expiry == 0 || block.timestamp <= a.expiry, "allowance expired");
        require(balances[user][token] >= amount, "insufficient balance");
        _enforceRiskLimits(user, token, amount, a);

        // update state
        a.amount -= amount;
        balances[user][token] -= amount;

        // transfer token to destination
        IERC20(token).safeTransfer(to, amount);

        bytes32 dataHash = keccak256(data);
        emit AgentExecuted(user, msg.sender, to, token, amount, dataHash);
    }

    /// @notice User withdraws their tokens
    function withdraw(address token, uint256 amount) external nonReentrant {
        require(token != address(0), "zero token");
        require(amount > 0, "zero amount");
        require(balances[msg.sender][token] >= amount, "insufficient balance");

        balances[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Emergency withdraw full balance for the caller
    function emergencyWithdraw(address token) external nonReentrant whenPaused {
        require(token != address(0), "zero token");
        uint256 bal = balances[msg.sender][token];
        require(bal > 0, "no balance");
        balances[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, bal);
        emit EmergencyWithdrawn(msg.sender, token, bal);
    }

    function _setAllowance(address user, address agent, address token, uint256 amount, uint256 expiry) internal {
        require(user != address(0), "zero user");
        require(agent != address(0), "zero agent");
        require(token != address(0), "zero token");
        require(approvedAgents[agent], "agent not approved");
        require(amount > 0, "zero amount");
        require(expiry == 0 || expiry > block.timestamp, "expired allowance");

        if (perUserPercentCapBps > 0) {
            uint256 maxExposure = _percentCap(balances[user][token]);
            require(amount <= maxExposure, "allowance exceeds exposure cap");
        }

        allowances[user][agent][token] = Allowance({
            amount: amount,
            expiry: expiry,
            dailySpent: 0,
            dailyWindowStart: block.timestamp
        });
        emit AgentAllowanceSet(user, agent, token, amount, expiry);
    }

    function _enforceRiskLimits(address user, address token, uint256 amount, Allowance storage a) internal {
        require(amount <= perTxCap, "per-tx cap exceeded");

        if (perUserPercentCapBps > 0) {
            uint256 maxExposure = _percentCap(balances[user][token]);
            require(amount <= maxExposure, "percent cap exceeded");
        }

        if (block.timestamp > a.dailyWindowStart + 1 days) {
            a.dailySpent = 0;
            a.dailyWindowStart = block.timestamp;
        }
        require(a.dailySpent + amount <= perAgentDailyCap, "daily cap exceeded");
        a.dailySpent += amount;
    }

    function _percentCap(uint256 balance) internal view returns (uint256) {
        if (perUserPercentCapBps == 0) return 0;
        return (balance * perUserPercentCapBps) / 10_000;
    }

    // --- signature recovery helper (supports 65-byte signatures) ---
    function _recoverSigner(bytes32 hash, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (v < 27) {
            v += 27;
        }
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }

    /* Admin controls */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setAgentApproval(address agent, bool approved) external onlyOwner {
        require(agent != address(0), "zero agent");
        approvedAgents[agent] = approved;
        emit AgentApprovalSet(agent, approved);
    }

    function setRiskLimits(uint256 newPerTxCap, uint256 newPerAgentDailyCap, uint256 newPerUserPercentCapBps) external onlyOwner {
        require(newPerUserPercentCapBps <= 10_000, "invalid percent cap");
        perTxCap = newPerTxCap == 0 ? type(uint256).max : newPerTxCap;
        perAgentDailyCap = newPerAgentDailyCap == 0 ? type(uint256).max : newPerAgentDailyCap;
        perUserPercentCapBps = newPerUserPercentCapBps;
        emit RiskLimitsUpdated(perTxCap, perAgentDailyCap, perUserPercentCapBps);
    }
}
