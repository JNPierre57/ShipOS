import { randomUUID } from "node:crypto";
import type {
  DomainEvent,
  PresentationAction,
  RunMode,
} from "../../../packages/contracts/src/index.js";
import type { ShipModule } from "../../../packages/module-sdk/src/index.js";
import { source } from "../../../packages/testkit/src/index.js";
import { RunContext, eventFactory } from "./runtime.js";
import { Store } from "./store.js";
import { VirtualClock, ReplayClock } from "./clock.js";
export interface RunResult {
  id: string;
  mode: RunMode;
  state: "running" | "completed" | "cancelled";
  events: DomainEvent[];
  diagnostics: string[];
}
export class IsolatedRuns {
  runs = new Map<
    string,
    {
      result: RunResult;
      context: RunContext;
      cancel: () => void;
      speed: number;
    }
  >();
  listeners = new Set<(action: PresentationAction) => void>();
  constructor(readonly modules: ShipModule[]) {}
  async create(
    mode: "simulation" | "replay",
    payloads: Record<string, unknown>[],
    speed: 1 | 5 | 20 | "instant" = 1,
    level: "source" | "domain" | "presentation" = "source",
    eventType = "elite.ship.destroyed",
  ) {
    const store = new Store(":memory:");
    await store.migrate();
    const validTimes = payloads
      .map((p) => Date.parse(String(p.timestamp)))
      .filter(Number.isFinite);
    const sourceEpoch = validTimes.length
      ? Math.min(...validTimes)
      : Date.parse("2026-01-01T00:00:00Z");
    const start = mode === "replay" ? sourceEpoch : Date.now();
    const clock =
      mode === "replay" ? new ReplayClock(start) : new VirtualClock(start);
    const context = new RunContext(
      mode,
      store,
      this.modules.map((m) => ({ ...m })),
      clock,
    );
    context.engine.listeners.add((a) => {
      const action = { ...a, issuedAt: Date.now(), payload: { ...a.payload } };
      for (const key of ["startedAt", "endsAt"] as const)
        if (typeof action.payload[key] === "number")
          action.payload[key] =
            action.issuedAt +
            (action.payload[key] - clock.now()) /
              (speed === "instant" ? 1 : speed);
      for (const fn of this.listeners) fn(action);
    });
    const result: RunResult = {
      id: randomUUID(),
      mode,
      state: "running",
      events: [],
      diagnostics: [],
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastWall = Date.now();
    let index = 0;
    const firstTimestamp = sourceEpoch;
    const timeline = payloads
      .map((p, i) => ({
        at: Number.isFinite(Date.parse(String(p.timestamp)))
          ? Math.max(0, Date.parse(String(p.timestamp)) - firstTimestamp)
          : i * 1000,
        p,
      }))
      .sort((a, b) => a.at - b.at);
    let elapsed = 0;
    const process = (p: Record<string, unknown>, seq: number) => {
      const e = source(p, seq);
      e.observedAt = new Date(clock.now()).toISOString();
      e.sourceTimestamp =
        typeof p.timestamp === "string" &&
        Number.isFinite(Date.parse(p.timestamp))
          ? p.timestamp
          : null;
      e.agentId = "isolated:" + result.id;
      if (level === "source") context.ingest(e);
      else {
        const module = context.modules.find(
          (m) => m.manifest.eventType === eventType,
        );
        if (!module) throw Error("Unknown event type");
        const event = eventFactory(
          module.manifest.id,
          {
            type: module.manifest.eventType,
            semanticKey: "preview:" + result.id,
            payload: {
              name: "Simulation",
              reasons: ["preview"],
              estimatedBaseValueCredits: 19010800,
            },
            quality: "inferred",
          },
          e,
          mode,
          clock,
        );
        if (level === "domain") {
          context.store.domain(event);
          context.dispatch();
        } else {
          const definition = context.registry.present(module, event, "FULL");
          if (definition) context.engine.start(event, "FULL", definition);
        }
      }
    };
    const finish = () => {
      context.stopContext();
      result.events = context.store.events();
      result.state = "completed";
    };
    const cancel = () => {
      context.stopContext();
      clearTimeout(timer);
      context.director.stop();
      if (result.state === "running") result.state = "cancelled";
    };
    this.runs.set(result.id, {
      result,
      context,
      cancel,
      speed: speed === "instant" ? 1 : speed,
    });
    if (speed === "instant") {
      for (const [i, item] of timeline.entries()) {
        clock.advance(Math.max(0, start + item.at - clock.now()));
        process(item.p, i + 1);
      }
      clock.advance(60000);
      finish();
    } else {
      const tick = () => {
        const wall = Date.now();
        elapsed += (wall - lastWall) * speed;
        lastWall = wall;
        while (index < timeline.length && timeline[index]!.at <= elapsed) {
          const item = timeline[index]!;
          clock.advance(Math.max(0, start + item.at - clock.now()));
          process(item.p, index + 1);
          index++;
        }
        clock.advance(Math.max(0, start + elapsed - clock.now()));
        result.events = store.events();
        if (
          index >= timeline.length &&
          elapsed >= (timeline.at(-1)?.at ?? 0) + 60000 &&
          context.engine.active.size === 0 &&
          context.director.queue.length === 0
        ) {
          finish();
          return;
        }
        timer = setTimeout(tick, 50);
      };
      tick();
    }
    while (this.runs.size > 20) {
      const old = this.runs.keys().next().value!;
      const r = this.runs.get(old)!;
      r.cancel();
      r.context.close();
      this.runs.delete(old);
    }
    return result;
  }
  snapshots() {
    return [...this.runs.values()].flatMap((r) =>
      r.context.engine.snapshot().map((run) => ({
        ...run,
        startedAt:
          Date.now() + (run.startedAt - r.context.clock.now()) / r.speed,
        endsAt:
          Date.now() +
          Math.max(0, run.endsAt - r.context.clock.now()) / r.speed,
      })),
    );
  }
  close() {
    for (const r of this.runs.values()) {
      r.cancel();
      r.context.close();
    }
    this.runs.clear();
  }
}
export function everythingGoesWrong() {
  const base = Date.now();
  return [
    { at: 0, event: "Status", Flags: 16777216 },
    {
      at: 2000,
      event: "HullDamage",
      Health: 0.19,
      PlayerPilot: true,
      Fighter: false,
    },
    { at: 5000, event: "Status", Flags: 16777216 + 524288 },
    { at: 8000, event: "Died" },
  ].map(({ at, ...p }) => ({
    ...p,
    timestamp: new Date(base + at).toISOString(),
  }));
}
export function parseJournals(files: { name: string; content: string }[]) {
  const payloads: Record<string, unknown>[] = [],
    diagnostics: string[] = [];
  for (const file of files) {
    const lines = file.content.split("\n");
    if (lines.at(-1) !== "") {
      diagnostics.push(file.name + ": partial EOF ignored");
      lines.pop();
    }
    let offset = 0;
    for (const line of lines) {
      if (!line) {
        offset++;
        continue;
      }
      try {
        const p = JSON.parse(line);
        if (!p || Array.isArray(p) || typeof p !== "object")
          throw Error("Not object");
        payloads.push(p as Record<string, unknown>);
      } catch {
        diagnostics.push(`${file.name}:${offset}: malformed line`);
      }
      offset += Buffer.byteLength(line) + 1;
    }
  }
  return { payloads, diagnostics };
}
