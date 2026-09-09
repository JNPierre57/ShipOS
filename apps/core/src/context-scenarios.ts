export const contextScenarioNames = [
  "Quiet Travel",
  "Combat Escalation",
  "Close Call",
  "Powerplay Combat",
  "New Build",
] as const;
export function contextScenario(name: string): Record<string, unknown>[] {
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
  if (name === "New Build") {
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
