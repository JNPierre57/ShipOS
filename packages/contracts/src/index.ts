import { z } from "zod";
export const sourceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  agentId: z.string().min(1),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  source: z.enum(["elite.journal", "elite.status", "elite.navroute"]),
  mode: z.enum(["live", "bootstrap"]),
  observedAt: z.iso.datetime(),
  sourceTimestamp: z.iso.datetime().nullable(),
  sourceRecord: z.strictObject({
    filename: z.string(),
    byteStart: z.number().int().nonnegative().optional(),
    byteEnd: z.number().int().nonnegative().optional(),
    contentHash: z.string(),
  }),
  payload: z.record(z.string(), z.unknown()),
});
export type SourceEvent = z.infer<typeof sourceSchema>;
export type RunMode = "live" | "simulation" | "replay";
export const eventTypes = [
  "elite.ship.destroyed",
  "elite.ship.hull.critical",
  "elite.ship.fuel.low",
  "elite.exobiology.highValueDiscovery",
  "elite.exploration.remarkableBody",
  "shipos.context.loadout.novel",
  "shipos.broadcast.tension",
  "shipos.broadcast.critical",
  "shipos.broadcast.recovery",
  "shipos.editorial.moment",
  "shipos.command.ship",
  "shipos.command.loadout",
] as const;
export type EventType = (typeof eventTypes)[number];
export interface DomainEvent {
  schemaVersion: 1;
  id: string;
  sequence: number;
  type: EventType;
  occurredAt: string;
  emittedAt: string;
  semanticKey: string;
  sourceEventIds: string[];
  payload: Record<string, unknown>;
  provenance: {
    mode: RunMode;
    sourceIds: string[];
    quality: "source-observed" | "derived" | "estimated" | "inferred";
  };
  sessionId?: string;
  expeditionId?: string;
}
export type Profile = "FULL" | "COMPACT" | "SILENT";
export interface PresentationAction {
  id: string;
  presentationRunId: string;
  type:
    | "overlay.show"
    | "overlay.hide"
    | "overlay.effect.start"
    | "overlay.effect.stop"
    | "audio.play"
    | "audio.stop"
    | "obs.action";
  target: string;
  issuedAt: number;
  payload: Record<string, unknown>;
}
export const helloSchema = z.strictObject({
  type: z.literal("hello"),
  protocolVersion: z.literal(1),
  agentId: z.string().min(1),
  agentVersion: z.string(),
  lastAckedSequence: z.number().int().nonnegative(),
  spoolDepth: z.number().int().nonnegative().optional(),
});
export const subscriptionSchema = z.strictObject({
  type: z.literal("subscribe"),
  patterns: z
    .array(z.string().regex(/^elite\.(?:[a-zA-Z]+\.)*(?:[a-zA-Z]+|\*)$/))
    .min(1)
    .max(32),
  afterSequence: z.number().int().nonnegative().optional(),
});
export const matches = (type: string, patterns: string[]) =>
  patterns.some((p) =>
    p.endsWith("*") ? type.startsWith(p.slice(0, -1)) : type === p,
  );

export const domainSchema: z.ZodType<DomainEvent> = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  type: z.enum(eventTypes),
  occurredAt: z.iso.datetime(),
  emittedAt: z.iso.datetime(),
  semanticKey: z.string(),
  sourceEventIds: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
  provenance: z.strictObject({
    mode: z.enum(["live", "simulation", "replay"]),
    sourceIds: z.array(z.string()),
    quality: z.enum(["source-observed", "derived", "estimated", "inferred"]),
  }),
  sessionId: z.string().optional(),
  expeditionId: z.string().optional(),
});
