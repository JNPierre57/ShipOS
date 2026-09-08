import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { modules } from "../../apps/core/src/modules.js";
import { VirtualClock } from "../../apps/core/src/clock.js";
import { source } from "../../packages/testkit/src/index.js";
const cases = JSON.parse(readFileSync("fixtures/golden.json", "utf8")) as {
  name: string;
  payloads: Record<string, unknown>[];
  expected: string[];
}[];
for (const fixture of cases)
  test(fixture.name, async () => {
    const store = new Store(":memory:");
    await store.migrate();
    const run = new RunContext(
      "replay",
      store,
      modules,
      new VirtualClock(Date.parse("2026-09-08T10:00:00Z")),
    );
    fixture.payloads.forEach((p, i) => run.ingest(source(p, i + 1)));
    expect(store.events().map((e) => e.type)).toEqual(fixture.expected);
    expect(store.events().every((e) => e.provenance.mode === "replay")).toBe(
      true,
    );
    run.close();
  });
