import { test, expect } from "vitest";
import { IsolatedRuns } from "../../apps/core/src/isolated-runs.js";
import {
  contextScenario,
  contextScenarioNames,
} from "../../apps/core/src/context-scenarios.js";
import { modules } from "../../apps/core/src/modules.js";
for (const name of contextScenarioNames)
  test("deterministic context replay: " + name, async () => {
    const runs = new IsolatedRuns(modules);
    const a = await runs.create("replay", contextScenario(name), "instant"),
      b = await runs.create("replay", contextScenario(name), "instant");
    const first = runs.runs.get(a.id)!.context,
      second = runs.runs.get(b.id)!.context;
    expect(first.context.state).toEqual(second.context.state);
    expect(
      a.events.map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        occurredAt: e.occurredAt,
      })),
    ).toEqual(
      b.events.map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        occurredAt: e.occurredAt,
      })),
    );
    if (name === "Quiet Travel") expect(a.events).toHaveLength(0);
    if (name === "New Build")
      expect(
        a.events.filter((e) => e.type === "shipos.context.loadout.novel"),
      ).toHaveLength(2);
    if (name === "New Build")
      expect(
        first.context.state.timeline.some((t) => t.to === "TRANSITION"),
      ).toBe(true);
    if (name === "Close Call")
      expect(first.context.state.timeline.map((t) => t.to)).toEqual([
        "ACTIVE",
        "TENSION",
        "CRITICAL",
        "RECOVERY",
        "CALM",
      ]);
    runs.close();
  });
