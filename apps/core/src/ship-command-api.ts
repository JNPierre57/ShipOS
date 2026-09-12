import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { RunContext } from "./runtime.js";
import { shipRequest } from "./ship-command.js";
export function shipCommandApi(
  app: FastifyInstance,
  run: RunContext,
  dataDir: string,
) {
  const path = join(dataDir, "chat-bridge.token");
  if (!existsSync(path))
    writeFileSync(path, randomBytes(32).toString("hex"), {
      mode: 0o600,
      flag: "wx",
    });
  const token = readFileSync(path, "utf8").trim();
  if (token.length < 32) throw Error("Invalid chat bridge token");
  app.get("/api/v1/commands/ship/status", () => ({
    available: !run.shipCommands.reason(),
    reason: run.shipCommands.reason(),
    config: run.shipCommands.config(),
  }));
  let lastLogged = "";
  app.post(
    "/api/v1/commands/ship",
    {
      bodyLimit: 2048,
      preValidation: async (req, reply) => {
        const got = Buffer.from(req.headers.authorization ?? ""),
          expected = Buffer.from("Bearer " + token);
        if (got.length !== expected.length || !timingSafeEqual(got, expected))
          return reply.code(401).send({ error: "Unauthorized" });
      },
    },
    (req, reply) => {
      const parsed = shipRequest.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "Invalid command" });
      const result = run.shipCommands.execute(parsed.data);
      const key = result.status + ":" + result.reason;
      if (
        !["cooldown", "duplicate"].includes(result.reason) &&
        key !== lastLogged
      ) {
        app.log.info(
          { command: "ship", status: result.status, reason: result.reason },
          "Chat command",
        );
        lastLogged = key;
      }
      return result;
    },
  );
}
