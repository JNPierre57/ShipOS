import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../apps/core/src/server.js";
import { coreSchema } from "../../apps/core/src/config.js";
import { source } from "../../packages/testkit/src/index.js";
import type { DomainEvent } from "../../packages/contracts/src/index.js";
let server: Awaited<ReturnType<typeof createServer>>;
test.beforeAll(async () => {
  server = await createServer(
    coreSchema.parse({
      port: 48918,
      gatewayPort: 48919,
      dataDir: mkdtempSync(join(tmpdir(), "shipos-context-browser ")),
    }),
    "context-fixture",
  );
  await server.start();
});
test.afterAll(async () => server.close());
test("loadout renders a bounded animated module summary in the existing overlay", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("http://127.0.0.1:48918/overlay/?motion=full");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  const response = await page.request.post(
    "http://127.0.0.1:48918/api/v1/simulation",
    {
      data: {
        level: "source",
        scenario: "Loadout Combat Engineered",
        speed: 1,
      },
    },
  );
  expect(response.ok()).toBe(true);
  await expect(page.getByText("LOADOUT // IMPERIAL CUTTER")).toBeVisible();
  await expect(
    page.getByText("Efficient G5 · Plasma Slug", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".terminal-lines > div").last()).toHaveCSS(
    "opacity",
    "1",
  );
  const box = await page.locator('[data-loadout="true"]').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.height).toBeLessThan(800);
  await page.screenshot({
    path: "test-results/loadout-card.png",
    omitBackground: true,
  });
  await expect(page.locator(".card")).toHaveCount(0, { timeout: 12000 });
});
test("ship source simulation renders all eight animated lines without an extra source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("http://127.0.0.1:48918/overlay/?motion=full");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  const response = await page.request.post(
    "http://127.0.0.1:48918/api/v1/simulation",
    { data: { level: "source", scenario: "Ship Card Cutter", speed: 1 } },
  );
  expect(response.ok()).toBe(true);
  await expect(page.getByText("SHIP // IMPERIAL CUTTER")).toBeVisible();
  await expect(
    page.getByText("CARGO  12 / 128 T", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("FSD  IDLE", { exact: false })).toBeVisible();
  await expect(page.locator(".terminal-lines > div")).toHaveCount(8);
  await expect(page.locator(".terminal-lines > div").last()).toHaveCSS(
    "opacity",
    "1",
  );
  await page.screenshot({
    path: "test-results/ship-card.png",
    omitBackground: true,
  });
  await expect(page.locator(".card")).toHaveCount(0, { timeout: 10000 });
});
test("historical return renders contextual animated lines and exposes its evidence in Context Lab", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:48918/overlay/?motion=full");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  const response = await page.request.post(
    "http://127.0.0.1:48918/api/v1/simulation",
    { data: { level: "source", scenario: "System Return", speed: 1 } },
  );
  expect(response.ok()).toBe(true);
  await expect(page.getByText("KNOWN SYSTEM REACQUIRED")).toBeVisible();
  await expect(page.getByText("Remembered Haven")).toBeVisible();
  await expect(page.getByText(/LAST OBSERVED 23 DAYS AGO/)).toBeVisible();
  expect(
    await page
      .locator(".terminal-lines > div")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).not.toBe("none");
  await page.goto("http://127.0.0.1:48918/control/?view=context");
  await expect(
    page.getByRole("heading", { name: "Editorial memory · why this alert?" }),
  ).toBeVisible();
  const runs = await (
    await page.request.get("http://127.0.0.1:48918/api/v1/runs")
  ).json();
  const run =
    runs.find((r: { scenario?: string }) => r.scenario === "System Return") ??
    runs[0];
  await page.getByLabel("Inspect run", { exact: true }).selectOption(run.id);
  await expect(
    page.getByText(/system-return · eligible · return_after_absence/),
  ).toBeVisible();
  await page.request.post("http://127.0.0.1:48918/api/v1/simulation", {
    data: { level: "source", scenario: "Quiet Travel", speed: 1 },
  });
});
test("source New Build displays twice, then Quiet Travel replaces and clears the preview", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:48918/overlay/?motion=full");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post(
      "http://127.0.0.1:48918/api/v1/simulation",
      { data: { level: "source", scenario: "New Build", speed: 1 } },
    );
    expect(response.ok()).toBe(true);
    await expect(
      page.getByText("CONFIGURATION SIGNATURE UNKNOWN"),
    ).toBeVisible();
    const quiet = await page.request.post(
      "http://127.0.0.1:48918/api/v1/simulation",
      { data: { level: "source", scenario: "Quiet Travel", speed: 1 } },
    );
    expect(quiet.ok()).toBe(true);
    await expect(page.locator(".card")).toHaveCount(0);
  }
});
test("queued OS cue is invalidated by an exclusive fatal sequence", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:48918/overlay/?motion=full");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  const make = (type: DomainEvent["type"], id: string): DomainEvent => ({
    schemaVersion: 1,
    id,
    sequence: 0,
    type,
    occurredAt: new Date().toISOString(),
    emittedAt: new Date().toISOString(),
    semanticKey: id,
    sourceEventIds: [],
    payload: {},
    provenance: { mode: "simulation", sourceIds: [], quality: "derived" },
  });
  const get = (type: string) => {
    const m = server.run.modules.find((m) => m.manifest.eventType === type)!;
    return { ...m, policy: { ...m.policy, cooldownMs: 0, attentionCost: 0 } };
  };
  const a = make("shipos.context.loadout.novel", "queue-novel"),
    b = make("shipos.broadcast.recovery", "queue-recovery"),
    fatal = make("elite.ship.destroyed", "queue-fatal");
  expect(server.run.director.decide(a, get(a.type)).status).toBe("presented");
  expect(server.run.director.decide(b, get(b.type)).status).toBe("queued");
  expect(server.run.director.decide(fatal, get(fatal.type)).interruption).toBe(
    true,
  );
  expect(server.run.director.queue).toHaveLength(0);
  expect(server.store.get("director_decisions", b.id)).toMatchObject({
    status: "suppressed",
    reasons: expect.arrayContaining(["exclusive_queue_invalidated"]),
  });
  await expect(page.locator(".terminal")).toHaveCount(1);
  await expect(page.locator(".terminal")).toHaveAttribute(
    "data-primitive",
    "FatalSequence",
  );
  server.run.engine.cancelAll();
  await expect(page.locator(".card")).toHaveCount(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
test("OS primitives reveal lines, resume, compact and cancel without ghost DOM or animations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:48918/overlay/?motion=full");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  const types = [
    "elite.ship.destroyed",
    "elite.ship.hull.critical",
    "elite.ship.fuel.low",
    "elite.exobiology.highValueDiscovery",
    "elite.exploration.remarkableBody",
    "shipos.context.loadout.novel",
    "shipos.broadcast.recovery",
  ];
  for (const [i, eventType] of types.entries()) {
    const response = await page.request.post(
      "http://127.0.0.1:48918/api/v1/simulation",
      {
        data: {
          level: "presentation",
          scenario: "single",
          eventType,
          speed: 1,
        },
      },
    );
    expect(response.ok()).toBe(true);
    const run = await response.json();
    await expect(page.locator(".terminal")).toHaveCount(1);
    await page.waitForTimeout(320);
    if ((await page.locator(".terminal-lines>div").count()) > 1)
      await expect(page.locator(".terminal-lines>div").nth(1)).toHaveCSS(
        "opacity",
        "0",
      );
    await page.waitForTimeout(900);
    await expect(page.locator(".terminal-lines>div").last()).toHaveCSS(
      "opacity",
      "1",
    );
    await page.screenshot({ path: `test-results/terminal-${i}.png` });
    await page.reload();
    await expect(page.locator(".terminal-lines>div").last()).toHaveCSS(
      "opacity",
      "1",
    );
    await page.request.post(
      `http://127.0.0.1:48918/api/v1/runs/${run.id}/cancel`,
      { data: {} },
    );
    await expect(page.locator(".card")).toHaveCount(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  }
  await page.goto("http://127.0.0.1:48918/overlay/");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  const module = server.run.modules.find(
    (m) => m.manifest.eventType === "shipos.broadcast.recovery",
  )!;
  const e = {
    schemaVersion: 1 as const,
    id: "compact-terminal",
    sequence: 0,
    type: module.manifest.eventType,
    occurredAt: new Date().toISOString(),
    emittedAt: new Date().toISOString(),
    semanticKey: "compact",
    sourceEventIds: [],
    payload: {},
    provenance: {
      mode: "simulation" as const,
      sourceIds: [],
      quality: "derived" as const,
    },
  };
  server.run.engine.start(e, "COMPACT", module.present(e, "COMPACT"));
  await expect(page.locator(".terminal-lines>div")).toHaveCount(1);
  await expect(page.locator(".terminal")).toHaveCSS("animation-name", "none");
  server.run.engine.cancelAll();
  await expect(page.locator(".terminal")).toHaveCount(0);
});
test("Context Lab shows 14 scores, their evidence, ship memory and isolated replay", async ({
  page,
}) => {
  const timestamp = new Date().toISOString();
  server.run.ingest(
    source({ event: "LoadGame", Commander: "Browser fixture", timestamp }, 1),
  );
  server.run.ingest(
    source(
      {
        event: "Loadout",
        ShipID: 4,
        Ship: "asp",
        ShipName: "Lab Ship",
        Modules: [{ Slot: "Engine", Item: "test" }],
        timestamp,
      },
      2,
    ),
  );
  server.run.ingest(
    source({ event: "ScanOrganic", ScanType: "Log", timestamp }, 3),
  );
  await page.goto("http://127.0.0.1:48918/control");
  await page
    .locator("nav")
    .getByRole("button", { name: /Context Lab/ })
    .click();
  await expect(page.locator(".context-activity")).toHaveCount(14);
  await page.getByRole("button", { name: /^exobiology/ }).click();
  await expect(page.locator(".context-evidence")).toContainText("ScanOrganic");
  await expect(page.getByText("Lab Ship", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/context-lab.png",
    fullPage: true,
  });
  const replay = await page.request.post(
    "http://127.0.0.1:48918/api/v1/simulation",
    { data: { scenario: "Close Call", speed: "instant" } },
  );
  expect(replay.ok()).toBe(true);
  const r = await replay.json();
  await expect(page.getByLabel("Inspect")).toContainText(r.id.slice(0, 8));
  await page.getByLabel("Inspect").selectOption(r.id);
  await expect(page.getByText(/CRITICAL → RECOVERY/)).toBeVisible();
});
