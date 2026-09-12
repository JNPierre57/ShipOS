import { Store } from "../dist/apps/core/src/store.js";
import { RunContext } from "../dist/apps/core/src/runtime.js";
import { ReplayClock } from "../dist/apps/core/src/clock.js";
import { modules } from "../dist/apps/core/src/modules.js";
import { source } from "../dist/packages/testkit/src/index.js";
const store = new Store(":memory:");
await store.migrate();
const clock = new ReplayClock(Date.parse("2026-09-12T12:00:00Z"));
const run = new RunContext("replay", store, modules, clock);
let seq = 0;
const send = (p) =>
  run.ingest(
    source({ ...p, timestamp: new Date(clock.now()).toISOString() }, ++seq),
  );
send({ event: "LoadGame", Commander: "Benchmark", ShipID: 1 });
send({
  event: "Loadout",
  Ship: "cutter",
  ShipID: 1,
  FuelCapacity: { Main: 32 },
  CargoCapacity: 128,
  MaxJumpRange: 48.7,
  Rebuy: 18400000,
});
const timings = [];
for (let i = 0; i < 300; i++) {
  clock.advance(21000);
  send({
    event: "Status",
    Flags: 16777224,
    Fuel: { FuelMain: 24.6 },
    Cargo: 12,
  });
  const start = performance.now();
  const result = run.shipCommands.execute({
    requestId: "bench-" + i,
    timestamp: new Date(clock.now()).toISOString(),
    platform: "simulation",
  });
  if (result.status !== "presented") throw Error(JSON.stringify(result));
  timings.push(performance.now() - start);
}
timings.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      commands: 300,
      p50Ms: timings[150],
      p95Ms: timings[285],
      maxMs: timings.at(-1),
    },
    null,
    2,
  ),
);
run.close();
