import { z } from "zod";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { timingSafeEqual } from "node:crypto";
import {
  helloSchema,
  sourceSchema,
} from "../../../packages/contracts/src/index.js";
import { Store } from "./store.js";
export async function createGateway(
  store: Store,
  token: string,
  onAccepted: () => void = () => {},
  heartbeatMs = 10000,
  staleMs = 30000,
  afterCommit?: () => boolean,
  onDisconnected: () => void = () => {},
  onConnection: (detail: {
    connected: boolean;
    generation: number;
    sequence: number;
    closeCode?: number;
  }) => void = () => {},
) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });
  const status = {
    connected: false,
    lastHeartbeat: 0,
    agentId: "",
    agentVersion: "",
    protocolVersion: 1,
    sequence: 0,
    spoolDepth: 0,
    reconnectCount: 0,
    sourceFile: "",
    byteOffset: 0,
  };
  let active: import("ws").WebSocket | undefined;
  app.get(
    "/agent/v1/ws",
    {
      websocket: true,
      preValidation: async (req, reply) => {
        const got = Buffer.from(req.headers.authorization ?? "");
        const expected = Buffer.from("Bearer " + token);
        if (got.length !== expected.length || !timingSafeEqual(got, expected))
          await reply.code(401).send({ error: "Unauthorized" });
      },
    },
    (socket) => {
      let agentId: string | undefined;
      let lastSeen = Date.now();
      const timer = setInterval(() => {
        if (Date.now() - lastSeen > staleMs) socket.terminate();
        else socket.ping();
      }, heartbeatMs);
      socket.on("pong", () => {
        lastSeen = Date.now();
        status.lastHeartbeat = lastSeen;
      });
      socket.on("message", (raw) => {
        try {
          lastSeen = Date.now();
          status.lastHeartbeat = lastSeen;
          const m = JSON.parse(raw.toString()) as {
            type: string;
            event?: unknown;
          };
          if (!agentId) {
            const h = helloSchema.parse(m);
            if (active && active !== socket)
              active.close(1008, "Agent replaced");
            active = socket;
            agentId = h.agentId;
            status.connected = true;
            status.agentId = agentId;
            status.agentVersion = h.agentVersion;
            status.spoolDepth = h.spoolDepth ?? 0;
            status.reconnectCount++;
            status.sequence = store.ack(agentId);
            onConnection({
              connected: true,
              generation: status.reconnectCount,
              sequence: status.sequence,
            });
            socket.send(
              JSON.stringify({
                type: "welcome",
                protocolVersion: 1,
                serverVersion: "1.0.0",
                sequence: status.sequence,
              }),
            );
            return;
          }
          if (m.type === "agent_status") {
            const info = z
              .strictObject({
                type: z.literal("agent_status"),
                spoolDepth: z.number().int().nonnegative(),
              })
              .parse(m);
            status.spoolDepth = info.spoolDepth;
            return;
          }
          if (m.type !== "source_event") throw Error("Expected source_event");
          const e = sourceSchema.parse(m.event);
          if (e.agentId !== agentId) throw Error("Agent identity mismatch");
          const sequence = store.accept(e);
          status.sequence = sequence;
          status.sourceFile = e.sourceRecord.filename;
          status.byteOffset = e.sourceRecord.byteEnd ?? 0;
          if (afterCommit?.() === false) {
            socket.terminate();
            return;
          }
          socket.send(JSON.stringify({ type: "ack", sequence }));
          onAccepted();
        } catch {
          socket.send(
            JSON.stringify({
              type: "error",
              code: "invalid_protocol_or_sequence",
              afterSequence: agentId ? store.ack(agentId) : 0,
            }),
          );
          socket.close(1008, "Protocol or sequence error");
        }
      });
      socket.on("error", () => {});
      socket.on("close", (closeCode) => {
        clearInterval(timer);
        if (active === socket) {
          status.connected = false;
          active = undefined;
          onConnection({
            connected: false,
            generation: status.reconnectCount,
            sequence: status.sequence,
            closeCode,
          });
          onDisconnected();
        }
      });
    },
  );
  return { app, status, dropConnection: () => active?.terminate() };
}
