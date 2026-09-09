import { z } from "zod";
import type {
  SourceEvent,
  DomainEvent,
} from "../../../packages/contracts/src/index.js";
import {
  defaultPolicy,
  type Candidate,
  type ShipModule,
  type PresentationDefinition,
  type WorldState,
} from "../../../packages/module-sdk/src/index.js";
import type { Store } from "./store.js";
import type { Phase, Transition } from "./context.js";

export const editorialDefaults = {
  version: 1,
  returnAfterMs: 7 * 86400000,
  globalGapMs: 90000,
  progressGapMs: 240000,
  progressCount: 3,
  travelCount: 5,
};
export interface MemoryFact {
  kind: string;
  name: string;
  commander: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
  sessions: number;
  lastSession: string;
  sourceId: string;
  peak?: number;
}
interface ActivityCount {
  count: number;
  firstAt: number;
  lastAt: number;
  lastCueCount: number;
  lastCueAt: number;
  lastSource: string;
  pendingFirst: boolean;
  previousLastSeen?: number;
}
interface SessionMemory {
  shownSurveyKinds?: string[];
  anchor: string;
  commander: string;
  closed: boolean;
  system: string | null;
  ship: string | null;
  counts: Record<string, ActivityCount>;
  lastOffered: number | null;
  recentSources: string[];
}
export interface EditorialNote {
  id: string;
  eventId?: string;
  at: number;
  family: string;
  reason: string;
  commander: string;
  sourceIds: string[];
  lines: string[];
  eligible: boolean;
  facts: Record<string, unknown>;
  chosenLines?: string[];
}
const clean = (v: unknown) =>
  typeof v === "string" ? v.trim().slice(0, 120) : "";
const day = (n: number) => Math.floor(n / 86400000);
const surveyLabels: Record<string, string> = {
  "star.black_hole": "BLACK HOLE",
  "star.neutron": "NEUTRON STAR",
  "planet.earth_like": "EARTH-LIKE WORLD",
  "planet.ammonia_world": "AMMONIA WORLD",
  "planet.terraformable": "TERRAFORMABLE",
  "planet.high_gravity": "HIGH GRAVITY",
  "planet.many_biological_signals": "RICH BIOLOGICAL SIGNALS",
};
const rules: Record<
  string,
  { family: string; label: string; minimum: number }
> = {
  Bounty: { family: "combat", label: "COMBAT REWARDS", minimum: 2 },
  FactionKillBond: { family: "combat", label: "COMBAT REWARDS", minimum: 2 },
  FSDJump: { family: "travel", label: "HYPERSPACE JUMPS", minimum: 5 },
  MiningRefined: { family: "mining", label: "REFINING EVENTS", minimum: 1 },
  EngineerCraft: {
    family: "engineering",
    label: "ENGINEERING OPERATIONS",
    minimum: 1,
  },
  ModuleBuy: {
    family: "outfitting",
    label: "OUTFITTING OPERATIONS",
    minimum: 1,
  },
  ModuleSwap: {
    family: "outfitting",
    label: "OUTFITTING OPERATIONS",
    minimum: 1,
  },
  MarketSell: { family: "trading", label: "MARKET TRANSACTIONS", minimum: 1 },
  MarketBuy: { family: "trading", label: "MARKET TRANSACTIONS", minimum: 1 },
  MissionCompleted: {
    family: "missioning",
    label: "MISSIONS COMPLETED",
    minimum: 1,
  },
  PowerplayCollect: {
    family: "powerplay",
    label: "POWERPLAY TRANSFERS",
    minimum: 1,
  },
  PowerplayDeliver: {
    family: "powerplay",
    label: "POWERPLAY TRANSFERS",
    minimum: 1,
  },
  ScanOrganic: { family: "exobiology", label: "ORGANIC ANALYSES", minimum: 1 },
  Scan: { family: "exploration", label: "SCAN EVENTS", minimum: 5 },
  LaunchSRV: { family: "srv", label: "SRV DEPLOYMENTS", minimum: 1 },
  Disembark: { family: "onFoot", label: "DISEMBARKATIONS", minimum: 1 },
};
const labels: Record<string, string> = {
  combat: "COMBAT",
  travel: "TRANSIT",
  mining: "REFINING",
  engineering: "ENGINEERING",
  outfitting: "OUTFITTING",
  trading: "TRADE",
  missioning: "MISSIONS",
  powerplay: "POWERPLAY",
  exobiology: "BIOLOGICAL ANALYSIS",
  exploration: "SURVEY",
  srv: "SURFACE OPERATIONS",
  onFoot: "ON-FOOT OPERATIONS",
};
export class Editorial {
  constructor(readonly store: Store) {}
  broadcast(event: DomainEvent, transition: Transition, commander: string) {
    if (commander === "unknown") return;
    const recovery = transition.to === "RECOVERY";
    const lines = recovery
      ? [
          "RECOVERY STATE CONFIRMED",
          `${Math.round(transition.durationMs / 1000)} SECONDS IN ${transition.from}`,
          "FRESH SAFE TELEMETRY RECEIVED",
        ]
      : transition.to === "CRITICAL"
        ? ["PRIORITY OVERRIDE ENGAGED", "CRITICAL TELEMETRY CONFIRMED"]
        : ["THREAT PROFILE RISING"];
    const note: EditorialNote = {
      id: event.id,
      eventId: event.id,
      at: transition.at,
      family: recovery ? "recovery" : "danger",
      reason: transition.reason,
      commander,
      sourceIds: transition.sourceIds,
      lines,
      eligible: true,
      facts: {
        previousPhase: transition.from,
        durationMs: transition.durationMs,
        evidence: transition.evidence,
      },
    };
    this.store.put("editorial_notes", note.id, note);
  }
  private state(commander: string, source: SourceEvent): SessionMemory {
    const old = this.store.get<SessionMemory>(
      "editorial_state",
      "session:" + commander,
    );
    if (old && !old.closed && source.payload.event !== "LoadGame") return old;
    return {
      anchor: source.id,
      commander,
      closed: false,
      system: old?.system ?? null,
      ship: old?.ship ?? null,
      counts: {},
      lastOffered: null,
      recentSources: [],
    };
  }
  private touch(
    kind: string,
    key: string,
    name: string,
    s: SessionMemory,
    source: SourceEvent,
    now: number,
  ) {
    const id = JSON.stringify([kind, s.commander, key]),
      old = this.store.get<MemoryFact>("editorial_memory", id);
    const fact: MemoryFact = {
      kind,
      name,
      commander: s.commander,
      firstSeen: Math.min(old?.firstSeen ?? now, now),
      lastSeen: Math.max(old?.lastSeen ?? now, now),
      count: (old?.count ?? 0) + 1,
      sessions: (old?.sessions ?? 0) + (old?.lastSession === s.anchor ? 0 : 1),
      lastSession: s.anchor,
      sourceId: source.id,
    };
    this.store.put("editorial_memory", id, { ...old, ...fact });
    return { old, id, fact };
  }
  observe(
    source: SourceEvent,
    world: Pick<WorldState, "commander">,
    events: DomainEvent[],
    phase: Phase,
    now: number,
    historical = false,
  ): { candidate?: Candidate; note?: EditorialNote } {
    const sourceAt = Date.parse(source.sourceTimestamp ?? source.observedAt);
    if (Number.isFinite(sourceAt)) now = Math.min(now, sourceAt);
    const p = source.payload,
      name = String(p.event ?? "");
    const commander = clean(
      p.event === "LoadGame" ? p.Commander : world.commander,
    );
    if (!commander || commander === "unknown") return {};
    if (source.mode === "bootstrap" && !historical) return {};
    if (
      !Object.hasOwn(rules, name) &&
      !["LoadGame", "Shutdown", "Loadout", "Location"].includes(name) &&
      !events.length
    )
      return {};
    if (name === "ScanOrganic" && p.ScanType !== "Analyse") return {};
    const s = this.state(commander, source);
    s.recentSources = [...s.recentSources, source.id].slice(-8);
    let family = "",
      reason = "",
      lines: string[] = [],
      facts: Record<string, unknown> = {},
      eligible = false;
    const offer = (
      f: string,
      r: string,
      l: string[],
      details: Record<string, unknown> = {},
    ) => {
      family = f;
      reason = r;
      lines = l;
      facts = details;
      eligible = true;
    };
    let historyReturn: number | undefined;
    if (
      (name === "FSDJump" || name === "Location") &&
      Number.isSafeInteger(p.SystemAddress) &&
      clean(p.StarSystem)
    ) {
      const key = String(p.SystemAddress);
      if (s.system !== key) {
        if (s.system) {
          const previousKey = JSON.stringify(["system", commander, s.system]);
          const previous = this.store.get<MemoryFact>(
            "editorial_memory",
            previousKey,
          );
          if (previous)
            this.store.put("editorial_memory", previousKey, {
              ...previous,
              lastSeen: Math.max(now, previous.lastSeen),
            });
        }
        const { old } = this.touch(
          "system",
          key,
          clean(p.StarSystem),
          s,
          source,
          now,
        );
        s.system = key;
        if (old && now - old.lastSeen >= editorialDefaults.returnAfterMs) {
          historyReturn = day(now - old.lastSeen);
          offer(
            "system-return",
            "return_after_absence",
            [
              "KNOWN SYSTEM REACQUIRED",
              clean(p.StarSystem),
              `LAST OBSERVED ${historyReturn} DAYS AGO`,
            ],
            {
              daysAbsent: historyReturn,
              previousLastSeen: old.lastSeen,
              visits: old.count + 1,
            },
          );
        }
      }
    }
    if (name === "Loadout" && Number.isSafeInteger(p.ShipID) && clean(p.Ship)) {
      const key = String(p.ShipID),
        previous = s.ship
          ? this.store.get<MemoryFact>(
              "editorial_memory",
              JSON.stringify(["ship", commander, s.ship]),
            )
          : undefined;
      const { old, fact } = this.touch(
        "ship",
        key,
        clean(p.ShipName) || clean(p.Ship),
        s,
        source,
        now,
      );
      const changed = s.ship !== null && s.ship !== key;
      const novel = events.some(
        (e) => e.type === "shipos.context.loadout.novel",
      );
      if (changed && old)
        offer(
          "ship-return",
          "known_ship_reactivated",
          [
            "KNOWN VESSEL REACTIVATED",
            fact.name,
            now - old.lastSeen >= editorialDefaults.returnAfterMs
              ? `LAST OBSERVED ${day(now - old.lastSeen)} DAYS AGO`
              : previous
                ? `AFTER ${previous.name} / ${previous.sessions} OBSERVED SESSIONS`
                : "PREVIOUSLY OBSERVED BY SHIPOS",
          ],
          {
            daysAbsent: day(Math.max(0, now - old.lastSeen)),
            previousShipSessions: previous?.sessions ?? 0,
            previousShip: previous?.name,
          },
        );
      else if (changed && !old && !novel)
        offer(
          "ship-change",
          "first_ship_observation",
          [
            "NEW VESSEL IN SHIPOS MEMORY",
            fact.name,
            previous
              ? `AFTER ${previous.name} / ${previous.sessions} OBSERVED SESSIONS`
              : "TELEMETRY PROFILE ACQUIRED",
          ],
          { previousShipSessions: previous?.sessions ?? 0 },
        );
      else if (novel) {
        const e = events.find(
          (e) => e.type === "shipos.context.loadout.novel",
        )!;
        const slots = Array.isArray(e.payload.changedSlots)
          ? e.payload.changedSlots.length
          : 0;
        offer(
          "build",
          old ? "configuration_changed" : "first_configuration_observation",
          [
            old
              ? "CONFIGURATION SIGNATURE UPDATED"
              : "CONFIGURATION SIGNATURE UNKNOWN",
            fact.name,
            old
              ? `${slots} CHANGED MODULE SLOTS`
              : "TELEMETRY PROFILE ACQUIRED",
          ],
          {
            changedSlots: slots,
            previousShipSessions: previous?.sessions ?? 0,
          },
        );
      }
      s.ship = key;
    }
    const rule = Object.hasOwn(rules, name) ? rules[name] : undefined;
    if (rule) {
      const { old } = this.touch(
        "activity",
        rule.family,
        labels[rule.family]!,
        s,
        source,
        now,
      );
      const c = s.counts[rule.family] ?? {
        count: 0,
        firstAt: now,
        lastAt: now,
        lastCueCount: 0,
        lastCueAt: now,
        lastSource: source.id,
        pendingFirst: true,
        previousLastSeen: old?.lastSeen,
      };
      c.count++;
      c.lastAt = now;
      c.lastSource = source.id;
      s.counts[rule.family] = c;
      if (!family) {
        family = rule.family;
        reason = "accumulating_evidence";
        facts = { count: c.count, label: rule.label };
        const first = c.pendingFirst && c.count >= rule.minimum;
        const progress =
          !c.pendingFirst &&
          c.count - c.lastCueCount >= editorialDefaults.progressCount &&
          now - c.lastCueAt >= editorialDefaults.progressGapMs;
        if (first || progress) {
          const returned =
            first &&
            c.previousLastSeen !== undefined &&
            c.firstAt - c.previousLastSeen >= editorialDefaults.returnAfterMs;
          offer(
            rule.family,
            returned
              ? "activity_return"
              : first
                ? "first_session_occurrence"
                : "activity_progress",
            [
              returned
                ? `${labels[rule.family]} RESUMED`
                : first
                  ? `${labels[rule.family]} / SESSION OPENED`
                  : `${labels[rule.family]} / PROGRESS`,
              `${c.count} ${rule.label} THIS SESSION`,
              returned
                ? `LAST OBSERVED ${day(c.firstAt - c.previousLastSeen!)} DAYS AGO`
                : "CONFIRMED BY TELEMETRY",
            ],
            {
              count: c.count,
              label: rule.label,
              elapsedMs: now - c.firstAt,
              daysAbsent: returned
                ? day(c.firstAt - c.previousLastSeen!)
                : null,
            },
          );
        }
      }
      if (name === "ScanOrganic") {
        const species = clean(p.Species_Localised) || clean(p.Species);
        if (species) {
          const { old: seen } = this.touch(
            "species",
            clean(p.Species) || species,
            species,
            s,
            source,
            now,
          );
          facts = {
            ...facts,
            species,
            speciesObservations: (seen?.count ?? 0) + 1,
          };
          if (eligible) lines[2] = species;
        }
      }
      if (name === "LaunchSRV" && clean(p.SRVType))
        this.touch(
          "vehicle",
          clean(p.SRVType),
          clean(p.SRVType),
          s,
          source,
          now,
        );
    }
    const discovery = events.find(
      (e) =>
        e.type === "elite.exploration.remarkableBody" ||
        e.type === "elite.exobiology.highValueDiscovery",
    );
    if (discovery) {
      const kind = discovery.type.includes("exobiology")
        ? "valuable-biology"
        : "remarkable";
      const surveyKinds = Array.isArray(discovery.payload.reasons)
        ? discovery.payload.reasons.filter(
            (r): r is string =>
              typeof r === "string" && Object.hasOwn(surveyLabels, r),
          )
        : [];
      const newSurveyKind =
        kind === "remarkable" &&
        surveyKinds.some((k) => !s.shownSurveyKinds?.includes(k));
      const c = s.counts[kind] ?? {
        count: 0,
        firstAt: now,
        lastAt: now,
        lastCueCount: 0,
        lastCueAt: now,
        lastSource: source.id,
        pendingFirst: true,
      };
      c.count++;
      c.lastAt = now;
      c.lastSource = source.id;
      s.counts[kind] = c;
      const record = this.store.get<MemoryFact>(
        "editorial_memory",
        JSON.stringify(["notable", commander, kind]),
      );
      const value = Number(discovery.payload.estimatedBaseValueCredits);
      const isRecord =
        Number.isFinite(value) &&
        value > 0 &&
        !!record &&
        value > (record.peak ?? 0);
      const { id, fact } = this.touch("notable", kind, kind, s, source, now);
      if (Number.isFinite(value) && value > 0)
        this.store.put("editorial_memory", id, {
          ...fact,
          peak: Math.max(value, record?.peak ?? 0),
        });
      const first = c.count === 1;
      const progress =
        now - c.lastCueAt >= editorialDefaults.progressGapMs &&
        c.count - c.lastCueCount >= editorialDefaults.progressCount;
      offer(
        kind,
        isRecord
          ? "personal_observed_record"
          : first
            ? "first_session_discovery"
            : newSurveyKind
              ? "new_discovery_kind"
              : progress || c.pendingFirst
                ? "discovery_series"
                : "discovery_grouped",
        [
          isRecord
            ? "NEW OBSERVED ANALYSIS RECORD"
            : first
              ? kind === "remarkable"
                ? "FIRST REMARKABLE BODY THIS SESSION"
                : "FIRST VALUABLE ANALYSIS THIS SESSION"
              : newSurveyKind
                ? "NEW SURVEY SIGNATURE THIS SESSION"
                : `${c.count} ${kind === "remarkable" ? "NOTABLE SURVEY EVENTS" : "VALUABLE ANALYSES"} THIS SESSION`,
          clean(discovery.payload.name) || "DISCOVERY CONFIRMED",
          kind === "valuable-biology" && Number.isFinite(value)
            ? `${value.toLocaleString("en-US")} CR / ESTIMATED BASE`
            : surveyKinds
                .slice(0, 2)
                .map((k) => surveyLabels[k])
                .join(" / ") || "SURVEY RECORD UPDATED",
        ],
        {
          count: c.count,
          record: isRecord,
          previousPeak: record?.peak ?? null,
          estimatedValue: Number.isFinite(value) ? value : null,
          surveyKinds,
        },
      );
      eligible = c.pendingFirst || progress || isRecord || newSurveyKind;
    }
    if (name === "Shutdown") s.closed = true;
    if (family) {
      if (eligible && ["TENSION", "CRITICAL"].includes(phase)) {
        eligible = false;
        reason = "danger_has_priority";
      }
      // Configuration changes retain their existing module cooldown; routine narration shares a pace.
      if (
        eligible &&
        family !== "build" &&
        s.lastOffered !== null &&
        now - s.lastOffered < editorialDefaults.globalGapMs
      ) {
        eligible = false;
        reason = "editorial_spacing";
      }
      if (eligible && !historical) {
        if (family === "remarkable" && Array.isArray(facts.surveyKinds))
          s.shownSurveyKinds = [
            ...new Set([
              ...(s.shownSurveyKinds ?? []),
              ...(facts.surveyKinds as string[]),
            ]),
          ];
        if (family !== "build") s.lastOffered = now;
        const c = s.counts[family];
        if (c) {
          c.pendingFirst = false;
          c.lastCueAt = now;
          c.lastCueCount = c.count;
        }
      }
    }
    this.store.put("editorial_state", "session:" + commander, s);
    if (historical || !family) return {};
    const target =
      discovery ??
      events.find((e) => e.type === "shipos.context.loadout.novel");
    const note: EditorialNote = {
      id: target?.id ?? "source:" + source.id,
      eventId: target?.id,
      at: now,
      family,
      reason,
      commander,
      sourceIds: target?.sourceEventIds ?? [source.id],
      lines,
      eligible,
      facts,
    };
    this.store.put("editorial_notes", note.id, note);
    if (target || !eligible) return { note };
    return {
      note,
      candidate: {
        type: "shipos.editorial.moment",
        semanticKey: `editorial:${family}:${source.id}`,
        payload: { editorialNoteId: note.id },
        quality: "derived",
      },
    };
  }
  backfill() {
    const progress = this.store.get<{
      row: number;
      commander: string;
      complete: boolean;
    }>("editorial_state", "backfill");
    if (progress?.complete) return;
    let row = progress?.row ?? 0,
      commander = progress?.commander ?? "unknown";
    for (;;) {
      const batch = this.store.db
        .prepare(
          "SELECT rowid AS n,data FROM source_events WHERE rowid>? AND processing_state='done' ORDER BY rowid LIMIT 500",
        )
        .all(row) as { n: number; data: string }[];
      if (!batch.length) break;
      this.store.db.transaction(() => {
        for (const r of batch) {
          const source = JSON.parse(r.data) as SourceEvent;
          if (source.payload.event === "LoadGame")
            commander = clean(source.payload.Commander) || "unknown";
          const at = Date.parse(source.sourceTimestamp ?? source.observedAt);
          if (source.mode === "live" && Number.isFinite(at))
            this.observe(source, { commander }, [], "CALM", at, true);
          row = r.n;
        }
        this.store.put("editorial_state", "backfill", {
          row,
          commander,
          complete: false,
        });
      })();
    }
    this.store.db.transaction(() => {
      // Historical records establish the comparison baseline, never replay alerts.
      const records = this.store.db
        .prepare(
          "SELECT data FROM domain_events WHERE json_extract(data,'$.type')='elite.exobiology.highValueDiscovery'",
        )
        .all() as { data: string }[];
      for (const r of records) {
        const e = JSON.parse(r.data) as DomainEvent;
        const origin = this.store.db
          .prepare("SELECT data FROM source_events WHERE id=?")
          .get(e.sourceEventIds[0]) as { data: string } | undefined;
        if (!origin) continue;
        const prior = this.store.db
          .prepare(
            "SELECT data FROM source_events WHERE rowid <= (SELECT rowid FROM source_events WHERE id=?) AND json_extract(data,'$.payload.event')='LoadGame' ORDER BY rowid DESC LIMIT 1",
          )
          .get(e.sourceEventIds[0]) as { data: string } | undefined;
        const owner = prior
          ? clean((JSON.parse(prior.data) as SourceEvent).payload.Commander)
          : "";
        const value = Number(e.payload.estimatedBaseValueCredits);
        if (!owner || !Number.isFinite(value) || value <= 0) continue;
        const id = JSON.stringify(["notable", owner, "valuable-biology"]),
          old = this.store.get<MemoryFact>("editorial_memory", id),
          at = Date.parse(e.occurredAt),
          session = e.sessionId ?? "historical";
        this.store.put("editorial_memory", id, {
          kind: "notable",
          name: "valuable-biology",
          commander: owner,
          firstSeen: Math.min(old?.firstSeen ?? at, at),
          lastSeen: Math.max(old?.lastSeen ?? at, at),
          count: (old?.count ?? 0) + 1,
          sessions: (old?.sessions ?? 0) + (old?.lastSession === session ? 0 : 1),
          lastSession: session,
          sourceId: e.sourceEventIds[0],
          peak: Math.max(value, old?.peak ?? 0),
        });
      }
      for (const state of this.store.all<SessionMemory>("editorial_state"))
        if (state.anchor)
          this.store.put("editorial_state", "session:" + state.commander, {
            ...state,
            closed: true,
          });
      this.store.put("editorial_state", "backfill", {
        row,
        commander,
        complete: true,
      });
    })();
  }
  snapshot() {
    return {
      defaults: editorialDefaults,
      backfill: this.store.get("editorial_state", "backfill"),
      notes: (
        this.store.db
          .prepare(
            "SELECT data FROM editorial_notes ORDER BY rowid DESC LIMIT 30",
          )
          .all() as { data: string }[]
      ).map((r) => {
        const note = JSON.parse(r.data) as EditorialNote;
        return {
          ...note,
          decision: note.eventId
            ? this.store.get("director_decisions", note.eventId)
            : null,
        };
      }),
      memory: (
        this.store.db
          .prepare(
            "SELECT data FROM editorial_memory ORDER BY rowid DESC LIMIT 30",
          )
          .all() as { data: string }[]
      ).map((r) => JSON.parse(r.data) as MemoryFact),
    };
  }
}

export const editorialModule: ShipModule = {
  manifest: {
    id: "editorial",
    version: "1.0.0",
    name: "Editorial moments",
    eventType: "shipos.editorial.moment",
  },
  configSchema: z.strictObject({}),
  policy: {
    ...defaultPolicy,
    importance: 40,
    urgency: 15,
    attentionCost: 1,
    cooldownMs: 10000,
  },
  detect: () => [],
  present: () => ({
    title: "TELEMETRY UPDATE",
    subtitle: "",
    accent: "#bacdaa",
    durationMs: 4500,
    slot: "primary",
    layers: ["EventLayer"],
    audioAsset: "audio.alert.context-novel",
    terminal: {
      primitive: "ConsoleStrip",
      severity: "notice",
      label: "SHIPOS / MEMORY",
      lines: ["TELEMETRY UPDATE"],
      timingMs: 450,
      emphasis: 0,
    },
  }),
};
export function editorialPresentation(
  store: Store,
  event: DomainEvent,
  definition: PresentationDefinition,
): PresentationDefinition {
  const id =
    typeof event.payload.editorialNoteId === "string"
      ? event.payload.editorialNoteId
      : event.id;
  const note = store.get<EditorialNote>("editorial_notes", id);
  if (!note?.eligible || !note.lines.length) return definition;
  const key = JSON.stringify(["wording", note.commander, note.family]);
  const previous = store.get<{ line: string }>("editorial_state", key)?.line;
  const alternatives = [
    note.lines[0]!,
    note.lines[0]!.replace("THIS SESSION", "/ SESSION LOG")
      .replace("SESSION OPENED", "ACTIVITY CONFIRMED")
      .replace("PROGRESS", "SEQUENCE CONTINUES")
      .replace("REACQUIRED", "REVISITED")
      .replace("REACTIVATED", "BACK ONLINE"),
  ];
  const first =
    alternatives.find((line) => line !== previous) ?? alternatives[0]!;
  const lines = [first, ...note.lines.slice(1)];
  store.put("editorial_state", key, { line: first });
  store.put("editorial_notes", id, { ...note, chosenLines: lines });
  return {
    ...definition,
    title: first,
    subtitle: lines.slice(1).join(" · "),
    terminal: {
      primitive: "ConsoleStrip",
      severity: "notice",
      label: "SHIPOS / " + note.family.toUpperCase(),
      timingMs: 450,
      emphasis: 0,
      ...definition.terminal,
      lines,
    },
  };
}
