export const loadoutScenarioNames = [
  "Loadout Cutter Cargo",
  "Loadout Clipper Exploration",
  "Loadout Combat Engineered",
  "Loadout No Engineering",
  "Loadout Inactive",
  "Loadout Stale",
  "Loadout Ship Switch",
  "Loadout Partial",
] as const;
export function loadoutFixture(name: string): Record<string, unknown>[] {
  const module = (Slot: string, Item: string, engineered = false) => ({
    Slot,
    Item,
    ...(engineered
      ? {
          Engineering: {
            BlueprintName: "Weapon_Efficient",
            Level: 5,
            ExperimentalEffect_Localised: "Plasma Slug",
          },
        }
      : {}),
  });
  const exploration = name.includes("Exploration"),
    combat = name.includes("Combat");
  const Modules = [
    module("FrameShiftDrive", "int_hyperdrive_size7_class5"),
    module("MainEngines", "int_engine_size8_class5"),
    module("PowerPlant", "int_powerplant_size8_class5"),
    module("PowerDistributor", "int_powerdistributor_size7_class5"),
    module("Slot01_Size8", "int_shieldgenerator_size8_class5"),
    module(
      "Slot02_Size8",
      exploration ? "int_fuelscoop_size7_class5" : "int_cargorack_size8_class1",
    ),
    module("Slot03_Size5", "int_guardianfsdbooster_size5"),
    module("Slot04_Size6", "int_shieldcellbank_size6_class5"),
    module("Slot05_Size6", "int_shieldcellbank_size6_class5"),
    module("LargeHardpoint1", "hpt_plasmaaccelerator_fixed_large", combat),
    module("LargeHardpoint2", "hpt_plasmaaccelerator_fixed_large", combat),
  ];
  const rows: Record<string, unknown>[] = [
    { event: "LoadGame", Ship: "cutter", ShipID: 1 },
    {
      event: "Loadout",
      Ship: exploration ? "empire_trader" : "cutter",
      ShipID: 1,
      Modules: name.includes("Partial")
        ? [null, {}, module("FrameShiftDrive", "int_hyperdrive_size6_class5")]
        : Modules,
    },
    { event: "Status", Flags: 16777224 },
  ];
  if (name.includes("Inactive")) rows.push({ event: "Shutdown" });
  if (name.includes("Stale")) rows.push({ event: "ShipOSDemoDisconnect" });
  if (name.includes("Ship Switch"))
    rows.push(
      { event: "ShipyardSwap", ShipID: 2 },
      { event: "ShipOSDemoCommand", command: "loadout" },
      {
        event: "Loadout",
        Ship: "empire_trader",
        ShipID: 2,
        Modules: [module("FrameShiftDrive", "int_hyperdrive_size5_class5")],
      },
      { event: "Status", Flags: 16777224 },
    );
  rows.push({ event: "ShipOSDemoCommand", command: "loadout" });
  return rows;
}
