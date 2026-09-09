import { RunContext } from "../dist/apps/core/src/runtime.js";
import { Store } from "../dist/apps/core/src/store.js";
import { ReplayClock } from "../dist/apps/core/src/clock.js";
import { modules } from "../dist/apps/core/src/modules.js";
import { source } from "../dist/packages/testkit/src/index.js";

// Local synthetic comparison; no live sources, overlay connection or personal data.
async function measure(enabled) {
  const store = new Store(":memory:");
  await store.migrate();
  const clock = new ReplayClock(Date.parse("2026-09-08T10:00:00Z"));
  const run = new RunContext("replay", store, modules, clock);
  if (!enabled) run.editorial.observe = () => ({});
  run.ingest(
    source({ event: "LoadGame", Commander: "Performance Fixture" }, 1),
  );
  for (let i = 0; i < 325; i++)
    run.world.bodies[String(i)] = {
      systemAddress: 42,
      bodyId: i,
      name: "Synthetic " + i,
      wasFootfalled: false,
      biologicalSignals: 0,
      sourceIds: [],
      scan: { description: "x".repeat(1150) },
    };
  const worldBytes = Buffer.byteLength(JSON.stringify(run.world));
  const timings = [],
    start = performance.now(),
    cpu = process.cpuUsage();
  for (let i = 1; i <= 1200; i++) {
    clock.advance(1000);
    const payload =
      i % 120 === 0
        ? {
            event: "ScanOrganic",
            ScanType: "Analyse",
            Species: "fixture",
            Species_Localised: "Synthetic organism",
          }
        : i % 60 === 0
          ? { event: "FSDJump", StarSystem: "Synthetic " + i, SystemAddress: i }
          : { event: "Status", Flags: 16777224 };
    const at = performance.now();
    run.ingest(
      source(
        { ...payload, timestamp: new Date(clock.now()).toISOString() },
        i + 1,
      ),
    );
    timings.push(performance.now() - at);
  }
  timings.sort((a, b) => a - b);
  const result = {
    enabled,
    records: 1200,
    worldBytes,
    wallMs: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    p50Ms: timings[600],
    p95Ms: timings[1140],
    maxMs: timings.at(-1),
    memoryFacts: store.all("editorial_memory").length,
    notes: store.all("editorial_notes").length,
  };
  run.close();
  return result;
}
console.log(
  JSON.stringify(
    [await measure(false), await measure(true), await measure(false)],
    null,
    2,
  ),
);
