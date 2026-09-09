import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "../../apps/core/src/server.js";
import { coreSchema } from "../../apps/core/src/config.js";
import { modules } from "../../apps/core/src/modules.js";
import type { DomainEvent } from "../../packages/contracts/src/index.js";
test.use({ video: { mode: "on", size: { width: 1280, height: 720 } } });
let server: Awaited<ReturnType<typeof createServer>>;
test.beforeAll(async () => {
  server = await createServer(
    coreSchema.parse({
      port: 48916,
      gatewayPort: 48917,
      dataDir: mkdtempSync(join(tmpdir(), "shipos-visuals ")),
    }),
    "visual-test-token",
  );
  await server.start();
});
test.afterAll(async () => server.close());
function event(type: DomainEvent["type"]): DomainEvent {
  return {
    schemaVersion: 1,
    id: "visual-" + type,
    sequence: 0,
    type,
    occurredAt: new Date().toISOString(),
    emittedAt: new Date().toISOString(),
    semanticKey: type,
    sourceEventIds: [],
    provenance: { mode: "simulation", sourceIds: [], quality: "inferred" },
    payload: {
      name: type.includes("exobiology")
        ? "Stratum Tectonicas"
        : "Brambe LM-U d3-231 BC 4",
      estimatedBaseValueCredits: 19010800,
      health: 0.18,
      gravityG: 2.65,
      reasons: ["planet.high_gravity", "planet.many_biological_signals"],
    },
  };
}
test("five visual sequences, resumed timeline, compact and reduced motion, cancellation leaves no animations", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("http://127.0.0.1:48916/overlay");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  await page.addStyleTag({
    content:
      "body { background: radial-gradient(ellipse at 70% 20%, #172638, #050911 70%); }",
  });
  for (const module of modules) {
    const e = event(module.manifest.eventType);
    const definition = module.present(e, "FULL");
    const run = server.run.engine.start(e, "FULL", definition);
    await expect(page.locator(".card")).toHaveAttribute(
      "data-visual",
      definition.visual!,
    );
    await expect(page.locator(".detail")).toHaveText(definition.detail!);
    await page.waitForTimeout(definition.durationMs * 0.16);
    const initialPosition = await page
      .locator(".stage-instrument")
      .boundingBox();
    await expect(page.locator(".stage-readout")).toHaveCSS("opacity", "0");
    await page.screenshot({
      path: `test-results/choreography-${definition.visual}-acquire.png`,
    });
    await page.waitForTimeout(definition.durationMs * 0.26);
    if (definition.visual === "signal-loss") {
      await expect(page.locator(".stage-instrument")).toHaveCSS("opacity", "0");
      await expect(page.locator(".stage-readout")).toHaveCSS("opacity", "0");
    }
    await page.screenshot({
      path: `test-results/choreography-${definition.visual}-transition.png`,
    });
    await page.waitForTimeout(definition.durationMs * 0.26);
    if (definition.visual !== "signal-loss") {
      const finalPosition = await page
        .locator(".stage-instrument")
        .boundingBox();
      expect(Math.abs(finalPosition!.x - initialPosition!.x)).toBeGreaterThan(
        150,
      );
    }
    await expect
      .poll(() =>
        page
          .locator(".detail")
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBe(1);
    await page.screenshot({
      path: `test-results/visual-${definition.visual}.png`,
    });
    if (definition.visual === "biology") {
      await page.reload();
      await page.addStyleTag({
        content:
          "body { background: radial-gradient(ellipse at 70% 20%, #172638, #050911 70%); }",
      });
      await expect(page.locator(".metric-block strong")).toHaveText(
        "19,010,800",
      );
      await expect
        .poll(() =>
          page
            .locator(".card")
            .evaluate((el) =>
              parseFloat(
                (el as HTMLElement).style.getPropertyValue("--offset"),
              ),
            ),
        )
        .toBeLessThan(-2000);
      await expect
        .poll(() =>
          page
            .locator(".metric-block")
            .evaluate((el) => Number(getComputedStyle(el).opacity)),
        )
        .toBe(1);
    }
    server.run.engine.finish(run.id, "interrupted");
    await expect(page.locator(".card,.global-pulse")).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    ).toBe(0);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const module = modules[0]!;
  const e = event(module.manifest.eventType);
  const full = server.run.engine.start(e, "FULL", module.present(e, "FULL"));
  await expect(page.locator(".detail")).toBeVisible();
  await expect(page.locator(".detail")).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  server.run.engine.finish(full.id, "interrupted");
  await expect(page.locator(".card")).toHaveCount(0);
  const compact = server.run.engine.start(
    e,
    "COMPACT",
    module.present(e, "COMPACT"),
  );
  await expect(page.locator(".card")).toHaveClass(/compact/);
  await expect(page.locator(".global-pulse")).toBeHidden();
  await page.screenshot({ path: "test-results/visual-compact.png" });
  server.run.engine.finish(compact.id, "interrupted");
  await expect(page.locator(".card,.global-pulse")).toHaveCount(0);
});

test("natural FULL completion fades and removes every transient", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:48916/overlay");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  const module = modules[2]!;
  const e = event(module.manifest.eventType);
  const definition = module.present(e, "FULL");
  const run = server.run.engine.start(e, "FULL", definition);
  await expect(page.locator(".card")).toHaveCount(1);
  await page.waitForTimeout(definition.durationMs * 0.96);
  expect(
    await page
      .locator(".card")
      .evaluate((el) => Number(getComputedStyle(el).opacity)),
  ).toBeLessThan(0.8);
  await expect(page.locator(".card,.global-pulse")).toHaveCount(0);
  expect(server.run.engine.active.has(run.id)).toBe(false);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
