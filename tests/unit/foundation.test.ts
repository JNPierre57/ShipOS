import { test, expect } from "vitest";
import { sourceSchema, matches } from "../../packages/contracts/src/index.js";
test("strict envelope, permissive raw payload", () => {
  const x = {
    schemaVersion: 1,
    id: "a",
    agentId: "a",
    sequence: 1,
    source: "elite.status",
    mode: "bootstrap",
    observedAt: "2026-09-08T10:00:00Z",
    sourceTimestamp: null,
    sourceRecord: { filename: "Status.json", contentHash: "x" },
    payload: { FutureField: 42 },
  };
  expect(sourceSchema.parse(x).payload.FutureField).toBe(42);
  expect(sourceSchema.safeParse({ ...x, extra: true }).success).toBe(false);
});
test("subscription filters", () => {
  expect(matches("elite.ship.destroyed", ["elite.ship.*"])).toBe(true);
  expect(matches("elite.ship.destroyed", ["elite.exploration.*"])).toBe(false);
});
test("DynamicChatOverlay fixture consumer deduplicates public event IDs", async () => {
  const { DomainConsumer } =
    await import("../../packages/testkit/src/domain-consumer.js");
  const { domainSchema } =
    await import("../../packages/contracts/src/index.js");
  const consumer = new DomainConsumer();
  const e = domainSchema.parse({
    schemaVersion: 1,
    id: "stable",
    sequence: 1,
    type: "elite.ship.destroyed",
    occurredAt: "2026-09-08T10:00:00Z",
    emittedAt: "2026-09-08T10:00:00Z",
    semanticKey: "test",
    sourceEventIds: [],
    payload: {},
    provenance: { mode: "live", sourceIds: [], quality: "derived" },
  });
  consumer.consume(e);
  consumer.consume(e);
  expect(consumer.received).toHaveLength(1);
  expect(consumer.afterSequence).toBe(1);
});
