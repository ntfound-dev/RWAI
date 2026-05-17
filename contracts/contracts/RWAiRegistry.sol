// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ntfound-dev (https://github.com/ntfound-dev)
// Modified versions must retain this notice. See LICENSE in root.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract RWAiRegistry is Ownable, Pausable {

    struct Asset {
        address tokenAddress;
        string  assetType;        // "real_estate" | "bond" | "commodity"
        string  metadataURI;      // IPFS: Nexus-generated asset summary
        uint256 complianceScore;  // 0–100, written by Shield Agent
        bytes32 documentHash;     // keccak256 of submitted docs
        address assetOwner;
        uint256 createdAt;
        bool    active;           // true only after Shield score >= 70
    }

    mapping(uint256 => Asset)      public assets;
    mapping(address => uint256[])  public ownerAssets;
    uint256 public assetCount;

    event AssetRegistered(uint256 indexed assetId, address tokenAddress, address owner, string assetType);
    event ComplianceUpdated(uint256 indexed assetId, uint256 score, bytes32 docHash);
    event AssetDeactivated(uint256 indexed assetId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerAsset(
        address tokenAddress,
        string  calldata assetType,
        string  calldata metadataURI,
        address assetOwner
    ) external onlyOwner whenNotPaused returns (uint256 assetId) {
        assetId = assetCount++;
        assets[assetId] = Asset({
            tokenAddress:    tokenAddress,
            assetType:       assetType,
            metadataURI:     metadataURI,
            complianceScore: 0,
            documentHash:    bytes32(0),
            assetOwner:      assetOwner,
            createdAt:       block.timestamp,
            active:          false
        });
        ownerAssets[assetOwner].push(assetId);
        emit AssetRegistered(assetId, tokenAddress, assetOwner, assetType);
    }

    function updateCompliance(uint256 assetId, uint256 score, bytes32 docHash)
        external onlyOwner
    {
        require(assetId < assetCount, "Asset not found");
        assets[assetId].complianceScore = score;
        assets[assetId].documentHash    = docHash;
        if (score >= 70) assets[assetId].active = true;
        emit ComplianceUpdated(assetId, score, docHash);
    }

    function deactivateAsset(uint256 assetId) external onlyOwner {
        require(assetId < assetCount, "Asset not found");
        assets[assetId].active = false;
        emit AssetDeactivated(assetId);
    }

    function getOwnerAssets(address owner) external view returns (uint256[] memory) {
        return ownerAssets[owner];
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
