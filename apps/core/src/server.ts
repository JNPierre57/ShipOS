import { ObsAdapter } from "./obs.js";
import { createLogger } from "./logging.js";
import { IsolatedRuns } from "./isolated-runs.js";
import { controlApi } from "./control-api.js";
import { externalApi } from "./external.js";
import Fastify, { LogController } from "fastify";
import websocket from "@fastify/websocket";
import statics from "@fastify/static";
import { join } from "node:path";
import { z } from "zod";
import type WebSocket from "ws";
import type { CoreConfig } from "./config.js";
import { Store } from "./store.js";
import { RunContext } from "./runtime.js";
import { createGateway } from "./gateway.js";
import { modules } from "./modules.js";
import { shipCommandApi } from "./ship-command-api.js";
import { ScreenCommands } from "./screen-command.js";
import { screenGalleryHtml } from "./screen-gallery.js";
export async function createServer(config: CoreConfig, token: string) {
  const logger = createLogger(join(config.dataDir, "logs"));
  const obs = new ObsAdapter(config.obs);
  const store = new Store(join(config.dataDir, "shipos.db"));
  await store.migrate(config.backupRetention);
  const run = new RunContext(
    "live",
    store,
    modules,
    undefined,
    config.moduleFailureThreshold,
  );
  run.diagnostics.add((data) => logger.warn(data, "Core diagnostic"));
  run.eventBus.add((event) =>
    logger.info(
      {
        domainEventId: event.id,
        type: event.type,
        sessionId: event.sessionId,
        expeditionId: event.expeditionId,
      },
      "Domain event persisted",
    ),
  );
  const isolated = new IsolatedRuns(modules);
  const app = Fastify({
    loggerInstance: logger as import("fastify").FastifyBaseLogger,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 16 * 1024 * 1024,
  });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });
  await app.register(statics, {
    root: join(process.cwd(), "apps/overlay/build"),
    prefix: "/overlay/",
  });
  await app.register(statics, {
    root: join(process.cwd(), "apps/control-panel/build"),
    prefix: "/control/",
    decorateReply: false,
  });
  const overlays = new Set<WebSocket>();
  let nextOverlayId = 0;
  let audioStatus = "DISCONNECTED";
  app.addHook("onRequest", async (req, reply) => {
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`
    )
      return reply.code(403).send({ error: "Origin rejected" });
    if (
      req.headers.host?.split(":")[0] !== config.host &&
      req.headers.host?.split(":")[0] !== "localhost"
    )
      return reply.code(403).send({ error: "Host rejected" });
  });
  app.get("/overlay", async (_req, reply) => reply.redirect("/overlay/"));
  app.get("/control", async (_req, reply) => reply.redirect("/control/"));
  app.get("/screens", async (_req, reply) =>
    reply.type("text/html; charset=utf-8").send(screenGalleryHtml),
  );
  app.get("/screens/", async (_req, reply) =>
    reply.type("text/html; charset=utf-8").send(screenGalleryHtml),
  );
  app.get("/", async (_req, reply) => reply.redirect("/control/"));
  app.get("/overlay/ws", { websocket: true }, (socket, req) => {
    run.shipCommands.revalidate();
    run.crew.revalidate();
    overlays.add(socket);
    const overlayId = ++nextOverlayId;
    const client = /obs/i.test(req.headers["user-agent"] ?? "")
      ? "obs"
      : "browser";
    const receipts = new Set<string>();
    logger.info({ overlayId, client, connected: true }, "Overlay connection");
    socket.send(
      JSON.stringify({
        type: "volumes",
        volumes: store.get("settings", "audio") ?? {},
      }),
    );
    socket.send(
      JSON.stringify({
        type: "snapshot",
        runs: [...run.engine.snapshot(), ...isolated.snapshots()],
      }),
    );
    socket.on("message", (data) => {
      try {
        const msg = z
          .discriminatedUnion("type", [
            z.object({
              type: z.literal("audio_status"),
              status: z.enum(["READY", "SUSPENDED", "DEGRADED"]),
              activeSources: z.number().int().nonnegative(),
            }),
            z.strictObject({
              type: z.literal("overlay_rendered"),
              presentationRunId: z.uuid(),
            }),
          ])
          .parse(JSON.parse(data.toString()));
        if (msg.type === "audio_status") audioStatus = msg.status;
        else {
          const active = [...run.engine.snapshot(), ...isolated.snapshots()];
          for (const id of receipts)
            if (!active.some((p) => p.id === id)) receipts.delete(id);
          const p = active.find((p) => p.id === msg.presentationRunId);
          if (p && !receipts.has(p.id)) {
            receipts.add(p.id);
            logger.info(
              {
                overlayId,
                client,
                presentationRunId: p.id,
                eventId: p.eventId,
                elapsedMs: Date.now() - p.startedAt,
              },
              "Overlay rendered",
            );
          }
        }
      } catch {
        socket.close(1008, "Invalid status");
      }
    });
    socket.on("close", (closeCode) => {
      overlays.delete(socket);
      logger.info(
        { overlayId, client, connected: false, closeCode },
        "Overlay connection",
      );
      if (!overlays.size) audioStatus = "DISCONNECTED";
    });
  });
  run.engine.listeners.add((action) => {
    if (action.type === "overlay.show")
      logger.info(
        {
          presentationRunId: action.presentationRunId,
          clients: [...overlays].filter((s) => s.readyState === 1).length,
        },
        "Overlay presentation sent",
      );
    for (const ws of overlays)
      if (ws.readyState === 1)
        ws.send(JSON.stringify({ type: "action", action }));
  });
  const broadcast = (data: unknown) => {
    for (const ws of overlays)
      if (ws.readyState === 1) ws.send(JSON.stringify(data));
  };
  isolated.listeners.add((action) => broadcast({ type: "action", action }));
  controlApi(app, run, isolated, broadcast, config.backupRetention);
  externalApi(app, run, config.externalWindow);
  const gateway = await createGateway(
    store,
    token,
    () => {
      setImmediate(() => {
        try {
          run.process();
        } catch (error) {
          app.log.error(error, "Source processing failed");
        }
      });
    },
    config.heartbeatMs,
    config.staleMs,
    undefined,
    () => {
      run.shipCommands.revalidate();
      run.crew.revalidate();
    },
    (detail) => logger.info(detail, "Agent connection"),
  );
  run.shipCommands.link = () => ({
    connected: gateway.status.connected,
    lastHeartbeat: gateway.status.lastHeartbeat,
    agentId: gateway.status.agentId,
    generation: gateway.status.reconnectCount,
  });
  obs.broadcastListeners.add((state) => run.crew.observeBroadcast(state));
  const screen = new ScreenCommands(run, obs, config.dataDir);
  shipCommandApi(app, run, config.dataDir, screen);
  app.get("/health", () => ({ status: "ok", db: "ok", mode: "live" }));
  app.get("/api/v1/status", () => ({
    core: "READY",
    db: "ok",
    obs: obs.status,
    screenshots: screen.snapshot(),
    crew: run.crew.snapshot(),
    agent: gateway.status,
    overlay: overlays.size,
    audio: audioStatus,
    world: run.world,
    modules: [...run.registry.status.entries()].map(([id, s]) => ({
      id,
      ...s,
    })),
    director: {
      budget: run.director.budget(),
      queue: run.director.queue,
      active: run.engine.snapshot(),
    },
    system: { ...config, version: "1.0.0" },
    expedition: store.get("expeditions", "active") ?? null,
  }));
  app.get("/api/v1/events", (req) => {
    const q = z
      .object({
        beforeSequence: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
      })
      .parse(req.query);
    return store.recentEvents(q.beforeSequence, q.limit);
  });
  app.get("/api/v1/decisions", () => store.all("director_decisions"));
  app.get("/api/v1/world", () => run.world);
  app.post("/api/v1/obs/mute", async (req) => {
    const p = z
      .strictObject({ inputName: z.string(), inputMuted: z.boolean() })
      .parse(req.body);
    return { ok: await obs.mute(p.inputName, p.inputMuted) };
  });
  app.post("/api/v1/obs/reconnect", async () => {
    await obs.close();
    await obs.connect(process.env.SHIPOS_OBS_PASSWORD);
    return { status: obs.status };
  });
  const reconcile = setInterval(() => {
    try {
      run.process();
    } catch (error) {
      logger.error(
        { code: "processing_retry", error: String(error) },
        "Durable processing pending",
      );
    }
  }, 1000);
  let started = false;
  return {
    app,
    gateway,
    run,
    store,
    overlays,
    getAudio: () => audioStatus,
    async start() {
      try {
        await app.listen({ host: config.host, port: config.port });
        await gateway.app.listen({
          host: config.gatewayHost,
          port: config.gatewayPort,
        });
        run.process();
        void obs.connect(process.env.SHIPOS_OBS_PASSWORD);
        started = true;
      } catch (error) {
        clearInterval(reconcile);
        await gateway.app.close();
        await app.close();
        run.close();
        throw error;
      }
    },
    async close() {
      screen.close();
      clearInterval(reconcile);
      await obs.close();
      isolated.close();
      for (const ws of overlays) ws.terminate();
      await gateway.app.close();
      await app.close();
      if (started) run.close();
      else store.close();
    },
  };
}
