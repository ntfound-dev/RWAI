import { DEPLOYED_ADDRESSES, DEPLOYED_AGENT_IDS, DEPLOYED_PYTH } from "./deployment";

// Contract addresses — fill from contracts/deployments.json after deploy
export const ADDRESSES = {
  ...DEPLOYED_ADDRESSES,
  // ERC-8004 official Mantle Testnet (pre-deployed, fixed)
  ERC8004_Identity:   "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  ERC8004_Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
} as const;

// ERC-8004 agent IDs — fill after running scripts/registerAgents.ts
export const AGENT_IDS = DEPLOYED_AGENT_IDS;

export const PYTH = {
  mantleSepolia: "0x98046Bd286715D3B0BC227Dd7a956b83D8978603" as `0x${string}`,
  mantle:        "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" as `0x${string}`,
  priceFeeds: {
    MNT:  "0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585",
    USDY: "0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326",
    mETH: "0xfbc9c3a716650b6e24ab22ab85b1c0ef4141b18f4590cc0b986e2f9064cf73d6",
    fBTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  },
  deployed: DEPLOYED_PYTH,
} as const;

// ── ABIs (production, matches deployed contracts) ─────────────────

export const AGENT_EXECUTOR_ABI = [
  "function actionCount() view returns (uint256)",
  "function actionLog(uint256) view returns (uint256 agentId, string agentName, string actionType, string aiReasoning, bytes actionData, address triggeredBy, uint256 timestamp, uint256 blockNumber, bool success, string errorMessage)",
  "function agentTransactionLimits(uint256) view returns (uint256)",
  "function agentDailyLimits(uint256) view returns (uint256)",
  "function agentDailyUsage(uint256) view returns (uint256)",
  "function highValueActionApproved(uint256) view returns (bool)",
  "function reputationManager() view returns (address)",
  "function portfolioVault() view returns (address)",
  "function logTokenization(uint256 agentId, uint256 assetId, address tokenAddress, string aiReasoning) returns (uint256)",
  "function logComplianceReview(uint256 agentId, uint256 assetId, uint256 score, string aiReasoning) returns (uint256)",
  "function recordYieldSnapshot(uint256 agentId, address[] assetAddresses, uint256[] apysBps, string agentSummary) returns (uint256)",
  "function executeAllocation(uint256 agentId, address user, address[] assets, uint256[] amounts, string aiReasoning) returns (uint256)",
  "function executeRebalance(uint256 agentId, address user, address[] fromAssets, address[] toAssets, uint256[] amounts, string aiReasoning) returns (uint256)",
  "function approveHighValueAction(uint256 actionId)",
  "function setAgentLimits(uint256 agentId, uint256 txLimit, uint256 dailyLimit)",
  "function grantAgentRole(address agent)",
  "event AgentActionExecuted(uint256 indexed actionId, uint256 indexed agentId, string agentName, string actionType, bool success)",
  "event HighValueActionQueued(uint256 indexed actionId, uint256 agentId, uint256 value)",
  "event PortfolioAllocated(address indexed user, uint256 actionId)",
  "event PortfolioRebalanced(address indexed user, uint256 actionId)",
] as const;

export const AGENT_REPUTATION_ABI = [
  "function localScore(uint256 agentId) view returns (uint256)",
  "function actionCount(uint256 agentId) view returns (uint256)",
  "function getAutonomyLevel(uint256 agentId) view returns (uint8)",
  "function canActAutonomously(uint256 agentId, uint256 valueWei, uint256 limitWei) view returns (bool)",
  "function nexusAgentId() view returns (uint256)",
  "function shieldAgentId() view returns (uint256)",
  "function yieldAgentId() view returns (uint256)",
  "function atlasAgentId() view returns (uint256)",
  "function setAgentIds(uint256 nexus, uint256 shield, uint256 yield_, uint256 atlas)",
  "function grantAgentRole(address agent)",
  "event ReputationUpdated(uint256 indexed agentId, string action, int256 delta, uint256 newScore)",
  "event AutonomyLevelChanged(uint256 indexed agentId, uint8 oldLevel, uint8 newLevel)",
] as const;

export const YIELD_ORACLE_ABI = [
  "function getLatestYield(address asset) view returns (uint256 apyBps, uint256 timestamp, string agentNote)",
  "function getCurrentYield(address asset) view returns (uint256 apyBps, uint256 timestamp, string agentNote, bool isActive)",
  "function getTrackedAssets() view returns (address[])",
  "function snapshotCount() view returns (uint256)",
  "function getMarketSnapshot(uint256 snapshotId) view returns (tuple(uint256 snapshotId, address[] assets, uint256[] apys, string marketSummary, uint256 timestamp, uint256 blockNumber))",
  "function getLatestSnapshot() view returns (tuple(uint256 snapshotId, address[] assets, uint256[] apys, string marketSummary, uint256 timestamp, uint256 blockNumber))",
  "function lastAssetUpdate(address asset) view returns (uint256)",
  "function pyth() view returns (address)",
  "function maxPriceAge() view returns (uint256)",
  "function pythPriceFeedIds(address asset) view returns (bytes32)",
  "function currentPrices(address asset) view returns (uint256 priceE18, uint256 confidenceE18, int32 exponent, uint256 publishTime, uint256 timestamp, string agentNote, bool isActive)",
  "function getPythUpdateFee(bytes[] priceUpdate) view returns (uint256)",
  "function readPythPrice(address asset) view returns (uint256 priceE18, uint256 confidenceE18, int32 exponent, uint256 publishTime)",
  "function getLatestPrice(address asset) view returns (uint256 priceE18, uint256 confidenceE18, int32 exponent, uint256 publishTime, uint256 timestamp, string agentNote)",
  "function getCurrentPrice(address asset) view returns (uint256 priceE18, uint256 confidenceE18, int32 exponent, uint256 publishTime, uint256 timestamp, string agentNote, bool isActive)",
  "function updateYield(address asset, uint256 apyBps, string agentNote)",
  "function updateYields(address[] assets, uint256[] apysBps, string agentNote)",
  "function createMarketSnapshot(address[] assets, uint256[] apys, string marketSummary) returns (uint256)",
  "function updatePrice(address asset, bytes[] priceUpdate, string agentNote) payable returns (uint256 priceE18, uint256 confidenceE18, uint256 publishTime)",
  "function setPythContract(address pythContract)",
  "function setMaxPriceAge(uint256 newMaxPriceAge)",
  "function setAssetPriceFeed(address asset, bytes32 priceFeedId)",
  "function setAssetPriceFeeds(address[] assets, bytes32[] priceFeedIds)",
  "event YieldUpdated(address indexed asset, uint256 apyBps, string agentNote)",
  "event MarketSnapshotCreated(uint256 indexed snapshotId, uint256 assetCount)",
  "event PriceFeedConfigured(address indexed asset, bytes32 indexed priceFeedId)",
  "event PriceUpdated(address indexed asset, bytes32 indexed priceFeedId, uint256 priceE18, uint256 confidenceE18, uint256 publishTime, string agentNote)",
] as const;

export const PORTFOLIO_VAULT_ABI = [
  "function hasPortfolio(address user) view returns (bool)",
  "function getPortfolio(address user) view returns (tuple(address[] assets, uint256[] allocations, uint256 riskScore, string strategyType, uint256 createdAt, uint256 lastRebalanced, string atlasReasoning))",
  "function vaultAllocations(address user, address asset) view returns (uint256)",
  "function supportedAssets(address asset) view returns (bool)",
  "function getSupportedAssets() view returns (address[])",
  "function createPortfolio(address user, address[] assets, uint256[] allocations, uint256 riskScore, string strategyType, string atlasReasoning)",
  "function updatePortfolio(address user, address[] newAssets, uint256[] newAllocations, string atlasReasoning)",
  "function executeAllocation(address user, address[] assets, uint256[] amounts) returns (uint256)",
  "function executeRebalance(address user, address[] fromAssets, address[] toAssets, uint256[] amounts) returns (uint256)",
  "function deposit(address asset, uint256 amount)",
  "function withdraw(address asset, uint256 amount)",
  "function addSupportedAsset(address asset)",
  "function setYieldOracle(address oracle)",
  "event PortfolioCreated(address indexed user, string strategyType, uint256 riskScore)",
  "event PortfolioRebalanced(address indexed user, uint256 timestamp, string reasoning)",
  "event AllocationExecuted(address indexed user, uint256 allocationId, uint256 totalValue)",
  "event AssetDeposited(address indexed user, address indexed asset, uint256 amount)",
  "event AssetWithdrawn(address indexed user, address indexed asset, uint256 amount)",
] as const;

export const HYBRID_VAULT_ABI = [
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function balances(address user, address token) view returns (uint256)",
  "function allowances(address user, address agent, address token) view returns (uint256 amount, uint256 expiry, uint256 dailySpent, uint256 dailyWindowStart)",
  "function nonces(address user) view returns (uint256)",
  "function approvedAgents(address agent) view returns (bool)",
  "function perTxCap() view returns (uint256)",
  "function perAgentDailyCap() view returns (uint256)",
  "function perUserPercentCapBps() view returns (uint256)",
  "function deposit(address token, uint256 amount)",
  "function setAgentAllowance(address agent, address token, uint256 amount, uint256 expiry)",
  "function setAgentAllowanceBySig(address user, address agent, address token, uint256 amount, uint256 expiry, uint256 nonce, bytes signature)",
  "function revokeAllowance(address agent, address token)",
  "function executeOnBehalf(address user, address token, address to, uint256 amount, bytes data)",
  "function withdraw(address token, uint256 amount)",
  "function emergencyWithdraw(address token)",
  "event Deposited(address indexed user, address indexed token, uint256 amount)",
  "event AgentAllowanceSet(address indexed user, address indexed agent, address indexed token, uint256 amount, uint256 expiry)",
  "event AgentAllowanceRevoked(address indexed user, address indexed agent, address indexed token)",
  "event AgentExecuted(address indexed user, address indexed agent, address indexed to, address token, uint256 amount, bytes32 dataHash)",
] as const;

export const RWAI_REGISTRY_ABI = [
  "function assetCount() view returns (uint256)",
  "function assets(uint256) view returns (address tokenAddress, string assetType, string metadataURI, uint256 complianceScore, bytes32 documentHash, address assetOwner, uint256 createdAt, bool active)",
  "function getOwnerAssets(address owner) view returns (uint256[])",
  "function registerAsset(address tokenAddress, string assetType, string metadataURI, address assetOwner) returns (uint256)",
  "function updateCompliance(uint256 assetId, uint256 score, bytes32 docHash)",
  "function deactivateAsset(uint256 assetId)",
  "event AssetRegistered(uint256 indexed assetId, address tokenAddress, address owner, string assetType)",
  "event ComplianceUpdated(uint256 indexed assetId, uint256 score, bytes32 docHash)",
] as const;

export const COMPLIANCE_LOG_ABI = [
  "function isWalletAllowed(address wallet) view returns (bool)",
  "function getWalletRiskProfile(address wallet) view returns (bool isAllowed, uint256 riskScore, string reason, bool isSanctioned, uint256 lastUpdate)",
  "function getAssetCompliance(uint256 assetId) view returns (tuple(uint256 complianceScore, bytes32 documentHash, string complianceReport, uint256 lastReview, address reviewedBy, bool requiresReview))",
  "function sanctionedWallets(address) view returns (bool)",
  "function getMonitoredWallets() view returns (address[])",
  "function updateWalletCompliance(address wallet, bool isAllowed, uint256 riskScore, string reason, bytes32 evidenceHash)",
  "function clearWallet(address wallet, string note)",
  "function blockWallet(address wallet, string reason)",
  "function reviewAssetCompliance(uint256 assetId, uint256 complianceScore, bytes32 documentHash, string complianceReport)",
  "function updateSanctionsList(address wallet, bool sanctioned)",
  "event WalletComplianceUpdated(address indexed wallet, bool allowed, uint256 riskScore)",
  "event AssetComplianceReviewed(uint256 indexed assetId, uint256 score, bool requiresReview)",
  "event SanctionsListUpdated(address indexed wallet, bool sanctioned)",
] as const;

export const ASSET_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function assetId() view returns (uint256)",
  "function annualYieldBps() view returns (uint256)",
  "function metadataURI() view returns (string)",
  "function transfersEnabled() view returns (bool)",
  "function blacklisted(address) view returns (bool)",
  "function getAssetInfo() view returns (uint256, uint256, bool, bool)",
  "function updateYield(uint256 newYieldBps, string agentNote)",
  "function setBlacklist(address wallet, bool isBlacklisted)",
  "function setTransfersEnabled(bool enabled)",
  "function burn(uint256 amount)",
  "event YieldUpdated(uint256 newYieldBps, string agentNote, uint256 timestamp)",
  "event BlacklistUpdated(address indexed wallet, bool isBlacklisted)",
] as const;

// ── Mantle native RWA assets ───────────────────────────────────────
export const MANTLE_ASSETS = {
  USDY: {
    symbol:      "USDY",
    name:        "Ondo US Dollar Yield",
    address:     "0xcE265E23aAc349cEf9Fa3CC058062A44080f2289" as `0x${string}`,
    description: "US Treasury yield — 4.2% APY",
    riskLevel:   "low" as const,
    color:       "#22c55e",
  },
  mETH: {
    symbol:      "mETH",
    name:        "Mantle Staked ETH",
    address:     "0xD57f88B64611dBf74f87FC40f2F1010320483584" as `0x${string}`,
    description: "Liquid staked ETH — 6.1% APY",
    riskLevel:   "medium" as const,
    color:       "#3b82f6",
  },
  fBTC: {
    symbol:      "fBTC",
    name:        "Mantle Wrapped BTC",
    address:     "0xbED7ad48984fBb3984F5aF83E176fb9f40dB37cc" as `0x${string}`,
    description: "Wrapped Bitcoin on Mantle — 3.5% APY",
    riskLevel:   "medium" as const,
    color:       "#f97316",
  },
  mUSD: {
    symbol:      "mUSD",
    name:        "Mantle USD",
    address:     "0xDf079DB274fAEFfeD10A4a0E5C12f65e1570Cd35" as `0x${string}`,
    description: "Mantle stablecoin — 3.9% APY",
    riskLevel:   "low" as const,
    color:       "#8b5cf6",
  },
  MI4: {
    symbol:      "MI4",
    name:        "Mantle Index 4",
    address:     "0x0000000000000000000000000000000000000004" as `0x${string}`,
    description: "Diversified Mantle index",
    riskLevel:   "medium" as const,
    color:       "#8b5cf6",
  },
} as const;
