import { createHash } from "node:crypto";
import type { SourceEvent } from "../../../packages/contracts/src/index.js";
import type { WorldState } from "../../../packages/module-sdk/src/index.js";

export const categories = [
  "combat",
  "travel",
  "mining.space",
  "mining.surface",
  "engineering",
  "outfitting",
  "powerplay",
  "bgs",
  "trading",
  "missioning",
  "exploration",
  "exobiology",
  "srv",
  "onFoot",
] as const;
export type Category = (typeof categories)[number];
export type Quality = "OBSERVED" | "DERIVED" | "INFERRED";
export type Phase =
  "CALM" | "ACTIVE" | "TENSION" | "CRITICAL" | "RECOVERY" | "TRANSITION";
export interface Signal {
  sourceEventId: string;
  id: string;
  timestamp: number;
  category: Category;
  source: string;
  polarity: 1 | -1;
  weight: number;
  confidence: number;
  ttlMs: number;
  evidence: string;
  provenance: Quality;
  danger: number;
  intensity: number;
}
export interface Activity {
  category: Category;
  score: number;
  confidence: number;
  quality: Quality;
  status: "STABLE" | "EXPERIMENTAL";
  lastChangedAt: number;
  dominantEvidence: string | null;
  evidence: (Signal & { ageMs: number; contribution: number })[];
}
export interface Transition {
  sourceIds: string[];
  id: string;
  at: number;
  from: Phase;
  to: Phase;
  reason: string;
  danger: number;
  evidence: string[];
  durationMs: number;
  peakDanger: number;
}
export interface ContextState {
  version: 1;
  signals: Signal[];
  activities: Activity[];
  phase: Phase;
  since: number;
  dimensions: {
    intensity: number;
    danger: number;
    novelty: number;
    pace: number;
  };
  pending: { phase: Phase; since: number } | null;
  peak: number;
  criticalAt: number | null;
  episode: string | null;
  safeAt: number | null;
  safeSourceId: string | null;
  lastSourceAt: number | null;
  timeline: Transition[];
  activityTimeline: {
    at: number;
    category: Category;
    active: boolean;
    confidence: number;
    evidence: string[];
  }[];
  buildTimeline: {
    at: number;
    hash: string;
    newToShipOS: boolean;
    changedSlots: string[];
  }[];
  census: Record<string, { count: number; lastSeen: number }>;
  factionCompletions: { faction: string; at: number }[];
  summaries: Partial<
    Record<
      Category,
      { firstAt: number; activeMs: number; peak: number; confidence: number }
    >
  >;
  lastTick: number;
  novelAt: number | null;
}
export const freshContext = (now: number): ContextState => ({
  version: 1,
  signals: [],
  activities: [],
  phase: "CALM",
  since: now,
  dimensions: { intensity: 0, danger: 0, novelty: 0, pace: 0 },
  pending: null,
  peak: 0,
  criticalAt: null,
  episode: null,
  safeAt: null,
  safeSourceId: null,
  lastSourceAt: null,
  timeline: [],
  activityTimeline: [],
  buildTimeline: [],
  census: {},
  factionCompletions: [],
  summaries: {},
  lastTick: now,
  novelAt: null,
});
export const rules: Partial<
  Record<string, [Category, number, number, Quality, number, number]>
> = {
  UnderAttack: ["combat", 0.9, 30000, "OBSERVED", 55, 75],
  Bounty: ["combat", 0.8, 60000, "OBSERVED", 0, 60],
  FactionKillBond: ["combat", 0.9, 60000, "OBSERVED", 0, 70],
  FSDJump: ["travel", 0.8, 90000, "OBSERVED", 0, 20],
  StartJump: ["travel", 0.7, 45000, "OBSERVED", 0, 25],
  SupercruiseEntry: ["travel", 0.6, 60000, "OBSERVED", 0, 20],
  MiningRefined: ["mining.space", 0.95, 120000, "OBSERVED", 0, 35],
  EngineerCraft: ["engineering", 1, 180000, "OBSERVED", 0, 30],
  ModuleBuy: ["outfitting", 1, 90000, "OBSERVED", 0, 20],
  ModuleSell: ["outfitting", 1, 90000, "OBSERVED", 0, 20],
  ModuleSwap: ["outfitting", 1, 90000, "OBSERVED", 0, 20],
  PowerplayCollect: ["powerplay", 1, 180000, "OBSERVED", 0, 25],
  PowerplayDeliver: ["powerplay", 1, 180000, "OBSERVED", 0, 25],
  MarketBuy: ["trading", 0.9, 90000, "OBSERVED", 0, 20],
  MarketSell: ["trading", 0.9, 90000, "OBSERVED", 0, 20],
  MissionAccepted: ["missioning", 0.8, 120000, "OBSERVED", 0, 25],
  MissionCompleted: ["missioning", 1, 120000, "OBSERVED", 0, 35],
  Scan: ["exploration", 0.7, 90000, "OBSERVED", 0, 20],
  SAASignalsFound: ["exploration", 0.9, 90000, "OBSERVED", 0, 30],
  ScanOrganic: ["exobiology", 1, 120000, "OBSERVED", 0, 35],
  LaunchSRV: ["srv", 1, 90000, "OBSERVED", 0, 25],
  Disembark: ["onFoot", 1, 90000, "OBSERVED", 0, 20],
};
const bounded = (n: number) => Math.max(0, Math.min(1, n));
const digest = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function observe(
  state: ContextState,
  source: SourceEvent,
  world: WorldState,
  now: number,
) {
  const p = source.payload,
    name = String(p.event ?? source.source).slice(0, 100);
  state.lastSourceAt = now;
  const safeName = ["__proto__", "constructor", "prototype"].includes(name)
    ? "Other"
    : name;
  const censusName =
    Object.hasOwn(state.census, safeName) ||
    Object.keys(state.census).length < 127
      ? safeName
      : "Other";
  state.census[censusName] = {
    count: (state.census[censusName]?.count ?? 0) + 1,
    lastSeen: now,
  };
  const add = (
    key: string,
    rule: NonNullable<(typeof rules)[string]>,
    confidence = 1,
  ) => {
    const [category, weight, ttlMs, provenance, danger, intensity] = rule;
    state.signals = state.signals.filter((s) => s.source !== key);
    state.signals.push({
      sourceEventId: source.id,
      id: source.id + ":" + key,
      timestamp: now,
      category,
      source: key,
      polarity: 1,
      weight,
      confidence,
      ttlMs,
      provenance,
      danger,
      intensity,
      evidence:
        name +
        " → " +
        category +
        (key === "hull"
          ? ` (Health=${String(p.Health)})`
          : key === "heat"
            ? ` (overheating flag)`
            : key === "surface"
              ? " (MaterialCollected while in SRV; mining is inferred)"
              : key === "faction-repetition"
                ? " (repeated faction-effect completions; intent unknown)"
                : ""),
    });
  };
  const rule = Object.hasOwn(rules, name) ? rules[name] : undefined;
  if (rule && (name !== "UnderAttack" || p.Target === "You")) add(name, rule);
  if (
    name === "Status" &&
    typeof p.Flags === "number" &&
    Number.isInteger(p.Flags)
  ) {
    for (const category of ["srv", "onFoot"] as const) {
      state.signals = state.signals.filter(
        (s) => s.source !== "vehicle:" + category,
      );
      if (world.vehicleContext === category)
        add("vehicle:" + category, [category, 1, 30000, "OBSERVED", 0, 15]);
    }
    if (world.vehicleContext === "mainShip") {
      const overheating = (p.Flags & 1048576) !== 0;
      state.signals = state.signals.filter((s) => s.source !== "heat");
      if (overheating)
        add("heat", ["travel", 0.2, 15000, "DERIVED", 40, 55], 0.9);
      // A fresh clear, shielded main-ship sample is positive safety evidence.
      if (!overheating && (p.Flags & 8) !== 0) {
        state.safeAt = now;
        state.safeSourceId = source.id;
      }
    }
  }
  const contextFresh =
    world.contextAt !== null &&
    Math.abs(
      Date.parse(source.sourceTimestamp ?? source.observedAt) -
        Date.parse(world.contextAt),
    ) <= 30000;
  if (
    name === "HullDamage" &&
    contextFresh &&
    world.vehicleContext === "mainShip" &&
    p.PlayerPilot === true &&
    p.Fighter !== true &&
    typeof p.Health === "number" &&
    p.Health >= 0 &&
    p.Health <= 1
  )
    add(
      "hull",
      [
        "combat",
        0.25,
        45000,
        "DERIVED",
        p.Health <= 0.2 ? 100 : p.Health <= 0.5 ? 60 : 25,
        85,
      ],
      0.35,
    );
  if (
    name === "MaterialCollected" &&
    contextFresh &&
    world.vehicleContext === "srv"
  )
    add("surface", ["mining.surface", 0.55, 60000, "INFERRED", 0, 25], 0.55);
  state.factionCompletions = state.factionCompletions
    .filter((x) => now - x.at < 180000)
    .slice(-15);
  if (
    name === "MissionCompleted" &&
    typeof p.Faction === "string" &&
    Array.isArray(p.FactionEffects) &&
    p.FactionEffects.length
  ) {
    state.factionCompletions.push({ faction: p.Faction, at: now });
    if (
      state.factionCompletions.filter((x) => x.faction === p.Faction).length >=
      2
    )
      add("faction-repetition", ["bgs", 0.6, 180000, "INFERRED", 0, 15], 0.45);
  }
  if (name === "Died" || name === "Shutdown" || name === "LoadGame") {
    state.signals = [];
    state.safeAt = null;
    state.safeSourceId = null;
    state.criticalAt = null;
    state.peak = 0;
    state.episode = null;
  }
}
export function evaluate(state: ContextState, now: number): Transition | null {
  state.signals = state.signals
    .filter((s) => now - s.timestamp < s.ttlMs)
    .slice(-96);
  const old = state.activities;
  state.activities = categories.map((category) => {
    const evidence = state.signals
      .filter((s) => s.category === category)
      .map((s) => ({
        ...s,
        ageMs: Math.max(0, now - s.timestamp),
        contribution:
          s.weight *
          s.polarity *
          Math.max(0, 1 - (now - s.timestamp) / s.ttlMs),
      }));
    const score = bounded(evidence.reduce((n, s) => n + s.contribution, 0));
    const confidence = evidence.length
      ? evidence.reduce((n, s) => n + s.confidence * s.contribution, 0) /
        Math.max(
          0.001,
          evidence.reduce((n, s) => n + s.contribution, 0),
        )
      : 0;
    const dominant = evidence
      .slice()
      .sort((a, b) => b.contribution - a.contribution)[0];
    const previous = old.find((a) => a.category === category);
    const active = score >= 0.35;
    if (active !== (previous?.score ?? 0) >= 0.35) {
      state.activityTimeline.push({
        at: now,
        category,
        active,
        confidence,
        evidence: evidence.map((e) => e.id),
      });
      state.activityTimeline = state.activityTimeline.slice(-200);
    }
    const summary = state.summaries[category];
    if (score >= 0.35) {
      state.summaries[category] = {
        firstAt: summary?.firstAt ?? now,
        activeMs:
          (summary?.activeMs ?? 0) +
          Math.min(1000, Math.max(0, now - state.lastTick)),
        peak: Math.max(summary?.peak ?? 0, score),
        confidence: Math.max(summary?.confidence ?? 0, confidence),
      };
    }
    return {
      category,
      score,
      confidence,
      quality: dominant?.provenance ?? "DERIVED",
      status:
        category === "bgs" || category === "mining.surface"
          ? "EXPERIMENTAL"
          : "STABLE",
      lastChangedAt:
        !previous || Math.abs(previous.score - score) > 0.1
          ? now
          : previous.lastChangedAt,
      dominantEvidence: dominant?.id ?? null,
      evidence,
    };
  });
  state.lastTick = now;
  const strength = (s: Signal) =>
    Math.max(0, 1 - (now - s.timestamp) / s.ttlMs);
  const danger = Math.min(
    100,
    state.signals.reduce((n, s) => n + s.danger * strength(s), 0),
  );
  const intensity = Math.max(
    0,
    ...state.signals.map((s) => s.intensity * strength(s)),
  );
  const pace = Math.min(
    100,
    state.signals.filter((s) => now - s.timestamp < 10000).length * 12,
  );
  const novelty =
    state.novelAt === null
      ? 0
      : 100 * Math.max(0, 1 - (now - state.novelAt) / 30000);
  state.dimensions = { danger, intensity, pace, novelty };
  state.peak = Math.max(state.peak, danger);
  let target: Phase =
    intensity >= 35 ? "ACTIVE" : novelty > 0 ? "TRANSITION" : "CALM";
  if (danger >= 75) target = "CRITICAL";
  else if (danger >= 45) target = "TENSION";
  const hazardous = state.phase === "CRITICAL" || state.phase === "TENSION";
  if (hazardous && danger >= 25 && danger < 75) target = state.phase;
  if (
    hazardous &&
    danger < 25 &&
    state.criticalAt !== null &&
    now - state.criticalAt < 120000 &&
    state.peak >= 75 &&
    state.safeAt !== null &&
    now - state.safeAt < 10000
  )
    target = "RECOVERY";
  if (state.phase === "RECOVERY" && now - state.since < 10000 && danger < 45)
    target = "RECOVERY";
  if (target === state.phase) {
    state.pending = null;
    return null;
  }
  if (state.pending?.phase !== target)
    state.pending = { phase: target, since: now };
  const hold =
    target === "CRITICAL"
      ? 2000
      : target === "TENSION"
        ? 3000
        : hazardous
          ? 8000
          : 2000;
  if (now - state.pending.since < hold) return null;
  if (
    target === "RECOVERY" &&
    (state.safeAt === null ||
      state.safeAt <= state.pending.since ||
      now - state.safeAt > 3000)
  )
    return null;
  const evidence = state.signals.map((s) => s.id);
  const transition: Transition = {
    sourceIds: [
      ...new Set([
        ...state.signals.map((s) => s.sourceEventId),
        ...(target === "RECOVERY" && state.safeSourceId
          ? [state.safeSourceId]
          : []),
      ]),
    ],
    id: digest([state.phase, target, now, evidence]),
    at: now,
    from: state.phase,
    to: target,
    reason: `danger=${danger.toFixed(1)} intensity=${intensity.toFixed(1)}; held ${hold}ms`,
    danger,
    evidence,
    durationMs: now - state.since,
    peakDanger: state.peak,
  };
  if (target === "CRITICAL") {
    state.criticalAt = now;
    state.episode ??= transition.id;
  }
  if (target === "CALM") {
    state.peak = 0;
    state.criticalAt = null;
    state.episode = null;
  }
  state.phase = target;
  state.since = now;
  state.pending = null;
  state.timeline.push(transition);
  state.timeline = state.timeline.slice(-200);
  return transition;
}

export interface Fingerprint {
  hash: string;
  slots: Record<string, string>;
}
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const norm = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() || null : null;
export function fingerprint(
  payload: Record<string, unknown>,
): Fingerprint | null {
  if (
    !Array.isArray(payload.Modules) ||
    !payload.Modules.length ||
    payload.Modules.length > 128
  )
    return null;
  const pairs: [string, string][] = [];
  for (const raw of payload.Modules) {
    const m = record(raw),
      e = record(m.Engineering),
      slot = norm(m.Slot),
      item = norm(m.Item);
    if (!slot || !item) return null;
    pairs.push([
      slot,
      JSON.stringify([
        item,
        norm(e.BlueprintName),
        typeof e.Level === "number" ? e.Level : null,
        norm(e.ExperimentalEffect),
      ]),
    ]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (new Set(pairs.map((x) => x[0])).size !== pairs.length) return null;
  return {
    hash: digest(["loadout-v1", pairs]),
    slots: Object.fromEntries(pairs),
  };
}
export function changedSlots(
  previous: Fingerprint | undefined,
  next: Fingerprint,
) {
  return [
    ...new Set([
      ...Object.keys(previous?.slots ?? {}),
      ...Object.keys(next.slots),
    ]),
  ]
    .sort()
    .filter((s) => previous?.slots[s] !== next.slots[s])
    .map((slot) => ({
      slot,
      before: previous?.slots[slot] ?? null,
      after: next.slots[slot] ?? null,
    }));
}
