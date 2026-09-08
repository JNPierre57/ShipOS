import { test, expect } from "vitest";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { VirtualClock } from "../../apps/core/src/clock.js";
import { shipDestroyed } from "../../modules/ship-destroyed/src/index.js";
import { source } from "../../packages/testkit/src/index.js";
for (const [flags, flags2, expected] of [
  [16777216, 0, 1],
  [0, 1, 0],
  [67108864, 0, 0],
  [33554432, 0, 0],
  [16777216, 2, 0],
  [0, 0, 0],
])
  test(`Died context ${flags}/${flags2}`, async () => {
    const store = new Store(":memory:");
    await store.migrate();
    const run = new RunContext(
      "live",
      store,
      [shipDestroyed],
      new VirtualClock(Date.parse("2026-09-08T10:00:00Z")),
    );
    const actions: string[] = [];
    run.engine.listeners.add((a) => actions.push(a.type));
    run.ingest(source({ event: "Status", Flags: flags, Flags2: flags2 }, 1));
    run.ingest(source({ event: "Died" }, 2));
    expect(store.events()).toHaveLength(expected!);
    expect(actions.filter((a) => a === "overlay.show")).toHaveLength(expected!);
    run.close();
  });
test("bootstrap death does not publish or present", async () => {
  const store = new Store(":memory:");
  await store.migrate();
  const run = new RunContext("live", store, [shipDestroyed]);
  run.ingest(source({ event: "Status", Flags: 16777216 }, 1, "bootstrap"));
  run.ingest(source({ event: "Died" }, 2, "bootstrap"));
  expect(store.events()).toHaveLength(0);
  run.close();
});
