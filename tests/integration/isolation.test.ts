import { test, expect } from "vitest";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { modules } from "../../apps/core/src/modules.js";
import {
  IsolatedRuns,
  everythingGoesWrong,
  parseJournals,
} from "../../apps/core/src/isolated-runs.js";
import { source } from "../../packages/testkit/src/index.js";
test("simulation three levels and replay cannot mutate live world, records, milestones, expedition or external bus", async () => {
  const store = new Store(":memory:");
  await store.migrate();
  const live = new RunContext("live", store, modules);
  live.store.put("expeditions", "active", { id: "live-expedition" });
  live.ingest(
    source(
      { event: "Scan", SystemAddress: 1, BodyID: 2, SurfaceGravity: 20 },
      1,
    ),
  );
  const snapshot = () =>
    JSON.stringify({
      world: live.world,
      records: store.all("records"),
      milestones: store.all("milestones"),
      expedition: store.all("expeditions"),
      events: store.events(),
    });
  const before = snapshot();
  let external = 0;
  live.externalBus.add(() => external++);
  const isolated = new IsolatedRuns(modules);
  try {
    for (const level of ["source", "domain", "presentation"] as const) {
      const result = await isolated.create(
        "simulation",
        everythingGoesWrong(),
        "instant",
        level,
      );
      expect(result.state).toBe("completed");
    }
    for (const speed of [1, 5, 20, "instant"] as const) {
      const result = await isolated.create(
        "replay",
        [{ event: "Scan", SystemAddress: 99, BodyID: 3, SurfaceGravity: 1000 }],
        speed,
      );
      expect(result.mode).toBe("replay");
    }
    expect(snapshot()).toBe(before);
    expect(external).toBe(0);
  } finally {
    isolated.close();
    live.close();
  }
});
test("replay parser quarantines malformed lines, ignores partial EOF, supports multiple journals", () => {
  const parsed = parseJournals([
    { name: "part1.log", content: '{"event":"LoadGame"}\nBAD\n{"event":' },
    { name: "part2.log", content: '{"event":"Shutdown"}\n' },
  ]);
  expect(parsed.payloads.map((p) => p.event)).toEqual(["LoadGame", "Shutdown"]);
  expect(parsed.diagnostics).toHaveLength(2);
});
test("non-live RunContext refuses a persistent store even if accidentally injected", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const store = new Store(
    join(mkdtempSync(join(tmpdir(), "shipos-isolation ")), "live.db"),
  );
  await store.migrate();
  expect(() => new RunContext("simulation", store, modules)).toThrow(
    "isolated",
  );
  expect(() => new RunContext("replay", store, modules)).toThrow("isolated");
  store.close();
});
test("replay preserves original raw timestamp and elapsed source clock", async () => {
  const isolated = new IsolatedRuns(modules);
  const payload = {
    event: "Scan",
    timestamp: "2025-01-01T00:00:00Z",
    SystemAddress: 1,
    BodyID: 1,
    StarType: "N",
    UnknownFutureProperty: { a: 1 },
  };
  try {
    const result = await isolated.create("replay", [payload], "instant");
    const context = isolated.runs.get(result.id)!.context;
    expect(result.events[0]?.occurredAt).toBe(payload.timestamp);
    const original = context.store.source(
      result.events[0]!.sourceEventIds[0]!,
    )!.event;
    expect(original.payload).toEqual(payload);
  } finally {
    isolated.close();
  }
});
