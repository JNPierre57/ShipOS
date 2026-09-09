import { z } from "zod";
import type {
  ShipModule,
  ModuleContext,
  WorldState,
  Candidate,
  DeepReadonly,
  Policy,
} from "../../../packages/module-sdk/src/index.js";
import type {
  SourceEvent,
  DomainEvent,
  Profile,
} from "../../../packages/contracts/src/index.js";
import type { Store } from "./store.js";
export const policySchema = z.strictObject({
  importance: z.number().min(0).max(100),
  urgency: z.number().min(0).max(100),
  attentionCost: z.number().min(0).max(100),
  ttlMs: z.number().positive().max(300000),
  cooldownMs: z.number().min(0).max(3600000),
  interruptPolicy: z.enum([
    "never",
    "if-lower-priority",
    "always",
    "exclusive",
  ]),
  preferredProfile: z.enum(["FULL", "COMPACT", "SILENT"]),
  allowCompact: z.boolean(),
});
export interface ModuleStatus {
  enabled: boolean;
  health: "HEALTHY" | "DEGRADED" | "DISABLED";
  failures: number;
  lastFailure: string | null;
  config: Record<string, unknown>;
  policy?: Policy;
}
export function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) freeze(v);
  }
  return value as DeepReadonly<T>;
}
export class Registry {
  status = new Map<string, ModuleStatus>();
  constructor(
    readonly modules: ShipModule[],
    readonly store: Store,
    readonly failureThreshold = 3,
  ) {
    for (const m of modules) {
      const saved = store.get<ModuleStatus>(
        "settings",
        "module:" + m.manifest.id,
      );
      if (saved?.policy) m.policy = policySchema.parse(saved.policy);
      if (saved) saved.config = m.configSchema.parse(saved.config);
      this.status.set(
        m.manifest.id,
        saved ?? {
          enabled: true,
          health: "HEALTHY",
          failures: 0,
          lastFailure: null,
          config: m.configSchema.parse({}),
          policy: m.policy,
        },
      );
    }
  }
  update(
    id: string,
    update: {
      enabled?: boolean;
      config?: Record<string, unknown>;
      policy?: Policy;
    },
  ) {
    const m = this.modules.find((m) => m.manifest.id === id);
    if (!m) throw Error("Unknown module");
    const s = this.status.get(id)!;
    if (update.config) s.config = m.configSchema.parse(update.config);
    if (update.policy) {
      m.policy = policySchema.parse(update.policy);
      s.policy = m.policy;
    }
    if (update.enabled !== undefined) {
      s.enabled = update.enabled;
      s.failures = 0;
      s.health = update.enabled ? "HEALTHY" : "DISABLED";
    }
    this.store.put("settings", "module:" + id, s);
  }
  run<T>(module: ShipModule, fn: () => T): T | undefined {
    const s = this.status.get(module.manifest.id)!;
    if (!s.enabled) return;
    try {
      const result = this.store.db.transaction(() => {
        const value = fn();
        if (value instanceof Promise) {
          void value.catch(() => {});
          throw Error("Synchronous module hook returned a Promise");
        }
        return value;
      })();
      s.failures = 0;
      s.health = "HEALTHY";
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "SqliteError") throw error;
      s.failures++;
      s.lastFailure = String(error);
      s.health = s.failures >= this.failureThreshold ? "DISABLED" : "DEGRADED";
      if (s.health === "DISABLED") s.enabled = false;
      return undefined;
    } finally {
      this.store.put("settings", "module:" + module.manifest.id, s);
    }
  }
  detect(
    module: ShipModule,
    source: SourceEvent,
    previous: WorldState,
    next: WorldState,
    diagnostics: unknown[],
  ): Candidate[] {
    const id = module.manifest.id;
    const ctx: ModuleContext = {
      config: this.status.get(id)!.config,
      worldState: freeze(structuredClone(next)),
      storage: {
        get: <T>(key: string) =>
          this.store.get<T>("module_storage", id + ":" + key),
        set: (key, value) =>
          this.store.put("module_storage", id + ":" + key, value),
      },
      records: {
        candidate: (key, value) => {
          if (!Number.isFinite(value)) throw Error("Invalid record");
          const full = id + ":" + key;
          const old = this.store.get<{ value: number }>("records", full);
          if (old && old.value >= value) return false;
          this.store.put("records", full, {
            key: full,
            value,
            sourceEventId: source.id,
          });
          this.store.put("milestones", full + ":" + source.id, {
            key: full,
            value,
            sourceEventId: source.id,
          });
          return true;
        },
      },
      logger: {
        warn: (code, details) =>
          diagnostics.push({ module: id, code, ...details }),
      },
    };
    const detected = this.run(module, () =>
      module.detect(
        structuredClone(source),
        freeze(structuredClone(previous)),
        ctx.worldState,
        ctx,
      ),
    );
    if (detected === undefined)
      diagnostics.push({
        module: id,
        code: "module_not_executed",
        status: this.status.get(id),
      });
    return detected ?? [];
  }
  present(module: ShipModule, event: DomainEvent, profile: Profile) {
    return this.run(module, () =>
      editorialPresentation(
        this.store,
        event,
        terminalPresentation(event, module.present(event, profile)),
      ),
    );
  }
}
import { terminalPresentation } from "./terminal-presentations.js";
import { editorialPresentation } from "./editorial.js";
