import { loadoutFixture, loadoutScenarioNames } from "./loadout-fixtures.js";
import { crewScenarioNames, crewScenario } from "./crew-fixtures.js";
export const contextScenarioNames = [
  ...crewScenarioNames,
  "Viewer Screenshot",
  ...loadoutScenarioNames,
  "Quiet Travel",
  "Combat Escalation",
  "Close Call",
  "Powerplay Combat",
  "New Build",
  "Editorial Journey",
  "System Return",
  "Ship Reunion",
  "Ship Card Cutter",
  "Ship Card Clipper",
  "Ship Card Stale",
  "Ship Card Disconnected",
  "Ship Card NMS",
] as const;
export function contextScenario(name: string): Record<string, unknown>[] {
  if (crewScenarioNames.some((n) => n === name)) return crewScenario(name);
  if (name === "Viewer Screenshot")
    return [{ event: "ShipOSDemoScreen", timestamp: "2026-09-15T12:00:00Z" }];
  if (name.startsWith("Loadout "))
    return loadoutFixture(name).map((p, i) => ({
      ...p,
      timestamp: new Date(Date.UTC(2026, 8, 12, 12, 0, i)).toISOString(),
    }));
  const rows: { at: number; payload: Record<string, unknown> }[] = [];
  const add = (at: number, payload: Record<string, unknown>) =>
    rows.push({ at, payload });
  const status = (at: number) => add(at, { event: "Status", Flags: 16777224 });
  add(0, {
    event: "LoadGame",
    Commander: "POC Fixture",
    Ship: "asp",
    ShipID: 1,
  });
  status(0);
  if (name.startsWith("Ship Card ")) {
    add(1, {
      event: "Loadout",
      Ship: name.endsWith("Clipper") ? "empire_trader" : "cutter",
      ShipID: 1,
      ShipName: "Wanderer",
      ShipIdent: "DEMO-07",
      MaxJumpRange: 48.7,
      FuelCapacity: { Main: 32 },
      CargoCapacity: 128,
      Rebuy: 18400000,
    });
    add(2, {
      event: "Status",
      Flags: 16777224,
      Fuel: { FuelMain: 24.6, FuelReservoir: 0.4 },
      Cargo: 12,
    });
    if (name.endsWith("Disconnected"))
      add(3, { event: "ShipOSDemoDisconnect" });
    if (name.endsWith("NMS")) add(3, { event: "Shutdown" });
    if (name.endsWith("Stale"))
      add(3, { event: "Loadout", Ship: "empire_trader", ShipID: 2 });
    add(name.endsWith("Stale") ? 60 : 4, { event: "ShipOSDemoCommand" });
  } else if (name === "New Build") {
    const load = (at: number, item: string) =>
      add(at, {
        event: "Loadout",
        Ship: "asp",
        ShipID: 1,
        ShipName: "Fixture",
        Modules: [{ Slot: "MainEngines", Item: item }],
      });
    load(1, "int_engine_size5_class4");
    load(10, "int_engine_size5_class4");
    load(70, "int_engine_size5_class5");
    load(80, "int_engine_size5_class5");
    load(140, "int_engine_size5_class4");
  } else if (name === "System Return") {
    add(1, {
      event: "FSDJump",
      StarSystem: "Remembered Haven",
      SystemAddress: 420,
    });
  } else if (name === "Ship Reunion") {
    add(1, {
      event: "Loadout",
      Ship: "asp",
      ShipID: 7,
      ShipName: "Old Companion",
      Modules: [{ Slot: "MainEngines", Item: "int_engine_size5_class4" }],
    });
  } else if (name === "Editorial Journey") {
    for (const at of [1, 40, 80, 120, 160, 240, 300, 420])
      add(at, {
        event: "FSDJump",
        StarSystem: `Survey ${at}`,
        SystemAddress: 1000 + at,
      });
    add(520, {
      event: "ScanOrganic",
      ScanType: "Analyse",
      Species: "$Codex_Ent_Bacterial_01_Name;",
      Species_Localised: "Bacterium Aurasus",
    });
    add(630, { event: "MiningRefined", Type: "Platinum" });
    add(740, { event: "MarketSell", Type: "Platinum", Count: 3 });
    add(850, { event: "MissionCompleted", Name: "Fixture mission" });
    add(960, {
      event: "EngineerCraft",
      Engineer: "Fixture",
      Slot: "MainEngines",
    });
  } else if (name === "Quiet Travel") {
    for (const at of [1, 40, 80])
      add(at, { event: "FSDJump", StarSystem: "Fixture", SystemAddress: 42 });
  } else {
    if (name === "Powerplay Combat")
      add(1, {
        event: "PowerplayCollect",
        Power: "Aisling Duval",
        Type: "powerplay",
        Count: 10,
      });
    add(2, { event: "Bounty", Target: "pirate", TotalReward: 10000 });
    add(7, { event: "UnderAttack", Target: "You" });
    add(11, { event: "UnderAttack", Target: "You" });
    status(15);
    add(15, {
      event: "HullDamage",
      Health: 0.18,
      PlayerPilot: true,
      Fighter: false,
    });
    if (name === "Close Call") for (let at = 30; at <= 90; at += 2) status(at);
  }
  status(210);
  return rows
    .sort((a, b) => a.at - b.at)
    .map(({ at, payload }) => ({
      ...payload,
      timestamp: new Date(
        Date.parse("2026-09-08T10:00:00Z") + at * 1000,
      ).toISOString(),
    }));
}
