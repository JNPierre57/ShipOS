import { z } from "zod";
import {
  defaultPolicy,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";
import { catalog, catalogVersion } from "./catalog.js";
const organic = z.object({
  event: z.literal("ScanOrganic"),
  ScanType: z.literal("Analyse"),
  Genus: z.string(),
  Species: z.string(),
  Variant: z.string(),
  SystemAddress: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  Body: z.number().int().nonnegative(),
});
const sale = z.object({
  event: z.literal("SellOrganicData"),
  BioData: z.array(
    z.object({
      Genus: z.string(),
      Species: z.string(),
      Variant: z.string(),
      Value: z.number().nonnegative(),
      Bonus: z.number().nonnegative(),
    }),
  ),
});
export const highValue: ShipModule = {
  manifest: {
    id: "high-value-exobiology",
    name: "High Value Exobiology",
    version: "1.0.0",
    eventType: "elite.exobiology.highValueDiscovery",
  },
  configSchema: z.strictObject({
    highValueThresholdCredits: z.number().nonnegative().default(5000000),
  }),
  policy: { ...defaultPolicy, importance: 75, attentionCost: 4 },
  detect(source, _previous, _next, ctx) {
    const sold = sale.safeParse(source.payload);
    if (sold.success) {
      ctx.storage.set("sale:" + source.id, {
        sourceEventId: source.id,
        items: sold.data.BioData.map((item) => ({
          ...item,
          estimatedBaseValueCredits: catalog[item.Species]?.value ?? null,
          variance: catalog[item.Species]
            ? item.Value - catalog[item.Species]!.value
            : null,
        })),
      });
      return [];
    }
    const parsed = organic.safeParse(source.payload);
    if (!parsed.success) return [];
    const p = parsed.data,
      entry = catalog[p.Species];
    if (!entry) {
      ctx.logger.warn("catalog_miss", { species: p.Species });
      return [];
    }
    if (entry.value < Number(ctx.config.highValueThresholdCredits)) return [];
    const identity = `${p.SystemAddress}:${p.Body}:${p.Species}`;
    if (ctx.storage.get("discovery:" + identity)) return [];
    ctx.storage.set("discovery:" + identity, {
      sourceEventId: source.id,
      estimatedBaseValueCredits: entry.value,
    });
    return [
      {
        type: "elite.exobiology.highValueDiscovery",
        semanticKey: "exobiology:" + identity,
        payload: {
          identity,
          genus: p.Genus,
          species: p.Species,
          variant: p.Variant,
          name: entry.name,
          systemAddress: p.SystemAddress,
          bodyId: p.Body,
          estimatedBaseValueCredits: entry.value,
          isEstimate: true,
          catalogVersion,
          estimateSource: entry.source,
        },
        quality: "estimated",
      },
    ];
  },
  present(event, profile) {
    return {
      visual: "biology",
      detail: String(event.payload.name ?? "Biological discovery"),
      metric: Number(
        event.payload.estimatedBaseValueCredits ?? 0,
      ).toLocaleString("en-US"),
      metricLabel: "CR · ESTIMATED BASE VALUE",
      tags: ["ANALYSIS COMPLETE", "BONUS NOT INCLUDED"],
      title: "VALUABLE BIOLOGY",
      subtitle: `${String(event.payload.name)} · Estimated base ${Number(event.payload.estimatedBaseValueCredits).toLocaleString("en-US")} CR`,
      accent: "#86dec2",
      durationMs: profile === "COMPACT" ? 3500 : 7000,
      slot: "primary",
      layers: ["EventLayer"],
      audioAsset: "audio.alert.high-value-exobiology",
    };
  },
};
