import { afterEach, expect, test } from "vitest";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { ReplayClock } from "../../apps/core/src/clock.js";
import { modules } from "../../apps/core/src/modules.js";
import { source } from "../../packages/testkit/src/index.js";
import { Crew } from "../../apps/core/src/crew.js";
import {
  departments,
  viewerKey,
  viewerSchema,
} from "../../apps/core/src/crew-model.js";
import { crewBanks, crewRoute } from "../../apps/core/src/crew-messages.js";
import type { DomainEvent } from "../../packages/contracts/src/index.js";
import type { PresentationDefinition } from "../../packages/module-sdk/src/index.js";
import type { PresentationRun } from "../../apps/core/src/presentation.js";
import { IsolatedRuns } from "../../apps/core/src/isolated-runs.js";
import { contextScenario } from "../../apps/core/src/context-scenarios.js";
import { crewScenarioNames } from "../../apps/core/src/crew-fixtures.js";
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanup.splice(0)) f();
});
async function setup() {
  const store = new Store(":memory:");
  await store.migrate();
  const clock = new ReplayClock(Date.parse("2026-09-15T12:00:00Z"));
  const run = new RunContext(
    "replay",
    store,
    modules.map((m) => ({ ...m })),
    clock,
  );
  cleanup.push(() => run.close());
  let seq = 0,
    id = 0;
  const send = (p: Record<string, unknown>) =>
    run.ingest(
      source({ timestamp: new Date(clock.now()).toISOString(), ...p }, ++seq),
    );
  const status = () => send({ event: "Status", Flags: 0, Flags2: 1 });
  const load = () => {
    send({ event: "LoadGame", Commander: "Fixture" });
    status();
  };
  const body = (viewer = "Alice", role = "SCI") => ({
    requestId: "crew-test-" + ++id,
    timestamp: new Date(clock.now()).toISOString(),
    platform: "simulation",
    viewer: { login: viewer.toLowerCase(), displayName: viewer },
    role,
  });
  const join = (viewer = "Alice", role = "SCI") =>
    run.crew.execute(body(viewer, role));
  const broadcast = (active = true, startedAt = clock.now() - 60000) =>
    run.crew.observeBroadcast({
      connected: true,
      active,
      startedAt: active ? startedAt : null,
      stopped: !active,
    });
  run.crew.configure({ confirmations: false });
  load();
  broadcast();
  const event = (
    type: DomainEvent["type"],
    payload: Record<string, unknown> = {},
  ): DomainEvent => ({
    schemaVersion: 1,
    id: "event-" + ++id,
    sequence: 0,
    type,
    semanticKey: "event-" + id,
    occurredAt: new Date(clock.now()).toISOString(),
    emittedAt: new Date(clock.now()).toISOString(),
    payload,
    sourceEventIds: [],
    provenance: { mode: "replay", sourceIds: [], quality: "derived" },
  });
  return {
    run,
    store,
    clock,
    send,
    status,
    load,
    body,
    join,
    broadcast,
    event,
  };
}
const definition: PresentationDefinition = {
  title: "FACT",
  subtitle: "Observed detail",
  accent: "#ffffff",
  durationMs: 7000,
  slot: "primary",
  layers: ["EventLayer"],
  audioAsset: "original",
};
test("roster supports every role, alias, multiple viewers, moves, duplicate joins and leave", async () => {
  const t = await setup();
  for (const role of departments)
    expect(t.join(role, role).reason).toBe("joined");
  expect(t.join().reason).toBe("joined");
  expect(t.join("Bob").reason).toBe("joined");
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(3);
  expect(t.join().reason).toBe("already_enrolled");
  expect(t.join("Alice", "NAV").reason).toBe("department_changed");
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(2);
  expect(t.run.crew.snapshot().departments.NAV).toHaveLength(2);
  expect(t.join("Alice", "ING").reason).toBe("department_changed");
  expect(t.run.crew.snapshot().departments.ENG).toHaveLength(2);
  expect(t.join("Alice", "leave").reason).toBe("left");
  expect(t.join("Alice", "leave").reason).toBe("not_enrolled");
});
test("stable identity takes priority; normalized login/name fallback never uses message text", async () => {
  const t = await setup();
  const b = t.body();
  expect(
    viewerKey(viewerSchema.parse({ login: "ALIce", displayName: "Alice" })),
  ).toBe("login:alice");
  expect(viewerKey(viewerSchema.parse({ displayName: "Ａlice" }))).toBe(
    "name:alice",
  );
  t.run.crew.execute({
    ...b,
    viewer: { id: "42", login: "alice", displayName: "Alice" },
  });
  t.run.crew.execute({
    ...t.body("Renamed", "NAV"),
    viewer: { id: "42", displayName: "Renamed" },
  });
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(0);
  expect(t.run.crew.snapshot().departments.NAV).toHaveLength(1);
  expect(() =>
    t.run.crew.execute({ ...t.body(), text: "do something" }),
  ).toThrow();
  expect(() =>
    viewerSchema.parse({ id: "not-an-id", displayName: "Alice" }),
  ).toThrow();
});
test("active duty rotates deterministically; silent members remain enrolled but SYSTEM is used", async () => {
  const t = await setup();
  t.join();
  t.join("Bob");
  const e = t.event("elite.exobiology.highValueDiscovery");
  const choose = () => t.run.crew.decorate(e, definition).comm?.displayName;
  expect([choose(), choose(), choose()]).toEqual(["Alice", "Bob", "Alice"]);
  t.clock.advance(21 * 60000);
  expect(choose()).toBeUndefined();
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(2);
  const activity = t.body("Bob");
  delete (activity as Record<string, unknown>).role;
  expect(t.run.crew.activity(activity).reason).toBe("activity_updated");
  expect(choose()).toBe("Bob");
  expect(t.run.crew.snapshot().departments.SCI?.map((m) => m.active)).toEqual([
    false,
    true,
  ]);
});
test("both stream and confirmed Elite are required, independent of loadout or vehicle", async () => {
  const t = await setup();
  expect(t.run.shipCommands.reason()).not.toBeNull(); // No main ship/loadout in fixture.
  expect(t.run.crew.reason()).toBeNull();
  t.broadcast(false);
  expect(t.join().reason).toBe("stream_inactive");
  t.broadcast();
  t.send({ event: "Shutdown" });
  t.status();
  expect(t.join().reason).toBe("game_not_active");
  t.load();
  expect(t.join().reason).toBe("joined");
  t.send({ event: "Shutdown" });
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(1);
  const e = t.event("elite.exobiology.highValueDiscovery");
  expect(t.run.crew.decorate(e, definition)).toBe(definition);
  t.load();
  expect(t.run.crew.decorate(e, definition).comm?.displayName).toBe("Alice");
  t.run.shipCommands.link = () => ({
    connected: true,
    lastHeartbeat: t.clock.now(),
    generation: 2,
    agentId: "fixture-agent",
  });
  expect(t.run.crew.reason()).toBe("awaiting_fresh_telemetry");
  t.send({ event: "Status", Flags: "invalid" });
  expect(t.run.crew.reason()).toBe("awaiting_fresh_telemetry");
  t.status();
  expect(t.run.crew.reason()).toBeNull();
});
test("real stop clears storage immediately; disconnect/restart restore only the same confirmed broadcast", async () => {
  const t = await setup();
  t.join();
  const startedAt = t.run.crew.snapshot().broadcast!;
  t.run.crew.observeBroadcast({ connected: false, active: false, startedAt });
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(1);
  expect(t.join("Bob").reason).toBe("obs_unavailable");
  t.run.crew = new Crew(t.run);
  expect(t.run.crew.reason()).toBe("obs_unavailable");
  t.broadcast(true, startedAt + 100);
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(1);
  t.broadcast(true, startedAt + 10000);
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(0);
  t.join();
  t.broadcast(false);
  expect(t.store.get("settings", "crew:current")).toBeUndefined();
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(0);
  t.broadcast();
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(0);
  t.join();
  t.run.crew.reset();
  expect(t.join("Bob").reason).toBe("joined");
});
test("stale, future, replayed and wrong-platform requests are rejected without mutation", async () => {
  const t = await setup();
  const b = t.body();
  expect(t.run.crew.execute({ ...b, platform: "twitch" }).reason).toBe(
    "mode_mismatch",
  );
  expect(
    t.run.crew.execute({
      ...b,
      timestamp: new Date(t.clock.now() - 11000).toISOString(),
    }).reason,
  ).toBe("request_expired");
  expect(
    t.run.crew.execute({
      ...b,
      timestamp: new Date(t.clock.now() + 3000).toISOString(),
    }).reason,
  ).toBe("request_expired");
  expect(t.run.crew.execute(b).reason).toBe("joined");
  t.run.crew = new Crew(t.run);
  t.broadcast();
  expect(t.run.crew.execute(b).reason).toBe("duplicate");
  expect(t.run.crew.snapshot().departments.SCI).toHaveLength(1);
});
test("explicit routing protects safety and keeps unsupported editorial families unchanged", async () => {
  const t = await setup();
  for (const [type, dep] of [
    ["elite.exobiology.highValueDiscovery", "SCI"],
    ["elite.exploration.remarkableBody", "SCI"],
    ["elite.ship.fuel.low", "ENG"],
    ["shipos.context.loadout.novel", "ENG"],
  ] as const)
    expect(crewRoute(t.store, t.event(type), definition)?.department).toBe(dep);
  for (const [family, dep] of [
    ["travel", "NAV"],
    ["system-return", "NAV"],
    ["exobiology", "SCI"],
    ["combat", "TAC"],
    ["outfitting", "ENG"],
    ["trade", undefined],
  ]) {
    const e = t.event("shipos.editorial.moment");
    t.store.put("editorial_notes", e.id, { family });
    expect(crewRoute(t.store, e, definition)?.department).toBe(dep);
  }
  for (const type of [
    "elite.ship.destroyed",
    "elite.ship.hull.critical",
    "shipos.broadcast.critical",
    "shipos.broadcast.tension",
    "shipos.broadcast.recovery",
    "shipos.command.ship",
    "shipos.command.loadout",
    "shipos.command.screen",
  ] as const)
    expect(crewRoute(t.store, t.event(type), definition)).toBeNull();
});
test("message banks have meaningful depth and preserve recent rotation over a Core restart", async () => {
  const t = await setup();
  t.join();
  for (const [key, bank] of Object.entries(crewBanks)) {
    expect(bank.length).toBeGreaterThanOrEqual(
      [
        "biology",
        "valuable",
        "remarkable",
        "survey",
        "travel",
        "combat",
      ].includes(key)
        ? 10
        : 5,
    );
    expect(new Set(bank).size).toBe(bank.length);
    expect(
      bank.some((s) => /\{\{|\$\{|undefined|NaN|First Footfall/i.test(s)),
    ).toBe(false);
  }
  const e = t.event("elite.exobiology.highValueDiscovery"),
    history: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (i === 10) {
      t.run.crew = new Crew(t.run);
      t.broadcast();
    }
    const comm = t.run.crew.decorate(e, definition).comm!;
    expect(history.slice(-5)).not.toContain(comm.message);
    expect(comm.facts).toEqual(["FACT", "Observed detail"]);
    history.push(comm.message);
  }
});
test("Director emits one silent COMM, preserves policy, falls back without an officer, critical always wins", async () => {
  const t = await setup();
  t.join("Alice", "ENG");
  const actions: string[] = [];
  t.run.engine.listeners.add((a) => actions.push(a.type));
  t.send({
    event: "Status",
    Flags: 16777224 + 524288,
    Fuel: { FuelMain: 1.2 },
  });
  const card = t.run.engine.snapshot()[0]!;
  expect(card.definition.comm).toMatchObject({
    department: "ENG",
    displayName: "Alice",
  });
  expect(card.definition.comm!.facts).toContain(
    "Réservoir principal observé : 1.2 t",
  );
  const original = t.run.registry.present(
    t.run.modules.find((m) => m.manifest.id === "low-fuel")!,
    t.store.events().find((e) => e.id === card.eventId)!,
    card.profile,
  )!;
  expect(card.definition.durationMs).toBe(original.durationMs);
  expect(card.definition.layers).toEqual(original.layers);
  expect(card.definition.slot).toBe(original.slot);
  expect(actions.filter((a) => a === "overlay.show")).toHaveLength(1);
  expect(actions).not.toContain("audio.play");
  expect(
    t.store.get<PresentationRun>("presentation_runs", card.id)?.definition.comm
      ?.displayName,
  ).toBe("CREW MEMBER");
  expect(JSON.stringify(t.store.events())).not.toContain("Alice");
  t.send({ event: "Died" });
  expect(t.run.engine.snapshot()).toHaveLength(1);
  expect(t.run.engine.snapshot()[0]?.definition.comm).toBeUndefined();
  expect(t.run.engine.snapshot()[0]?.definition.title).toBe("SHIP DESTROYED");
  const e = t.event("elite.exobiology.highValueDiscovery");
  expect(t.run.crew.decorate(e, definition)).toBe(definition);
});
test("assignment is low priority, silent, idempotent and cannot queue past Elite shutdown", async () => {
  const t = await setup();
  t.run.crew.configure({ confirmations: true });
  expect(t.join().confirmation).toBe("presented");
  expect(t.run.engine.snapshot()[0]?.definition.comm?.assignment).toBe(true);
  expect(t.join().reason).toBe("already_enrolled");
  expect(
    t.store.events().filter((e) => e.type === "shipos.crew.assignment"),
  ).toHaveLength(1);
  t.clock.advance(5000);
  t.send({ event: "Status", Flags: 524288 });
  expect(t.join("Bob").confirmation).toBe("queued");
  t.send({ event: "Shutdown" });
  t.clock.advance(8000);
  expect(t.run.engine.snapshot().some((r) => r.definition.comm)).toBe(false);
});
test("all named Crew scenarios are isolated, use real source rules and keep SYSTEM fallbacks", async () => {
  const isolated = new IsolatedRuns(modules);
  cleanup.push(() => isolated.close());
  for (const name of crewScenarioNames) {
    const result = await isolated.create(
      "simulation",
      contextScenario(name),
      "instant",
      "source",
      undefined,
      name,
    );
    const run = isolated.runs.get(result.id)!.context;
    const presentations = run.store.all<PresentationRun>("presentation_runs");
    const comms = presentations.filter((p) => p.definition.comm);
    if (["Crew Inactive Officer", "Crew No Officer"].includes(name)) {
      expect(comms, name).toHaveLength(0);
      expect(presentations.length, name).toBeGreaterThan(0);
    } else expect(comms.length, name).toBeGreaterThan(0);
    if (name === "Crew Multiple Officers")
      expect(comms.length).toBeGreaterThanOrEqual(2);
    if (name === "Crew Critical Override")
      expect(
        presentations.some(
          (p) => p.definition.title === "SHIP DESTROYED" && !p.definition.comm,
        ),
      ).toBe(true);
    expect(result.events.some((e) => e.type === "shipos.crew.assignment")).toBe(
      false,
    );
  }
});
