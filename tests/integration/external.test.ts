import { test, expect } from "vitest";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { modules } from "../../apps/core/src/modules.js";
import { externalApi } from "../../apps/core/src/external.js";
import { source } from "../../packages/testkit/src/index.js";
test("external exact/prefix subscriptions, SILENT independence, reconnect cursor, consumer dedupe and explicit stale gap", async () => {
  const store = new Store(":memory:");
  await store.migrate();
  const run = new RunContext("live", store, modules);
  run.director.config.budget = 0;
  const app = Fastify();
  await app.register(websocket);
  externalApi(app, run, 2);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const port = (app.server.address() as { port: number }).port;
  const seen = new Set<string>();
  let deliveries = 0;
  const consume = (e: { id: string }) => {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      deliveries++;
    }
  };
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/events/ws`);
    await new Promise((r) => ws.once("open", r));
    return ws;
  };
  const next = (ws: WebSocket) =>
    new Promise<Record<string, unknown>>((r) =>
      ws.once("message", (m) => r(JSON.parse(m.toString()))),
    );
  let seq = 1;
  const low = () => {
    run.ingest(source({ event: "Status", Flags: 0 }, seq++));
    run.ingest(source({ event: "Status", Flags: 524288 }, seq++));
  };
  try {
    for (const pattern of ["elite.*", "elite.ship.*", "elite.ship.fuel.low"]) {
      const ws = await connect();
      let message = next(ws);
      ws.send(JSON.stringify({ type: "subscribe", patterns: [pattern] }));
      expect((await message).type).toBe("subscribed");
      message = next(ws);
      low();
      const m = await message;
      expect(m.type).toBe("domain_event");
      const event = m.event as { id: string };
      consume(event);
      consume(event);
      expect(
        run.store.get<{ profile: string }>("director_decisions", event.id)
          ?.profile,
      ).toBe("SILENT");
      ws.terminate();
    }
    expect(deliveries).toBe(3);
    const ws = await connect();
    const messages: Record<string, unknown>[] = [];
    ws.on("message", (m) => messages.push(JSON.parse(m.toString())));
    ws.send(
      JSON.stringify({
        type: "subscribe",
        patterns: ["elite.ship.*"],
        afterSequence: 2,
      }),
    );
    await expect.poll(() => messages.length).toBe(2);
    expect((messages[1]!.event as { sequence: number }).sequence).toBe(3);
    let m = next(ws);
    ws.send(
      JSON.stringify({
        type: "subscribe",
        patterns: ["elite.*"],
        afterSequence: 0,
      }),
    );
    expect((await m).type).toBe("resync_required");
    m = next(ws);
    ws.send(JSON.stringify({ type: "subscribe", patterns: ["*"] }));
    expect((await m).type).toBe("error");
    ws.terminate();
  } finally {
    await app.close();
    run.close();
  }
});
