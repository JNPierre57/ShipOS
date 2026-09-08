import { test, expect } from "vitest";
import { Store } from "../../apps/core/src/store.js";
import { RunContext, eventFactory } from "../../apps/core/src/runtime.js";
import { VirtualClock } from "../../apps/core/src/clock.js";
import { modules } from "../../apps/core/src/modules.js";
import { source } from "../../packages/testkit/src/index.js";
import type { ShipModule } from "../../packages/module-sdk/src/index.js";
async function setup() {
  const store = new Store(":memory:");
  await store.migrate();
  const clock = new VirtualClock(Date.parse("2026-09-08T10:00:00Z"));
  return { clock, run: new RunContext("live", store, modules, clock) };
}
const event = (m: ShipModule, n: number, clock: VirtualClock) =>
  eventFactory(
    m.manifest.id,
    {
      type: m.manifest.eventType,
      semanticKey: "test:" + n,
      payload: { name: "Test body", reasons: ["planet.earth_like"] },
      quality: "derived",
    },
    source(
      { timestamp: new Date(clock.now()).toISOString(), event: "Test" },
      n,
    ),
    "live",
    clock,
  );
test("urgent interruption cancels timers/actions; exclusive clears queue", async () => {
  const { clock, run } = await setup();
  const minor = modules[4]!,
    hull = modules[1]!,
    death = modules[0]!;
  const first = event(minor, 1, clock);
  run.director.decide(first, minor);
  const queued = event(
    { ...minor, policy: { ...minor.policy, cooldownMs: 0 } },
    2,
    clock,
  );
  run.director.decide(queued, {
    ...minor,
    policy: { ...minor.policy, cooldownMs: 0 },
  });
  const actions: string[] = [];
  run.engine.listeners.add((a) =>
    actions.push(a.type + ":" + a.presentationRunId),
  );
  run.director.decide(event(hull, 3, clock), hull);
  expect(
    run.store.get<{ status: string }>("director_decisions", first.id)?.status,
  ).toBe("interrupted");
  expect(clock.pending).toBe(1);
  run.director.decide(event(death, 4, clock), death);
  expect(run.director.queue).toHaveLength(0);
  expect(run.engine.snapshot()).toHaveLength(1);
  run.director.stop();
  expect(clock.pending).toBe(0);
  const count = actions.length;
  clock.advance(100000);
  expect(actions).toHaveLength(count);
  run.close();
});
test("TTL, budget, COMPACT, SILENT, exact idempotency and cooldown decisions", async () => {
  const { clock, run } = await setup();
  const module = modules[4]!;
  const old = event(module, 1, clock);
  clock.advance(40000);
  expect(run.director.decide(old, module).status).toBe("expired");
  run.director.config.budget = 2;
  const compact = event(module, 2, clock);
  expect(run.director.decide(compact, module).profile).toBe("COMPACT");
  expect(run.director.decide(compact, module).eventId).toBe(compact.id);
  expect(run.engine.snapshot()).toHaveLength(1);
  expect(
    run.director.decide(event(module, 3, clock), module).reasons,
  ).toContain("cooldown");
  clock.advance(30000);
  run.director.config.budget = 0;
  expect(run.director.decide(event(module, 4, clock), module).profile).toBe(
    "SILENT",
  );
  run.close();
});
test("bounded queue and factory failure do not kill engine", async () => {
  const { clock, run } = await setup();
  const m = {
    ...modules[4]!,
    policy: { ...modules[4]!.policy, cooldownMs: 0, attentionCost: 0 },
  };
  run.director.config.queueMax = 2;
  for (let n = 1; n < 6; n++) run.director.decide(event(m, n, clock), m);
  expect(run.director.queue).toHaveLength(2);
  run.director.stop();
  const broken = {
    ...modules[0]!,
    present: () => {
      throw Error("factory");
    },
  };
  expect(run.director.decide(event(broken, 7, clock), broken).status).toBe(
    "failed",
  );
  run.close();
});
test("exclusive run keeps attention against a subsequent hull alert", async () => {
  const { clock, run } = await setup();
  const death = modules[0]!,
    hull = modules[1]!;
  const first = event(death, 1, clock);
  run.director.decide(first, death);
  const decision = run.director.decide(event(hull, 2, clock), hull);
  expect(decision.status).toBe("queued");
  expect(run.engine.snapshot()[0]?.eventId).toBe(first.id);
  run.close();
});
