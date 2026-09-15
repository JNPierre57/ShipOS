import { expect, test } from "vitest";
import { IsolatedRuns } from "../../apps/core/src/isolated-runs.js";
import { modules } from "../../apps/core/src/modules.js";
import { contextScenario } from "../../apps/core/src/context-scenarios.js";
import type { PresentationAction } from "../../packages/contracts/src/index.js";
test("Crew golden sequence rotates Alice/Bob/Alice without adding interventions or changing Director outcomes", async () => {
  const isolated = new IsolatedRuns(modules);
  const presented: PresentationAction[] = [];
  isolated.listeners.add((a) => {
    if (a.type === "overlay.show") presented.push(a);
  });
  try {
    const payloads = contextScenario("Crew Multiple Officers");
    const a = await isolated.create(
      "simulation",
      payloads,
      "instant",
      "source",
      undefined,
      "Crew Multiple Officers",
    );
    const comms = presented.map(
      (a) =>
        a.payload.comm as {
          department: string;
          displayName: string;
          message: string;
        },
    );
    expect(comms.map((c) => [c.department, c.displayName, c.message])).toEqual([
      [
        "SCI",
        "Alice",
        "Analyse à forte valeur estimée. Le montant de base figure au relevé.",
      ],
      [
        "SCI",
        "Bob",
        "Ce corps présente une caractéristique remarquable dans nos relevés.",
      ],
      [
        "SCI",
        "Alice",
        "Observation notable. Je transmets les données disponibles.",
      ],
    ]);
    const before = isolated.runs
      .get(a.id)!
      .context.store.all<Record<string, unknown>>("director_decisions");
    presented.length = 0;
    const b = await isolated.create(
      "simulation",
      payloads,
      "instant",
      "source",
    );
    expect(presented).toHaveLength(3);
    expect(presented.every((p) => !p.payload.comm)).toBe(true);
    const after = isolated.runs
      .get(b.id)!
      .context.store.all<Record<string, unknown>>("director_decisions");
    const policy = (rows: Record<string, unknown>[]) =>
      rows.map(
        ({ type, importance, urgency, ttlMs, status, cost, budgetAfter }) => ({
          type,
          importance,
          urgency,
          ttlMs,
          status,
          cost,
          budgetAfter,
        }),
      );
    expect(policy(before)).toEqual(policy(after));
  } finally {
    isolated.close();
  }
});
