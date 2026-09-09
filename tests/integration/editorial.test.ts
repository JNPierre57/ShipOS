import { test, expect } from "vitest";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { ReplayClock } from "../../apps/core/src/clock.js";
import { modules } from "../../apps/core/src/modules.js";
import { source } from "../../packages/testkit/src/index.js";
import { Editorial, type MemoryFact } from "../../apps/core/src/editorial.js";
import { IsolatedRuns } from "../../apps/core/src/isolated-runs.js";
import { contextScenario } from "../../apps/core/src/context-scenarios.js";
import { catalog } from "../../modules/high-value-exobiology/src/catalog.js";
const epoch = Date.parse("2026-09-08T10:00:00Z");
test("a different survey kind remains interesting and a delayed first cue does not claim to be the first discovery", async () => {
  const { run, send } = await setup();
  const scan = (body: number, planet: string) => ({
    event: "Scan",
    SystemAddress: 42,
    BodyID: body,
    BodyName: "Fixture " + body,
    PlanetClass: planet,
  });
  run.context.state.phase = "CRITICAL";
  send(scan(1, "Earthlike body"));
  run.context.state.phase = "CALM";
  send(scan(2, "Earthlike body"));
  let note = run.editorial.snapshot().notes[0]!;
  expect(note.lines[0]).not.toContain("FIRST");
  expect(note.lines[2]).toBe("EARTH-LIKE WORLD");
  expect(note.eligible).toBe(true);
  send(scan(3, "Ammonia world"), epoch + 100000);
  note = run.editorial.snapshot().notes[0]!;
  expect(note).toMatchObject({ eligible: true, reason: "new_discovery_kind" });
  expect(note.chosenLines).toContain("AMMONIA WORLD");
  run.close();
});
test("valuable discoveries retain raw payloads while grouping repeats and naming the actual species", async () => {
  const { run, store, send } = await setup();
  const species = Object.keys(catalog)
    .filter((k) => catalog[k]!.value >= 5000000)
    .sort((a, b) => catalog[a]!.value - catalog[b]!.value);
  const scan = (key: string, body: number) => ({
    event: "ScanOrganic",
    ScanType: "Analyse",
    Genus: "fixture",
    Species: key,
    Variant: "fixture",
    SystemAddress: 42,
    Body: body,
  });
  send(scan(species[0]!, 1));
  send(scan(species[0]!, 2), epoch + 100000);
  send(scan(species.at(-1)!, 3), epoch + 200000);
  const events = store
    .events()
    .filter((e) => e.type === "elite.exobiology.highValueDiscovery");
  expect(events).toHaveLength(3);
  expect(events[2]!.payload.name).toBe(catalog[species.at(-1)!]!.name);
  expect(
    events.every((e) => !Object.hasOwn(e.payload, "editorialNoteId")),
  ).toBe(true);
  expect(store.get("director_decisions", events[1]!.id)).toMatchObject({
    status: "suppressed",
    reasons: ["editorial:discovery_grouped"],
  });
  const note = run.editorial
    .snapshot()
    .notes.find((n) => n.eventId === events[2]!.id)!;
  expect(note.reason).toBe("personal_observed_record");
  expect(note.chosenLines).toContain(catalog[species.at(-1)!]!.name);
  run.close();
});
test("wording varies across real session starts and stale observations do not advance last seen", async () => {
  const { run, store, send } = await setup();
  send({ event: "MiningRefined" });
  const first = run.editorial.snapshot().notes[0]!.chosenLines;
  send({ event: "Shutdown" });
  send({ event: "LoadGame", Commander: "Editorial Fixture" }, epoch + 86400000);
  send({ event: "MiningRefined" });
  expect(run.editorial.snapshot().notes[0]!.chosenLines![0]).not.toBe(
    first![0],
  );
  const before = store.get<MemoryFact>(
    "editorial_memory",
    JSON.stringify(["activity", "Editorial Fixture", "mining"]),
  )!;
  run.editorial.observe(
    source(
      {
        event: "MiningRefined",
        timestamp: new Date(epoch + 1000).toISOString(),
      },
      900,
    ),
    { commander: "Editorial Fixture" },
    [],
    "CALM",
    epoch + 10 * 86400000,
  );
  expect(
    store.get<MemoryFact>(
      "editorial_memory",
      JSON.stringify(["activity", "Editorial Fixture", "mining"]),
    )!.lastSeen,
  ).toBe(before.lastSeen);
  run.close();
});
async function setup() {
  const store = new Store(":memory:");
  await store.migrate();
  const clock = new ReplayClock(epoch);
  const run = new RunContext("replay", store, modules, clock);
  let seq = 0;
  const send = (p: Record<string, unknown>, at = clock.now()) => {
    clock.advance(at - clock.now());
    const e = source({ ...p, timestamp: new Date(at).toISOString() }, ++seq);
    run.ingest(e);
    return e;
  };
  send({ event: "LoadGame", Commander: "Editorial Fixture" });
  return { store, clock, run, send };
}
test("sustained travel speaks at five jumps then a paced progress milestone; idle time never creates editorial events", async () => {
  const { store, clock, run, send } = await setup();
  for (let i = 1; i <= 8; i++)
    send(
      { event: "FSDJump", StarSystem: "System " + i, SystemAddress: i },
      epoch + i * 80000,
    );
  const cues = store
    .events()
    .filter((e) => e.type === "shipos.editorial.moment");
  expect(cues).toHaveLength(2);
  const notes = run.editorial.snapshot().notes.filter((n) => n.eligible);
  expect(notes.map((n) => n.reason)).toEqual([
    "activity_progress",
    "first_session_occurrence",
  ]);
  expect(notes[0]!.lines.join(" ")).toContain("8 HYPERSPACE JUMPS");
  clock.advance(3600000);
  expect(
    store.events().filter((e) => e.type === "shipos.editorial.moment"),
  ).toHaveLength(2);
  run.close();
});
test("all supported ordinary activities use observed evidence and share pacing; uncertain events stay silent", async () => {
  const { run, store, send } = await setup();
  const payloads = [
    { event: "MiningRefined" },
    { event: "EngineerCraft" },
    { event: "ModuleBuy" },
    { event: "MarketBuy" },
    { event: "MissionCompleted" },
    { event: "PowerplayDeliver" },
    {
      event: "ScanOrganic",
      ScanType: "Analyse",
      Species: "other",
      Species_Localised: "Other Species",
    },
    { event: "LaunchSRV", SRVType: "Scarab" },
    { event: "Disembark" },
  ];
  payloads.forEach((p, i) => send(p, epoch + i * 100000));
  expect(
    store.events().filter((e) => e.type === "shipos.editorial.moment"),
  ).toHaveLength(9);
  expect(
    run.editorial.snapshot().notes.find((n) => n.family === "exobiology")!
      .lines,
  ).toContain("Other Species");
  send({ event: "MarketSell" });
  expect(run.editorial.snapshot().notes[0]!.eligible).toBe(false);
  const count = store.events().length;
  send({ event: "ProspectedAsteroid" });
  send({ event: "ScanOrganic", ScanType: "Log" });
  expect(store.events()).toHaveLength(count);
  run.close();
});
test("danger suppresses routine suggestions and permits a supported first occurrence after recovery", async () => {
  const { run, store, send } = await setup();
  run.context.state.phase = "CRITICAL";
  send({ event: "MiningRefined" });
  expect(run.editorial.snapshot().notes[0]).toMatchObject({
    eligible: false,
    reason: "danger_has_priority",
  });
  expect(store.events()).toHaveLength(0);
  run.context.state.phase = "CALM";
  send({ event: "MiningRefined" });
  expect(run.editorial.snapshot().notes[0]).toMatchObject({
    eligible: true,
    reason: "first_session_occurrence",
  });
  run.close();
});
test("editorial memory rolls back with ingestion and survives service recreation without restarting the session", async () => {
  const { run, store, send } = await setup();
  send({ event: "MiningRefined" });
  const before = store.all("editorial_memory");
  store.db.exec(
    "CREATE TRIGGER fail_editorial BEFORE INSERT ON world_state BEGIN SELECT RAISE(ABORT, 'fixture'); END;",
  );
  expect(() => send({ event: "MiningRefined" })).toThrow("fixture");
  expect(store.all("editorial_memory")).toEqual(before);
  store.db.exec("DROP TRIGGER fail_editorial");
  run.process();
  run.editorial = new Editorial(store);
  send({ event: "MiningRefined" });
  expect(run.editorial.snapshot().notes[0]!.reason).toBe(
    "accumulating_evidence",
  );
  expect(store.events()).toHaveLength(1);
  run.close();
});
test("backfill is silent, idempotent, commander scoped and establishes durable history", async () => {
  const store = new Store(":memory:");
  await store.migrate();
  const payloads = [
    { event: "LoadGame", Commander: "Historical Fixture" },
    { event: "Location", StarSystem: "Old Home", SystemAddress: 7 },
    { event: "MiningRefined" },
    { event: "Shutdown" },
  ];
  payloads.forEach((p, i) => {
    const e = source(
      {
        ...p,
        timestamp: new Date(epoch - 30 * 86400000 + i * 1000).toISOString(),
      },
      i + 1,
    );
    store.accept(e);
    store.processed(e.id, {});
  });
  const editorial = new Editorial(store);
  editorial.backfill();
  const memory = store.all("editorial_memory");
  editorial.backfill();
  expect(store.all("editorial_memory")).toEqual(memory);
  expect(editorial.snapshot().notes).toHaveLength(0);
  expect(store.events()).toHaveLength(0);
  expect(
    store.get<MemoryFact>(
      "editorial_memory",
      JSON.stringify(["system", "Historical Fixture", "7"]),
    )!.name,
  ).toBe("Old Home");
  const e = source({ event: "MiningRefined" }, 20);
  expect(
    editorial.observe(e, { commander: "Other Commander" }, [], "CALM", epoch)
      .note!.reason,
  ).toBe("first_session_occurrence");
  expect(
    editorial.observe(
      { ...e, id: "another" },
      { commander: "Historical Fixture" },
      [],
      "CALM",
      epoch,
    ).note!.reason,
  ).toBe("activity_return");
  store.close();
});
test("seeded return and reunion demonstrations are deterministic and never touch the live store", async () => {
  const isolated = new IsolatedRuns(modules);
  for (const scenario of [
    "System Return",
    "Ship Reunion",
    "Editorial Journey",
  ]) {
    const a = await isolated.create(
      "replay",
      contextScenario(scenario),
      "instant",
      "source",
      undefined,
      scenario,
    );
    const b = await isolated.create(
      "simulation",
      contextScenario(scenario),
      "instant",
      "source",
      undefined,
      scenario,
    );
    const first = isolated.runs.get(a.id)!.context.editorial.snapshot().notes;
    const second = isolated.runs.get(b.id)!.context.editorial.snapshot().notes;
    expect(
      first.map((n) => ({ lines: n.lines, reason: n.reason, facts: n.facts })),
    ).toEqual(
      second.map((n) => ({ lines: n.lines, reason: n.reason, facts: n.facts })),
    );
    expect(first.some((n) => n.eligible)).toBe(true);
    if (scenario === "System Return")
      expect(first[0]!.reason).toBe("return_after_absence");
    if (scenario === "Ship Reunion")
      expect(first[0]!.lines).toContain("Old Companion");
  }
  for (const r of isolated.runs.values()) r.context.close();
});
