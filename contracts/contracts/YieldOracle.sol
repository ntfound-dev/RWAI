// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ntfound-dev (https://github.com/ntfound-dev)
// Modified versions must retain this notice. See LICENSE in root.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract YieldOracle is AccessControl, Pausable, ReentrancyGuard {

    bytes32 public constant YIELD_AGENT_ROLE = keccak256("YIELD_AGENT_ROLE");
    bytes32 public constant ADMIN_ROLE       = keccak256("ADMIN_ROLE");

    uint256 public constant MIN_UPDATE_INTERVAL = 6 hours;
    uint256 public maxPriceAge = 60;
    IPyth public pyth;

    struct YieldData {
        uint256 apyBps;     // basis points (420 = 4.20%)
        uint256 timestamp;
        string  agentNote;  // AI-written market observation stored on-chain
        bool    isActive;
    }

    struct MarketSnapshot {
        uint256   snapshotId;
        address[] assets;
        uint256[] apys;
        string    marketSummary; // AI-generated overall market analysis
        uint256   timestamp;
        uint256   blockNumber;
    }

    struct PriceData {
        uint256 priceE18;       // USD price scaled to 18 decimals
        uint256 confidenceE18;  // Pyth confidence interval scaled to 18 decimals
        int32   exponent;       // original Pyth exponent
        uint256 publishTime;    // Pyth publish timestamp
        uint256 timestamp;      // Mantle block timestamp when stored
        string  agentNote;
        bool    isActive;
    }

    mapping(address => YieldData)      public currentYields;
    mapping(address => YieldData[])    public yieldHistory;
    mapping(address => uint256)        public lastAssetUpdate;   // throttle per asset
    mapping(uint256 => MarketSnapshot) public marketSnapshots;
    mapping(address => bytes32)        public pythPriceFeedIds;
    mapping(address => PriceData)      public currentPrices;
    mapping(address => PriceData[])    public priceHistory;

    address[] public trackedAssets;
    uint256   public snapshotCount;

    event YieldUpdated(address indexed asset, uint256 apyBps, string agentNote);
    event MarketSnapshotCreated(uint256 indexed snapshotId, uint256 assetCount);
    event AssetTrackingStarted(address indexed asset);
    event PythContractUpdated(address indexed pythContract);
    event MaxPriceAgeUpdated(uint256 maxPriceAge);
    event PriceFeedConfigured(address indexed asset, bytes32 indexed priceFeedId);
    event PriceUpdated(
        address indexed asset,
        bytes32 indexed priceFeedId,
        uint256 priceE18,
        uint256 confidenceE18,
        uint256 publishTime,
        string agentNote
    );

    constructor(address adminAddress, address pythContract) {
        require(adminAddress != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
        _grantRole(ADMIN_ROLE,         adminAddress);
        if (pythContract != address(0)) {
            pyth = IPyth(pythContract);
            emit PythContractUpdated(pythContract);
        }
    }

    // ── Single-asset update (enforces MIN_UPDATE_INTERVAL) ────────
    function updateYield(
        address asset,
        uint256 apyBps,
        string  calldata agentNote
    ) external onlyRole(YIELD_AGENT_ROLE) whenNotPaused {
        require(asset != address(0), "Invalid asset");
        require(apyBps <= 100_000, "APY max 1000%");
        require(bytes(agentNote).length > 0, "Agent note required");
        require(
            block.timestamp >= lastAssetUpdate[asset] + MIN_UPDATE_INTERVAL,
            "Update too frequent"
        );
        _writeYield(asset, apyBps, agentNote);
    }

    // ── Batch update (no per-asset throttle — for initial population) ─
    function updateYields(
        address[] calldata assets,
        uint256[] calldata apysBps,
        string    calldata agentNote
    ) external onlyRole(YIELD_AGENT_ROLE) whenNotPaused {
        require(assets.length == apysBps.length, "Length mismatch");
        for (uint256 i = 0; i < assets.length; i++) {
            require(apysBps[i] <= 100_000, "APY max 1000%");
            _writeYield(assets[i], apysBps[i], agentNote);
        }
    }

    // ── Market snapshot (AI-authored, stored permanently on Mantle) ─
    function createMarketSnapshot(
        address[] calldata assets,
        uint256[] calldata apys,
        string    calldata marketSummary
    ) external onlyRole(YIELD_AGENT_ROLE) whenNotPaused returns (uint256 snapshotId) {
        require(assets.length == apys.length, "Length mismatch");
        require(assets.length > 0, "Empty snapshot");
        require(bytes(marketSummary).length > 0, "Summary required");

        snapshotId = snapshotCount++;
        marketSnapshots[snapshotId] = MarketSnapshot({
            snapshotId:    snapshotId,
            assets:        assets,
            apys:          apys,
            marketSummary: marketSummary,
            timestamp:     block.timestamp,
            blockNumber:   block.number
        });

        emit MarketSnapshotCreated(snapshotId, assets.length);
    }

    // ── Pyth price updates ───────────────────────────────────────
    function updatePrice(
        address asset,
        bytes[] calldata priceUpdate,
        string calldata agentNote
    )
        external
        payable
        onlyRole(YIELD_AGENT_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256 priceE18, uint256 confidenceE18, uint256 publishTime)
    {
        bytes32 priceFeedId = pythPriceFeedIds[asset];
        require(address(pyth) != address(0), "Pyth not configured");
        require(asset != address(0), "Invalid asset");
        require(priceFeedId != bytes32(0), "Price feed not configured");
        require(bytes(agentNote).length > 0, "Agent note required");

        uint256 fee = pyth.getUpdateFee(priceUpdate);
        require(msg.value >= fee, "Insufficient Pyth fee");
        pyth.updatePriceFeeds{ value: fee }(priceUpdate);

        PythStructs.Price memory pythPrice = pyth.getPriceNoOlderThan(priceFeedId, maxPriceAge);
        (priceE18, confidenceE18) = _normalizePythPrice(pythPrice);
        publishTime = pythPrice.publishTime;

        _writePrice(asset, priceFeedId, priceE18, confidenceE18, pythPrice.expo, publishTime, agentNote);

        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{ value: msg.value - fee }("");
            require(ok, "Refund failed");
        }
    }

    // ── View ───────────────────────────────────────────────────────
    function getLatestYield(address asset)
        external view
        returns (uint256 apyBps, uint256 timestamp, string memory agentNote)
    {
        YieldData memory s = currentYields[asset];
        return (s.apyBps, s.timestamp, s.agentNote);
    }

    function getCurrentYield(address asset)
        external view
        returns (uint256 apyBps, uint256 timestamp, string memory agentNote, bool isActive)
    {
        YieldData memory s = currentYields[asset];
        return (s.apyBps, s.timestamp, s.agentNote, s.isActive);
    }

    function getMarketSnapshot(uint256 snapshotId)
        external view returns (MarketSnapshot memory)
    {
        require(snapshotId < snapshotCount, "Snapshot not found");
        return marketSnapshots[snapshotId];
    }

    function getLatestSnapshot() external view returns (MarketSnapshot memory) {
        require(snapshotCount > 0, "No snapshots");
        return marketSnapshots[snapshotCount - 1];
    }

    function getTrackedAssets() external view returns (address[] memory) {
        return trackedAssets;
    }

    function getYieldHistory(address asset) external view returns (YieldData[] memory) {
        return yieldHistory[asset];
    }

    function getPythUpdateFee(bytes[] calldata priceUpdate) external view returns (uint256) {
        require(address(pyth) != address(0), "Pyth not configured");
        return pyth.getUpdateFee(priceUpdate);
    }

    function readPythPrice(address asset)
        external view
        returns (uint256 priceE18, uint256 confidenceE18, int32 exponent, uint256 publishTime)
    {
        bytes32 priceFeedId = pythPriceFeedIds[asset];
        require(address(pyth) != address(0), "Pyth not configured");
        require(priceFeedId != bytes32(0), "Price feed not configured");

        PythStructs.Price memory pythPrice = pyth.getPriceNoOlderThan(priceFeedId, maxPriceAge);
        (priceE18, confidenceE18) = _normalizePythPrice(pythPrice);
        return (priceE18, confidenceE18, pythPrice.expo, pythPrice.publishTime);
    }

    function getLatestPrice(address asset)
        external view
        returns (
            uint256 priceE18,
            uint256 confidenceE18,
            int32 exponent,
            uint256 publishTime,
            uint256 timestamp,
            string memory agentNote
        )
    {
        PriceData memory s = currentPrices[asset];
        return (s.priceE18, s.confidenceE18, s.exponent, s.publishTime, s.timestamp, s.agentNote);
    }

    function getCurrentPrice(address asset)
        external view
        returns (
            uint256 priceE18,
            uint256 confidenceE18,
            int32 exponent,
            uint256 publishTime,
            uint256 timestamp,
            string memory agentNote,
            bool isActive
        )
    {
        PriceData memory s = currentPrices[asset];
        return (s.priceE18, s.confidenceE18, s.exponent, s.publishTime, s.timestamp, s.agentNote, s.isActive);
    }

    function getPriceHistory(address asset) external view returns (PriceData[] memory) {
        return priceHistory[asset];
    }

    // ── Admin ──────────────────────────────────────────────────────
    function grantYieldRole(address agent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(YIELD_AGENT_ROLE, agent);
    }

    function setPythContract(address pythContract) external onlyRole(ADMIN_ROLE) {
        require(pythContract != address(0), "Invalid Pyth contract");
        pyth = IPyth(pythContract);
        emit PythContractUpdated(pythContract);
    }

    function setMaxPriceAge(uint256 newMaxPriceAge) external onlyRole(ADMIN_ROLE) {
        require(newMaxPriceAge > 0, "Invalid max price age");
        maxPriceAge = newMaxPriceAge;
        emit MaxPriceAgeUpdated(newMaxPriceAge);
    }

    function setAssetPriceFeed(address asset, bytes32 priceFeedId) external onlyRole(ADMIN_ROLE) {
        _setAssetPriceFeed(asset, priceFeedId);
    }

    function setAssetPriceFeeds(
        address[] calldata assets,
        bytes32[] calldata priceFeedIds
    ) external onlyRole(ADMIN_ROLE) {
        require(assets.length == priceFeedIds.length, "Length mismatch");
        for (uint256 i = 0; i < assets.length; i++) {
            _setAssetPriceFeed(assets[i], priceFeedIds[i]);
        }
    }

    function pause()   external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    // ── Internal ───────────────────────────────────────────────────
    function _writeYield(address asset, uint256 apyBps, string memory agentNote) internal {
        YieldData memory snap = YieldData(apyBps, block.timestamp, agentNote, true);
        currentYields[asset]   = snap;
        yieldHistory[asset].push(snap);
        lastAssetUpdate[asset] = block.timestamp;

        if (!_isTracked(asset)) {
            trackedAssets.push(asset);
            emit AssetTrackingStarted(asset);
        }
        emit YieldUpdated(asset, apyBps, agentNote);
    }

    function _isTracked(address asset) internal view returns (bool) {
        for (uint256 i = 0; i < trackedAssets.length; i++) {
            if (trackedAssets[i] == asset) return true;
        }
        return false;
    }

    function _setAssetPriceFeed(address asset, bytes32 priceFeedId) internal {
        require(asset != address(0), "Invalid asset");
        require(priceFeedId != bytes32(0), "Invalid price feed");
        pythPriceFeedIds[asset] = priceFeedId;
        emit PriceFeedConfigured(asset, priceFeedId);
    }

    function _writePrice(
        address asset,
        bytes32 priceFeedId,
        uint256 priceE18,
        uint256 confidenceE18,
        int32 exponent,
        uint256 publishTime,
        string memory agentNote
    ) internal {
        PriceData memory snap = PriceData({
            priceE18:      priceE18,
            confidenceE18: confidenceE18,
            exponent:      exponent,
            publishTime:   publishTime,
            timestamp:     block.timestamp,
            agentNote:     agentNote,
            isActive:      true
        });

        currentPrices[asset] = snap;
        priceHistory[asset].push(snap);

        if (!_isTracked(asset)) {
            trackedAssets.push(asset);
            emit AssetTrackingStarted(asset);
        }
        emit PriceUpdated(asset, priceFeedId, priceE18, confidenceE18, publishTime, agentNote);
    }

    function _normalizePythPrice(PythStructs.Price memory pythPrice)
        internal pure
        returns (uint256 priceE18, uint256 confidenceE18)
    {
        require(pythPrice.price > 0, "Invalid Pyth price");
        priceE18 = _scaleToE18(uint256(uint64(pythPrice.price)), pythPrice.expo);
        confidenceE18 = _scaleToE18(uint256(pythPrice.conf), pythPrice.expo);
    }

    function _scaleToE18(uint256 value, int32 exponent) internal pure returns (uint256) {
        if (value == 0) return 0;

        if (exponent >= 0) {
            uint256 scale = 18 + uint256(uint32(exponent));
            require(scale <= 58, "Exponent too large");
            return value * (10 ** scale);
        }

        uint256 absExponent = uint256(-int256(exponent));
        if (absExponent > 18) {
            uint256 scaleDown = absExponent - 18;
            require(scaleDown <= 77, "Exponent too small");
            return value / (10 ** scaleDown);
        }

        return value * (10 ** (18 - absExponent));
    }
}
