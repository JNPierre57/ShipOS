import { randomUUID } from "node:crypto";
import type {
  DomainEvent,
  PresentationAction,
  Profile,
} from "../../../packages/contracts/src/index.js";
import type { PresentationDefinition } from "../../../packages/module-sdk/src/index.js";
import type { Clock } from "./clock.js";
import type { Store } from "./store.js";
export interface PresentationRun {
  id: string;
  eventId: string;
  profile: Profile;
  definition: PresentationDefinition;
  startedAt: number;
  endsAt: number;
  status: "running" | "completed" | "interrupted";
  mode: string;
}
export class PresentationEngine {
  active = new Map<string, { run: PresentationRun; abort: AbortController }>();
  listeners = new Set<(action: PresentationAction) => void>();
  onEnd: ((run: PresentationRun) => void) | undefined;
  constructor(
    readonly clock: Clock,
    readonly store: Store,
  ) {}
  emit(
    run: PresentationRun,
    type: PresentationAction["type"],
    payload: Record<string, unknown> = {},
  ) {
    const a = {
      id: randomUUID(),
      presentationRunId: run.id,
      type,
      target: run.definition.slot,
      issuedAt: this.clock.now(),
      payload,
    };
    for (const fn of this.listeners) {
      try {
        fn(a);
      } catch {
        /* Disconnected sinks do not own the lifecycle. */
      }
    }
  }
  private persist(run: PresentationRun) {
    this.store.put(
      "presentation_runs",
      run.id,
      run.definition.comm
        ? {
            ...run,
            definition: {
              ...run.definition,
              comm: {
                ...run.definition.comm,
                displayName: "CREW MEMBER",
              },
            },
          }
        : run,
    );
  }
  start(
    event: DomainEvent,
    profile: Profile,
    definition: PresentationDefinition,
  ) {
    const run: PresentationRun = {
      id: randomUUID(),
      eventId: event.id,
      profile,
      definition,
      startedAt: this.clock.now(),
      endsAt: this.clock.now() + definition.durationMs,
      status: "running",
      mode: event.provenance.mode,
    };
    const abort = new AbortController();
    this.active.set(run.id, { run, abort });
    this.persist(run);
    this.emit(run, "overlay.show", {
      ...definition,
      profile,
      startedAt: run.startedAt,
      endsAt: run.endsAt,
      mode: run.mode,
    });
    if (definition.layers.includes("GlobalFxLayer"))
      this.emit(run, "overlay.effect.start", { accent: definition.accent });
    if (definition.audioAsset)
      this.emit(run, "audio.play", {
        assetId: definition.audioAsset,
        bus: "alerts",
      });
    const cancelTimer = this.clock.later(definition.durationMs, () =>
      this.finish(run.id, "completed"),
    );
    abort.signal.addEventListener("abort", cancelTimer, { once: true });
    return run;
  }
  finish(id: string, status: "completed" | "interrupted") {
    const current = this.active.get(id);
    if (!current) return;
    current.abort.abort();
    current.run.status = status;
    this.active.delete(id);
    this.emit(current.run, "audio.stop");
    this.emit(current.run, "overlay.effect.stop");
    this.emit(current.run, "overlay.hide");
    this.persist(current.run);
    this.onEnd?.(current.run);
  }
  cancelAll() {
    for (const id of [...this.active.keys()]) this.finish(id, "interrupted");
  }
  snapshot() {
    return [...this.active.values()].map((v) => v.run);
  }
}
