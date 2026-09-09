import { RunContext } from "../dist/apps/core/src/runtime.js";
import { Store } from "../dist/apps/core/src/store.js";
import { ReplayClock } from "../dist/apps/core/src/clock.js";
import { modules } from "../dist/apps/core/src/modules.js";
import { source } from "../dist/packages/testkit/src/index.js";
const store = new Store(":memory:");
await store.migrate();
const clock = new ReplayClock(Date.parse("2026-09-08T10:00:00Z"));
const run = new RunContext("replay", store, modules, clock);
const cpu = process.cpuUsage(),
  start = performance.now(),
  rss = process.memoryUsage().rss;
const timings = [];
for (let i = 0; i < 3600; i++) {
  clock.advance(1000);
  const event =
    i % 180 === 0
      ? { event: "FSDJump", StarSystem: "Benchmark", SystemAddress: 42 }
      : i % 60 === 0
        ? {
            event: "ScanOrganic",
            ScanType: "Log",
            Species: "synthetic_species",
          }
        : { event: "Status", Flags: 16777224 };
  const at = performance.now();
  run.ingest(
    source({ ...event, timestamp: new Date(clock.now()).toISOString() }, i + 1),
  );
  timings.push(performance.now() - at);
}
timings.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      records: 3600,
      simulatedSeconds: 3600,
      wallMs: performance.now() - start,
      cpu: process.cpuUsage(cpu),
      rssStart: rss,
      rssEnd: process.memoryUsage().rss,
      ingestP50Ms: timings[1800],
      ingestP95Ms: timings[3420],
      ingestMaxMs: timings.at(-1),
      context: run.context?.metrics,
    },
    null,
    2,
  ),
);
run.close();
