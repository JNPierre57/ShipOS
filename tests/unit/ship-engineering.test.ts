import { expect, test } from "vitest";
import { initialWorld, reduce } from "../../apps/core/src/world.js";
import { source } from "../../packages/testkit/src/index.js";

// Synthetic fixture using the shape observed in the 15 September Journal.
export const craft = {
  event: "EngineerCraft",
  Slot: "PowerPlant",
  Module: "int_powerplant_size8_class5",
  BlueprintName: "PowerPlant_Boosted",
  Level: 5,
  Quality: 1,
  ApplyExperimentalEffect: "special_powerplant_highcharge",
  ExperimentalEffect: "special_powerplant_highcharge",
  ExperimentalEffect_Localised: "Modèle XXL",
  Modifiers: [{ Label: "Mass", Value: 88, OriginalValue: 80, LessIsGood: 1 }],
};
function world() {
  const loaded = reduce(
    initialWorld(),
    source({ event: "LoadGame", ShipID: 1 }),
  );
  return reduce(
    loaded,
    source(
      {
        event: "Loadout",
        ShipID: 1,
        Ship: "cutter",
        MaxJumpRange: 26,
        Rebuy: 100000,
        Modules: [
          {
            Slot: "PowerPlant",
            Item: craft.Module,
            Engineering: {
              BlueprintName: "Old",
              ExperimentalEffect: "old_effect",
            },
          },
        ],
      },
      2,
    ),
  );
}
test("engineering updates the installed slot without waiting for Loadout or retaining old effects/performance", () => {
  const before = world();
  const updated = reduce(before, source(craft, 3));
  const modules = updated.ship.Modules as {
    Engineering: Record<string, unknown>;
  }[];
  expect(updated.shipTelemetry?.loadoutAt).not.toBeNull();
  expect(modules[0]!.Engineering.ExperimentalEffect).toBe(
    craft.ExperimentalEffect,
  );
  expect(modules[0]!.Engineering.Modifiers).toEqual(craft.Modifiers);
  expect(updated.ship.MaxJumpRange).toBeUndefined();
  expect(updated.ship.Rebuy).toBeUndefined();
  expect(before.ship.MaxJumpRange).toBe(26);
  const plain = {
    ...craft,
    ApplyExperimentalEffect: undefined,
    ExperimentalEffect: undefined,
    ExperimentalEffect_Localised: undefined,
  };
  const next = reduce(updated, source(plain, 4));
  expect(
    (next.ship.Modules as typeof modules)[0]!.Engineering.ExperimentalEffect,
  ).toBeUndefined();
});
test("incomplete, mismatched, ambiguous or untrusted changes stay unavailable", () => {
  for (const change of [
    { Module: "int_powerplant_size2_class5" },
    { Slot: "StoredSlot" },
    { ShipID: 99 },
    { Modifiers: undefined },
    { Quality: undefined },
    { Modifiers: [{ Label: "Mass" }] },
    { ApplyExperimentalEffect: "different" },
  ]) {
    expect(
      reduce(world(), source({ ...craft, ...change }, 3)).shipTelemetry
        ?.loadoutAt,
    ).toBeNull();
  }
  const ambiguous = world();
  (ambiguous.ship.Modules as unknown[]).push(
    ...(ambiguous.ship.Modules as unknown[]),
  );
  expect(
    reduce(ambiguous, source(craft, 3)).shipTelemetry?.loadoutAt,
  ).toBeNull();
  expect(
    reduce(world(), { ...source(craft, 3), agentId: "other-agent" })
      .shipTelemetry?.loadoutAt,
  ).toBeNull();
  const invalidated = reduce(world(), source({ event: "ModuleStore" }, 3));
  expect(
    reduce(invalidated, source(craft, 4)).shipTelemetry?.loadoutAt,
  ).toBeNull();
});
test("conversion previews preserve state, applied conversions update it, Shutdown cannot revive it", () => {
  const before = world();
  expect(
    reduce(
      before,
      source({ ...craft, event: "EngineerLegacyConvert", IsPreview: true }, 3),
    ),
  ).toEqual(before);
  expect(
    reduce(
      before,
      source({ ...craft, event: "EngineerLegacyConvert", IsPreview: false }, 3),
    ).ship.MaxJumpRange,
  ).toBeUndefined();
  const stopped = reduce(before, source({ event: "Shutdown" }, 3));
  expect(reduce(stopped, source(craft, 4)).shipTelemetry?.session).toBeNull();
  expect(reduce(stopped, source(craft, 4)).shipTelemetry?.loadoutAt).toBeNull();
});
