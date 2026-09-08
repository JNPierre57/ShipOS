import { source } from "../../packages/testkit/src/index.js";
import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "../../apps/core/src/server.js";
import { coreSchema } from "../../apps/core/src/config.js";
let server: Awaited<ReturnType<typeof createServer>>;
test.beforeEach(async () => {
  server = await createServer(
    coreSchema.parse({
      port: 48912,
      gatewayPort: 48913,
      dataDir: mkdtempSync(join(tmpdir(), "shipos-control ")),
    }),
    "browser-control-token",
  );
  await server.start();
});
test.afterEach(async () => server.close());
test("main control journeys, isolated scenario, expedition, audio, replay, backup", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:48912/control");
  await expect(
    page.getByRole("heading", { name: "Your ship. In focus." }),
  ).toBeVisible();
  const nav = (name: string) =>
    page
      .locator("nav")
      .getByRole("button", { name: new RegExp(name) })
      .click();
  await nav("Modules");
  const module = page.locator("section").filter({
    has: page.getByRole("heading", { name: "ship-destroyed", exact: true }),
  });
  await module.getByLabel("Enabled").uncheck();
  await expect
    .poll(() => server.run.registry.status.get("ship-destroyed")?.enabled)
    .toBe(false);
  await module.getByLabel("Enabled").check();
  await module.getByLabel("Configuration").fill('{"contextMaxAgeMs":45000}');
  await module.getByRole("button", { name: "Save configuration" }).click();
  await expect
    .poll(
      () =>
        server.run.registry.status.get("ship-destroyed")?.config
          .contextMaxAgeMs,
    )
    .toBe(45000);
  await nav("Agent");
  await expect(
    page.getByRole("heading", { name: "Agent diagnostics" }),
  ).toBeVisible();
  await nav("World State");
  await expect(
    page.getByRole("heading", { name: "World state", exact: true }),
  ).toBeVisible();
  await nav("Expedition");
  await page.getByLabel("Name", { exact: true }).fill("Browser journey");
  await page.getByRole("button", { name: "Start expedition" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser journey" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "End expedition" }).click();
  await expect(
    page.getByRole("button", { name: "Start expedition" }),
  ).toBeVisible();
  await nav("Audio");
  await page.getByRole("slider", { name: "master volume" }).fill("0.25");
  await page.getByRole("button", { name: "Save volumes" }).click();
  await expect
    .poll(
      () => server.store.get<{ master: number }>("settings", "audio")?.master,
    )
    .toBe(0.25);
  await nav("Simulation");
  await page.getByRole("button", { name: "Launch simulation" }).click();
  await expect(
    page.getByRole("heading", { name: "Isolated run history" }),
  ).toBeVisible();
  expect(server.store.events()).toHaveLength(0);
  await nav("Replay");
  await page.getByLabel("Journal files").setInputFiles({
    name: "Journal.test.log",
    mimeType: "text/plain",
    buffer: Buffer.from(
      '{"event":"Scan","SystemAddress":1,"BodyID":1,"StarType":"N"}\n',
    ),
  });
  await page.getByRole("button", { name: "Start replay" }).click();
  await expect(page.locator("pre")).toContainText(
    "elite.exploration.remarkableBody",
  );
  await nav("Director");
  await expect(
    page.getByRole("heading", { name: "Decision history" }),
  ).toBeVisible();
  await nav("System");
  await page.getByRole("button", { name: "Create backup" }).click();
  await expect(page.locator("pre").last()).toContainText("backups");
  const timestamp = new Date().toISOString();
  server.run.ingest(source({ event: "Status", Flags: 16777216, timestamp }, 1));
  server.run.ingest(source({ event: "Died", timestamp }, 2));
  await nav("Events");
  await page.getByRole("button", { name: /elite.ship.destroyed/ }).click();
  await expect(
    page.getByRole("heading", { name: /Event Inspector/ }),
  ).toBeVisible();
  await expect(page.locator("pre").first()).toContainText("sourceEventIds");
  await nav("Overview");
  await page.screenshot({
    path: "test-results/control-overview.png",
    fullPage: true,
  });
});
test("overlay audio starts, missing asset degrades, interruption cleans DOM and sources", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createOscillator;
    const counters = { started: 0, stopped: 0 };
    Object.assign(window, { audioCounters: counters });
    AudioContext.prototype.createOscillator = function () {
      const osc = original.call(this);
      const start = osc.start.bind(osc),
        stop = osc.stop.bind(osc);
      osc.start = (...args) => {
        counters.started++;
        start(...args);
      };
      osc.stop = (...args) => {
        counters.stopped++;
        stop(...args);
      };
      return osc;
    };
  });
  await page.goto("http://127.0.0.1:48912/overlay");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  await page.mouse.click(10, 10);
  await expect.poll(() => server.getAudio()).toBe("READY");
  const response = await page.request.post(
    "http://127.0.0.1:48912/api/v1/simulation",
    {
      data: {
        level: "presentation",
        scenario: "single",
        eventType: "elite.ship.destroyed",
        speed: 1,
      },
    },
  );
  expect(response.ok()).toBe(true);
  await expect(page.locator(".card")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { audioCounters: { started: number } })
            .audioCounters.started,
      ),
    )
    .toBeGreaterThan(0);
  const result = await response.json();
  await page.request.post(
    `http://127.0.0.1:48912/api/v1/runs/${result.id}/cancel`,
    { data: {} },
  );
  await expect(page.locator(".card")).toHaveCount(0);
  const run = server.run.engine.start(
    {
      schemaVersion: 1,
      id: "browser-missing-asset",
      sequence: 0,
      type: "elite.ship.destroyed",
      occurredAt: new Date().toISOString(),
      emittedAt: new Date().toISOString(),
      semanticKey: "missing",
      sourceEventIds: [],
      payload: {},
      provenance: { mode: "simulation", sourceIds: [], quality: "inferred" },
    },
    "FULL",
    {
      title: "Missing asset test",
      subtitle: "Visual continues",
      accent: "#fff",
      durationMs: 1000,
      slot: "primary",
      layers: ["EventLayer"],
      audioAsset: "absent-asset",
    },
  );
  await expect(
    page.getByRole("heading", { name: "Missing asset test" }),
  ).toBeVisible();
  await expect.poll(() => server.getAudio()).toBe("DEGRADED");
  server.run.engine.finish(run.id, "interrupted");
  await expect(page.locator(".card")).toHaveCount(0);
});
