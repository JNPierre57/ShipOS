import { createHash } from "node:crypto";
import type { SourceEvent } from "../../contracts/src/index.js";
export function source(
  payload: Record<string, unknown>,
  sequence = 1,
  mode: SourceEvent["mode"] = "live",
): SourceEvent {
  const timestamp =
    typeof payload.timestamp === "string"
      ? payload.timestamp
      : "2026-09-08T10:00:00Z";
  return {
    schemaVersion: 1,
    id: createHash("sha256")
      .update(JSON.stringify([payload, sequence, mode]))
      .digest("hex"),
    agentId: "fixture-agent",
    sequence,
    source: payload.event === "Status" ? "elite.status" : "elite.journal",
    mode,
    observedAt: timestamp,
    sourceTimestamp: timestamp,
    sourceRecord: {
      filename: "Journal.synthetic.log",
      byteStart: sequence * 100,
      byteEnd: (sequence + 1) * 100,
      contentHash: createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
    },
    payload,
  };
}
