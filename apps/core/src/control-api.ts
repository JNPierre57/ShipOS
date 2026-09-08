import { policySchema } from "./module-registry.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eventTypes } from "../../../packages/contracts/src/index.js";
import type { RunContext } from "./runtime.js";
import {
  IsolatedRuns,
  everythingGoesWrong,
  parseJournals,
} from "./isolated-runs.js";
export function controlApi(
  app: FastifyInstance,
  run: RunContext,
  isolated: IsolatedRuns,
  broadcast: (data: unknown) => void,
  backupRetention = 10,
) {
  app.get("/api/v1/events/:id", (req) => {
    const id = (req.params as { id: string }).id;
    const event = run.store.event(id);
    return {
      event,
      sources: event?.sourceEventIds.map((s) => run.store.source(s)),
      decision: run.store.get("director_decisions", id),
      presentations: run.store
        .all<{ eventId: string }>("presentation_runs")
        .filter((p) => p.eventId === id),
    };
  });
  app.get("/api/v1/sources", () =>
    (
      run.store.db
        .prepare("SELECT id FROM source_events ORDER BY rowid DESC LIMIT 200")
        .all() as { id: string }[]
    ).map((r) => run.store.source(r.id)),
  );
  app.post("/api/v1/modules/:id", (req) => {
    const change = z
      .strictObject({
        enabled: z.boolean().optional(),
        policy: policySchema.optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);
    run.registry.update((req.params as { id: string }).id, change);
    return { ok: true };
  });
  app.post("/api/v1/director", (req) => {
    const config = z
      .strictObject({
        budget: z.number().min(0).max(100),
        windowMs: z.number().min(1000).max(300000),
        queueMax: z.number().int().min(0).max(20),
        importanceWeight: z.number().min(0).max(1),
        urgencyWeight: z.number().min(0).max(1),
      })
      .parse(req.body);
    run.director.config = config;
    run.store.put("settings", "director", config);
    return config;
  });
  app.get(
    "/api/v1/audio",
    () =>
      run.store.get("settings", "audio") ?? {
        master: 0.5,
        alerts: 0.7,
        effects: 0.6,
        ambience: 0.3,
        voice: 0.8,
      },
  );
  app.post("/api/v1/audio", (req) => {
    const volumes = z
      .strictObject({
        master: z.number().min(0).max(1),
        alerts: z.number().min(0).max(1),
        effects: z.number().min(0).max(1),
        ambience: z.number().min(0).max(1),
        voice: z.number().min(0).max(1),
      })
      .parse(req.body);
    run.store.put("settings", "audio", volumes);
    broadcast({ type: "volumes", volumes });
    return volumes;
  });
  app.post("/api/v1/simulation", async (req) => {
    const p = z
      .strictObject({
        level: z.enum(["source", "domain", "presentation"]).default("source"),
        eventType: z.enum(eventTypes).default("elite.ship.destroyed"),
        scenario: z
          .enum(["Everything Goes Wrong", "single"])
          .default("Everything Goes Wrong"),
        speed: z.union([z.literal(1), z.literal("instant")]).default(1),
      })
      .parse(req.body ?? {});
    return isolated.create(
      "simulation",
      p.scenario === "Everything Goes Wrong" && p.level === "source"
        ? everythingGoesWrong()
        : [
            {
              event: "Status",
              Flags: 16777216,
              timestamp: new Date().toISOString(),
            },
            { event: "Died", timestamp: new Date().toISOString() },
          ].slice(p.level === "source" ? 0 : 1),
      p.speed,
      p.level,
      p.eventType,
    );
  });
  app.post("/api/v1/replay", async (req) => {
    const p = z
      .strictObject({
        files: z
          .array(
            z.strictObject({
              name: z.string().max(255),
              content: z.string().max(8000000),
            }),
          )
          .min(1)
          .max(20),
        speed: z.union([
          z.literal(1),
          z.literal(5),
          z.literal(20),
          z.literal("instant"),
        ]),
      })
      .parse(req.body);
    const parsed = parseJournals(p.files);
    if (parsed.payloads.length > 50000)
      throw Error("Replay limit 50000 records");
    const result = await isolated.create("replay", parsed.payloads, p.speed);
    result.diagnostics.push(...parsed.diagnostics);
    return result;
  });
  app.get("/api/v1/runs", () =>
    [...isolated.runs.values()].map((r) => ({
      ...r.result,
      world: r.context.world,
      decisions: r.context.store.all("director_decisions"),
    })),
  );
  app.post("/api/v1/runs/:id/cancel", (req) => {
    isolated.runs.get((req.params as { id: string }).id)?.cancel();
    return { ok: true };
  });
  app.get("/api/v1/expeditions", () => run.store.all("expeditions"));
  app.post("/api/v1/expeditions/start", (req) => {
    const { name } = z
      .strictObject({ name: z.string().min(1).max(100) })
      .parse(req.body);
    return run.store.db.transaction(() => {
      if (run.store.get("expeditions", "active"))
        throw Error("An expedition is already active");
      const expedition = {
        id: randomUUID(),
        name,
        startedAt: run.clock.now(),
        endedAt: null,
      };
      run.store.put("expeditions", "active", expedition);
      run.store.put("expeditions", expedition.id, expedition);
      return expedition;
    })();
  });
  app.post("/api/v1/expeditions/end", () =>
    run.store.db.transaction(() => {
      const active = run.store.get<{ id: string }>("expeditions", "active");
      if (!active) throw Error("No active expedition");
      run.store.put("expeditions", active.id, {
        ...active,
        endedAt: run.clock.now(),
      });
      run.store.db.prepare("DELETE FROM expeditions WHERE id='active'").run();
      return { ok: true };
    })(),
  );
  app.get("/api/v1/records", () => ({
    records: run.store.all("records"),
    milestones: run.store.all("milestones"),
    sales: run.store.all("module_storage"),
  }));
  app.post("/api/v1/backup", async () => ({
    path: await run.store.backup(backupRetention),
  }));
  app.setErrorHandler((error, _req, reply) => {
    const err = error as Error;
    return reply.code(err instanceof z.ZodError ? 400 : 409).send({
      error:
        err instanceof z.ZodError
          ? err.issues.map((i) => ({ path: i.path, message: i.message }))
          : err.message,
    });
  });
}
