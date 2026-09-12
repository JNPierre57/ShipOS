import type { ZodType } from "zod";
import type {
  SourceEvent,
  DomainEvent,
  EventType,
  Profile,
} from "../../contracts/src/index.js";
export type {
  SourceEvent,
  DomainEvent,
  PresentationAction,
} from "../../contracts/src/index.js";
export type Unknown<T> = T | "unknown";
export interface BodyState {
  systemAddress: number;
  bodyId: number;
  name: Unknown<string>;
  wasFootfalled: Unknown<boolean>;
  scan: Record<string, unknown>;
  biologicalSignals: Unknown<number>;
  sourceIds: string[];
}
export interface WorldState {
  shipTelemetry?: {
    session: string | null;
    agentId: string;
    loadoutAt: string | null;
    statusAt: string | null;
    cargo: number | null;
  };
  commander: Unknown<string>;
  ship: Record<string, unknown>;
  vehicleContext:
    | "unknown"
    | "mainShip"
    | "fighter"
    | "srv"
    | "onFoot"
    | "taxi"
    | "multicrew";
  contextAt: string | null;
  currentSystem: Record<string, unknown>;
  currentBody: string | null;
  location: Record<string, unknown>;
  hull: Unknown<number>;
  hullEpisode: boolean;
  shields: Unknown<boolean>;
  fuel: {
    low: Unknown<boolean>;
    main: Unknown<number>;
    reservoir: Unknown<number>;
  };
  flags: Unknown<number>;
  flags2: Unknown<number>;
  session: string | null;
  expedition: string | null;
  lastJump: Record<string, unknown> | null;
  lastDock: Record<string, unknown> | null;
  biologicalContext: Record<string, unknown>;
  bodies: Record<string, BodyState>;
  navRoute: unknown[] | null;
}
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export interface Candidate {
  type: EventType;
  semanticKey: string;
  payload: Record<string, unknown>;
  quality: DomainEvent["provenance"]["quality"];
  sourceIds?: string[];
  revision?: string;
}
export interface Policy {
  importance: number;
  urgency: number;
  attentionCost: number;
  ttlMs: number;
  cooldownMs: number;
  interruptPolicy: "never" | "if-lower-priority" | "always" | "exclusive";
  preferredProfile: Profile;
  allowCompact: boolean;
}
export interface ModuleContext {
  config: Record<string, unknown>;
  storage: {
    get<T>(key: string): T | undefined;
    set(key: string, value: unknown): void;
  };
  records: { candidate(key: string, value: number): boolean };
  logger: { warn(code: string, details?: Record<string, unknown>): void };
  worldState: DeepReadonly<WorldState>;
}
export interface PresentationDefinition {
  terminal?: {
    primitive:
      | "SystemLine"
      | "ConsoleStrip"
      | "IncidentPanel"
      | "FatalSequence"
      | "RecoverySequence";
    maxLines?: number;
    severity: "notice" | "warning" | "critical";
    label: string;
    lines: string[];
    timingMs: number;
    emphasis: number;
  };
  visual?: "biology" | "orbital" | "fuel" | "integrity" | "signal-loss";
  detail?: string;
  metric?: string;
  metricLabel?: string;
  tags?: string[];
  gauge?: number;
  title: string;
  subtitle: string;
  accent: string;
  durationMs: number;
  slot: string;
  layers: string[];
  audioAsset: string;
}
export interface ShipModule {
  manifest: { id: string; version: string; name: string; eventType: EventType };
  configSchema: ZodType<Record<string, unknown>>;
  policy: Policy;
  detect(
    source: SourceEvent,
    previous: DeepReadonly<WorldState>,
    next: DeepReadonly<WorldState>,
    ctx: ModuleContext,
  ): Candidate[];
  present(event: DomainEvent, profile: Profile): PresentationDefinition;
}
export const defaultPolicy: Policy = {
  importance: 50,
  urgency: 30,
  attentionCost: 3,
  ttlMs: 30000,
  cooldownMs: 10000,
  interruptPolicy: "never",
  preferredProfile: "FULL",
  allowCompact: true,
};
