import { z } from "zod";
import {
  defaultPolicy,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";

export const loadoutConfig = z.strictObject({
  durationMs: z.number().int().min(7000).max(10000).default(10000),
  maxDisplayedModules: z.number().int().min(5).max(8).default(8),
});
export const loadoutModule: ShipModule = {
  manifest: {
    id: "chat-loadout",
    name: "Chat !loadout",
    version: "1.0.0",
    eventType: "shipos.command.loadout",
  },
  configSchema: loadoutConfig,
  policy: {
    ...defaultPolicy,
    importance: 15,
    urgency: 5,
    attentionCost: 2,
    cooldownMs: 30000,
    ttlMs: 15000,
  },
  detect: () => [],
  present: (e) => ({
    title: String(e.payload.title),
    subtitle: "VESSEL CONFIGURATION",
    durationMs: Number(e.payload.durationMs),
    accent: "#bacdaa",
    slot: "primary",
    layers: ["EventLayer"],
    audioAsset: "",
    terminal: {
      primitive: "ConsoleStrip",
      severity: "notice",
      label: "SHIPOS / LOADOUT",
      lines: e.payload.lines as string[],
      maxLines: 10,
      timingMs: 120,
      emphasis: 0,
    },
  }),
};
const clean = (x: unknown) =>
  typeof x === "string"
    ? x
        .replace(/[\x00-\x1f]/g, " ")
        .trim()
        .slice(0, 90)
    : "";
const readable = (x: string) => x.replace(/^\$|;$/g, "").replace(/_/g, " ");
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const core: Record<string, [string, number]> = {
  FrameShiftDrive: ["FSD", 0],
  MainEngines: ["THRUSTERS", 1],
  PowerPlant: ["POWER PLANT", 2],
  PowerDistributor: ["DISTRIBUTOR", 3],
  LifeSupport: ["LIFE SUPPORT", 30],
  Radar: ["SENSORS", 31],
  FuelTank: ["FUEL TANK", 32],
};
const optional: Record<string, [string, number]> = {
  shieldgenerator: ["SHIELD", 4],
  guardianfsdbooster: ["GUARDIAN FSD BOOSTER", 5],
  fuelscoop: ["FUEL SCOOP", 6],
  shieldcellbank: ["SCB", 7],
  buggybay: ["SRV HANGAR", 8],
  fighterbay: ["FIGHTER HANGAR", 9],
  repairer: ["AFMU", 10],
  refinery: ["REFINERY", 11],
  dronecontrol: ["LIMPET CONTROLLER", 12],
};
const blueprints: Record<string, string> = {
  FSD_LongRange: "Increased Range",
  Engine_Dirty: "Dirty Drives",
  Engine_Clean: "Clean Drives",
  PowerPlant_Armoured: "Armoured",
  PowerPlant_Boosted: "Overcharged",
  PowerDistributor_HighFrequency: "Charge Enhanced",
  ShieldGenerator_Reinforced: "Reinforced",
  Weapon_Efficient: "Efficient",
};
const weaponNames: Record<string, string> = {
  beamlaser: "Beam Laser",
  pulselaser: "Pulse Laser",
  burstlaser: "Burst Laser",
  multicannon: "Multicannon",
  cannon: "Cannon",
  plasmaaccelerator: "Plasma Accelerator",
  railgun: "Railgun",
  mininglaser: "Mining Laser",
};
function weaponName(item: string) {
  const parts = item.replace(/^hpt_/, "").split("_");
  const name = weaponNames[parts[0] ?? ""];
  return name
    ? [name, ...parts.slice(1)].join(" · ")
    : readable(item.replace(/^hpt_/, ""));
}
export interface LoadoutModuleView {
  displayName: string;
  specification?: string;
  engineeringBlueprint?: string;
  engineeringGrade?: number;
  experimentalEffect?: string;
  quantity: number;
  category: "core" | "optional" | "hardpoint";
  priority: number;
}
export interface LoadoutCardViewModel {
  modules: LoadoutModuleView[];
  omitted: number;
}
export function loadoutView(
  ship: Record<string, unknown>,
  limit: number,
): LoadoutCardViewModel {
  const groups = new Map<string, LoadoutModuleView>();
  let total = 0;
  for (const raw of Array.isArray(ship.Modules) ? ship.Modules : []) {
    const m = object(raw),
      slot = clean(m.Slot),
      item = clean(m.Item).toLowerCase();
    if (!slot || !item) continue;
    const c = core[slot],
      o = Object.entries(optional).find(([key]) =>
        item.startsWith("int_" + key),
      );
    const weapon = /^(Small|Medium|Large|Huge)Hardpoint\d+$/.test(slot);
    if (!c && !o && !weapon) {
      if (/^(Slot|Military|TinyHardpoint)/.test(slot)) total++;
      continue;
    }
    total++;
    const eng = object(m.Engineering);
    const v: LoadoutModuleView = {
      displayName:
        clean(m.Item_Localised) || c?.[0] || o?.[1][0] || weaponName(item),
      quantity: 1,
      category: c ? "core" : weapon ? "hardpoint" : "optional",
      priority: c?.[1] ?? o?.[1][1] ?? 15,
    };
    // Only ordinary internal families use class1..5 = E..A. No weapon/special rating guesses.
    if (
      /^int_(powerplant|engine|hyperdrive(?:_overcharge)?|lifesupport|powerdistributor|sensors|fueltank|shieldgenerator|fuelscoop|shieldcellbank|repairer|refinery)_size\d+_class[1-5]$/.test(
        item,
      )
    ) {
      const match = item.match(/_size(\d+)_class([1-5])$/)!;
      v.specification = `${match[1]}${"EDCBA"[Number(match[2]) - 1]}`;
    } else if (item.startsWith("int_guardianfsdbooster_size")) {
      v.specification = item.match(/_size(\d+)/)?.[1];
    } else if (!weapon && !clean(m.Item_Localised)) {
      // Preserve variant identifiers for special/unknown modules rather than assigning a rating.
      v.specification = readable(item.replace(/^int_/, ""));
    }
    const bp =
      clean(eng.BlueprintName_Localised) ||
      blueprints[clean(eng.BlueprintName)] ||
      readable(clean(eng.BlueprintName));
    if (bp) v.engineeringBlueprint = bp;
    if (
      typeof eng.Level === "number" &&
      Number.isInteger(eng.Level) &&
      eng.Level >= 1 &&
      eng.Level <= 5
    )
      v.engineeringGrade = eng.Level;
    const effect =
      clean(eng.ExperimentalEffect_Localised) ||
      readable(clean(eng.ExperimentalEffect).replace(/^special_/, ""));
    if (effect) v.experimentalEffect = effect;
    const key = JSON.stringify([
      item,
      v.engineeringBlueprint,
      v.engineeringGrade,
      v.experimentalEffect,
      eng.Modifiers,
    ]);
    const existing = groups.get(key);
    if (existing) existing.quantity++;
    else groups.set(key, v);
  }
  const all = [...groups.values()].sort((a, b) => a.priority - b.priority);
  const selected = all.slice(0, limit);
  // Reserve one line for the highest-priority weapon group on armed vessels.
  const weapon = all.find((m) => m.category === "hardpoint");
  if (weapon && !selected.includes(weapon))
    selected[selected.length - 1] = weapon;
  return {
    modules: selected,
    omitted: total - selected.reduce((n, m) => n + m.quantity, 0),
  };
}
export function loadoutLines(view: LoadoutCardViewModel) {
  return view.modules.map((m) =>
    [
      (m.quantity > 1 ? `${m.quantity}× ` : "") +
        m.displayName +
        (m.specification ? " " + m.specification : ""),
      [
        m.engineeringBlueprint,
        m.engineeringGrade ? "G" + m.engineeringGrade : "",
      ]
        .filter(Boolean)
        .join(" "),
      m.experimentalEffect,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}
