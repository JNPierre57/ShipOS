import { test, expect } from "vitest";
import { Store } from "../../apps/core/src/store.js";
import { RunContext } from "../../apps/core/src/runtime.js";
import { VirtualClock } from "../../apps/core/src/clock.js";
import { modules } from "../../apps/core/src/modules.js";
import { source } from "../../packages/testkit/src/index.js";
import { initialWorld, reduce } from "../../apps/core/src/world.js";
import { shipDestroyed } from "../../modules/ship-destroyed/src/index.js";
const start = Date.parse("2026-09-08T10:00:00Z");
async function setup() {
  const store = new Store(":memory:");
  await store.migrate();
  return new RunContext("live", store, modules, new VirtualClock(start));
}
test("initial low fuel initializes; only false→true triggers and rearms", async () => {
  const run = await setup();
  [524288, 524288, 0, 524288, 524288, 0, 524288].forEach((Flags, i) =>
    run.ingest(source({ event: "Status", Flags }, i + 1)),
  );
  expect(run.store.events().map((e) => e.type)).toEqual([
    "elite.ship.fuel.low",
    "elite.ship.fuel.low",
  ]);
  run.close();
});
test("hull episodes deduplicate and repair resets, fighter rejected", async () => {
  const run = await setup();
  const payloads = [
    { event: "Status", Flags: 16777216 },
    { event: "HullDamage", Health: 0.19, PlayerPilot: true, Fighter: false },
    { event: "HullDamage", Health: 0.1, PlayerPilot: true, Fighter: false },
    { event: "RepairAll" },
    { event: "HullDamage", Health: 0.19, PlayerPilot: true, Fighter: true },
    { event: "HullDamage", Health: 0.19, PlayerPilot: true, Fighter: false },
  ];
  payloads.forEach((p, i) => run.ingest(source(p, i + 1)));
  expect(
    run.store.events().filter((e) => e.type === "elite.ship.hull.critical"),
  ).toHaveLength(2);
  run.close();
});
test.each([true, false, undefined])(
  "WasFootfalled %s and reduced scan preserve unknown",
  (value) => {
    const p = {
      event: "Scan",
      SystemAddress: 1,
      BodyID: 2,
      ...(value === undefined ? {} : { WasFootfalled: value }),
    };
    let world = reduce(initialWorld(), source(p));
    expect(world.bodies["1:2"]!.wasFootfalled).toBe(value ?? "unknown");
    expect(world.bodies["1:2"]!.scan.TerraformState).toBeUndefined();
    world = reduce(world, source({ ...p, TerraformState: "Terraformable" }, 2));
    world = reduce(
      world,
      source({ event: "Scan", SystemAddress: 1, BodyID: 2 }, 3),
    );
    expect(world.bodies["1:2"]!.scan.TerraformState).toBe("Terraformable");
  },
);
test("remarkable body revisions accumulate reasons and coalesce", async () => {
  const run = await setup();
  run.ingest(
    source(
      {
        event: "Scan",
        SystemAddress: 1,
        BodyID: 2,
        BodyName: "Test 2",
        PlanetClass: "Earthlike body",
        WasFootfalled: false,
      },
      1,
    ),
  );
  run.ingest(
    source(
      {
        event: "SAASignalsFound",
        SystemAddress: 1,
        BodyID: 2,
        Signals: [{ Type: "$SAA_SignalType_Biological;", Count: 6 }],
      },
      2,
    ),
  );
  const events = run.store.events();
  expect(events).toHaveLength(2);
  expect(events[1]!.payload.reasons).toEqual([
    "planet.earth_like",
    "planet.many_biological_signals",
  ]);
  expect(
    run.store.get<{ status: string }>("director_decisions", events[1]!.id)
      ?.status,
  ).toBe("coalesced");
  run.close();
});
test("exobiology catalogue miss, Analyse, stable discovery dedupe, actual sales reconcile", async () => {
  const run = await setup();
  const p = {
    event: "ScanOrganic",
    ScanType: "Analyse",
    Genus: "$Codex_Ent_Stratum_Genus_Name;",
    Species: "$Codex_Ent_Stratum_07_Name;",
    Variant: "$Codex_Ent_Stratum_07_A_Name;",
    SystemAddress: 1,
    Body: 2,
  };
  run.ingest(source({ ...p, Species: "unknown" }, 1));
  run.ingest(source({ ...p, ScanType: "Sample" }, 2));
  run.ingest(source(p, 3));
  run.ingest(source(p, 4));
  run.ingest(
    source(
      {
        event: "SellOrganicData",
        BioData: [
          {
            Genus: p.Genus,
            Species: p.Species,
            Variant: p.Variant,
            Value: 19010800,
            Bonus: 0,
          },
        ],
      },
      5,
    ),
  );
  expect(run.store.events()).toHaveLength(1);
  expect(run.store.events()[0]!.payload).toMatchObject({
    isEstimate: true,
    estimatedBaseValueCredits: 19010800,
  });
  expect(
    JSON.stringify(
      run.store.source(source({ ...p, Species: "unknown" }, 1).id),
    ),
  ).toContain("catalog_miss");
  expect(JSON.stringify(run.store.all("module_storage"))).toContain("variance");
  run.close();
});
test("module exception is isolated, circuit breaker disables and can reenable", async () => {
  const store = new Store(":memory:");
  await store.migrate();
  const broken = {
    ...shipDestroyed,
    detect: () => {
      throw Error("injected detector failure");
    },
  };
  const run = new RunContext("live", store, [broken]);
  for (let i = 1; i <= 3; i++) run.ingest(source({ event: "Test" }, i));
  expect(run.registry.status.get("ship-destroyed")).toMatchObject({
    health: "DISABLED",
    failures: 3,
    enabled: false,
  });
  expect(store.pendingSources()).toHaveLength(0);
  run.registry.update("ship-destroyed", { enabled: true });
  expect(run.registry.status.get("ship-destroyed")?.health).toBe("HEALTHY");
  run.close();
});
test("NavRoute accepts raw event variants and clear", () => {
  for (const event of ["Route", "NavRoute"]) {
    const e = source({
      event,
      Route: [{ StarSystem: "Sol", SystemAddress: 1 }],
    });
    e.source = "elite.navroute";
    const state = reduce(initialWorld(), e);
    expect(state.navRoute).toHaveLength(1);
    expect(reduce(state, source({ event: "NavRouteClear" })).navRoute).toEqual(
      [],
    );
  }
});
test("module policy is validated and scoped to its RunContext", async () => {
  const run = await setup();
  const live = run.modules[2]!;
  const original = modules[2]!.policy.preferredProfile;
  run.registry.update(live.manifest.id, {
    policy: { ...live.policy, preferredProfile: "SILENT" },
  });
  expect(live.policy.preferredProfile).toBe("SILENT");
  expect(modules[2]!.policy.preferredProfile).toBe(original);
  run.ingest(source({ event: "Status", Flags: 0 }, 1));
  run.ingest(source({ event: "Status", Flags: 524288 }, 2));
  expect(run.store.events()).toHaveLength(1);
  expect(
    run.store.get<{ reasons: string[] }>(
      "director_decisions",
      run.store.events()[0]!.id,
    )?.reasons,
  ).toContain("policy_silent");
  run.close();
});

test("all module configurations reject unknown keys instead of silently discarding typos", () => {
  for (const module of modules) {
    expect(
      module.configSchema.safeParse({ misspelledThreshold: 42 }).success,
    ).toBe(false);
    expect(module.configSchema.safeParse({}).success).toBe(true);
  }
});
