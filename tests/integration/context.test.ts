import { test, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { ReplayClock } from "../../apps/core/src/clock.js";
import { modules } from "../../apps/core/src/modules.js";
import { source } from "../../packages/testkit/src/index.js";
import { contextScenario } from "../../apps/core/src/context-scenarios.js";
const setup = async () => {
  const store = new Store(":memory:");
  await store.migrate();
  const clock = new ReplayClock(Date.parse("2026-09-08T10:00:00Z"));
  return { store, clock, run: new RunContext("replay", store, modules, clock) };
};
test("persistent memory survives restart without repeating novelty; internal events stay private", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "shipos-context-memory ")),
    "shipos.db",
  );
  let store = new Store(path);
  await store.migrate();
  let clock = new ReplayClock(Date.parse("2026-09-08T10:00:00Z"));
  let run = new RunContext("live", store, modules, clock);
  const external: string[] = [];
  run.externalBus.add((e) => external.push(e.type));
  run.ingest(
    source(
      { event: "LoadGame", Commander: "Persistent fixture", ShipID: 1 },
      1,
    ),
  );
  const load = {
    event: "Loadout",
    Ship: "asp",
    ShipID: 1,
    Modules: [{ Slot: "Engine", Item: "a" }],
  };
  run.ingest(source(load, 2));
  expect(
    store.events().filter((e) => e.type === "shipos.context.loadout.novel"),
  ).toHaveLength(1);
  expect(external).toEqual([]);
  run.close();
  store = new Store(path);
  await store.migrate();
  clock = new ReplayClock(Date.parse("2026-09-08T11:00:00Z"));
  run = new RunContext("live", store, modules, clock);
  expect(run.context.ship?.fingerprint.hash).toBeDefined();
  run.ingest(source(load, 3));
  expect(
    store.events().filter((e) => e.type === "shipos.context.loadout.novel"),
  ).toHaveLength(1);
  expect(store.all("context_sessions")).toHaveLength(1);
  run.close();
});
test("memory novelty is transactional, bootstrap silent, known builds remain known", async () => {
  const { run, store, clock } = await setup();
  let seq = 0;
  const send = (
    p: Record<string, unknown>,
    mode: "live" | "bootstrap" = "live",
  ) => run.ingest(source(p, ++seq, mode));
  send({ event: "LoadGame", Commander: "Fixture" });
  const load = (item: string) => ({
    event: "Loadout",
    ShipID: 1,
    Ship: "asp",
    Modules: [{ Slot: "Engine", Item: item }],
  });
  send(load("a"), "bootstrap");
  send(load("a"));
  expect(store.events()).toHaveLength(0);
  send(load("b"));
  send(load("b"));
  send(load("a"));
  expect(
    store.events().filter((e) => e.type === "shipos.context.loadout.novel"),
  ).toHaveLength(1);
  const state = structuredClone(run.context.state);
  const ship = structuredClone(run.context.ship);
  store.db.exec(
    "CREATE TRIGGER fail_context BEFORE INSERT ON world_state BEGIN SELECT RAISE(ABORT, 'fixture'); END;",
  );
  expect(() => send(load("c"))).toThrow("fixture");
  expect(run.context.state).toEqual(state);
  expect(run.context.ship).toEqual(ship);
  store.db.exec("DROP TRIGGER fail_context");
  run.process();
  expect(
    store.events().filter((e) => e.type === "shipos.context.loadout.novel"),
  ).toHaveLength(2);
  clock.advance(1000);
  run.close();
  expect(clock.pending).toBe(0);
});
test("combat timeline creates internal events via Director and coalesces hull critical", async () => {
  const { run, clock, store } = await setup();
  const actions: string[] = [];
  run.engine.listeners.add((a) => actions.push(a.type));
  for (const [i, p] of contextScenario("Close Call").entries()) {
    clock.advance(Date.parse(String(p.timestamp)) - clock.now());
    run.ingest(source(p, i + 1));
  }
  clock.advance(60000);
  const events = store.events();
  const critical = events.find((e) => e.type === "shipos.broadcast.critical")!;
  expect(critical).toBeDefined();
  expect(store.get("director_decisions", critical.id)).toMatchObject({
    status: "coalesced",
    coalescing: "hull_critical_precedence",
  });
  expect(events.some((e) => e.type === "shipos.broadcast.recovery")).toBe(true);
  expect(actions).toContain("overlay.show");
  expect(store.all("context_transitions").length).toBeGreaterThan(3);
  run.close();
});
