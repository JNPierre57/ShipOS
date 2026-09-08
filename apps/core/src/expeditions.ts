import type {
  DomainEvent,
  SourceEvent,
} from "../../../packages/contracts/src/index.js";
import { Store } from "./store.js";
export interface Expedition {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number | null;
  aggregates?: {
    systems: number[];
    discoveries: number;
    exobiology: number;
    estimatedValues: number;
    actualSoldValues: number;
    records: number;
    milestones: number;
  };
}
export function aggregateExpedition(
  store: Store,
  source: SourceEvent,
  events: DomainEvent[],
) {
  const current = store.get<Expedition>("expeditions", "active");
  if (!current) return;
  const a = current.aggregates ?? {
    systems: [],
    discoveries: 0,
    exobiology: 0,
    estimatedValues: 0,
    actualSoldValues: 0,
    records: 0,
    milestones: 0,
  };
  const p = source.payload;
  if (
    (p.event === "FSDJump" || p.event === "Location") &&
    typeof p.SystemAddress === "number" &&
    !a.systems.includes(p.SystemAddress)
  )
    a.systems.push(p.SystemAddress);
  for (const e of events) {
    if (e.type === "elite.exploration.remarkableBody") a.discoveries++;
    if (e.type === "elite.exobiology.highValueDiscovery") {
      a.exobiology++;
      a.estimatedValues += Number(e.payload.estimatedBaseValueCredits) || 0;
    }
  }
  if (p.event === "SellOrganicData" && Array.isArray(p.BioData))
    for (const item of p.BioData) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.Value === "number" &&
        typeof item.Bonus === "number"
      )
        a.actualSoldValues += item.Value + item.Bonus;
    }
  a.records += store
    .all<{ sourceEventId: string }>("records")
    .filter((r) => r.sourceEventId === source.id).length;
  a.milestones += store
    .all<{ sourceEventId: string }>("milestones")
    .filter((r) => r.sourceEventId === source.id).length;
  current.aggregates = a;
  store.put("expeditions", "active", current);
  store.put("expeditions", current.id, current);
}
