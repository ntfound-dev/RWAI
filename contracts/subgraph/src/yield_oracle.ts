import { YieldUpdated } from "../../generated/YieldOracle/YieldOracle";
import { YieldSnapshot } from "../../generated/schema";

export function handleYieldUpdated(event: YieldUpdated): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const snap = new YieldSnapshot(id);
  snap.asset       = event.params.asset;
  snap.apyBps      = event.params.apyBps;
  snap.blockNumber = event.block.number;
  snap.timestamp   = event.block.timestamp;
  snap.save();
}
