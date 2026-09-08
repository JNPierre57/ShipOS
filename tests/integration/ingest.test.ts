import { test, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Spool } from "../../apps/agent/src/spool.js";
import { Tailer } from "../../apps/agent/src/tailer.js";
import { Store } from "../../apps/core/src/store.js";
import { createGateway } from "../../apps/core/src/gateway.js";
import { source } from "../../packages/testkit/src/index.js";
import WebSocket from "ws";
const dir = () => mkdtempSync(join(tmpdir(), "ShipOS path with spaces "));
test("spool crash before checkpoint recovers identity and sequence; ACK-only compaction", () => {
  const d = dir();
  const spool = new Spool(d);
  const e = source({ event: "Died" });
  expect(() =>
    spool.append(e, () => {
      throw Error("crash");
    }),
  ).toThrow();
  const restarted = new Spool(d);
  expect(restarted.events).toHaveLength(1);
  expect(restarted.state.cursors[e.sourceRecord.filename]).toBe(
    e.sourceRecord.byteEnd,
  );
  restarted.compact();
  expect(restarted.events).toHaveLength(1);
  restarted.ack(1);
  restarted.compact();
  expect(new Spool(d).pending()).toHaveLength(0);
  expect(new Spool(d).state.nextSequence).toBe(2);
});
test("partial EOF, malformed complete line, rotation, bootstrap and status dedupe", () => {
  const d = dir();
  const s = new Spool(join(d, "spool"));
  writeFileSync(join(d, "Journal.01.log"), '{"event":"LoadGame"}\n{"event":');
  writeFileSync(join(d, "Status.json"), '{"event":"Status","Flags":524288}');
  const tail = new Tailer(d, s);
  tail.reconcile();
  expect(s.events).toHaveLength(2);
  expect(s.events.every((e) => e.mode === "bootstrap")).toBe(true);
  appendFileSync(
    join(d, "Journal.01.log"),
    '"Died"}\nBAD\n{"event":"Shutdown"}\n',
  );
  writeFileSync(join(d, "Journal.02.log"), '{"event":"LoadGame"}\n');
  tail.reconcile();
  expect(s.events).toHaveLength(5);
  expect(readFileSync(join(d, "spool", "quarantine.jsonl"), "utf8")).toContain(
    "malformed_line",
  );
  tail.reconcile();
  expect(s.events).toHaveLength(5);
});
test("durable contiguous acceptance, conflict rejection and restart pending recovery", async () => {
  const path = join(dir(), "core.db");
  let db = new Store(path);
  await db.migrate();
  const e = source({ event: "Died" });
  expect(db.accept(e)).toBe(1);
  expect(db.accept(e)).toBe(1);
  expect(() => db.accept(source({ event: "Died" }, 3))).toThrow("gap");
  db.close();
  db = new Store(path);
  await db.migrate();
  expect(db.ack(e.agentId)).toBe(1);
  expect(db.pendingSources()).toEqual([e]);
  expect(() => db.accept({ ...e, payload: { event: "Other" } })).toThrow(
    "conflict",
  );
  db.close();
});
test("real websocket ACK follows commit, reconnect resends without duplicate, protocol mismatch", async () => {
  const db = new Store(":memory:");
  await db.migrate();
  const gateway = await createGateway(db, "test-token");
  await gateway.app.listen({ port: 0, host: "127.0.0.1" });
  const address = gateway.app.server.address() as { port: number };
  const url = `ws://127.0.0.1:${address.port}/agent/v1/ws`;
  const connect = () =>
    new WebSocket(url, { headers: { Authorization: "Bearer test-token" } });
  const message = (s: WebSocket) =>
    new Promise<Record<string, unknown>>((resolve) =>
      s.once("message", (d) => resolve(JSON.parse(d.toString()))),
    );
  const opened = (s: WebSocket) =>
    new Promise<void>((r) => s.once("open", () => r()));
  try {
    for (let i = 0; i < 2; i++) {
      const s = connect();
      await opened(s);
      let next = message(s);
      s.send(
        JSON.stringify({
          type: "hello",
          protocolVersion: 1,
          agentId: "fixture-agent",
          agentVersion: "test",
          lastAckedSequence: 0,
        }),
      );
      expect((await next).type).toBe("welcome");
      next = message(s);
      s.send(
        JSON.stringify({
          type: "source_event",
          event: source({ event: "Died" }),
        }),
      );
      expect((await next).sequence).toBe(1);
      expect(db.pendingSources()).toHaveLength(1);
      s.terminate();
    }
    const s = connect();
    await opened(s);
    const next = message(s);
    s.send(JSON.stringify({ type: "hello", protocolVersion: 99 }));
    expect((await next).type).toBe("error");
    s.terminate();
  } finally {
    await gateway.app.close();
    db.close();
  }
});
test("real killed Agent process after spool fsync recovers before checkpoint advancement", async () => {
  const { spawn } = await import("node:child_process");
  const d = dir();
  const worker = spawn(
    process.execPath,
    ["fixtures/agent-kill-worker.mjs", d],
    { stdio: "ignore" },
  );
  await new Promise<void>((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", () => resolve());
  });
  const spool = new Spool(d);
  expect(spool.events).toHaveLength(1);
  expect(spool.state.nextSequence).toBe(2);
  expect(spool.state.cursors["Journal.synthetic.log"]).toBe(200);
  expect(spool.events[0]?.payload.event).toBe("Died");
});
test("UTF8 byte offsets and torn spool tail recovery are stable", () => {
  const d = dir();
  const journal = join(d, "Journal.2026.01.log");
  writeFileSync(journal, '{"event":"LoadGame","Commander":"Étoile 日本"}\n');
  const spool = new Spool(join(d, "spool"));
  const tailer = new Tailer(d, spool);
  tailer.reconcile();
  expect(spool.events[0]?.sourceRecord.byteEnd).toBe(
    Buffer.byteLength(readFileSync(journal)),
  );
  appendFileSync(join(d, "spool", "spool.jsonl"), '{"partial":');
  const restored = new Spool(join(d, "spool"));
  expect(restored.events).toHaveLength(1);
  expect(restored.events[0]?.payload.Commander).toBe("Étoile 日本");
  expect(
    readFileSync(join(d, "spool", "spool.jsonl"), "utf8").endsWith("\n"),
  ).toBe(true);
});
