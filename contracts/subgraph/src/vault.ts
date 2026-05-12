import { BigInt } from "@graphprotocol/graph-ts";
import { AllocationExecuted } from "../../generated/PortfolioVault/PortfolioVault";
import { TvlSnapshot, GlobalStats } from "../../generated/schema";

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

export function handleAllocationExecuted(event: AllocationExecuted): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const snap = new TvlSnapshot(id);
  snap.user        = event.params.user;
  snap.totalValue  = event.params.totalValue;
  snap.blockNumber = event.block.number;
  snap.timestamp   = event.block.timestamp;
  snap.save();

  const g = loadOrCreateGlobal();
  g.cumulativeTvlWei = g.cumulativeTvlWei.plus(event.params.totalValue);
  g.lastUpdated      = event.block.timestamp;
  g.save();
}
