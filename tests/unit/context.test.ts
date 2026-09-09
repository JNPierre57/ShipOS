import { test, expect } from "vitest";
import {
  fingerprint,
  changedSlots,
  freshContext,
  observe,
  evaluate,
} from "../../apps/core/src/context.js";
import { initialWorld, reduce } from "../../apps/core/src/world.js";
import { source } from "../../packages/testkit/src/index.js";
const load = {
  Modules: [
    {
      Slot: "B",
      Item: "Beam",
      Health: 0.4,
      Engineering: {
        BlueprintName: "Efficient",
        Level: 5,
        Quality: 0.2,
        ExperimentalEffect: "ThermalVent",
      },
    },
    { Slot: "A", Item: "Engine" },
  ],
};
test("fingerprints canonicalize module order/case and ignore operational volatility", () => {
  expect(fingerprint(load)).toEqual(
    fingerprint({
      Modules: [
        { Slot: "a", Item: "ENGINE", AmmoInClip: 2 },
        {
          ...load.Modules[0],
          Health: 1,
          On: false,
          Priority: 4,
          Engineering: { ...load.Modules[0]!.Engineering, Quality: 0.9 },
        },
      ],
    }),
  );
  const changed = fingerprint({
    Modules: [
      { Slot: "A", Item: "Engine" },
      {
        ...load.Modules[0],
        Engineering: { BlueprintName: "LongRange", Level: 5 },
      },
    ],
  })!;
  expect(changedSlots(fingerprint(load)!, changed).map((x) => x.slot)).toEqual([
    "b",
  ]);
  expect(fingerprint({ Modules: [{ Slot: "a" }] })).toBeNull();
  expect(
    fingerprint({
      Modules: [
        { Slot: "a", Item: "x" },
        { Slot: "A", Item: "y" },
      ],
    }),
  ).toBeNull();
});
test("independent activity evidence decays, refreshes and expires without unbounded growth", () => {
  const state = freshContext(0),
    world = initialWorld();
  for (let i = 0; i < 1000; i++)
    observe(state, source({ event: "PowerplayCollect" }, i + 1), world, 0);
  observe(
    state,
    source({ event: "UnderAttack", Target: "You" }, 1001),
    world,
    0,
  );
  evaluate(state, 0);
  expect(state.signals.length).toBe(2);
  expect(state.activities.find((a) => a.category === "combat")!.score).toBe(
    0.9,
  );
  expect(state.activities.find((a) => a.category === "powerplay")!.score).toBe(
    1,
  );
  evaluate(state, 15000);
  expect(state.activities.find((a) => a.category === "combat")!.score).toBe(
    0.45,
  );
  evaluate(state, 180001);
  expect(state.signals).toHaveLength(0);
});
test("BGS requires repeated faction effects and always remains inferred", () => {
  const state = freshContext(0),
    world = initialWorld();
  observe(
    state,
    source({ event: "MissionCompleted", Faction: "A", FactionEffects: [{}] }),
    world,
    0,
  );
  evaluate(state, 0);
  expect(state.activities.find((a) => a.category === "bgs")!.score).toBe(0);
  observe(
    state,
    source(
      { event: "MissionCompleted", Faction: "A", FactionEffects: [{}] },
      2,
    ),
    world,
    1000,
  );
  evaluate(state, 1000);
  expect(state.activities.find((a) => a.category === "bgs")).toMatchObject({
    quality: "INFERRED",
    status: "EXPERIMENTAL",
  });
  expect(
    state.activities.find((a) => a.category === "bgs")!.confidence,
  ).toBeCloseTo(0.45);
});
test("critical hysteresis and recovery require sustained danger then fresh safety", () => {
  const state = freshContext(0);
  const status = source({ event: "Status", Flags: 16777224 });
  const world = reduce(initialWorld(), status);
  observe(
    state,
    source({ event: "HullDamage", PlayerPilot: true, Health: 0.1 }),
    world,
    0,
  );
  evaluate(state, 0);
  expect(state.phase).toBe("CALM");
  evaluate(state, 1000);
  expect(state.phase).toBe("CALM");
  evaluate(state, 2000);
  expect(state.phase).toBe("CRITICAL");
  for (let t = 3000; t < 65000; t += 1000) {
    observe(state, status, world, t);
    evaluate(state, t);
  }
  expect(state.timeline.map((t) => t.to)).toContain("RECOVERY");
  expect(state.phase).toBe("CALM");
  const silent = freshContext(0);
  observe(
    silent,
    source({ event: "HullDamage", PlayerPilot: true, Health: 0.1 }),
    world,
    0,
  );
  for (let t = 0; t <= 180000; t += 1000) evaluate(silent, t);
  expect(silent.timeline.some((t) => t.to === "RECOVERY")).toBe(false);
});
test("unknown vehicles and missing target do not fabricate danger", () => {
  const s = freshContext(0);
  observe(
    s,
    source({ event: "HullDamage", Health: 0.1, PlayerPilot: true }),
    initialWorld(),
    0,
  );
  observe(
    s,
    source({ event: "UnderAttack", Target: "SRV" }),
    initialWorld(),
    0,
  );
  evaluate(s, 0);
  expect(s.dimensions.danger).toBe(0);
});
test("hostile unknown event names are counted without inherited rules or prototype mutation", () => {
  const state = freshContext(0);
  for (let i = 0; i < 300; i++)
    observe(
      state,
      source(
        { event: i === 0 ? "__proto__" : i === 1 ? "toString" : "future-" + i },
        i + 1,
      ),
      initialWorld(),
      i * 1000,
    );
  evaluate(state, 300000);
  expect(Object.keys(state.census).length).toBeLessThanOrEqual(128);
  expect(state.signals).toHaveLength(0);
  expect(Object.getPrototypeOf(state.census)).toBe(Object.prototype);
});
test("all independent categories have a documented fixture and low-confidence categories remain labelled", () => {
  const state = freshContext(0);
  let world = initialWorld();
  const events = [
    { event: "UnderAttack", Target: "You" },
    { event: "FSDJump" },
    { event: "MiningRefined" },
    { event: "EngineerCraft" },
    { event: "ModuleBuy" },
    { event: "PowerplayDeliver" },
    { event: "MarketSell" },
    { event: "MissionAccepted" },
    { event: "Scan" },
    { event: "ScanOrganic" },
    { event: "LaunchSRV", SRVType: "test-raw-type" },
    { event: "Status", Flags: 67108864 },
    { event: "MaterialCollected" },
    { event: "Disembark" },
  ];
  events.forEach((p, i) => {
    const e = source(p, i + 1);
    world = reduce(world, e);
    observe(state, e, world, 0);
  });
  evaluate(state, 0);
  for (const name of [
    "combat",
    "travel",
    "mining.space",
    "engineering",
    "outfitting",
    "powerplay",
    "trading",
    "missioning",
    "exploration",
    "exobiology",
    "srv",
    "onFoot",
  ])
    expect(
      state.activities.find((a) => a.category === name)!.score,
    ).toBeGreaterThan(0);
  expect(
    state.activities.find((a) => a.category === "mining.surface"),
  ).toMatchObject({ quality: "INFERRED", status: "EXPERIMENTAL" });
});
test("two hours of changing evidence retain bounded diagnostic state", () => {
  const state = freshContext(0);
  let world = initialWorld();
  for (let t = 0; t < 7200000; t += 1000) {
    const phase = t % 60000;
    const p =
      phase === 0
        ? { event: "UnderAttack", Target: "You" }
        : phase === 5000
          ? { event: "HullDamage", Health: 0.1, PlayerPilot: true }
          : { event: "Status", Flags: 16777224 };
    const e = source(
      { ...p, timestamp: new Date(t).toISOString() },
      t / 1000 + 1,
    );
    world = reduce(world, e);
    observe(state, e, world, t);
    evaluate(state, t);
  }
  expect(state.timeline.length).toBeLessThanOrEqual(200);
  expect(state.activityTimeline.length).toBeLessThanOrEqual(200);
  expect(state.signals.length).toBeLessThanOrEqual(96);
  expect(JSON.stringify(state).length).toBeLessThan(200000);
});
