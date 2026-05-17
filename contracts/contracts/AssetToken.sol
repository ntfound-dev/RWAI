// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ntfound-dev (https://github.com/ntfound-dev)
// Modified versions must retain this notice. See LICENSE in root.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IComplianceLog {
    function isWalletAllowed(address wallet) external view returns (bool);
}

interface IRWAiRegistry {
    function isAssetActive(uint256 assetId) external view returns (bool);
}

contract AssetToken is ERC20, ERC20Pausable, ERC20Burnable, AccessControl, ReentrancyGuard {

    bytes32 public constant AGENT_ROLE         = keccak256("AGENT_ROLE");
    bytes32 public constant MINTER_ROLE        = keccak256("MINTER_ROLE");
    bytes32 public constant YIELD_MANAGER_ROLE = keccak256("YIELD_MANAGER_ROLE");

    uint256 public immutable assetId;
    uint256 public annualYieldBps;
    address public immutable complianceLog;
    address public            rwaiRegistry;   // optional — address(0) skips active-asset check
    string  public metadataURI;

    mapping(address => bool) public blacklisted;
    bool public transfersEnabled = true;

    event YieldUpdated(uint256 newYieldBps, string agentNote, uint256 timestamp);
    event MetadataUpdated(string newURI);
    event BlacklistUpdated(address indexed wallet, bool isBlacklisted);
    event TransfersEnabled(bool enabled);

    modifier onlyActiveAsset() {
        if (rwaiRegistry != address(0)) {
            require(
                IRWAiRegistry(rwaiRegistry).isAssetActive(assetId),
                "RWAi: asset not active"
            );
        }
        _;
    }

    constructor(
        string  memory name,
        string  memory symbol,
        uint256 _assetId,
        uint256 totalSupply_,
        uint256 _annualYieldBps,
        address agentAddress,
        address _complianceLog,
        string  memory _metadataURI,
        address _rwaiRegistry       // pass address(0) to skip active-asset check
    ) ERC20(name, symbol) {
        assetId        = _assetId;
        annualYieldBps = _annualYieldBps;
        complianceLog  = _complianceLog;
        rwaiRegistry   = _rwaiRegistry;
        metadataURI    = _metadataURI;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(AGENT_ROLE,         agentAddress);
        _grantRole(MINTER_ROLE,        agentAddress);
        _grantRole(YIELD_MANAGER_ROLE, agentAddress);

        _mint(msg.sender, totalSupply_ * 10 ** decimals());
    }

    // ── Agent functions ────────────────────────────────────────────
    function updateYield(uint256 newYieldBps, string calldata agentNote)
        external onlyRole(YIELD_MANAGER_ROLE) onlyActiveAsset
    {
        annualYieldBps = newYieldBps;
        emit YieldUpdated(newYieldBps, agentNote, block.timestamp);
    }

    function updateMetadata(string calldata newURI) external onlyRole(AGENT_ROLE) {
        metadataURI = newURI;
        emit MetadataUpdated(newURI);
    }

    function setBlacklist(address wallet, bool isBlacklisted)
        external onlyRole(AGENT_ROLE)
    {
        blacklisted[wallet] = isBlacklisted;
        emit BlacklistUpdated(wallet, isBlacklisted);
    }

    function mint(address to, uint256 amount)
        external onlyRole(MINTER_ROLE) nonReentrant
    {
        require(to != address(0), "Cannot mint to zero address");
        _mint(to, amount);
    }

    // ── Admin functions ────────────────────────────────────────────
    function setTransfersEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        transfersEnabled = enabled;
        emit TransfersEnabled(enabled);
    }

    function setRegistry(address _rwaiRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rwaiRegistry = _rwaiRegistry;
    }

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ── View ───────────────────────────────────────────────────────
    function getAssetInfo() external view returns (
        uint256 _assetId,
        uint256 _annualYieldBps,
        bool    _transfersEnabled,
        bool    _isActive
    ) {
        bool active = rwaiRegistry != address(0)
            ? IRWAiRegistry(rwaiRegistry).isAssetActive(assetId)
            : true;
        return (assetId, annualYieldBps, transfersEnabled, active);
    }

    // ── Compliance-checked transfers ───────────────────────────────
    function _update(address from, address to, uint256 value)
        internal override(ERC20, ERC20Pausable)
    {
        // mints and burns bypass compliance — controlled by MINTER_ROLE
        if (from != address(0) && to != address(0)) {
            require(transfersEnabled, "RWAi: transfers disabled");
            require(!blacklisted[from], "RWAi: sender blacklisted");
            require(!blacklisted[to],   "RWAi: recipient blacklisted");

            if (complianceLog != address(0)) {
                require(
                    IComplianceLog(complianceLog).isWalletAllowed(from),
                    "RWAi: sender not compliance-cleared"
                );
                require(
                    IComplianceLog(complianceLog).isWalletAllowed(to),
                    "RWAi: recipient not compliance-cleared"
                );
            }
        }
        super._update(from, to, value);
    }
}
