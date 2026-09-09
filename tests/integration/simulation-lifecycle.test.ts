import { test, expect, vi } from "vitest";
import { IsolatedRuns } from "../../apps/core/src/isolated-runs.js";
import { contextScenario } from "../../apps/core/src/context-scenarios.js";
import { modules } from "../../apps/core/src/modules.js";
import { VirtualClock } from "../../apps/core/src/clock.js";

test("historical source simulations present on every launch and replacement stops previous timelines", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  const runs = new IsolatedRuns(modules);
  const shows: string[] = [];
  runs.listeners.add((a) => {
    if (a.type === "overlay.show") shows.push(String(a.payload.title));
  });
  try {
    for (let i = 0; i < 2; i++) {
      const result = await runs.create(
        "simulation",
        contextScenario("New Build"),
        1,
        "source",
        undefined,
        "New Build",
      );
      await vi.advanceTimersByTimeAsync(1500);
      const context = runs.runs.get(result.id)!.context;
      expect(context.store.all("director_decisions")).toEqual([
        expect.objectContaining({ status: "presented", reasons: ["selected"] }),
      ]);
      expect(context.engine.active.size).toBe(1);
    }
    expect(shows).toHaveLength(2);
    const combat = await runs.create(
      "simulation",
      contextScenario("Combat Escalation"),
      1,
    );
    await vi.advanceTimersByTimeAsync(12000);
    expect(shows).toContain("THREAT PROFILE RISING");
    const quiet = await runs.create(
      "simulation",
      contextScenario("Quiet Travel"),
      1,
    );
    const previous = runs.runs.get(combat.id)!;
    expect(previous.result.state).toBe("cancelled");
    expect(previous.context.engine.active.size).toBe(0);
    expect((previous.context.clock as VirtualClock).pending).toBe(0);
    const before = shows.length;
    await vi.advanceTimersByTimeAsync(280000);
    expect(shows).toHaveLength(before);
    expect(quiet.events).toEqual([]);
    expect(quiet.state).toBe("completed");
  } finally {
    runs.close();
    vi.useRealTimers();
  }
});

test("simulation and replay agree on source TTL and hull/context coalescing", async () => {
  const runs = new IsolatedRuns(modules);
  try {
    for (const mode of ["simulation", "replay"] as const) {
      const result = await runs.create(
        mode,
        contextScenario("Close Call"),
        "instant",
      );
      const decisions = runs.runs
        .get(result.id)!
        .context.store.all<{ type: string; status: string }>(
          "director_decisions",
        );
      expect(decisions.some((d) => d.status === "expired")).toBe(false);
      expect(
        decisions.find((d) => d.type === "elite.ship.hull.critical")?.status,
      ).toBe("presented");
      expect(
        decisions.find((d) => d.type === "shipos.broadcast.critical")?.status,
      ).toBe("coalesced");
    }
  } finally {
    runs.close();
  }
});
