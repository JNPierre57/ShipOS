import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { RunContext } from "./runtime.js";
import { shipRequest } from "./ship-command.js";
import type { ScreenCommands } from "./screen-command.js";
export function shipCommandApi(
  app: FastifyInstance,
  run: RunContext,
  dataDir: string,
  screen?: ScreenCommands,
) {
  const path = join(dataDir, "chat-bridge.token");
  if (!existsSync(path))
    writeFileSync(path, randomBytes(32).toString("hex"), {
      mode: 0o600,
      flag: "wx",
    });
  const token = readFileSync(path, "utf8").trim();
  if (token.length < 32) throw Error("Invalid chat bridge token");
  if (screen)
    app.get<{ Params: { id: string } }>("/api/v1/screens/:id", (req, reply) => {
      const bytes = screen.image(req.params.id);
      if (!bytes) return reply.code(404).send({ error: "Not found" });
      return reply
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .type("image/jpeg")
        .send(bytes);
    });
  for (const command of ["ship", "loadout", "screen"] as const) {
    if (command === "screen" && !screen) continue;
    app.get(`/api/v1/commands/${command}/status`, () =>
      command === "screen"
        ? screen!.snapshot()
        : run.shipCommands.snapshot(command),
    );
    let lastLogged = "";
    app.post(
      `/api/v1/commands/${command}`,
      {
        bodyLimit: 2048,
        preValidation: async (req, reply) => {
          const got = Buffer.from(req.headers.authorization ?? ""),
            expected = Buffer.from("Bearer " + token);
          if (got.length !== expected.length || !timingSafeEqual(got, expected))
            return reply.code(401).send({ error: "Unauthorized" });
        },
      },
      async (req, reply) => {
        const parsed = shipRequest.safeParse(req.body);
        if (!parsed.success)
          return reply.code(400).send({ error: "Invalid command" });
        const result =
          command === "screen"
            ? await screen!.execute(parsed.data)
            : run.shipCommands.execute(parsed.data, command);
        const key = result.status + ":" + result.reason;
        if (
          !["cooldown", "duplicate"].includes(result.reason) &&
          key !== lastLogged
        ) {
          app.log.info(
            { command, status: result.status, reason: result.reason },
            "Chat command",
          );
          lastLogged = key;
        }
        return result;
      },
    );
  }
}
