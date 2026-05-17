// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IRWAiTokenFees {
    function depositFees(uint256 amount) external;
}

/**
 * @title ProtocolTreasury
 * @notice Collects all protocol fees and distributes them:
 *         70% → RWAI stakers (via RWAiToken.depositFees)
 *         30% → retained in treasury for DAO spend
 *
 * Fee streams:
 *  1. Tokenization fee  0.5% of stated asset value  (0.2% if paid in RWAI)
 *  2. AUM fee           0.3% / year on HybridVault deposits (pro-rated)
 *  3. Market fee        0.15% of trade value
 *
 * All fee rates are governance-updatable within hard caps.
 */
contract ProtocolTreasury is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");
    bytes32 public constant GOVERNOR_ROLE  = keccak256("GOVERNOR_ROLE");

    IERC20          public immutable rwaiToken;
    IRWAiTokenFees  public immutable rwaiStaking; // same address — RWAiToken implements both

    uint256 public constant STAKER_SHARE_BPS   = 7_000; // 70% to stakers
    uint256 public constant MAX_TOKENIZE_BPS   =   200; // 2% hard cap
    uint256 public constant MAX_AUM_BPS        =   100; // 1%/yr hard cap
    uint256 public constant MAX_MARKET_BPS     =   100; // 1% hard cap

    // Fee parameters (governance-updatable)
    uint256 public tokenizationFeeBps     = 50; // 0.5%
    uint256 public tokenizationFeeRwaiBps = 20; // 0.2% (RWAI discount)
    uint256 public aumFeeBpsPerYear       = 30; // 0.3%/yr
    uint256 public marketFeeBps           = 15; // 0.15%

    // Stats
    uint256 public totalCollected;
    uint256 public totalDistributedToStakers;
    uint256 public pendingDistribution; // accumulated, not yet distributed

    event FeeCollected(string indexed feeType, address indexed payer, uint256 amount);
    event FeesDistributed(uint256 toStakers, uint256 retainedInTreasury);
    event FeeParamUpdated(string param, uint256 newValue);

    constructor(address rwaiTokenAddr, address admin) {
        require(rwaiTokenAddr != address(0), "Treasury: zero token");
        require(admin         != address(0), "Treasury: zero admin");
        rwaiToken   = IERC20(rwaiTokenAddr);
        rwaiStaking = IRWAiTokenFees(rwaiTokenAddr);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNOR_ROLE,      admin);
    }

    // ── Fee collection (called by AgentExecutor / HybridVault / Market) ──

    /**
     * @notice Collect tokenization fee at asset listing.
     * @param assetValueRwai  Value of the tokenized asset denominated in RWAI
     * @param payInRwai       If true, applies the RWAI discount rate
     * @param payer           Asset owner paying the fee
     */
    function collectTokenizationFee(
        uint256 assetValueRwai,
        bool    payInRwai,
        address payer
    ) external onlyRole(COLLECTOR_ROLE) whenNotPaused returns (uint256 feeAmount) {
        uint256 bps = payInRwai ? tokenizationFeeRwaiBps : tokenizationFeeBps;
        feeAmount = (assetValueRwai * bps) / 10_000;
        if (feeAmount == 0) return 0;

        rwaiToken.safeTransferFrom(payer, address(this), feeAmount);
        totalCollected     += feeAmount;
        pendingDistribution += feeAmount;

        emit FeeCollected("tokenization", payer, feeAmount);
    }

    /**
     * @notice Collect pro-rated AUM fee from HybridVault.
     * @param aumRwai          Current AUM in RWAI terms
     * @param durationSeconds  Seconds since last fee collection
     * @param payer            Vault address (transfers from vault)
     */
    function collectAumFee(
        uint256 aumRwai,
        uint256 durationSeconds,
        address payer
    ) external onlyRole(COLLECTOR_ROLE) whenNotPaused returns (uint256 feeAmount) {
        feeAmount = (aumRwai * aumFeeBpsPerYear * durationSeconds) / (10_000 * 365 days);
        if (feeAmount == 0) return 0;

        rwaiToken.safeTransferFrom(payer, address(this), feeAmount);
        totalCollected      += feeAmount;
        pendingDistribution += feeAmount;

        emit FeeCollected("aum", payer, feeAmount);
    }

    /**
     * @notice Collect market transaction fee on buy/sell.
     * @param tradeValueRwai  Trade value denominated in RWAI
     * @param payer           Buyer or seller paying the fee
     */
    function collectMarketFee(
        uint256 tradeValueRwai,
        address payer
    ) external onlyRole(COLLECTOR_ROLE) whenNotPaused returns (uint256 feeAmount) {
        feeAmount = (tradeValueRwai * marketFeeBps) / 10_000;
        if (feeAmount == 0) return 0;

        rwaiToken.safeTransferFrom(payer, address(this), feeAmount);
        totalCollected      += feeAmount;
        pendingDistribution += feeAmount;

        emit FeeCollected("market", payer, feeAmount);
    }

    // ── Distribution ───────────────────────────────────────────────

    /**
     * @notice Distribute accumulated fees: 70% → stakers, 30% stays here.
     *         Can be called by anyone (incentivises regular distribution).
     */
    function distributeFees() external nonReentrant whenNotPaused {
        uint256 amount = pendingDistribution;
        require(amount > 0, "Treasury: nothing to distribute");

        pendingDistribution = 0;

        uint256 toStakers  = (amount * STAKER_SHARE_BPS) / 10_000;
        uint256 toTreasury = amount - toStakers;

        if (toStakers > 0) {
            rwaiToken.approve(address(rwaiStaking), toStakers);
            rwaiStaking.depositFees(toStakers);
            totalDistributedToStakers += toStakers;
        }

        emit FeesDistributed(toStakers, toTreasury);
    }

    // ── Governance: update fee parameters ─────────────────────────

    function setTokenizationFee(uint256 normalBps, uint256 rwaiBps)
        external onlyRole(GOVERNOR_ROLE)
    {
        require(normalBps <= MAX_TOKENIZE_BPS, "Treasury: exceeds cap");
        require(rwaiBps   <= normalBps,        "Treasury: rwai must be <= normal");
        tokenizationFeeBps     = normalBps;
        tokenizationFeeRwaiBps = rwaiBps;
        emit FeeParamUpdated("tokenizationFee",     normalBps);
        emit FeeParamUpdated("tokenizationFeeRwai", rwaiBps);
    }

    function setAumFee(uint256 bpsPerYear) external onlyRole(GOVERNOR_ROLE) {
        require(bpsPerYear <= MAX_AUM_BPS, "Treasury: exceeds cap");
        aumFeeBpsPerYear = bpsPerYear;
        emit FeeParamUpdated("aumFee", bpsPerYear);
    }

    function setMarketFee(uint256 bps) external onlyRole(GOVERNOR_ROLE) {
        require(bps <= MAX_MARKET_BPS, "Treasury: exceeds cap");
        marketFeeBps = bps;
        emit FeeParamUpdated("marketFee", bps);
    }

    // ── Admin emergency ────────────────────────────────────────────

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function emergencyWithdraw(address tokenAddr, address to, uint256 amount)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        IERC20(tokenAddr).safeTransfer(to, amount);
    }

    // ── Views ──────────────────────────────────────────────────────

    function treasuryBalance() external view returns (uint256) {
        return rwaiToken.balanceOf(address(this));
    }

    function feeParams() external view returns (
        uint256 tokenize,
        uint256 tokenizeRwai,
        uint256 aumPerYear,
        uint256 market
    ) {
        return (tokenizationFeeBps, tokenizationFeeRwaiBps, aumFeeBpsPerYear, marketFeeBps);
    }
}
