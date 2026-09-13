import { z } from "zod";
import type {
  DomainEvent,
  SourceEvent,
} from "../../../packages/contracts/src/index.js";
import {
  defaultPolicy,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";
import type { RunContext } from "./runtime.js";
import { eventFactory } from "./runtime.js";
import { loadoutConfig, loadoutView, loadoutLines } from "./loadout-card.js";
export type VesselCommand = "ship" | "loadout";

export const shipConfig = z.strictObject({
  durationMs: z.number().int().min(3000).max(10000).default(6000),
  freshnessTTL: z.number().int().min(10000).max(60000).default(45000),
});
export const shipRequest = z.strictObject({
  requestId: z.string().min(1).max(200),
  timestamp: z.iso.datetime(),
  platform: z.enum(["twitch", "simulation"]),
});
export const shipModule: ShipModule = {
  manifest: {
    id: "chat-ship",
    name: "Chat !ship",
    version: "1.0.0",
    eventType: "shipos.command.ship",
  },
  configSchema: shipConfig,
  policy: {
    ...defaultPolicy,
    importance: 15,
    urgency: 5,
    attentionCost: 2,
    cooldownMs: 20000,
    ttlMs: 5000,
  },
  detect: () => [],
  present: (e) => ({
    title: String(e.payload.title ?? "SHIP // SIMULATION"),
    subtitle: "CURRENT VESSEL",
    durationMs: Number(e.payload.durationMs ?? 6000),
    accent: "#bacdaa",
    slot: "primary",
    layers: ["EventLayer"],
    audioAsset: "",
    terminal: {
      primitive: "ConsoleStrip",
      severity: "notice",
      label: "SHIPOS / VESSEL",
      lines: Array.isArray(e.payload.lines)
        ? (e.payload.lines as string[])
        : ["SHIP // SIMULATION", "PREVIEW / NO LIVE DATA"],
      maxLines: 8,
      timingMs: 120,
      emphasis: 0,
    },
  }),
};
const text = (v: unknown) =>
  typeof v === "string" ? v.trim().slice(0, 80) : "";
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const models: Record<string, string> = {
  cutter: "IMPERIAL CUTTER",
  empire_trader: "IMPERIAL CLIPPER",
  asp: "ASP EXPLORER",
  asp_scout: "ASP SCOUT",
  anaconda: "ANACONDA",
  krait_light: "KRAIT PHANTOM",
  krait_mkii: "KRAIT MK II",
  diamondbackxl: "DIAMONDBACK EXPLORER",
  python: "PYTHON",
  cobramkiii: "COBRA MK III",
  sidewinder: "SIDEWINDER",
  type9: "TYPE-9 HEAVY",
};
export class ShipCommands {
  link: () => {
    connected: boolean;
    lastHeartbeat: number;
    agentId: string;
    generation: number;
  };
  private freshGeneration: number | null = null;
  private freshStatus: string | null = null;
  private statusValidated = false;
  private requests = new Map<string, number>();
  private lastRequest = new Map<VesselCommand, number>();
  constructor(readonly run: RunContext) {
    this.link = () => ({
      connected: run.mode !== "live",
      lastHeartbeat: run.clock.now(),
      agentId: "fixture-agent",
      generation: 0,
    });
  }
  source(source: SourceEvent) {
    if (
      source.source === "elite.status" &&
      source.mode === "live" &&
      source.agentId === this.link().agentId
    ) {
      this.freshGeneration = this.link().generation;
      this.freshStatus = source.id;
      const at = Date.parse(source.sourceTimestamp ?? source.observedAt);
      const age = this.run.clock.now() - at;
      // Status.json is change-driven: validate freshness on arrival, not
      // repeatedly while an unchanged ship remains in the same session.
      this.statusValidated =
        Number.isFinite(at) &&
        age >= -2000 &&
        age <= this.config().freshnessTTL;
    }
    this.revalidate();
  }
  config() {
    return shipConfig.parse(
      this.run.registry.status.get("chat-ship")?.config ?? {},
    );
  }
  snapshot(command: VesselCommand = "ship") {
    const reason = this.reason(command);
    return {
      available: reason === null,
      reason,
      config:
        command === "ship"
          ? this.config()
          : loadoutConfig.parse(
              this.run.registry.status.get("chat-loadout")?.config ?? {},
            ),
    };
  }
  reason(command: VesselCommand = "ship"): string | null {
    const { world, clock } = this.run,
      t = world.shipTelemetry,
      link = this.link(),
      now = clock.now();
    if (!this.run.registry.status.get("chat-" + command)?.enabled)
      return "disabled";
    if (!link.connected || now - link.lastHeartbeat > 30000)
      return "agent_unavailable";
    if (!t?.session) return "game_not_active";
    if (
      this.freshGeneration !== link.generation ||
      !this.freshStatus ||
      t.agentId !== link.agentId
    )
      return "awaiting_fresh_telemetry";
    const at = Date.parse(t.statusAt ?? "");
    if (!Number.isFinite(at) || at > now + 2000 || !this.statusValidated)
      return "telemetry_stale";
    if (world.vehicleContext !== "mainShip") return "not_in_main_ship";
    if (
      !t.loadoutAt ||
      !text(world.ship.Ship) ||
      !Number.isSafeInteger(world.ship.ShipID)
    )
      return "ship_data_unavailable";
    if (command === "loadout" && !loadoutView(world.ship, 8).modules.length)
      return "loadout_unavailable";
    return null;
  }
  guard(event: DomainEvent) {
    if (
      event.type !== "shipos.command.ship" &&
      event.type !== "shipos.command.loadout"
    )
      return null;
    const command =
      event.type === "shipos.command.loadout" ? "loadout" : "ship";
    return (
      this.reason(command) ??
      (event.payload.session !== this.run.world.shipTelemetry?.session ||
      event.payload.shipId !== this.run.world.ship.ShipID ||
      (command === "loadout" &&
        event.payload.loadoutAt !== this.run.world.shipTelemetry?.loadoutAt)
        ? "ship_context_changed"
        : null)
    );
  }
  revalidate() {
    for (const active of this.run.engine.snapshot()) {
      const event = this.run.store.event(active.eventId);
      if (event && this.guard(event))
        this.run.engine.finish(active.id, "interrupted");
    }
  }
  execute(input: unknown, command: VesselCommand = "ship") {
    const request = shipRequest.parse(input),
      now = this.run.clock.now();
    if ((this.run.mode === "live") !== (request.platform === "twitch"))
      return { status: "rejected", reason: "mode_mismatch" };
    const age = now - Date.parse(request.timestamp);
    if (age > 10000 || age < -2000)
      return { status: "rejected", reason: "request_expired" };
    for (const [id, at] of this.requests)
      if (now - at > 60000) this.requests.delete(id);
    if (
      this.requests.has(request.requestId) ||
      this.run.store.event("chat-" + command + ":" + request.requestId)
    )
      return { status: "suppressed", reason: "duplicate" };
    if (this.requests.size >= 512)
      this.requests.delete(this.requests.keys().next().value!);
    this.requests.set(request.requestId, now);
    const reason = this.reason(command);
    if (reason) return { status: "rejected", reason };
    const module = this.run.modules.find(
      (m) => m.manifest.id === "chat-" + command,
    )!;
    const last = this.lastRequest.get(command);
    if (last !== undefined && now - last < module.policy.cooldownMs)
      return { status: "suppressed", reason: "cooldown" };
    const w = this.run.world,
      s = w.ship,
      c =
        command === "ship"
          ? this.config()
          : loadoutConfig.parse(
              this.run.registry.status.get("chat-loadout")?.config ?? {},
            ),
      lines: string[] = [];
    const title =
      command.toUpperCase() +
      " // " +
      (models[text(s.Ship).toLowerCase()] ?? text(s.Ship).toUpperCase());
    lines.push(title);
    const name = [
      text(s.ShipName),
      text(s.ShipIdent) ? "[" + text(s.ShipIdent) + "]" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (name) lines.push(name);
    const range = num(s.MaxJumpRange);
    if (range !== null) lines.push("JUMP MAX  " + range.toFixed(1) + " LY");
    const cap = s.FuelCapacity as { Main?: unknown } | undefined,
      fuel = num(w.fuel.main),
      capacity = num(cap?.Main);
    if (fuel !== null && capacity !== null)
      lines.push(`FUEL MAIN  ${fuel.toFixed(1)} / ${capacity.toFixed(1)} T`);
    const cargo = num(w.shipTelemetry?.cargo),
      cargoCap = num(s.CargoCapacity);
    if (cargo !== null && cargoCap !== null)
      lines.push(`CARGO  ${cargo} / ${cargoCap} T`);
    const rebuy = num(s.Rebuy);
    if (rebuy !== null)
      lines.push(
        "REBUY  " +
          (rebuy >= 1000000
            ? (rebuy / 1000000).toFixed(2) + " M CR"
            : rebuy.toLocaleString("en-US") + " CR"),
      );
    if (w.shields !== "unknown")
      lines.push("SHIELDS  " + (w.shields ? "UP" : "DOWN"));
    const flags = typeof w.flags === "number" ? w.flags : 0;
    const fsd =
      flags & 1073741824
        ? "JUMPING"
        : flags & 131072
          ? "CHARGING"
          : flags & 262144
            ? "COOLDOWN"
            : flags & 65536
              ? "MASS LOCKED"
              : flags & 16
                ? "SUPERCRUISE"
                : "IDLE";
    lines.push("FSD  " + fsd);
    if (command === "loadout") {
      const config = loadoutConfig.parse(c);
      const view = loadoutView(s, config.maxDisplayedModules);
      lines.splice(0, lines.length, title, ...loadoutLines(view));
      if (view.omitted) lines.push(`+ ${view.omitted} additional modules`);
    }
    const event = eventFactory(
      "chat-" + command,
      {
        type:
          command === "ship" ? "shipos.command.ship" : "shipos.command.loadout",
        semanticKey: "chat:" + command,
        quality: "derived",
        sourceIds: [this.freshStatus!],
        payload: {
          title,
          lines,
          durationMs: c.durationMs,
          session: w.shipTelemetry!.session,
          shipId: s.ShipID,
          loadoutAt: w.shipTelemetry!.loadoutAt,
        },
      },
      {
        id: request.requestId,
        observedAt: new Date(now).toISOString(),
        sourceTimestamp: new Date(now).toISOString(),
      } as SourceEvent,
      this.run.mode,
      this.run.clock,
    );
    // Request identity, not the most recent Status, defines command identity.
    event.id = "chat-" + command + ":" + request.requestId;
    this.lastRequest.set(command, now);
    this.run.store.domain(event);
    this.run.dispatch();
    const decision = this.run.store.get<{ status: string; reasons: string[] }>(
      "director_decisions",
      event.id,
    );
    return {
      status: decision?.status ?? "rejected",
      reason: decision?.reasons.at(-1) ?? "unavailable",
      eventId: event.id,
    };
  }
}
