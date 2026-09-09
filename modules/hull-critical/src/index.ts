import { z } from "zod";
import {
  defaultPolicy,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";
const damage = z.object({
  event: z.literal("HullDamage"),
  Health: z.number().min(0).max(1),
  PlayerPilot: z.literal(true),
  Fighter: z.literal(false),
});
export const hullCritical: ShipModule = {
  manifest: {
    id: "hull-critical",
    name: "Hull Critical",
    version: "1.0.0",
    eventType: "elite.ship.hull.critical",
  },
  configSchema: z.strictObject({ threshold: z.literal(0.2).default(0.2) }),
  policy: {
    ...defaultPolicy,
    importance: 90,
    urgency: 100,
    attentionCost: 7,
    ttlMs: 15000,
    cooldownMs: 0,
    interruptPolicy: "always",
  },
  detect(source, previous, _next, ctx) {
    const parsed = damage.safeParse(source.payload);
    if (
      !parsed.success ||
      previous.hullEpisode ||
      parsed.data.Health > Number(ctx.config.threshold) ||
      previous.vehicleContext !== "mainShip"
    )
      return [];
    return [
      {
        type: "elite.ship.hull.critical",
        semanticKey: "hull-episode:" + source.id,
        payload: {
          health: parsed.data.Health,
          threshold: 0.2,
          granularity: "20-percent-steps",
        },
        quality: "source-observed",
      },
    ];
  },
  present(event, profile) {
    return {
      visual: "integrity",
      detail: "STRUCTURAL ALERT",
      metric:
        typeof event.payload.health === "number"
          ? Math.round(event.payload.health * 100) + "%"
          : "≤ 20%",
      metricLabel: "LAST OBSERVED HULL INTEGRITY",
      gauge:
        typeof event.payload.health === "number" ? event.payload.health : 0.2,
      tags: ["CRITICAL DAMAGE", "EVASIVE ACTION"],
      title: "HULL CRITICAL",
      subtitle: "Structural integrity below observable 20% threshold",
      accent: "#ff8759",
      durationMs: profile === "COMPACT" ? 3000 : 6000,
      slot: "primary",
      layers: ["EventLayer", "GlobalFxLayer"],
      audioAsset: "audio.alert.hull-critical",
    };
  },
};
