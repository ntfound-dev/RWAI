// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ntfound-dev (https://github.com/ntfound-dev)
// Modified versions must retain this notice. See LICENSE in root.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract ComplianceLog is AccessControl, Pausable {

    bytes32 public constant SHIELD_ROLE     = keccak256("SHIELD_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant ADMIN_ROLE      = keccak256("ADMIN_ROLE");

    struct WalletRecord {
        bool    allowed;
        uint256 riskScore;    // 0–100 (0 = clean, 100 = sanctioned)
        string  reason;
        bytes32 evidenceHash; // IPFS hash of KYC / AML evidence
        uint256 lastUpdate;
        address updatedBy;
    }

    struct AssetCompliance {
        uint256 complianceScore; // 0–100
        bytes32 documentHash;
        string  complianceReport; // AI-generated Shield analysis
        uint256 lastReview;
        address reviewedBy;
        bool    requiresReview;  // flagged if score < 70 or > 95
    }

    mapping(address => WalletRecord)    public walletRecords;
    mapping(uint256 => AssetCompliance) public assetCompliance;
    mapping(address => bool)            public sanctionedWallets;

    address[] public monitoredWallets;

    uint256 public constant HIGH_RISK_THRESHOLD   = 80;
    uint256 public constant MEDIUM_RISK_THRESHOLD = 60;

    event WalletComplianceUpdated(address indexed wallet, bool allowed, uint256 riskScore);
    event WalletCleared(address indexed wallet, string note);
    event WalletBlocked(address indexed wallet, string reason);
    event AssetComplianceReviewed(uint256 indexed assetId, uint256 score, bool requiresReview);
    event SanctionsListUpdated(address indexed wallet, bool sanctioned);

    constructor(address adminAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
        _grantRole(ADMIN_ROLE,         adminAddress);
        _grantRole(COMPLIANCE_ROLE,    adminAddress);
    }

    // ── Full wallet compliance update (production) ─────────────────
    function updateWalletCompliance(
        address wallet,
        bool    isAllowed,
        uint256 riskScore,
        string  calldata reason,
        bytes32 evidenceHash
    ) external onlyRole(SHIELD_ROLE) whenNotPaused {
        require(wallet != address(0), "Invalid wallet");
        require(riskScore <= 100, "Risk score 0-100");

        bool sanctioned = sanctionedWallets[wallet];
        _setWalletRecord(
            wallet,
            sanctioned ? false : isAllowed,
            sanctioned ? 100   : riskScore,
            sanctioned ? "Wallet is sanctioned" : reason,
            evidenceHash
        );
    }

    // ── Convenience wrappers (backward-compatible) ─────────────────
    function clearWallet(address wallet, string calldata note)
        external onlyRole(SHIELD_ROLE)
    {
        _setWalletRecord(wallet, true, 0, note, bytes32(0));
        emit WalletCleared(wallet, note);
    }

    function blockWallet(address wallet, string calldata reason)
        external onlyRole(SHIELD_ROLE)
    {
        walletRecords[wallet].allowed    = false;
        walletRecords[wallet].lastUpdate = block.timestamp;
        walletRecords[wallet].updatedBy  = msg.sender;
        emit WalletBlocked(wallet, reason);
    }

    // ── Asset compliance ───────────────────────────────────────────
    function reviewAssetCompliance(
        uint256 assetId,
        uint256 complianceScore,
        bytes32 documentHash,
        string  calldata complianceReport
    ) external onlyRole(SHIELD_ROLE) whenNotPaused {
        require(complianceScore <= 100, "Score 0-100");
        bool requiresReview = complianceScore < 70 || complianceScore > 95;

        assetCompliance[assetId] = AssetCompliance({
            complianceScore:  complianceScore,
            documentHash:     documentHash,
            complianceReport: complianceReport,
            lastReview:       block.timestamp,
            reviewedBy:       msg.sender,
            requiresReview:   requiresReview
        });

        emit AssetComplianceReviewed(assetId, complianceScore, requiresReview);
    }

    // ── Sanctions ──────────────────────────────────────────────────
    function updateSanctionsList(address wallet, bool sanctioned)
        external onlyRole(COMPLIANCE_ROLE)
    {
        sanctionedWallets[wallet] = sanctioned;
        emit SanctionsListUpdated(wallet, sanctioned);

        if (sanctioned && walletRecords[wallet].allowed) {
            walletRecords[wallet].allowed    = false;
            walletRecords[wallet].riskScore  = 100;
            walletRecords[wallet].reason     = "Wallet sanctioned";
            walletRecords[wallet].lastUpdate = block.timestamp;
            walletRecords[wallet].updatedBy  = msg.sender;
            emit WalletComplianceUpdated(wallet, false, 100);
        }
    }

    // ── View ───────────────────────────────────────────────────────
    function isWalletAllowed(address wallet) external view returns (bool) {
        if (sanctionedWallets[wallet]) return false;
        return walletRecords[wallet].allowed;
    }

    function getWalletRiskProfile(address wallet) external view returns (
        bool    isAllowed,
        uint256 riskScore,
        string  memory reason,
        bool    isSanctioned,
        uint256 lastUpdate
    ) {
        WalletRecord memory r = walletRecords[wallet];
        bool sanctioned = sanctionedWallets[wallet];
        return (
            r.allowed && !sanctioned,
            sanctioned ? 100 : r.riskScore,
            sanctioned ? "Wallet is sanctioned" : r.reason,
            sanctioned,
            r.lastUpdate
        );
    }

    function getAssetCompliance(uint256 assetId)
        external view returns (AssetCompliance memory)
    {
        return assetCompliance[assetId];
    }

    function getMonitoredWallets() external view returns (address[] memory) {
        return monitoredWallets;
    }

    // ── Admin ──────────────────────────────────────────────────────
    function grantShieldRole(address shield)     external onlyRole(DEFAULT_ADMIN_ROLE) { _grantRole(SHIELD_ROLE, shield); }
    function grantComplianceRole(address c)      external onlyRole(DEFAULT_ADMIN_ROLE) { _grantRole(COMPLIANCE_ROLE, c); }
    function pause()   external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    // ── Internal ───────────────────────────────────────────────────
    function _setWalletRecord(
        address wallet,
        bool    allowed,
        uint256 riskScore,
        string  memory reason,
        bytes32 evidenceHash
    ) internal {
        bool isNew = walletRecords[wallet].lastUpdate == 0;
        walletRecords[wallet] = WalletRecord({
            allowed:      allowed,
            riskScore:    riskScore,
            reason:       reason,
            evidenceHash: evidenceHash,
            lastUpdate:   block.timestamp,
            updatedBy:    msg.sender
        });
        if (isNew) monitoredWallets.push(wallet);
        emit WalletComplianceUpdated(wallet, allowed, riskScore);
    }
}
