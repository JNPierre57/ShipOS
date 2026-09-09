import { z } from "zod";
import {
  defaultPolicy,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";
export const shipDestroyed: ShipModule = {
  manifest: {
    id: "ship-destroyed",
    name: "Ship Destroyed",
    version: "1.0.0",
    eventType: "elite.ship.destroyed",
  },
  configSchema: z.strictObject({
    contextMaxAgeMs: z.number().positive().default(30000),
  }),
  policy: {
    ...defaultPolicy,
    importance: 100,
    urgency: 100,
    attentionCost: 10,
    interruptPolicy: "exclusive",
  },
  detect(source, previous, _next, ctx) {
    if (source.payload.event !== "Died") return [];
    const age = previous.contextAt
      ? Date.parse(source.sourceTimestamp ?? source.observedAt) -
        Date.parse(previous.contextAt)
      : Infinity;
    if (
      previous.vehicleContext !== "mainShip" ||
      age < 0 ||
      age > Number(ctx.config.contextMaxAgeMs)
    ) {
      ctx.logger.warn("died_context_insufficient", {
        vehicleContext: previous.vehicleContext,
        age,
      });
      return [];
    }
    return [
      {
        type: "elite.ship.destroyed",
        semanticKey: "ship-destroyed:" + source.id,
        payload: { ship: previous.ship, context: previous.vehicleContext },
        quality: "derived",
      },
    ];
  },
  present(_event, profile) {
    return {
      visual: "signal-loss",
      detail: "SIGNAL LOST",
      metric: "OFFLINE",
      metricLabel: "VESSEL TELEMETRY",
      tags: ["EMERGENCY PROTOCOL"],
      title: "SHIP DESTROYED",
      subtitle: "Signal lost · Emergency protocol",
      accent: "#ff5b62",
      durationMs: profile === "COMPACT" ? 3500 : 8000,
      slot: "primary",
      layers: ["EventLayer", "GlobalFxLayer"],
      audioAsset: "audio.alert.ship-destroyed",
    };
  },
};
