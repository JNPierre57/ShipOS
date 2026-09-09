import type {
  SourceEvent,
  DomainEvent,
} from "../../../packages/contracts/src/index.js";
import type {
  WorldState,
  Candidate,
} from "../../../packages/module-sdk/src/index.js";
import {
  freshContext,
  observe,
  evaluate,
  fingerprint,
  changedSlots,
  type ContextState,
  type Fingerprint,
} from "./context.js";
import type { Store } from "./store.js";
export interface ShipMemory {
  id: string;
  shipId: number;
  type: unknown;
  name: unknown;
  ident: unknown;
  firstSeen: number;
  lastSeen: number;
  observations: number;
  fingerprint: Fingerprint;
  previousFingerprint: string | null;
  diff: ReturnType<typeof changedSlots>;
  newToShipOS: boolean;
}
export class ContextService {
  state: ContextState;
  ship: ShipMemory | null = null;
  metrics = { evaluations: 0, totalMs: 0, maxMs: 0 };
  constructor(
    readonly store: Store,
    now: number,
  ) {
    this.state = freshContext(now);
    evaluate(this.state, now);
  }
  restoreShip(world: WorldState, now: number) {
    const key = JSON.stringify(["ship", world.commander, world.ship.ShipID]);
    this.ship = this.store.get<ShipMemory>("context_memory", key) ?? null;
    if (!this.ship && fingerprint(world.ship)) {
      this.store.db.transaction(() => {
        this.ship = this.source(
          {
            schemaVersion: 1,
            id: "context-baseline",
            agentId: "context-baseline",
            sequence: 1,
            source: "elite.journal",
            mode: "bootstrap",
            observedAt: new Date(now).toISOString(),
            sourceTimestamp: null,
            sourceRecord: {
              filename: "persisted-world-baseline",
              contentHash: "context-baseline",
            },
            payload: { ...world.ship, event: "Loadout" },
          },
          world,
          now,
        ).ship;
      })();
    }
  }
  // Caller commits this draft only after the source transaction has succeeded.
  source(
    source: SourceEvent,
    world: WorldState,
    now: number,
    newSession = false,
  ) {
    const draft = newSession ? freshContext(now) : structuredClone(this.state),
      p = source.payload;
    let ship =
      p.event === "LoadGame"
        ? (this.store.get<ShipMemory>(
            "context_memory",
            JSON.stringify(["ship", world.commander, p.ShipID]),
          ) ?? null)
        : this.ship;
    const candidates: Candidate[] = [];
    if (
      p.event === "Loadout" &&
      world.commander !== "unknown" &&
      Number.isSafeInteger(p.ShipID) &&
      Number(p.ShipID) >= 0 &&
      typeof p.Ship === "string" &&
      p.Ship.trim().length > 0
    ) {
      const fp = fingerprint(p);
      if (fp) {
        const key = JSON.stringify(["ship", world.commander, p.ShipID]),
          old = this.store.get<ShipMemory>("context_memory", key);
        const knownKey = JSON.stringify([
          "fingerprint",
          world.commander,
          p.ShipID,
          fp.hash,
        ]);
        const known = this.store.get("context_memory", knownKey);
        ship = {
          id: key,
          shipId: p.ShipID as number,
          type: p.Ship,
          name: p.ShipName ?? null,
          ident: p.ShipIdent ?? null,
          firstSeen: old?.firstSeen ?? now,
          lastSeen: now,
          observations: (old?.observations ?? 0) + 1,
          fingerprint: fp,
          previousFingerprint:
            old?.fingerprint.hash === fp.hash
              ? old.previousFingerprint
              : (old?.fingerprint.hash ?? null),
          diff:
            old?.fingerprint.hash === fp.hash
              ? old.diff
              : changedSlots(old?.fingerprint, fp),
          newToShipOS: !known,
        };
        this.store.put("context_memory", key, ship);
        if (old?.fingerprint.hash !== fp.hash && source.mode === "live") {
          draft.buildTimeline.push({
            at: now,
            hash: fp.hash,
            newToShipOS: !known,
            changedSlots: ship.diff.map((d) => d.slot),
          });
          draft.buildTimeline = draft.buildTimeline.slice(-50);
        }
        if (!known) {
          this.store.put("context_memory", knownKey, {
            firstSeen: now,
            hash: fp.hash,
            ship: key,
            slots: fp.slots,
          });
          if (source.mode === "live") {
            draft.novelAt = now;
            candidates.push({
              type: "shipos.context.loadout.novel",
              semanticKey: knownKey,
              payload: {
                label: "CONFIGURATION SIGNATURE UNKNOWN",
                ship: ship.type,
                name: ship.name,
                fingerprint: fp.hash,
                changedSlots: ship.diff,
                newToShipOS: true,
              },
              quality: "derived",
            });
          }
        }
      }
    }
    if (p.event === "LaunchSRV" && typeof p.SRVType === "string") {
      const key = JSON.stringify(["vehicle", world.commander, p.SRVType]);
      const old = this.store.get<{ firstSeen: number; observations: number }>(
        "context_memory",
        key,
      );
      this.store.put("context_memory", key, {
        type: p.SRVType,
        firstSeen: old?.firstSeen ?? now,
        lastSeen: now,
        observations: (old?.observations ?? 0) + 1,
      });
    }
    if (source.mode === "live") observe(draft, source, world, now);
    return { draft, ship, candidates };
  }
  tick(now: number): {
    transition: ReturnType<typeof evaluate>;
    candidate: Candidate | null;
  } {
    const start = performance.now(),
      transition = evaluate(this.state, now),
      elapsed = performance.now() - start;
    this.metrics.evaluations++;
    this.metrics.totalMs += elapsed;
    this.metrics.maxMs = Math.max(this.metrics.maxMs, elapsed);
    let candidate: Candidate | null = null;
    if (transition) {
      const suffix = transition.to.toLowerCase();
      if (
        suffix === "critical" ||
        suffix === "tension" ||
        suffix === "recovery"
      )
        candidate = {
          type: `shipos.broadcast.${suffix}`,
          semanticKey: `broadcast:${this.state.episode ?? transition.id}:${suffix}`,
          sourceIds: transition.sourceIds,
          payload: {
            phase: transition.to,
            reason: transition.reason,
            transitionId: transition.id,
            episode: this.state.episode,
            dimensions: this.state.dimensions,
          },
          quality: "derived",
        };
    }
    return { transition, candidate };
  }
  snapshot() {
    return { ...this.state, ship: this.ship, metrics: this.metrics };
  }
  persistTransition(
    transition: NonNullable<ReturnType<typeof evaluate>>,
    mode: DomainEvent["provenance"]["mode"],
  ) {
    this.store.put("context_transitions", transition.id, {
      ...transition,
      mode,
    });
  }
}
