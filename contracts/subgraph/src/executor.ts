import { BigInt } from "@graphprotocol/graph-ts";
import { AgentActionExecuted } from "../../generated/AgentExecutor/AgentExecutor";
import { AgentAction, GlobalStats, DailyStats } from "../../generated/schema";

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
  return (timestamp.toI32() / 86400).toString();
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

export function handleAgentActionExecuted(event: AgentActionExecuted): void {
  const action = new AgentAction(event.params.actionId.toString());
  action.agentId     = event.params.agentId;
  action.agentName   = event.params.agentName;
  action.actionType  = event.params.actionType;
  action.success     = event.params.success;
  action.blockNumber = event.block.number;
  action.txHash      = event.transaction.hash;
  action.timestamp   = event.block.timestamp;
  action.save();

  const g = loadOrCreateGlobal();
  g.totalAgentRuns = g.totalAgentRuns + 1;
  if (event.params.success) g.successfulAgentRuns = g.successfulAgentRuns + 1;
  g.lastUpdated = event.block.timestamp;
  g.save();

  const d = loadOrCreateDaily(event.block.timestamp);
  d.agentRuns = d.agentRuns + 1;
  d.save();
}
