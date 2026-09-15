import { z } from "zod";
import type { WorldState } from "../../../packages/module-sdk/src/index.js";
import type { SourceEvent } from "../../../packages/contracts/src/index.js";

// Journal §8.13/8.14 provides the installed slot and its resulting engineering.
// Do not merge old effects/modifiers: absent values are no longer confirmed.
const engineering = z.object({
  Engineer: z.string().optional(),
  EngineerID: z.number().int().nonnegative().optional(),
  BlueprintName: z.string().min(1),
  BlueprintID: z.number().int().nonnegative().optional(),
  BlueprintName_Localised: z.string().optional(),
  Level: z.number().int().min(1).max(5),
  Quality: z.number().min(0).max(1),
  ExperimentalEffect: z.string().optional(),
  ExperimentalEffect_Localised: z.string().optional(),
  Modifiers: z
    .array(
      z
        .object({
          Label: z.string().min(1),
          Value: z.number().optional(),
          OriginalValue: z.number().optional(),
          ValueStr: z.string().optional(),
          LessIsGood: z
            .union([z.boolean(), z.number().int().min(0).max(1)])
            .optional(),
        })
        .refine((m) => m.Value !== undefined || m.ValueStr !== undefined),
    )
    .min(1),
});

export function applyEngineering(
  world: WorldState,
  source: SourceEvent,
): boolean {
  const p = source.payload,
    t = world.shipTelemetry;
  if (
    !t?.session ||
    !t.loadoutAt ||
    t.agentId !== source.agentId ||
    (p.ShipID !== undefined && p.ShipID !== world.ship.ShipID) ||
    typeof p.Slot !== "string" ||
    typeof p.Module !== "string" ||
    !Array.isArray(world.ship.Modules)
  )
    return false;
  const slots = world.ship.Modules.filter(
    (m): m is Record<string, unknown> =>
      m !== null && typeof m === "object" && m.Slot === p.Slot,
  );
  if (
    slots.length !== 1 ||
    typeof slots[0]!.Item !== "string" ||
    slots[0]!.Item.toLowerCase() !== p.Module.toLowerCase()
  )
    return false;
  const result = engineering.safeParse(p);
  if (!result.success) return false;
  if (
    p.ApplyExperimentalEffect !== undefined &&
    p.ApplyExperimentalEffect !== result.data.ExperimentalEffect
  )
    return false;
  slots[0]!.Engineering = result.data;
  t.loadoutAt = source.sourceTimestamp ?? source.observedAt;
  // Engineering can change mass and jump performance. Await a full Loadout
  // for aggregate values rather than claiming the old snapshot is still current.
  for (const key of [
    "MaxJumpRange",
    "UnladenMass",
    "Rebuy",
    "HullValue",
    "ModulesValue",
  ])
    delete world.ship[key];
  return true;
}
