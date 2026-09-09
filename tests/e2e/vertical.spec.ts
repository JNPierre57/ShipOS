import { test, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createServer } from "../../apps/core/src/server.js";
import { coreSchema } from "../../apps/core/src/config.js";
import { source } from "../../packages/testkit/src/index.js";
let server: Awaited<ReturnType<typeof createServer>>;
test.beforeAll(async () => {
  server = await createServer(
    coreSchema.parse({
      port: 48910,
      gatewayPort: 48911,
      dataDir: mkdtempSync(join(tmpdir(), "shipos-browser ")),
    }),
    "browser-fixture-token",
  );
  await server.start();
});
test.afterAll(async () => server.close());
test("Gateway → durable inbox → Died detector → actual overlay, reconnect, cleanup", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:48910/overlay");
  await expect(page.locator("main")).toHaveAttribute("data-connected", "true");
  const socket = new WebSocket("ws://127.0.0.1:48911/agent/v1/ws", {
    headers: { Authorization: "Bearer browser-fixture-token" },
  });
  await new Promise<void>((r) => socket.once("open", r));
  const send = async (data: unknown) => {
    const pending = new Promise((r) => socket.once("message", r));
    socket.send(JSON.stringify(data));
    await pending;
  };
  await send({
    type: "hello",
    protocolVersion: 1,
    agentId: "fixture-agent",
    agentVersion: "test",
    lastAckedSequence: 0,
  });
  const timestamp = new Date().toISOString();
  await send({
    type: "source_event",
    event: source({ event: "Status", Flags: 16777216, timestamp }, 1),
  });
  await send({
    type: "source_event",
    event: source({ event: "Died", timestamp }, 2),
  });
  await expect(page.getByText("VESSEL SIGNAL LOST")).toBeVisible();
  await page.reload();
  await expect(page.getByText("VESSEL SIGNAL LOST")).toBeVisible();
  server.run.engine.cancelAll();
  await expect(page.locator(".card")).toHaveCount(0);
  await page.close();
  await send({
    type: "source_event",
    event: source({ event: "Status", Flags: 0, Flags2: 1, timestamp }, 3),
  });
  await send({
    type: "source_event",
    event: source({ event: "Died", timestamp }, 4),
  });
  expect(server.store.events()).toHaveLength(1);
  socket.terminate();
});
