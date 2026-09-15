import { test, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { OBSWebSocket } from "obs-websocket-js";
import Fastify from "fastify";
import { ObsAdapter, obsSchema } from "../../apps/core/src/obs.js";
import { ScreenCommands } from "../../apps/core/src/screen-command.js";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { modules } from "../../apps/core/src/modules.js";
import { shipCommandApi } from "../../apps/core/src/ship-command-api.js";
const jpeg = readFileSync("tests/fixtures/screen.jpg");
class Client extends EventEmitter {
  active = true;
  startedAt = Date.now() - 60000;
  scene = "Gameplay";
  hidden = false;
  nested = false;
  fail = false;
  invalid = false;
  stopDuring = false;
  calls: { type: string; data: unknown }[] = [];
  async connect() {}
  async disconnect() {
    this.emit("ConnectionClosed");
  }
  async call(type: string, data?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ type, data });
    if (type === "GetVersion")
      return {
        obsVersion: "32.2.2",
        obsWebSocketVersion: "5.7.4",
        supportedImageFormats: ["jpg"],
        availableRequests: [
          "GetSourceScreenshot",
          "GetStreamStatus",
          "GetCurrentProgramScene",
          "GetCurrentSceneTransitionCursor",
          "GetSceneItemList",
          "GetGroupSceneItemList",
          "GetGroupList",
        ],
      };
    if (type === "GetStreamStatus")
      return {
        outputActive: this.active,
        outputReconnecting: false,
        outputDuration: Date.now() - this.startedAt,
      };
    if (type === "GetCurrentProgramScene")
      return { currentProgramSceneName: this.scene };
    if (type === "GetCurrentSceneTransitionCursor")
      return { transitionCursor: 0 };
    if (type === "GetSceneItemList" || type === "GetGroupSceneItemList")
      return {
        sceneItems: [
          {
            sourceName:
              this.nested && data?.sceneName === "Gameplay"
                ? "Group"
                : "Desktop",
            isGroup: this.nested && data?.sceneName === "Gameplay",
            sceneItemEnabled: !this.hidden,
          },
        ],
      };
    if (type === "GetGroupList") return { groups: [] };
    if (type === "GetSourceScreenshot") {
      if (this.fail) throw Error("OBS error");
      if (this.stopDuring) {
        this.active = false;
        this.emit("StreamStateChanged", {
          outputActive: false,
          outputState: "OBS_WEBSOCKET_OUTPUT_STOPPED",
        });
      }
      return {
        imageData: this.invalid
          ? "not a JPEG"
          : "data:image/jpeg;base64," + jpeg.toString("base64"),
      };
    }
    throw Error("Unexpected request " + type);
  }
}
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "shipos-screen-"));
  const store = new Store(":memory:");
  await store.migrate();
  const run = new RunContext("live", store, modules);
  run.registry.update("chat-screen", {
    config: { programScene: "Gameplay", requiredSource: "Desktop" },
  });
  const client = new Client(),
    obs = new ObsAdapter(
      obsSchema.parse({ enabled: true }),
      client as unknown as OBSWebSocket,
    );
  await obs.connect();
  const screen = new ScreenCommands(run, obs, dir);
  let id = 0;
  const request = () => ({
    requestId: "screen-" + ++id,
    timestamp: new Date().toISOString(),
    platform: "twitch",
  });
  const close = () => {
    screen.close();
    run.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { dir, store, run, client, obs, screen, request, close };
}
test("screen authenticates, rejects extra parameters and persists only file references without Elite", async () => {
  const t = await setup(),
    app = Fastify();
  shipCommandApi(app, t.run, t.dir, t.screen);
  try {
    const body = t.request(),
      headers = {
        authorization:
          "Bearer " + readFileSync(join(t.dir, "chat-bridge.token"), "utf8"),
      };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/commands/screen",
          payload: body,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/commands/screen",
          headers,
          payload: { ...body, source: "private" },
        })
      ).statusCode,
    ).toBe(400);
    const actions: string[] = [];
    t.run.engine.listeners.add((a) => actions.push(a.type));
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/commands/screen",
      headers,
      payload: body,
    });
    expect(response.json().reason).toBe("captured");
    expect(t.run.world.shipTelemetry).toBeUndefined();
    expect(actions).toContain("overlay.show");
    expect(actions).not.toContain("audio.play");
    const card = t.run.engine.snapshot()[0]!;
    expect(card.definition.title).toBe("SNAPSHOT CAPTURED");
    expect(
      JSON.stringify(t.store.event("chat-screen:" + body.requestId)),
    ).not.toContain("base64");
    expect(card.definition.terminal!.imagePath).toMatch(
      /^\/api\/v1\/screens\/gallery\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/,
    );
    expect(
      (await app.inject(card.definition.terminal!.imagePath!)).rawPayload,
    ).toEqual(jpeg);
    const status = t.screen.snapshot(),
      gallery = t.screen.gallery();
    expect(status.lastImagePath).toMatch(
      /^\/api\/v1\/screens\/gallery\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/,
    );
    expect(gallery.sessions).toHaveLength(1);
    expect(gallery.sessions[0]!.shots[0]!.url).toBe(status.lastImagePath);
    expect(
      (
        await app.inject({
          method: "GET",
          url: gallery.sessions[0]!.shots[0]!.url,
        })
      ).rawPayload,
    ).toEqual(jpeg);
    expect(
      (await app.inject("/api/v1/screens/%2e%2e%2fsecret")).statusCode,
    ).toBe(404);
    expect((await t.screen.execute(body)).reason).toBe("duplicate");
    expect(
      t.client.calls.find((c) => c.type === "GetSourceScreenshot")!.data,
    ).toEqual({
      sourceName: "Gameplay",
      imageFormat: "jpg",
      imageWidth: 1280,
      imageCompressionQuality: 80,
    });
    const recovered = new ScreenCommands(t.run, t.obs, t.dir);
    expect(
      (await recovered.execute({ ...t.request(), requestId: body.requestId }))
        .reason,
    ).toBe("duplicate");
  } finally {
    await app.close();
    t.close();
  }
});
test("screen fails closed for stream, visibility, missing target, OBS failure and stop during capture", async () => {
  for (const kind of [
    "inactive",
    "hidden",
    "scene",
    "failure",
    "invalid",
    "stop",
    "disconnected",
    "transition",
  ]) {
    const t = await setup();
    try {
      if (kind === "inactive") t.client.active = false;
      if (kind === "hidden") {
        t.client.nested = true;
        t.client.hidden = true;
      }
      if (kind === "scene") t.client.scene = "Private";
      if (kind === "failure") t.client.fail = true;
      if (kind === "invalid") t.client.invalid = true;
      if (kind === "stop") t.client.stopDuring = true;
      if (kind === "disconnected") await t.obs.close();
      if (kind === "transition") t.client.emit("SceneTransitionStarted");
      expect((await t.screen.execute(t.request())).status, kind).toBe(
        "rejected",
      );
      expect(t.run.engine.snapshot()).toHaveLength(0);
      expect(readdirSync(t.dir)).toEqual([]);
    } finally {
      t.close();
    }
  }
});
test("nested visible source accepted; cooldown/quota survive restart; new live has separate session", async () => {
  const t = await setup();
  try {
    t.client.nested = true;
    expect((await t.screen.execute(t.request())).status).toBe("accepted");
    const first = JSON.parse(
      readFileSync(join(t.dir, "screens/active.json"), "utf8"),
    );
    const restored = new ScreenCommands(t.run, t.obs, t.dir);
    expect((await restored.execute(t.request())).reason).toBe("cooldown");
    t.run.registry.update("chat-screen", {
      config: {
        programScene: "Gameplay",
        requiredSource: "Desktop",
        maxCaptures: 1,
      },
      policy: {
        ...t.run.modules.find((m) => m.manifest.id === "chat-screen")!.policy,
        cooldownMs: 0,
      },
    });
    expect(
      (await new ScreenCommands(t.run, t.obs, t.dir).execute(t.request()))
        .reason,
    ).toBe("quota");
    t.client.startedAt = Date.now();
    t.client.emit("StreamStateChanged", {
      outputActive: true,
      outputState: "OBS_WEBSOCKET_OUTPUT_STARTED",
    });
    expect(
      (await new ScreenCommands(t.run, t.obs, t.dir).execute(t.request()))
        .status,
    ).toBe("accepted");
    const second = JSON.parse(
      readFileSync(join(t.dir, "screens/active.json"), "utf8"),
    );
    expect(second.id).not.toBe(first.id);
    expect(second.shots).toHaveLength(1);
    expect(
      readFileSync(
        join(t.dir, "screens", first.id, first.shots[0].id + ".jpg"),
      ),
    ).toEqual(jpeg);
    const gallery = new ScreenCommands(t.run, t.obs, t.dir).gallery();
    expect(gallery.sessions).toHaveLength(2);
    expect(gallery.sessions.find((s) => s.id === first.id)).toMatchObject({
      active: false,
      shots: [{ id: first.shots[0].id }],
    });
  } finally {
    t.close();
  }
});
test("storage failure leaves no success; confirmation failure retains completed image", async () => {
  const t = await setup();
  try {
    writeFileSync(join(t.dir, "screens"), "blocked");
    expect((await t.screen.execute(t.request())).reason).toBe(
      "capture_or_storage_failed",
    );
    expect(t.run.engine.snapshot()).toHaveLength(0);
    rmSync(join(t.dir, "screens"));
    vi.spyOn(t.run, "dispatch").mockImplementation(() => {
      throw Error("director unavailable");
    });
    const result = await new ScreenCommands(t.run, t.obs, t.dir).execute(
      t.request(),
    );
    expect(result.reason).toBe("confirmation_unavailable");
    expect(
      JSON.parse(readFileSync(join(t.dir, "screens/active.json"), "utf8"))
        .shots,
    ).toHaveLength(1);
  } finally {
    t.close();
  }
});
test("stale and simulated messages do not reach OBS; request timeout degrades adapter", async () => {
  const t = await setup();
  try {
    const count = t.client.calls.length;
    expect(
      (
        await t.screen.execute({
          ...t.request(),
          timestamp: "2020-01-01T00:00:00Z",
        })
      ).reason,
    ).toBe("request_expired");
    expect(
      (await t.screen.execute({ ...t.request(), platform: "simulation" }))
        .reason,
    ).toBe("mode_mismatch");
    expect(t.client.calls.length).toBe(count);
    vi.useFakeTimers();
    vi.spyOn(t.client, "call").mockImplementation(() => new Promise(() => {}));
    const pending = t.screen.execute(t.request());
    await vi.advanceTimersByTimeAsync(4100);
    expect((await pending).reason).toBe("obs_timeout");
    expect(t.obs.status).toBe("DEGRADED");
  } finally {
    vi.useRealTimers();
    t.close();
  }
});
