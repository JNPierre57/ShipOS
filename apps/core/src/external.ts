import type { FastifyInstance } from "fastify";
import {
  subscriptionSchema,
  matches,
} from "../../../packages/contracts/src/index.js";
import type { RunContext } from "./runtime.js";
export function externalApi(
  app: FastifyInstance,
  run: RunContext,
  window: number,
) {
  app.get("/api/v1/events/ws", { websocket: true }, (socket) => {
    let patterns: string[] = [];
    let cursor = 0;
    const publish = (
      event: import("../../../packages/contracts/src/index.js").DomainEvent,
    ) => {
      if (event.sequence <= cursor) return;
      cursor = event.sequence;
      if (matches(event.type, patterns)) {
        if (socket.bufferedAmount > 1024 * 1024) {
          socket.close(1013, "Slow consumer; reconnect with afterSequence");
          return;
        }
        socket.send(JSON.stringify({ type: "domain_event", event }));
      }
    };
    socket.on("message", (raw) => {
      try {
        const s = subscriptionSchema.parse(JSON.parse(raw.toString()));
        run.externalBus.delete(publish);
        const latest =
          (
            run.store.db
              .prepare("SELECT MAX(sequence) AS n FROM domain_events")
              .get() as { n: number | null }
          ).n ?? 0;
        const floor = Math.max(0, latest - window);
        if (
          s.afterSequence !== undefined &&
          (s.afterSequence < floor || s.afterSequence > latest)
        ) {
          socket.send(
            JSON.stringify({
              type: "resync_required",
              earliestSequence: floor + 1,
              latestSequence: latest,
            }),
          );
          return;
        }
        patterns = s.patterns;
        cursor = s.afterSequence ?? latest;
        socket.send(
          JSON.stringify({ type: "subscribed", latestSequence: latest }),
        );
        for (const e of run.store.events(cursor, window)) publish(e);
        run.externalBus.add(publish);
      } catch {
        socket.send(
          JSON.stringify({ type: "error", code: "invalid_subscription" }),
        );
        socket.close(1008, "Invalid subscription");
      }
    });
    socket.on("close", () => run.externalBus.delete(publish));
  });
}
