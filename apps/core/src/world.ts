import { z } from "zod";
import type { WorldState } from "../../../packages/module-sdk/src/index.js";
import type { SourceEvent } from "../../../packages/contracts/src/index.js";
export const STANDARD_GRAVITY = 9.80665;
export function initialWorld(): WorldState {
  return {
    commander: "unknown",
    ship: {},
    vehicleContext: "unknown",
    contextAt: null,
    currentSystem: {},
    currentBody: null,
    location: {},
    hull: "unknown",
    hullEpisode: false,
    shields: "unknown",
    fuel: { low: "unknown", main: "unknown", reservoir: "unknown" },
    flags: "unknown",
    flags2: "unknown",
    session: null,
    expedition: null,
    lastJump: null,
    lastDock: null,
    biologicalContext: {},
    bodies: {},
    navRoute: null,
  };
}
const statusSchema = z.object({
  Flags: z.number().int().nonnegative(),
  Flags2: z.number().int().nonnegative().optional(),
  Fuel: z
    .object({
      FuelMain: z.number().nonnegative().optional(),
      FuelReservoir: z.number().nonnegative().optional(),
    })
    .optional(),
});
export function reduce(previous: WorldState, source: SourceEvent): WorldState {
  const next = structuredClone(previous),
    p = source.payload;
  const timestamp = source.sourceTimestamp ?? source.observedAt;
  if (source.source === "elite.status") {
    const result = statusSchema.safeParse(p);
    if (!result.success) return next;
    const s = result.data;
    next.flags = s.Flags;
    next.flags2 = s.Flags2 ?? "unknown";
    next.fuel = {
      low: (s.Flags & 524288) !== 0,
      main: s.Fuel?.FuelMain ?? "unknown",
      reservoir: s.Fuel?.FuelReservoir ?? "unknown",
    };
    next.shields = (s.Flags & 8) !== 0;
    const f2 = s.Flags2 ?? 0;
    next.vehicleContext =
      f2 & 2
        ? "taxi"
        : f2 & 4
          ? "multicrew"
          : f2 & 1
            ? "onFoot"
            : s.Flags & 67108864
              ? "srv"
              : s.Flags & 33554432
                ? "fighter"
                : s.Flags & 16777216
                  ? "mainShip"
                  : "unknown";
    next.contextAt = timestamp;
    if (next.shipTelemetry) {
      next.shipTelemetry.statusAt = timestamp;
      next.shipTelemetry.cargo =
        typeof p.Cargo === "number" && Number.isFinite(p.Cargo) && p.Cargo >= 0
          ? p.Cargo
          : null;
    }
  }
  if (p.event === "LoadGame") {
    next.shipTelemetry = {
      session: source.id,
      agentId: source.agentId,
      loadoutAt: null,
      statusAt: null,
      cargo: null,
    };
    if (typeof p.Commander === "string") next.commander = p.Commander;
    next.ship = { Ship: p.Ship, ShipID: p.ShipID };
    next.vehicleContext = "unknown";
    next.hullEpisode = false;
  }
  if (p.event === "Loadout") {
    if (p.ShipID !== next.ship.ShipID) next.hullEpisode = false;
    next.ship = { ...p };
    if (next.shipTelemetry) {
      next.shipTelemetry.loadoutAt = timestamp;
      if (p.ShipID !== previous.ship.ShipID) {
        next.shipTelemetry.statusAt = null;
        next.shipTelemetry.cargo = null;
      }
    }
    if (typeof p.HullHealth === "number") {
      next.hull = p.HullHealth;
      if (p.HullHealth > 0.2) next.hullEpisode = false;
    }
  }
  if (
    [
      "ShipyardSwap",
      "ShipyardBuy",
      "ShipyardNew",
      "ModuleBuy",
      "ModuleRetrieve",
      "ModuleSell",
      "ModuleStore",
      "ModuleSwap",
      "MassModuleStore",
      "EngineerCraft",
    ].includes(String(p.event)) ||
    (p.event === "EngineerLegacyConvert" && p.IsPreview !== true)
  ) {
    if (next.shipTelemetry) {
      next.shipTelemetry.loadoutAt = null;
      if (String(p.event).startsWith("Shipyard")) {
        next.shipTelemetry.statusAt = null;
        next.shipTelemetry.cargo = null;
      }
    }
  }
  if (p.event === "Disembark") {
    next.vehicleContext = "onFoot";
    next.contextAt = timestamp;
  }
  if (p.event === "Embark") {
    next.vehicleContext =
      p.Taxi === true
        ? "taxi"
        : p.Multicrew === true
          ? "multicrew"
          : p.SRV === true
            ? "srv"
            : p.OnStation === true
              ? "unknown"
              : "unknown";
    next.contextAt = timestamp;
  }
  if (p.event === "Location" || p.event === "FSDJump") {
    next.currentSystem = { name: p.StarSystem, address: p.SystemAddress };
    next.location = { ...p };
    next.currentBody =
      typeof p.SystemAddress === "number" && typeof p.BodyID === "number"
        ? `${p.SystemAddress}:${p.BodyID}`
        : null;
    if (p.event === "FSDJump") next.lastJump = { ...p };
  }
  if (p.event === "Docked") next.lastDock = { ...p };
  if (
    p.event === "HullDamage" &&
    p.PlayerPilot === true &&
    p.Fighter === false &&
    typeof p.Health === "number" &&
    p.Health >= 0 &&
    p.Health <= 1
  ) {
    next.hull = p.Health;
    if (p.Health > 0.2) next.hullEpisode = false;
    else next.hullEpisode = true;
  }
  if (p.event === "RepairAll") {
    next.hull = 1;
    next.hullEpisode = false;
  }
  if (p.event === "Died" || p.event === "Resurrect" || p.event === "Shutdown") {
    if (next.shipTelemetry) {
      if (p.event === "Shutdown") next.shipTelemetry.session = null;
      next.shipTelemetry.loadoutAt = null;
      next.shipTelemetry.statusAt = null;
    }
    next.vehicleContext = "unknown";
    next.contextAt = null;
    next.hullEpisode = false;
  }
  if (p.event === "ScanOrganic") next.biologicalContext = { ...p };
  if (
    (p.event === "Scan" || p.event === "SAASignalsFound") &&
    typeof p.SystemAddress === "number" &&
    Number.isSafeInteger(p.SystemAddress) &&
    typeof p.BodyID === "number"
  ) {
    const key = `${p.SystemAddress}:${p.BodyID}`;
    const b = next.bodies[key] ?? {
      systemAddress: p.SystemAddress,
      bodyId: p.BodyID,
      name: "unknown",
      wasFootfalled: "unknown",
      scan: {},
      biologicalSignals: "unknown",
      sourceIds: [],
    };
    if (typeof p.BodyName === "string") b.name = p.BodyName;
    if (p.event === "Scan") {
      b.scan = { ...b.scan, ...p };
      if (typeof p.WasFootfalled === "boolean")
        b.wasFootfalled = p.WasFootfalled;
    }
    if (Array.isArray(p.Signals)) {
      for (const s of p.Signals) {
        const r = z
          .object({
            Type: z.literal("$SAA_SignalType_Biological;"),
            Count: z.number().int().nonnegative(),
          })
          .safeParse(s);
        if (r.success) b.biologicalSignals = r.data.Count;
      }
    }
    b.sourceIds = [...new Set([...b.sourceIds, source.id])];
    next.bodies[key] = b;
  }
  if (p.event === "NavRouteClear") next.navRoute = [];
  else if (source.source === "elite.navroute" && Array.isArray(p.Route))
    next.navRoute = structuredClone(p.Route);
  return next;
}

/** Persist only relevant before/after changes, not the whole accumulated galaxy per source. */
export function stateDelta(previous: WorldState, next: WorldState) {
  const before: Record<string, unknown> = {},
    after: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof WorldState)[]) {
    if (key === "bodies") {
      const a: Record<string, unknown> = {},
        b: Record<string, unknown> = {};
      for (const id of Object.keys(next.bodies)) {
        if (
          JSON.stringify(previous.bodies[id]) !==
          JSON.stringify(next.bodies[id])
        ) {
          a[id] = previous.bodies[id] ?? "unknown";
          b[id] = next.bodies[id];
        }
      }
      if (Object.keys(b).length) {
        before.bodies = a;
        after.bodies = b;
      }
    } else if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      before[key] = previous[key];
      after[key] = next[key];
    }
  }
  return { previous: before, next: after };
}
