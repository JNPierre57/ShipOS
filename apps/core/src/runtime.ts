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
import { ContextService } from "./context-service.js";
import { contextModules } from "./context-modules.js";
import { Editorial, editorialModule } from "./editorial.js";
import { ShipCommands, shipModule } from "./ship-command.js";
import { loadoutModule } from "./loadout-card.js";
import { screenModule } from "./screen-command.js";
import { Crew, crewModule } from "./crew.js";
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
  context: ContextService;
  editorial: Editorial;
  shipCommands: ShipCommands;
  crew: Crew;
  private cancelTick: (() => void) | undefined;
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
    this.modules.push(
      ...[
        ...contextModules,
        editorialModule,
        shipModule,
        loadoutModule,
        screenModule,
        crewModule,
      ]
        .filter(
          (m) =>
            !this.modules.some(
              (existing) => existing.manifest.id === m.manifest.id,
            ),
        )
        .map((m) => ({ ...m, policy: { ...m.policy } })),
    );
    this.context = new ContextService(store, clock.now());
    this.context.restoreShip(this.world, clock.now());
    this.editorial = new Editorial(store);
    if (mode === "live") this.editorial.backfill();
    this.registry = new Registry(this.modules, store, failureThreshold);
    this.engine = new PresentationEngine(clock, store);
    this.director = new Director(clock, store, this.registry, this.engine);
    this.shipCommands = new ShipCommands(this);
    this.crew = new Crew(this);
    this.director.guard = (e) =>
      this.shipCommands.guard(e) ?? this.crew.guard(e);
    this.director.decorate = (e, d) => this.crew.decorate(e, d);
  }
  private scheduleContext() {
    this.cancelTick = this.clock.later(1000, () => {
      try {
        this.contextTick();
      } catch (error) {
        for (const log of this.diagnostics)
          log({ code: "context_tick_failed", error: String(error) });
      } finally {
        this.scheduleContext();
      }
    });
  }
  stopContext() {
    this.cancelTick?.();
    this.cancelTick = undefined;
  }
  contextTick() {
    this.shipCommands.revalidate();
    this.crew.revalidate();
    const before = structuredClone(this.context.state);
    try {
      this.store.db.transaction(() => {
        const { transition, candidate } = this.context.tick(this.clock.now());
        if (transition) {
          this.context.persistTransition(transition, this.mode);
          if (this.sessionId) this.saveContextSession();
        }
        if (candidate) {
          const at = new Date(this.clock.now()).toISOString();
          const event = eventFactory(
            "context",
            candidate,
            {
              id: transition!.id,
              observedAt: at,
              sourceTimestamp: at,
            } as SourceEvent,
            this.mode,
            this.clock,
          );
          if (this.sessionId) event.sessionId = this.sessionId;
          this.store.domain(event);
          this.editorial.broadcast(event, transition!, this.world.commander);
        }
      })();
    } catch (error) {
      this.context.state = before;
      throw error;
    }
    this.dispatch();
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
        let contextDraft: ReturnType<ContextService["source"]> | undefined;
        this.store.db.transaction(() => {
          contextDraft = this.context.source(
            source,
            next,
            this.clock.now(),
            source.mode === "live" && !sessionId,
          );
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
              if (
                [
                  ...contextModules,
                  editorialModule,
                  shipModule,
                  loadoutModule,
                  screenModule,
                  crewModule,
                ].some((m) => m.manifest.id === module.manifest.id)
              )
                continue;
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
            for (const candidate of contextDraft.candidates) {
              const event = eventFactory(
                "context",
                candidate,
                source,
                this.mode,
                this.clock,
              );
              event.sessionId = sessionId;
              emitted.push(this.store.domain(event));
            }
            const editorial = this.editorial.observe(
              source,
              next,
              emitted,
              contextDraft.draft.phase,
              this.clock.now(),
            );
            if (editorial.candidate) {
              const event = eventFactory(
                "editorial",
                editorial.candidate,
                source,
                this.mode,
                this.clock,
              );
              event.sessionId = sessionId;
              emitted.push(this.store.domain(event));
              if (editorial.note)
                this.store.put("editorial_notes", editorial.note.id, {
                  ...editorial.note,
                  eventId: event.id,
                });
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
        this.shipCommands.source(source);
        this.crew.revalidate();
        if (contextDraft) {
          this.context.state = contextDraft.draft;
          this.context.ship = contextDraft.ship;
        }
        if (source.mode === "live" && !this.cancelTick) this.scheduleContext();
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
      if (this.externalPublishing && event.type.startsWith("elite."))
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
      this.saveContextSession();
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
  private saveContextSession() {
    if (this.sessionId)
      this.store.put("context_sessions", this.sessionId, {
        sessionId: this.sessionId,
        activities: this.context.state.summaries,
        census: this.context.state.census,
        broadcast: this.context.state.timeline,
        activityTimeline: this.context.state.activityTimeline,
        buildTimeline: this.context.state.buildTimeline,
        updatedAt: this.clock.now(),
      });
  }
  close() {
    this.stopContext();
    this.director.stop();
    this.endSession();
    this.store.close();
  }
}
