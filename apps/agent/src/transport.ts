import WebSocket from "ws";
import { Spool } from "./spool.js";
export interface TransportConfig {
  url: string;
  token: string;
  heartbeatMs: number;
  staleMs: number;
  reconnectMs: number;
  maxBackoffMs: number;
  window: number;
}
export class Transport {
  socket?: WebSocket;
  private stopped = false;
  private ready = false;
  private sent = 0;
  private retries = 0;
  private lastSeen = 0;
  private timer?: ReturnType<typeof setInterval>;
  private reconnect?: ReturnType<typeof setTimeout>;
  constructor(
    readonly spool: Spool,
    readonly config: TransportConfig,
    readonly diagnostic: (code: string) => void = () => {},
  ) {}
  start() {
    this.stopped = false;
    this.connect();
    this.timer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        if (Date.now() - this.lastSeen > this.config.staleMs) {
          this.socket.terminate();
          return;
        }
        this.socket.ping();
        if (this.ready)
          this.socket.send(
            JSON.stringify({
              type: "agent_status",
              spoolDepth: this.spool.pending().length,
            }),
          );
        this.pump();
      }
    }, this.config.heartbeatMs);
  }
  private connect() {
    if (this.stopped) return;
    const socket = new WebSocket(this.config.url, {
      headers: { Authorization: "Bearer " + this.config.token },
      maxPayload: 1024 * 1024,
    });
    this.socket = socket;
    this.ready = false;
    socket.on("open", () => {
      this.lastSeen = Date.now();
      socket.send(
        JSON.stringify({
          type: "hello",
          protocolVersion: 1,
          agentId: this.spool.state.agentId,
          agentVersion: "1.0.0",
          lastAckedSequence: this.spool.state.acked,
          spoolDepth: this.spool.pending().length,
        }),
      );
    });
    socket.on("pong", () => {
      this.lastSeen = Date.now();
    });
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as {
          type: string;
          sequence?: number;
          protocolVersion?: number;
        };
        this.lastSeen = Date.now();
        if (message.type === "error")
          throw Error("Gateway rejected protocol/event");
        if (message.type === "welcome") {
          if (message.protocolVersion !== 1) throw Error("Protocol mismatch");
          this.ready = true;
          this.sent = message.sequence ?? 0;
          this.retries = 0;
        }
        if (message.type === "welcome" || message.type === "ack") {
          if (!Number.isSafeInteger(message.sequence))
            throw Error("Invalid ACK");
          this.spool.ack(message.sequence!);
          if (
            this.spool.state.acked === this.spool.state.nextSequence - 1 ||
            this.spool.events.filter(
              (e) => e.sequence <= this.spool.state.acked,
            ).length >= 256
          )
            this.spool.compact();
          this.pump();
        }
      } catch {
        this.diagnostic("protocol_or_resync_error");
        socket.close(1008, "Resync required");
      }
    });
    socket.on("error", () => this.diagnostic("connection_error"));
    socket.on("close", () => {
      this.ready = false;
      if (!this.stopped) {
        const base = Math.min(
          this.config.maxBackoffMs,
          this.config.reconnectMs * 2 ** Math.min(this.retries++, 15),
        );
        this.reconnect = setTimeout(
          () => this.connect(),
          base * (0.8 + Math.random() * 0.4),
        );
      }
    });
  }
  pump() {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return;
    for (const event of this.spool.pending()) {
      if (event.sequence <= this.sent) continue;
      if (event.sequence > this.spool.state.acked + this.config.window) break;
      this.socket.send(JSON.stringify({ type: "source_event", event }));
      this.sent = event.sequence;
    }
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.reconnect);
    this.socket?.terminate();
  }
}
