import { test, expect } from "vitest";
import { EventEmitter } from "node:events";
import type { OBSWebSocket } from "obs-websocket-js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { ObsAdapter, obsSchema } from "../../apps/core/src/obs.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { Store } from "../../apps/core/src/store.js";
import { modules } from "../../apps/core/src/modules.js";
import { source } from "../../packages/testkit/src/index.js";
import { shipCommandApi } from "../../apps/core/src/ship-command-api.js";
class Client extends EventEmitter {
  active = true;
  reconnecting = false;
  startedAt = Date.now() - 60000;
  calls: string[] = [];
  async connect() {}
  async disconnect() {
    this.emit("ConnectionClosed");
  }
  async call(type: string) {
    this.calls.push(type);
    if (type === "GetVersion")
      return {
        obsVersion: "fixture",
        obsWebSocketVersion: "fixture",
        availableRequests: [],
        supportedImageFormats: [],
      };
    if (type === "GetStreamStatus")
      return {
        outputActive: this.active,
        outputReconnecting: this.reconnecting,
        outputDuration: Date.now() - this.startedAt,
      };
    throw Error("Unexpected OBS request");
  }
}
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "shipos-crew-bridge-"));
  const store = new Store(join(dir, "test.db"));
  await store.migrate();
  const run = new RunContext(
    "live",
    store,
    modules.map((m) => ({ ...m })),
  );
  run.shipCommands.link = () => ({
    connected: true,
    lastHeartbeat: Date.now(),
    agentId: "fixture-agent",
    generation: 1,
  });
  const at = new Date().toISOString();
  run.ingest(
    source({ event: "LoadGame", Commander: "Fixture", timestamp: at }, 1),
  );
  run.ingest(
    source({ event: "Status", Flags: 0, Flags2: 1, timestamp: at }, 2),
  );
  run.crew.configure({ confirmations: false });
  const client = new Client(),
    obs = new ObsAdapter(
      obsSchema.parse({ enabled: true }),
      client as unknown as OBSWebSocket,
    );
  obs.broadcastListeners.add((s) => run.crew.observeBroadcast(s));
  await obs.connect();
  let id = 0;
  const request = () => ({
    requestId: "crew-" + ++id,
    timestamp: new Date().toISOString(),
    platform: "twitch",
    viewer: { id: "42", login: "alice", displayName: "Alice" },
    role: "SCI",
  });
  const close = async () => {
    await obs.close();
    run.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { dir, store, run, client, obs, request, close };
}
test("OBS lifecycle distinguishes true STOP, socket loss, reconnecting output and missed STOP on next broadcast", async () => {
  const t = await setup();
  try {
    expect(t.run.crew.execute(t.request()).reason).toBe("joined");
    t.client.emit("ConnectionError");
    expect(t.run.crew.snapshot().departments.SCI).toHaveLength(1);
    expect(t.run.crew.reason()).toBe("obs_unavailable");
    await t.obs.connect();
    expect(t.run.crew.snapshot().departments.SCI).toHaveLength(1);
    t.client.reconnecting = true;
    await t.obs.streamStatus(false);
    expect(t.run.crew.snapshot().departments.SCI).toHaveLength(1);
    expect(t.run.crew.snapshot().available).toBe(false);
    t.client.reconnecting = false;
    t.client.emit("StreamStateChanged", {
      outputActive: true,
      outputState: "OBS_WEBSOCKET_OUTPUT_RECONNECTED",
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.run.crew.snapshot().departments.SCI).toHaveLength(1);
    expect(t.run.crew.snapshot().available).toBe(true);
    t.client.emit("StreamStateChanged", {
      outputActive: false,
      outputState: "OBS_WEBSOCKET_OUTPUT_STOPPED",
    });
    expect(t.run.crew.snapshot().departments.SCI).toHaveLength(0);
    expect(t.store.get("settings", "crew:current")).toBeUndefined();
    t.client.startedAt = Date.now();
    t.client.emit("StreamStateChanged", {
      outputActive: true,
      outputState: "OBS_WEBSOCKET_OUTPUT_STARTED",
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.run.crew.execute(t.request()).reason).toBe("joined");
    t.client.emit("ConnectionClosed");
    t.client.startedAt += 10000;
    await t.obs.connect();
    expect(t.run.crew.snapshot().departments.SCI).toHaveLength(0);
    expect(
      t.client.calls.every((x) =>
        ["GetVersion", "GetStreamStatus"].includes(x),
      ),
    ).toBe(true);
  } finally {
    await t.close();
  }
});
test("HTTP commands and activity share Bearer auth, strict validation and bounded bodies, with no chat content", async () => {
  const t = await setup(),
    app = Fastify();
  shipCommandApi(app, t.run, t.dir);
  const headers = {
    authorization:
      "Bearer " + readFileSync(join(t.dir, "chat-bridge.token"), "utf8"),
  };
  try {
    for (const url of ["/api/v1/commands/crew", "/api/v1/crew/activity"]) {
      expect(
        (await app.inject({ method: "POST", url, payload: t.request() }))
          .statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers,
            payload: { ...t.request(), text: "message should never be sent" },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers,
            payload: { text: "x".repeat(3000) },
          })
        ).statusCode,
      ).toBe(413);
    }
    const body = t.request();
    const send = (payload: unknown, url = "/api/v1/commands/crew") =>
      app.inject({ method: "POST", url, headers, payload: payload as object });
    expect((await send(body)).json().reason).toBe("joined");
    expect((await send(body)).json().reason).toBe("duplicate");
    const activity = t.request();
    delete (activity as Record<string, unknown>).role;
    expect((await send(activity, "/api/v1/crew/activity")).json().reason).toBe(
      "activity_updated",
    );
    expect(
      t.store.events().some((e) => e.type === "shipos.crew.assignment"),
    ).toBe(false);
  } finally {
    await app.close();
    await t.close();
  }
});
