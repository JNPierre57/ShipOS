import { test, expect } from "vitest";
import {
  crewRequest,
  crewActivityRequest,
  viewerSchema,
  crewConfig,
} from "../../apps/core/src/crew-model.js";
import { crewFacts } from "../../apps/core/src/crew-messages.js";
import type { DomainEvent } from "../../packages/contracts/src/index.js";
import type { PresentationDefinition } from "../../packages/module-sdk/src/index.js";
test("Crew contracts reject untrusted extra fields, unsupported roles and invisible control characters", () => {
  const body = {
    requestId: "fixture",
    timestamp: "2026-09-15T12:00:00Z",
    platform: "twitch",
    viewer: { id: "42", displayName: "Alice" },
  };
  expect(crewRequest.parse({ ...body, role: " ing " }).role).toBe("ENG");
  for (const role of ["captain", "__proto__", "SCI extra", ""])
    expect(crewRequest.safeParse({ ...body, role }).success).toBe(false);
  expect(
    crewActivityRequest.safeParse({ ...body, text: "message" }).success,
  ).toBe(false);
  expect(viewerSchema.safeParse({ displayName: "Alice\u202e" }).success).toBe(
    false,
  );
  expect(viewerSchema.safeParse({ displayName: " " }).success).toBe(false);
  expect(crewConfig.parse({}).activeDutyMs).toBe(20 * 60000);
  expect(crewConfig.safeParse({ activeDutyMs: 0 }).success).toBe(false);
});
test("Crew facts omit unavailable fuel and preserve observed context without fabricated placeholders", () => {
  const e = { type: "elite.ship.fuel.low", payload: {} } as DomainEvent;
  const d = { title: "Known fact", subtitle: "" } as PresentationDefinition;
  expect(crewFacts(e, d)).toEqual(["Seuil d'alerte Elite : réserve < 25 %"]);
  for (const fuelMain of [null, "unknown", -1, NaN])
    expect(crewFacts({ ...e, payload: { fuelMain } }, d)).toHaveLength(1);
  expect(crewFacts({ ...e, payload: { fuelMain: 0 } }, d)).toContain(
    "Réservoir principal observé : 0.0 t",
  );
  expect(crewFacts({ ...e, type: "shipos.editorial.moment" }, d)).toEqual([
    "Known fact",
  ]);
});
