import WebSocket from "ws";
import { domainSchema, type DomainEvent } from "../../contracts/src/index.js";
/** Fixture representing an independent DynamicChatOverlay consumer; no real project integration. */
export class DomainConsumer {
  seen = new Set<string>();
  afterSequence = 0;
  received: DomainEvent[] = [];
  resyncRequired = false;
  socket?: WebSocket;
  constructor(readonly patterns: string[] = ["elite.*"]) {}
  consume(event: DomainEvent) {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    this.afterSequence = Math.max(this.afterSequence, event.sequence);
    this.received.push(event);
  }
  async connect(url: string) {
    const ws = new WebSocket(url);
    this.socket = ws;
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as {
        type: string;
        event?: unknown;
      };
      if (message.type === "domain_event")
        this.consume(domainSchema.parse(message.event));
      if (message.type === "resync_required") this.resyncRequired = true;
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("error", reject);
      ws.once("open", () => {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            patterns: this.patterns,
            afterSequence: this.afterSequence,
          }),
        );
        resolve();
      });
    });
  }
  close() {
    this.socket?.terminate();
  }
}
