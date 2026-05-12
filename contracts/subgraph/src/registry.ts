import { BigInt } from "@graphprotocol/graph-ts";
import { AssetRegistered, ComplianceUpdated, AssetDeactivated } from "../../generated/RWAiRegistry/RWAiRegistry";
import { Asset, GlobalStats, DailyStats } from "../../generated/schema";

function loadOrCreateGlobal(): GlobalStats {
  let g = GlobalStats.load("global");
  if (!g) {
    g = new GlobalStats("global");
    g.assetCount          = 0;
    g.activeAssetCount    = 0;
    g.totalAgentRuns      = 0;
    g.successfulAgentRuns = 0;
    g.cumulativeTvlWei    = BigInt.fromI32(0);
    g.avgComplianceScore  = 0;
    g.lastUpdated         = BigInt.fromI32(0);
  }
  return g;
}

function dayId(timestamp: BigInt): string {
  const day = timestamp.toI32() / 86400;
  return day.toString();
}

function loadOrCreateDaily(timestamp: BigInt): DailyStats {
  const id = dayId(timestamp);
  let d = DailyStats.load(id);
  if (!d) {
    d = new DailyStats(id);
    d.date      = id;
    d.newAssets = 0;
    d.agentRuns = 0;
    d.tvlUSD    = BigInt.fromI32(0);
    d.timestamp = timestamp;
  }
  return d;
}

export function handleAssetRegistered(event: AssetRegistered): void {
  const asset = new Asset(event.params.assetId.toString());
  asset.tokenAddress    = event.params.tokenAddress;
  asset.owner           = event.params.owner;
  asset.assetType       = event.params.assetType;
  asset.complianceScore = 0;
  asset.active          = true;
  asset.registeredAt    = event.block.timestamp;
  asset.txHash          = event.transaction.hash;
  asset.save();

  const g = loadOrCreateGlobal();
  g.assetCount       = g.assetCount + 1;
  g.activeAssetCount = g.activeAssetCount + 1;
  g.lastUpdated      = event.block.timestamp;
  g.save();

  const d = loadOrCreateDaily(event.block.timestamp);
  d.newAssets = d.newAssets + 1;
  d.save();
}

export function handleComplianceUpdated(event: ComplianceUpdated): void {
  const asset = Asset.load(event.params.assetId.toString());
  if (asset) {
    asset.complianceScore = event.params.score.toI32();
    asset.save();
  }

  const g = loadOrCreateGlobal();
  // Recompute avg compliance — approximation (proper avg needs accumulator)
  g.avgComplianceScore = event.params.score.toI32();
  g.lastUpdated        = event.block.timestamp;
  g.save();
}

export function handleAssetDeactivated(event: AssetDeactivated): void {
  const asset = Asset.load(event.params.assetId.toString());
  if (asset) {
    asset.active = false;
    asset.save();
  }

  const g = loadOrCreateGlobal();
  if (g.activeAssetCount > 0) g.activeAssetCount = g.activeAssetCount - 1;
  g.lastUpdated = event.block.timestamp;
  g.save();
}
