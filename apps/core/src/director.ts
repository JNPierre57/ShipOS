import type {
  DomainEvent,
  Profile,
} from "../../../packages/contracts/src/index.js";
import type { ShipModule } from "../../../packages/module-sdk/src/index.js";
import type { Clock } from "./clock.js";
import type { Store } from "./store.js";
import { Registry } from "./module-registry.js";
import { PresentationEngine, type PresentationRun } from "./presentation.js";
export interface Decision {
  eventId: string;
  importance: number;
  urgency: number;
  score: number;
  scoreComponents: { importance: number; urgency: number; ageBoost: number };
  age: number;
  ttlMs: number;
  budgetBefore: number;
  budgetAfter: number;
  dedupe: string;
  cooldown: string;
  coalescing: string;
  queuePosition: number | null;
  interruption: boolean;
  profile: Profile;
  status:
    | "presented"
    | "queued"
    | "suppressed"
    | "expired"
    | "deduplicated"
    | "coalesced"
    | "interrupted"
    | "failed";
  reasons: string[];
  at: number;
  semanticKey: string;
  type: string;
  cost: number;
}
export class Director {
  guard: (event: DomainEvent) => string | null = () => null;
  queue: { event: DomainEvent; module: ShipModule }[] = [];
  private busy = false;
  private cooldowns = new Map<string, number>();
  private semantics = new Map<string, number>();
  private spent: { at: number; cost: number }[] = [];
  config = {
    budget: 10,
    windowMs: 30000,
    queueMax: 5,
    importanceWeight: 0.6,
    urgencyWeight: 0.4,
  };
  constructor(
    readonly clock: Clock,
    readonly store: Store,
    readonly registry: Registry,
    readonly engine: PresentationEngine,
  ) {
    Object.assign(this.config, store.get("settings", "director"));
    for (const d of store.all<Decision>("director_decisions")) {
      if (d.cost > 0) {
        this.spent.push({ at: d.at, cost: d.cost });
        this.cooldowns.set(d.type, d.at);
        this.semantics.set(d.semanticKey, d.at);
      }
    }
    for (const run of store.all<PresentationRun>("presentation_runs")) {
      if (run.status === "running") {
        run.status = "interrupted";
        store.put("presentation_runs", run.id, run);
        const decision = store.get<Decision>("director_decisions", run.eventId);
        if (decision) {
          decision.status = "interrupted";
          decision.reasons.push("core_restart");
          this.save(decision);
        }
      }
    }
    for (const decision of store.all<Decision>("director_decisions")) {
      if (decision.status === "queued") {
        decision.status = "suppressed";
        decision.reasons.push("core_restart_queue_cancelled");
        this.save(decision);
      }
    }
    engine.onEnd = (run) => this.ended(run);
  }
  budget() {
    this.spent = this.spent.filter(
      (s) => s.at > this.clock.now() - this.config.windowMs,
    );
    return this.config.budget - this.spent.reduce((n, s) => n + s.cost, 0);
  }
  private save(d: Decision) {
    this.store.put("director_decisions", d.eventId, d);
    return d;
  }
  decide(event: DomainEvent, module: ShipModule, fromQueue = false): Decision {
    const existing = this.store.get<Decision>("director_decisions", event.id);
    if (existing && !fromQueue) return existing;
    const p = module.policy;
    const now = this.clock.now(),
      age = Math.max(0, now - Date.parse(event.occurredAt)),
      budget = this.budget();
    for (const [key, at] of this.semantics)
      if (now - at > 3600000) this.semantics.delete(key);
    const components = {
      importance: p.importance * this.config.importanceWeight,
      urgency: p.urgency * this.config.urgencyWeight,
      ageBoost: Math.min(10, age / 1000),
    };
    const d: Decision = {
      eventId: event.id,
      importance: p.importance,
      urgency: p.urgency,
      score: components.importance + components.urgency + components.ageBoost,
      scoreComponents: components,
      age,
      ttlMs: p.ttlMs,
      budgetBefore: budget,
      budgetAfter: budget,
      dedupe: "new",
      cooldown: "clear",
      coalescing: "none",
      queuePosition: null,
      interruption: false,
      profile: "SILENT",
      status: "suppressed",
      reasons: [],
      at: now,
      semanticKey: event.semanticKey,
      type: event.type,
      cost: 0,
    };
    const stop = (status: Decision["status"], reason: string) => {
      d.status = status;
      d.profile = "SILENT";
      d.reasons.push(reason);
      return this.save(d);
    };
    if (age > p.ttlMs) return stop("expired", "ttl_expired");
    const rejected = this.guard(event);
    if (rejected) return stop("suppressed", rejected);
    const editorialId =
      typeof event.payload.editorialNoteId === "string"
        ? event.payload.editorialNoteId
        : event.id;
    const editorial = this.store.get<{ eligible: boolean; reason: string }>(
      "editorial_notes",
      editorialId,
    );
    if (editorial && !editorial.eligible)
      return stop("suppressed", "editorial:" + editorial.reason);
    if (event.type === "shipos.broadcast.critical") {
      const hull = this.store
        .recentEvents(Number.MAX_SAFE_INTEGER, 100)
        .find(
          (e) =>
            e.type === "elite.ship.hull.critical" &&
            now - Date.parse(e.emittedAt) < 30000,
        );
      if (hull) {
        const decision = this.store.get<Decision>(
          "director_decisions",
          hull.id,
        );
        if (
          decision &&
          ["presented", "queued", "interrupted"].includes(decision.status)
        ) {
          d.coalescing = "hull_critical_precedence";
          return stop("coalesced", "hull_critical_precedence");
        }
      }
    }
    const semanticAt = this.semantics.get(event.semanticKey);
    if (semanticAt !== undefined && now - semanticAt < p.cooldownMs) {
      d.coalescing = "same_semantic_family";
      const queued = this.queue.find(
        (q) => q.event.semanticKey === event.semanticKey,
      );
      if (queued) {
        const old = this.store.get<Decision>(
          "director_decisions",
          queued.event.id,
        );
        if (old) {
          old.status = "coalesced";
          old.reasons.push("replaced_by_revision");
          this.save(old);
        }
        queued.event = event;
      }
      return stop("coalesced", "semantic_coalescing");
    }
    const last = this.cooldowns.get(event.type);
    if (
      last !== undefined &&
      now - last < p.cooldownMs &&
      p.interruptPolicy !== "exclusive"
    ) {
      d.cooldown = "active";
      return stop("suppressed", "cooldown");
    }
    if (p.preferredProfile === "SILENT")
      return stop("suppressed", "policy_silent");
    const bypass = p.interruptPolicy === "exclusive" || p.urgency >= 90;
    let cost = p.attentionCost;
    d.profile = p.preferredProfile;
    if (d.profile === "COMPACT") cost *= 0.4;
    if (cost > budget && !bypass) {
      if (p.allowCompact && p.attentionCost * 0.4 <= budget) {
        d.profile = "COMPACT";
        cost = p.attentionCost * 0.4;
      } else return stop("suppressed", "attention_budget");
    }
    if (bypass && cost > budget) d.reasons.push("urgent_budget_bypass");
    const active = this.engine.snapshot()[0];
    if (active) {
      const activeDecision = this.store.get<Decision>(
        "director_decisions",
        active.eventId,
      );
      const activeExclusive =
        this.registry.modules.find(
          (m) => m.manifest.eventType === activeDecision?.type,
        )?.policy.interruptPolicy === "exclusive";
      const interrupts =
        p.interruptPolicy === "exclusive" ||
        (!activeExclusive &&
          (p.interruptPolicy === "always" ||
            (p.interruptPolicy === "if-lower-priority" &&
              d.score > (activeDecision?.score ?? 0))));
      if (interrupts) {
        d.interruption = true;
        this.busy = true;
        if (p.interruptPolicy === "exclusive") {
          for (const q of this.queue) {
            const decision = this.store.get<Decision>(
              "director_decisions",
              q.event.id,
            );
            if (decision) {
              decision.status = "suppressed";
              decision.reasons.push("exclusive_queue_invalidated");
              this.save(decision);
            }
          }
          this.queue = [];
        }
        this.engine.cancelAll();
        this.busy = false;
      } else {
        d.status = "queued";
        d.profile = "SILENT";
        this.queue.push({ event, module });
        this.queue.sort(
          (a, b) =>
            b.module.policy.importance * this.config.importanceWeight +
            b.module.policy.urgency * this.config.urgencyWeight -
            (a.module.policy.importance * this.config.importanceWeight +
              a.module.policy.urgency * this.config.urgencyWeight),
        );
        if (this.queue.length > this.config.queueMax) {
          const removed = this.queue.pop()!;
          if (removed.event.id === event.id)
            return stop("suppressed", "queue_saturated");
          const old = this.store.get<Decision>(
            "director_decisions",
            removed.event.id,
          );
          if (old) {
            old.status = "suppressed";
            old.reasons.push("queue_evicted");
            this.save(old);
          }
        }
        d.queuePosition =
          this.queue.findIndex((q) => q.event.id === event.id) + 1;
        d.reasons.push("attention_owned");
        this.semantics.set(event.semanticKey, now);
        return this.save(d);
      }
    }
    const definition = this.registry.present(module, event, d.profile);
    if (!definition) return stop("failed", "presentation_factory_failed");
    this.spent.push({ at: now, cost });
    this.cooldowns.set(event.type, now);
    this.semantics.set(event.semanticKey, now);
    d.cost = cost;
    d.budgetAfter = this.budget();
    d.status = "presented";
    d.reasons.push("selected");
    this.save(d);
    this.engine.start(event, d.profile, definition);
    return d;
  }
  private ended(run: PresentationRun) {
    const d = this.store.get<Decision>("director_decisions", run.eventId);
    if (d && run.status === "interrupted") {
      d.status = "interrupted";
      d.reasons.push("preempted");
      this.save(d);
    }
    if (this.busy) return;
    const next = this.queue.shift();
    if (next) {
      this.semantics.delete(next.event.semanticKey);
      this.decide(next.event, next.module, true);
    }
  }
  stop() {
    this.busy = true;
    this.queue = [];
    this.engine.cancelAll();
  }
}
