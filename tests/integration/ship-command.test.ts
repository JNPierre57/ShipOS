import { test, expect } from "vitest";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { ReplayClock } from "../../apps/core/src/clock.js";
import { modules } from "../../apps/core/src/modules.js";
import { source } from "../../packages/testkit/src/index.js";
import { ShipCommands } from "../../apps/core/src/ship-command.js";
import { IsolatedRuns } from "../../apps/core/src/isolated-runs.js";
import { contextScenario } from "../../apps/core/src/context-scenarios.js";
import Fastify from "fastify";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shipCommandApi } from "../../apps/core/src/ship-command-api.js";
test("command HTTP entry authenticates and validates input before projection", async () => {
  const t = await setup();
  t.load();
  const app = Fastify();
  const dir = mkdtempSync(join(tmpdir(), "shipos-bridge-"));
  shipCommandApi(app, t.run, dir);
  try {
    const path = join(dir, "chat-bridge.token"),
      token = readFileSync(path, "utf8");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const data = {
      requestId: "http-test",
      timestamp: new Date(t.clock.now()).toISOString(),
      platform: "simulation",
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/commands/ship",
          payload: data,
        })
      ).statusCode,
    ).toBe(401);
    const headers = { authorization: "Bearer " + token };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/commands/ship",
          headers,
          payload: { ...data, ship: "forged" },
        })
      ).statusCode,
    ).toBe(400);
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/commands/ship",
      headers,
      payload: data,
    });
    expect(result.json().status).toBe("presented");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/commands/ship",
          headers,
          payload: data,
        })
      ).json().reason,
    ).toBe("duplicate");
  } finally {
    await app.close();
    t.run.close();
    rmSync(dir, { recursive: true });
  }
});
async function setup() {
  const store = new Store(":memory:");
  await store.migrate();
  const clock = new ReplayClock(Date.parse("2026-09-12T12:00:00Z"));
  const run = new RunContext("replay", store, modules, clock);
  let seq = 0,
    id = 0;
  const send = (p: Record<string, unknown>) =>
    run.ingest(
      source({ ...p, timestamp: new Date(clock.now()).toISOString() }, ++seq),
    );
  const request = () =>
    run.shipCommands.execute({
      requestId: "test-" + ++id,
      timestamp: new Date(clock.now()).toISOString(),
      platform: "simulation",
    });
  const status = () =>
    send({
      event: "Status",
      Flags: 16777224,
      Fuel: { FuelMain: 24.6 },
      Cargo: 12,
    });
  const load = () => {
    send({ event: "LoadGame", Commander: "Fixture", ShipID: 1 });
    send({
      event: "Loadout",
      Ship: "cutter",
      ShipID: 1,
      ShipName: "Fixture",
      ShipIdent: "TEST-01",
      FuelCapacity: { Main: 32 },
      CargoCapacity: 128,
      MaxJumpRange: 48.7,
      Rebuy: 18400000,
    });
    status();
  };
  return { run, store, clock, send, request, status, load };
}
test("ship command projects current facts, is silent, and applies global cooldown", async () => {
  const t = await setup();
  t.load();
  const actions: string[] = [];
  t.run.engine.listeners.add((a) => actions.push(a.type));
  expect(t.request().status).toBe("presented");
  const card = t.run.engine.snapshot()[0]!;
  expect(card.definition.terminal!.lines).toEqual([
    "SHIP // IMPERIAL CUTTER",
    "Fixture [TEST-01]",
    "JUMP MAX  48.7 LY",
    "FUEL MAIN  24.6 / 32.0 T",
    "CARGO  12 / 128 T",
    "REBUY  18.40 M CR",
    "SHIELDS  UP",
    "FSD  IDLE",
  ]);
  expect(actions).not.toContain("audio.play");
  expect(t.request().reason).toBe("cooldown");
  t.run.close();
});
test("shutdown keeps historic ship but invalidates commands, including final Status and active card", async () => {
  const t = await setup();
  t.load();
  t.request();
  t.send({ event: "Shutdown" });
  t.status();
  expect(t.run.world.ship.Ship).toBe("cutter");
  expect(t.request().reason).toBe("game_not_active");
  expect(t.run.engine.snapshot()).toHaveLength(0);
  t.run.close();
});
test("stale data and disconnected agent are refused; reconnection requires a fresh Status", async () => {
  const t = await setup();
  t.load();
  t.clock.advance(46000);
  expect(t.request().reason).toBe("telemetry_stale");
  t.run.shipCommands.link = () => ({
    connected: false,
    lastHeartbeat: t.clock.now(),
    agentId: "fixture-agent",
    generation: 1,
  });
  expect(t.request().reason).toBe("agent_unavailable");
  t.run.shipCommands.link = () => ({
    connected: true,
    lastHeartbeat: t.clock.now(),
    agentId: "fixture-agent",
    generation: 2,
  });
  expect(t.request().reason).toBe("awaiting_fresh_telemetry");
  t.status();
  expect(t.request().status).toBe("presented");
  t.run.close();
});
test("cold availability cannot inherit active state from restored WorldState", async () => {
  const t = await setup();
  t.load();
  t.run.shipCommands = new ShipCommands(t.run);
  expect(t.request().reason).toBe("awaiting_fresh_telemetry");
  t.status();
  expect(t.request().status).toBe("presented");
  t.run.close();
});
test("missing optional values are omitted and old ship fields cannot leak across Loadout", async () => {
  const t = await setup();
  t.load();
  t.send({ event: "Loadout", Ship: "empire_trader", ShipID: 2 });
  t.clock.advance(5000);
  expect(t.request().reason).toBe("telemetry_stale");
  t.status();
  expect(t.request().status).toBe("presented");
  expect(t.run.engine.snapshot()[0]!.definition.terminal!.lines).toEqual([
    "SHIP // IMPERIAL CLIPPER",
    "SHIELDS  UP",
    "FSD  IDLE",
  ]);
  t.run.close();
});
test("queued command is revalidated and safety alerts preempt an active card", async () => {
  const t = await setup();
  t.load();
  t.run.engine.start(
    {
      id: "busy",
      type: "shipos.editorial.moment",
      provenance: { mode: "replay" },
    } as never,
    "FULL",
    {
      title: "busy",
      subtitle: "",
      durationMs: 6000,
      accent: "",
      slot: "primary",
      layers: [],
      audioAsset: "",
    },
  );
  expect(t.request().status).toBe("queued");
  t.send({ event: "Shutdown" });
  t.clock.advance(6000);
  expect(t.run.engine.snapshot()).toHaveLength(0);
  t.clock.advance(21000);
  t.load();
  expect(t.request().status).toBe("presented");
  t.send({ event: "Status", Flags: 16777224 + 524288, Fuel: { FuelMain: 1 } });
  expect(t.run.engine.snapshot()[0]!.definition.title).toBe("LOW FUEL");
  t.run.close();
});
test("named demonstrations isolate Cutter, Clipper and unavailable cases", async () => {
  const runs = new IsolatedRuns(modules);
  for (const name of ["Cutter", "Clipper", "Stale", "Disconnected", "NMS"]) {
    const scenario = "Ship Card " + name;
    const result = await runs.create(
      "simulation",
      contextScenario(scenario),
      "instant",
      "source",
      undefined,
      scenario,
    );
    expect(
      result.events.filter((e) => e.type === "shipos.command.ship"),
    ).toHaveLength(["Cutter", "Clipper"].includes(name) ? 1 : 0);
  }
  runs.close();
});
test("death requires a fresh loadout but does not prevent recovery in the same game session", async () => {
  const t = await setup();
  t.load();
  t.send({ event: "Died" });
  t.status();
  expect(t.request().reason).toBe("ship_data_unavailable");
  t.send({ event: "Resurrect" });
  t.send({ event: "Loadout", Ship: "cutter", ShipID: 1 });
  t.status();
  t.clock.advance(31000);
  expect(t.request().status).toBe("presented");
  t.run.close();
});
