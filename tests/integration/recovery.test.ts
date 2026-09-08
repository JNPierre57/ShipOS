import { test, expect } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, validateBackup } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { modules } from "../../apps/core/src/modules.js";
import { source } from "../../packages/testkit/src/index.js";
import { VirtualClock } from "../../apps/core/src/clock.js";
import { createServer } from "../../apps/core/src/server.js";
import { coreSchema } from "../../apps/core/src/config.js";
import { createServer as netServer } from "node:net";
const dir = () => mkdtempSync(join(tmpdir(), "ShipOS recovery "));
test("ACK before detector crash recovery, outbox re-dispatch stable IDs and Director idempotency", async () => {
  const path = join(dir(), "core.db");
  let store = new Store(path);
  await store.migrate();
  store.accept(source({ event: "Status", Flags: 16777216 }, 1));
  store.accept(source({ event: "Died" }, 2));
  expect(store.ack("fixture-agent")).toBe(2);
  store.close();
  store = new Store(path);
  await store.migrate();
  let run = new RunContext(
    "live",
    store,
    modules,
    new VirtualClock(Date.parse("2026-09-08T10:00:00Z")),
  );
  run.process();
  const id = store.events()[0]!.id;
  store.db.prepare("UPDATE domain_events SET dispatch_state='pending'").run();
  run.close();
  store = new Store(path);
  await store.migrate();
  run = new RunContext(
    "live",
    store,
    modules,
    new VirtualClock(Date.parse("2026-09-08T10:00:00Z")),
  );
  let delivered = 0;
  run.externalBus.add((e) => {
    expect(e.id).toBe(id);
    delivered++;
  });
  run.process();
  expect(delivered).toBe(1);
  expect(store.events()).toHaveLength(1);
  expect(run.engine.snapshot()).toHaveLength(0);
  run.close();
});
test("migration idempotence, safe backup before upgrade, checksum mismatch, restore integrity", async () => {
  const d = dir(),
    m = join(d, "migrations");
  mkdirSync(m);
  copyFileSync("migrations/001_initial.sql", join(m, "001.sql"));
  const path = join(d, "core.db");
  let store = new Store(path, m);
  await store.migrate();
  store.put("settings", "saved", { value: 42 });
  store.close();
  writeFileSync(
    join(m, "002.sql"),
    "CREATE TABLE upgrade_marker(id INTEGER PRIMARY KEY);",
  );
  store = new Store(path, m);
  await store.migrate();
  const backups = readdirSync(join(d, "backups"));
  expect(backups.length).toBeGreaterThanOrEqual(2);
  const backup = await store.backup();
  store.close();
  validateBackup(backup);
  const restored = join(d, "restored.db");
  copyFileSync(backup, restored);
  store = new Store(restored, m);
  await store.migrate();
  expect(store.get("settings", "saved")).toEqual({ value: 42 });
  store.close();
  writeFileSync(
    join(m, "002.sql"),
    readFileSync(join(m, "002.sql"), "utf8") + " -- changed",
  );
  store = new Store(path, m);
  await expect(store.migrate()).rejects.toThrow("checksum mismatch");
});
test.each(["port", "gatewayPort"] as const)(
  "occupied %s fails without port fallback and releases sibling listener",
  async (field) => {
    const occupied = netServer();
    await new Promise<void>((r) => occupied.listen(0, "127.0.0.1", r));
    const port = (occupied.address() as { port: number }).port;
    const config = coreSchema.parse({
      dataDir: dir(),
      port: 48920,
      gatewayPort: 48921,
      [field]: port,
    });
    const server = await createServer(config, "integration-test-token");
    try {
      await expect(server.start()).rejects.toMatchObject({
        code: "EADDRINUSE",
      });
    } finally {
      await new Promise<void>((r) => occupied.close(() => r()));
    }
  },
);
test("malformed config refuses invalid ports and same ports", () => {
  expect(coreSchema.safeParse({ port: 0 }).success).toBe(false);
  expect(coreSchema.safeParse({ port: 12, gatewayPort: 12 }).success).toBe(
    false,
  );
});
test("real process kill after durable commit leaves pending inbox recoverable", async () => {
  const { spawn } = await import("node:child_process");
  const path = join(dir(), "killed.db");
  const worker = spawn(
    process.execPath,
    ["fixtures/core-kill-worker.mjs", path],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise<void>((resolve, reject) => {
    worker.stdout.on("data", (data) => {
      if (data.toString().includes("DURABLE_ACK=2")) resolve();
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code) reject(Error("Worker exited " + code));
    });
  });
  const exited = new Promise((r) => worker.once("exit", r));
  worker.kill("SIGKILL");
  await exited;
  const store = new Store(path);
  await store.migrate();
  expect(store.ack("kill-agent")).toBe(2);
  const run = new RunContext(
    "live",
    store,
    modules,
    new VirtualClock(Date.parse("2026-09-08T10:00:00Z")),
  );
  run.process();
  expect(store.events().map((e) => e.type)).toEqual(["elite.ship.destroyed"]);
  run.process();
  expect(store.events()).toHaveLength(1);
  run.close();
});
test("DB processing failure rolls back state and keeps inbox pending for retry", async () => {
  const store = new Store(":memory:");
  await store.migrate();
  const run = new RunContext("live", store, modules);
  const before = JSON.stringify(run.world);
  store.db.exec(
    "CREATE TRIGGER fail_state BEFORE INSERT ON world_state BEGIN SELECT RAISE(ABORT,'injected DB failure'); END;",
  );
  expect(() =>
    run.ingest(
      source(
        { event: "Scan", SystemAddress: 1, BodyID: 2, SurfaceGravity: 100 },
        1,
      ),
    ),
  ).toThrow("injected DB failure");
  expect(JSON.stringify(run.world)).toBe(before);
  expect(store.events()).toHaveLength(0);
  expect(store.all("records")).toHaveLength(0);
  expect(store.pendingSources()).toHaveLength(1);
  store.db.exec("DROP TRIGGER fail_state");
  run.process();
  expect(store.pendingSources()).toHaveLength(0);
  expect(store.events()).toHaveLength(1);
  run.close();
});
test("expedition aggregates are atomic and idempotent across duplicate ingestion", async () => {
  const store = new Store(":memory:");
  await store.migrate();
  const run = new RunContext("live", store, modules);
  store.put("expeditions", "active", {
    id: "trip",
    name: "Test journey",
    startedAt: 0,
    endedAt: null,
  });
  const e = source(
    { event: "Scan", SystemAddress: 1, BodyID: 2, StarType: "N" },
    1,
  );
  run.ingest(e);
  run.ingest(e);
  run.ingest(
    source(
      {
        event: "SellOrganicData",
        BioData: [
          { Genus: "g", Species: "s", Variant: "v", Value: 100, Bonus: 200 },
        ],
      },
      2,
    ),
  );
  expect(
    store.get<{
      aggregates: { discoveries: number; actualSoldValues: number };
    }>("expeditions", "trip")?.aggregates,
  ).toMatchObject({ discoveries: 1, actualSoldValues: 300 });
  run.close();
});
