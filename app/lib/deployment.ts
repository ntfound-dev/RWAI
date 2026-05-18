export const DEPLOYED_NETWORK = {
  "name": "mantleSepolia",
  "chainId": 5003,
  "explorerUrl": "https://sepolia.mantlescan.xyz"
} as const;

export const DEPLOYED_ADDRESSES = {
  "ComplianceLog": "0xCc6296557c05ca02f3258DEd19f4104a9C19a80B",
  "YieldOracle": "0x1288dF9F55673cBFc97BCe7aD5445D77B9029B92",
  "RWAiRegistry": "0xeE7a50936a25a375143b75b7Ca743B9513368680",
  "AgentReputationManager": "0xfFE21EC80012D3Bf00F5eE20a400C94455F32D32",
  "AgentExecutor": "0x9a822B9A50D090CfcCa1e6474efCd653112d8501",
  "PortfolioVault": "0xf7C43D8fe74712130C0a05D1F58A33515E2C63E4",
  "HybridVault": "0x8e9c0ebC81F3db508BFff45f3eE9a10115b604fe",
  "AssetToken": "0x80E0e5f6488FA2726c042a204344281974f72609"
} as const;

export const DEPLOYED_AGENT_IDS = {
  "nexus": 41,
  "shield": 42,
  "yield": 43,
  "atlas": 44
} as const;

export const DEPLOYED_PYTH = {
  "contract": "0x98046Bd286715D3B0BC227Dd7a956b83D8978603",
  "maxPriceAgeSeconds": 60,
  "priceFeeds": {
    "USDY": "0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326",
    "mUSD": "0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326",
    "mETH": "0xfbc9c3a716650b6e24ab22ab85b1c0ef4141b18f4590cc0b986e2f9064cf73d6",
    "fBTC": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
  }
} as const;
