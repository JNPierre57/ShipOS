import { z } from "zod";
import {
  defaultPolicy,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";
export const remarkableBody: ShipModule = {
  manifest: {
    id: "remarkable-body",
    name: "Remarkable Body",
    version: "1.0.0",
    eventType: "elite.exploration.remarkableBody",
  },
  configSchema: z.strictObject({
    highGravityG: z.number().positive().default(2),
    manyBiologicalSignals: z.number().int().positive().default(5),
  }),
  policy: {
    ...defaultPolicy,
    importance: 70,
    urgency: 20,
    attentionCost: 4,
    cooldownMs: 20000,
  },
  detect(source, _previous, next, ctx) {
    const p = source.payload;
    if (p.event !== "Scan" && p.event !== "SAASignalsFound") return [];
    const key = `${p.SystemAddress}:${p.BodyID}`,
      b = next.bodies[key];
    if (!b) return [];
    const s = b.scan,
      reasons: string[] = [];
    if (s.StarType === "H" || s.StarType === "SupermassiveBlackHole")
      reasons.push("star.black_hole");
    if (s.StarType === "N") reasons.push("star.neutron");
    if (s.PlanetClass === "Earthlike body") reasons.push("planet.earth_like");
    if (s.PlanetClass === "Ammonia world") reasons.push("planet.ammonia_world");
    if (s.TerraformState === "Terraformable")
      reasons.push("planet.terraformable");
    const gravity =
      typeof s.SurfaceGravity === "number" ? s.SurfaceGravity / 9.80665 : null;
    if (gravity !== null && gravity >= Number(ctx.config.highGravityG))
      reasons.push("planet.high_gravity");
    if (
      typeof b.biologicalSignals === "number" &&
      b.biologicalSignals >= Number(ctx.config.manyBiologicalSignals)
    )
      reasons.push("planet.many_biological_signals");
    if (gravity !== null && ctx.records.candidate("gravityG", gravity))
      reasons.push("record.new");
    const previous = ctx.storage.get<string[]>("reasons:" + key) ?? [];
    const combined = [...new Set([...previous, ...reasons])].sort();
    if (
      !combined.length ||
      JSON.stringify(combined) === JSON.stringify(previous)
    )
      return [];
    ctx.storage.set("reasons:" + key, combined);
    return [
      {
        type: "elite.exploration.remarkableBody",
        semanticKey: "remarkable-body:" + key,
        sourceIds: [...b.sourceIds],
        revision: combined.join("|"),
        payload: {
          systemAddress: b.systemAddress,
          bodyId: b.bodyId,
          name: b.name,
          reasons: combined,
          gravityG: gravity,
          wasFootfalled: b.wasFootfalled,
          biologicalSignals: b.biologicalSignals,
        },
        quality: "derived",
      },
    ];
  },
  present(event, profile) {
    return {
      visual: "orbital",
      detail: String(event.payload.name ?? "Unidentified body"),
      tags: ((event.payload.reasons as string[]) ?? []).map(
        (reason) =>
          ({
            "star.black_hole": "BLACK HOLE",
            "star.neutron": "NEUTRON STAR",
            "planet.earth_like": "EARTH-LIKE WORLD",
            "planet.ammonia_world": "AMMONIA WORLD",
            "planet.terraformable": "TERRAFORMABLE",
            "planet.high_gravity": "HIGH GRAVITY",
            "planet.many_biological_signals": "RICH BIOLOGICAL SIGNALS",
            "record.new": "NEW PERSONAL RECORD",
            preview: "DISCOVERY PREVIEW",
          })[reason] ?? reason,
      ),
      metric:
        typeof event.payload.gravityG === "number"
          ? event.payload.gravityG.toFixed(2) + " g"
          : undefined,
      metricLabel: "SURFACE GRAVITY",
      title: "REMARKABLE BODY",
      subtitle: `${String(event.payload.name)} · ${(event.payload.reasons as string[]).join(" / ")}`,
      accent: "#85bfff",
      durationMs: profile === "COMPACT" ? 3500 : 11000,
      slot: "primary",
      layers: ["EventLayer"],
      audioAsset: "audio.alert.remarkable-body",
    };
  },
};
