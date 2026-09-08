import { aggregateExpedition } from "./expeditions.js";
import { createHash, randomUUID } from "node:crypto";
import type {
  Candidate,
  ShipModule,
  WorldState,
} from "../../../packages/module-sdk/src/index.js";
import type {
  DomainEvent,
  SourceEvent,
  RunMode,
} from "../../../packages/contracts/src/index.js";
import { Store } from "./store.js";
import { initialWorld, reduce, stateDelta } from "./world.js";
import { RealClock, type Clock } from "./clock.js";
import { Registry } from "./module-registry.js";
import { PresentationEngine } from "./presentation.js";
import { Director } from "./director.js";
export function eventFactory(
  moduleId: string,
  candidate: Candidate,
  source: SourceEvent,
  mode: RunMode,
  clock: Clock,
): DomainEvent {
  const sourceIds = candidate.sourceIds ?? [source.id];
  return {
    schemaVersion: 1,
    id: createHash("sha256")
      .update(
        JSON.stringify([
          moduleId,
          candidate.type,
          sourceIds,
          candidate.semanticKey,
          candidate.revision ?? "",
        ]),
      )
      .digest("hex"),
    sequence: 0,
    type: candidate.type,
    occurredAt: source.sourceTimestamp ?? source.observedAt,
    emittedAt: new Date(clock.now()).toISOString(),
    semanticKey: candidate.semanticKey,
    sourceEventIds: sourceIds,
    payload: candidate.payload,
    provenance: { mode, sourceIds, quality: candidate.quality },
  };
}
export class RunContext {
  world: WorldState;
  registry: Registry;
  engine: PresentationEngine;
  director: Director;
  diagnostics = new Set<(data: Record<string, unknown>) => void>();
  eventBus = new Set<(event: DomainEvent) => void>();
  externalBus = new Set<(event: DomainEvent) => void>();
  readonly externalPublishing: boolean;
  private processing = false;
  sessionId: string | null = null;
  constructor(
    readonly mode: RunMode,
    readonly store: Store,
    readonly modules: ShipModule[],
    readonly clock: Clock = new RealClock(),
    failureThreshold = 3,
  ) {
    if (mode !== "live" && store.path !== ":memory:")
      throw Error("Non-live runs require isolated in-memory persistence");
    this.externalPublishing = mode === "live";
    this.world =
      store.get<WorldState>("world_state", "current") ?? initialWorld();
    this.modules = modules.map((m) => ({ ...m, policy: { ...m.policy } }));
    this.registry = new Registry(this.modules, store, failureThreshold);
    this.engine = new PresentationEngine(clock, store);
    this.director = new Director(clock, store, this.registry, this.engine);
  }
  process() {
    if (this.processing) return;
    this.processing = true;
    try {
      for (const source of this.store.pendingSources()) {
        const previous = this.world;
        const next = reduce(previous, source);
        const diagnostics: unknown[] = [];
        const emitted: DomainEvent[] = [];
        let sessionId = this.sessionId;
        this.store.db.transaction(() => {
          if (source.mode === "live") {
            if (!sessionId) {
              sessionId = randomUUID();
              this.store.put("sessions", sessionId, {
                id: sessionId,
                mode: this.mode,
                startedAt: this.clock.now(),
                endedAt: null,
              });
            }
            next.session = sessionId;
            const active = this.store.get<{ id: string }>(
              "expeditions",
              "active",
            );
            next.expedition = active?.id ?? null;
            for (const module of this.modules) {
              for (const candidate of this.registry.detect(
                module,
                source,
                previous,
                next,
                diagnostics,
              )) {
                const event = eventFactory(
                  module.manifest.id,
                  candidate,
                  source,
                  this.mode,
                  this.clock,
                );
                event.sessionId = sessionId;
                if (next.expedition) event.expeditionId = next.expedition;
                emitted.push(this.store.domain(event));
              }
            }
          }
          if (source.mode === "live")
            aggregateExpedition(this.store, source, emitted);
          this.store.put("world_state", "current", next);
          this.store.processed(source.id, {
            ...stateDelta(previous, next),
            diagnostics,
          });
        })();
        this.world = next;
        this.sessionId = sessionId;
        for (const d of diagnostics)
          for (const fn of this.diagnostics)
            fn({
              sourceEventId: source.id,
              agentId: source.agentId,
              agentSequence: source.sequence,
              ...(d as Record<string, unknown>),
            });
        if (source.payload.event === "Shutdown") this.endSession();
      }
      this.dispatch();
    } finally {
      this.processing = false;
    }
  }
  dispatch() {
    for (const event of this.store.events(0, 10000, true)) {
      if (this.externalPublishing)
        for (const fn of this.externalBus) {
          try {
            fn(event);
          } catch {
            for (const log of this.diagnostics)
              log({ code: "external_sink_failure", domainEventId: event.id });
          }
        }
      for (const fn of this.eventBus) {
        try {
          fn(event);
        } catch {
          for (const log of this.diagnostics)
            log({ code: "event_sink_failure", domainEventId: event.id });
        }
      }
      const module = this.modules.find(
        (m) => m.manifest.eventType === event.type,
      );
      if (module) this.director.decide(event, module);
      this.store.dispatched(event.id);
    }
  }
  ingest(source: SourceEvent) {
    this.store.accept(source);
    this.process();
  }
  endSession() {
    if (this.sessionId) {
      const session = this.store.get<Record<string, unknown>>(
        "sessions",
        this.sessionId,
      );
      this.store.put("sessions", this.sessionId, {
        ...session,
        endedAt: this.clock.now(),
      });
      this.sessionId = null;
    }
  }
  close() {
    this.director.stop();
    this.endSession();
    this.store.close();
  }
}
