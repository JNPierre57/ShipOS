import type { CrewMember, Department } from "./crew-model.js";
export const crewScenarioNames = [
  "Crew Science",
  "Crew Navigation",
  "Crew Engineering",
  "Crew Tactical",
  "Crew Multiple Officers",
  "Crew Inactive Officer",
  "Crew No Officer",
  "Crew Critical Override",
] as const;
export function crewScenarioMembers(name: string, at: number): CrewMember[] {
  const department: Department =
    name === "Crew Navigation"
      ? "NAV"
      : name === "Crew Engineering"
        ? "ENG"
        : name === "Crew Tactical"
          ? "TAC"
          : "SCI";
  return (
    name === "Crew No Officer"
      ? []
      : name === "Crew Multiple Officers"
        ? ["Alice", "Bob"]
        : ["Alice"]
  ).map((displayName, i) => ({
    key: "id:" + (i + 1),
    viewer: {
      id: String(i + 1),
      login: displayName.toLowerCase(),
      displayName,
    },
    department,
    lastActivity: name === "Crew Inactive Officer" ? at - 21 * 60000 : at,
    joinedAt: at - 21 * 60000,
    changedAt: at - 21 * 60000,
  }));
}
export function crewScenario(name: string): Record<string, unknown>[] {
  const rows: { at: number; p: Record<string, unknown> }[] = [];
  const add = (at: number, p: Record<string, unknown>) => rows.push({ at, p });
  add(0, { event: "LoadGame", Commander: "Crew Fixture" });
  add(0, { event: "Status", Flags: 16777224 });
  const biology = (at: number, body: number) =>
    add(at, {
      event: "ScanOrganic",
      ScanType: "Analyse",
      Genus: "$Codex_Ent_Stratum_Genus_Name;",
      Species: "$Codex_Ent_Stratum_07_Name;",
      Variant: "fixture",
      SystemAddress: 42,
      Body: body,
    });
  if (name === "Crew Navigation")
    for (let i = 1; i <= 5; i++)
      add(i, {
        event: "FSDJump",
        StarSystem: "Survey " + i,
        SystemAddress: 100 + i,
      });
  else if (name === "Crew Engineering")
    add(2, {
      event: "Status",
      Flags: 16777224 + 524288,
      Fuel: { FuelMain: 1.2 },
    });
  else if (name === "Crew Tactical") {
    add(1, { event: "Bounty", Target: "fixture", TotalReward: 10000 });
    add(3, { event: "Bounty", Target: "fixture", TotalReward: 20000 });
  } else {
    biology(2, 1);
    if (name === "Crew Multiple Officers") {
      add(95, {
        event: "Scan",
        SystemAddress: 42,
        BodyID: 2,
        BodyName: "Crew Survey 2",
        PlanetClass: "Earthlike body",
      });
      add(190, {
        event: "Scan",
        SystemAddress: 42,
        BodyID: 3,
        BodyName: "Crew Survey 3",
        PlanetClass: "Ammonia world",
      });
    }
    if (name === "Crew Critical Override") add(5, { event: "Died" });
  }
  return rows.map(({ at, p }) => ({
    ...p,
    timestamp: new Date(
      Date.parse("2026-09-15T12:00:00Z") + at * 1000,
    ).toISOString(),
  }));
}
