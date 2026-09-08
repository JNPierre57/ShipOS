import { z } from "zod";
import {
  defaultPolicy,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";
export const lowFuel: ShipModule = {
  manifest: {
    id: "low-fuel",
    name: "Low Fuel",
    version: "1.0.0",
    eventType: "elite.ship.fuel.low",
  },
  configSchema: z.strictObject({}),
  policy: {
    ...defaultPolicy,
    importance: 65,
    urgency: 80,
    attentionCost: 4,
    cooldownMs: 0,
    interruptPolicy: "if-lower-priority",
  },
  detect(source, previous, next) {
    if (
      source.source !== "elite.status" ||
      previous.fuel.low !== false ||
      next.fuel.low !== true
    )
      return [];
    return [
      {
        type: "elite.ship.fuel.low",
        semanticKey: "low-fuel:" + source.id,
        payload: {
          fuelMain: next.fuel.main,
          fuelReservoir: next.fuel.reservoir,
          thresholdSemantics: "Frontier low fuel flag (<25%)",
          sourceTimestamp: source.sourceTimestamp,
        },
        quality: "source-observed",
      },
    ];
  },
  present(_event, profile) {
    return {
      title: "LOW FUEL",
      subtitle: "Fuel reserve below 25% · Plan your next scoop",
      accent: "#efca77",
      durationMs: profile === "COMPACT" ? 3000 : 5000,
      slot: "primary",
      layers: ["EventLayer"],
      audioAsset: "audio.alert.low-fuel",
    };
  },
};
