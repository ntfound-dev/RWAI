// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ntfound-dev (https://github.com/ntfound-dev)
// Modified versions must retain this notice. See LICENSE in root.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title HybridVault
/// @notice Hybrid vault for autonomous agents with user-owned deposits, EIP-712 consent,
///         capped agent execution, and a timelocked destination whitelist.
///
/// Trust model
/// ───────────
/// • Users own their deposits — no owner function can pull balances directly.
/// • Agents may only transfer tokens to addresses in `approvedDestinations`.
///   Adding a new destination requires a 48-hour on-chain timelock so users
///   can see the proposal and withdraw before it takes effect.
/// • Removing a destination is instant (emergency security response).
/// • Users can withdraw() at any time regardless of pause state.
contract HybridVault is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ── Structs ───────────────────────────────────────────────────
    struct Allowance {
        uint256 amount;
        uint256 expiry;
        uint256 dailySpent;
        uint256 dailyWindowStart;
    }

    // ── State ─────────────────────────────────────────────────────
    // user => token => balance
    mapping(address => mapping(address => uint256)) public balances;

    // user => agent => token => allowance
    mapping(address => mapping(address => mapping(address => Allowance))) public allowances;

    // nonces for EIP-712 replay protection
    mapping(address => uint256) public nonces;

    // Governance-approved autonomous agent signer addresses
    mapping(address => bool) public approvedAgents;

    // ── Destination whitelist ─────────────────────────────────────
    // Agents may only call executeOnBehalf with a `to` address that is
    // in this set. Prevents agents (even if key is compromised) from
    // draining funds to arbitrary wallets.
    mapping(address => bool) public approvedDestinations;

    // Timelock: adding a destination requires a 48-hour proposal period.
    // dest => timestamp when it may be committed (0 = not proposed).
    mapping(address => uint256) public pendingDestinations;

    // 48 hours gives users enough time to see the proposal on-chain and exit.
    uint256 public constant DESTINATION_TIMELOCK = 48 hours;

    // ── Risk controls ─────────────────────────────────────────────
    // Max uint means "no fixed cap"; percent cap remains enabled by default.
    uint256 public perTxCap = type(uint256).max;
    uint256 public perAgentDailyCap = type(uint256).max;
    uint256 public perUserPercentCapBps = 1_000; // 10%

    // ── EIP-712 ───────────────────────────────────────────────────
    bytes32 private constant _AGENT_CONSENT_TYPEHASH =
        keccak256("AgentConsent(address user,address agent,address token,uint256 amount,uint256 expiry,uint256 nonce)");
    bytes32 private constant _EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _NAME_HASH    = keccak256("HybridVault");
    bytes32 private constant _VERSION_HASH = keccak256("1");
    bytes32 public DOMAIN_SEPARATOR;

    // ── Events ────────────────────────────────────────────────────
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event AgentAllowanceSet(address indexed user, address indexed agent, address indexed token, uint256 amount, uint256 expiry);
    event AgentAllowanceRevoked(address indexed user, address indexed agent, address indexed token);
    event AgentExecuted(address indexed user, address indexed agent, address indexed to, address token, uint256 amount, bytes32 dataHash);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event EmergencyWithdrawn(address indexed user, address indexed token, uint256 amount);
    event AgentApprovalSet(address indexed agent, bool approved);
    event RiskLimitsUpdated(uint256 perTxCap, uint256 perAgentDailyCap, uint256 perUserPercentCapBps);

    // Destination whitelist events (on-chain transparency for users)
    event DestinationProposed(address indexed dest, uint256 unlockTime);
    event DestinationCommitted(address indexed dest);
    event DestinationProposalCancelled(address indexed dest);
    event DestinationRevoked(address indexed dest);

    // ── Constructor ───────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            _EIP712_DOMAIN_TYPEHASH, _NAME_HASH, _VERSION_HASH, block.chainid, address(this)
        ));
        approvedAgents[msg.sender] = true;
        emit AgentApprovalSet(msg.sender, true);
    }

    // ── User-facing ───────────────────────────────────────────────

    /// @notice Deposit ERC20 tokens into the vault.
    function deposit(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(token  != address(0), "zero token");
        require(amount > 0,           "zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Grant an agent allowance (direct call by user).
    function setAgentAllowance(address agent, address token, uint256 amount, uint256 expiry) external whenNotPaused {
        _setAllowance(msg.sender, agent, token, amount, expiry);
    }

    /// @notice Grant an agent allowance via EIP-712 signature (gasless / relayer).
    function setAgentAllowanceBySig(
        address user, address agent, address token,
        uint256 amount, uint256 expiry, uint256 nonce,
        bytes calldata signature
    ) external whenNotPaused {
        require(nonce == nonces[user], "invalid nonce");

        bytes32 structHash = keccak256(abi.encode(
            _AGENT_CONSENT_TYPEHASH, user, agent, token, amount, expiry, nonce
        ));
        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        require(_recoverSigner(hash, signature) == user, "invalid signature");

        nonces[user]++;
        _setAllowance(user, agent, token, amount, expiry);
    }

    /// @notice Revoke an agent's allowance (callable by user at any time).
    function revokeAllowance(address agent, address token) external {
        delete allowances[msg.sender][agent][token];
        emit AgentAllowanceRevoked(msg.sender, agent, token);
    }

    /// @notice Withdraw tokens (not pausable — users can always exit).
    function withdraw(address token, uint256 amount) external nonReentrant {
        require(token  != address(0), "zero token");
        require(amount > 0,           "zero amount");
        require(balances[msg.sender][token] >= amount, "insufficient balance");
        balances[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Emergency full withdrawal — only callable when contract is paused.
    function emergencyWithdraw(address token) external nonReentrant whenPaused {
        require(token != address(0), "zero token");
        uint256 bal = balances[msg.sender][token];
        require(bal > 0, "no balance");
        balances[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, bal);
        emit EmergencyWithdrawn(msg.sender, token, bal);
    }

    // ── Agent execution ───────────────────────────────────────────

    /// @notice Execute a capped token transfer on behalf of a user.
    /// @dev `to` must be in approvedDestinations — agents cannot send to
    ///      arbitrary addresses, which closes the insider-drain vector.
    function executeOnBehalf(
        address user, address token, address to, uint256 amount, bytes calldata data
    ) external nonReentrant whenNotPaused {
        require(approvedAgents[msg.sender],    "agent not approved");
        require(approvedDestinations[to],       "destination not whitelisted");
        require(user   != address(0),           "zero user");
        require(token  != address(0),           "zero token");
        require(to     != address(0),           "zero recipient");
        require(amount > 0,                     "zero amount");

        Allowance storage a = allowances[user][msg.sender][token];
        require(a.amount >= amount,                                 "insufficient allowance");
        require(a.expiry == 0 || block.timestamp <= a.expiry,      "allowance expired");
        require(balances[user][token] >= amount,                    "insufficient balance");
        _enforceRiskLimits(user, token, amount, a);

        a.amount              -= amount;
        balances[user][token] -= amount;

        IERC20(token).safeTransfer(to, amount);
        emit AgentExecuted(user, msg.sender, to, token, amount, keccak256(data));
    }

    // ── Destination whitelist admin (timelocked adds, instant removes) ──

    /// @notice Propose a new approved destination. Starts the 48-hour timelock.
    /// @dev Anyone watching the chain can see this and withdraw before it commits.
    function proposeDestination(address dest) external onlyOwner {
        require(dest != address(0),          "zero address");
        require(!approvedDestinations[dest], "already approved");
        uint256 unlockTime = block.timestamp + DESTINATION_TIMELOCK;
        pendingDestinations[dest] = unlockTime;
        emit DestinationProposed(dest, unlockTime);
    }

    /// @notice Commit a proposed destination after the 48-hour timelock has elapsed.
    function commitDestination(address dest) external onlyOwner {
        uint256 unlockTime = pendingDestinations[dest];
        require(unlockTime != 0,                   "not proposed");
        require(block.timestamp >= unlockTime,     "timelock not elapsed");
        delete pendingDestinations[dest];
        approvedDestinations[dest] = true;
        emit DestinationCommitted(dest);
    }

    /// @notice Cancel a pending destination proposal before it commits.
    function cancelDestinationProposal(address dest) external onlyOwner {
        require(pendingDestinations[dest] != 0, "not proposed");
        delete pendingDestinations[dest];
        emit DestinationProposalCancelled(dest);
    }

    /// @notice Instantly remove an approved destination (emergency security response).
    function revokeDestination(address dest) external onlyOwner {
        require(approvedDestinations[dest], "not approved");
        approvedDestinations[dest] = false;
        emit DestinationRevoked(dest);
    }

    // ── Owner controls ────────────────────────────────────────────

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setAgentApproval(address agent, bool approved) external onlyOwner {
        require(agent != address(0), "zero agent");
        approvedAgents[agent] = approved;
        emit AgentApprovalSet(agent, approved);
    }

    function setRiskLimits(
        uint256 newPerTxCap, uint256 newPerAgentDailyCap, uint256 newPerUserPercentCapBps
    ) external onlyOwner {
        require(newPerUserPercentCapBps <= 10_000, "invalid percent cap");
        perTxCap          = newPerTxCap == 0          ? type(uint256).max : newPerTxCap;
        perAgentDailyCap  = newPerAgentDailyCap == 0  ? type(uint256).max : newPerAgentDailyCap;
        perUserPercentCapBps = newPerUserPercentCapBps;
        emit RiskLimitsUpdated(perTxCap, perAgentDailyCap, perUserPercentCapBps);
    }

    // ── Internal helpers ──────────────────────────────────────────

    function _setAllowance(
        address user, address agent, address token, uint256 amount, uint256 expiry
    ) internal {
        require(user  != address(0), "zero user");
        require(agent != address(0), "zero agent");
        require(token != address(0), "zero token");
        require(approvedAgents[agent], "agent not approved");
        require(amount > 0,            "zero amount");
        require(expiry == 0 || expiry > block.timestamp, "expired allowance");

        if (perUserPercentCapBps > 0) {
            require(amount <= _percentCap(balances[user][token]), "allowance exceeds exposure cap");
        }

        allowances[user][agent][token] = Allowance({
            amount:           amount,
            expiry:           expiry,
            dailySpent:       0,
            dailyWindowStart: block.timestamp
        });
        emit AgentAllowanceSet(user, agent, token, amount, expiry);
    }

    function _enforceRiskLimits(
        address user, address token, uint256 amount, Allowance storage a
    ) internal {
        require(amount <= perTxCap, "per-tx cap exceeded");

        if (perUserPercentCapBps > 0) {
            require(amount <= _percentCap(balances[user][token]), "percent cap exceeded");
        }

        if (block.timestamp > a.dailyWindowStart + 1 days) {
            a.dailySpent       = 0;
            a.dailyWindowStart = block.timestamp;
        }
        require(a.dailySpent + amount <= perAgentDailyCap, "daily cap exceeded");
        a.dailySpent += amount;
    }

    function _percentCap(uint256 balance) internal view returns (uint256) {
        if (perUserPercentCapBps == 0) return 0;
        return (balance * perUserPercentCapBps) / 10_000;
    }

    function _recoverSigner(bytes32 hash, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }
}
