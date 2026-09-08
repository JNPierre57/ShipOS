import { acquireLock } from "./process-lock.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, mkdirSync } from "node:fs";
import { z } from "zod";
import { createLogger } from "./logging.js";
import { Spool } from "./spool.js";
import { Tailer } from "./tailer.js";
import { Transport } from "./transport.js";
const schema = z.strictObject({
  journalDir: z
    .string()
    .default(
      join(
        homedir(),
        "Saved Games",
        "Frontier Developments",
        "Elite Dangerous",
      ),
    ),
  dataDir: z
    .string()
    .default(join(process.env.LOCALAPPDATA ?? homedir(), "ShipOS", "Agent")),
  url: z.url().refine(
    (url) => {
      const u = new URL(url);
      return (
        ["ws:", "wss:"].includes(u.protocol) &&
        !u.search &&
        !u.hash &&
        !u.username &&
        !u.password
      );
    },
    { message: "Use ws/wss URL without credentials or query parameters" },
  ),
  heartbeatMs: z.number().positive().default(10000),
  staleMs: z.number().positive().default(30000),
  reconnectMs: z.number().positive().default(1000),
  maxBackoffMs: z.number().positive().default(30000),
  window: z.number().int().min(1).max(1024).default(256),
  pollMs: z.number().min(100).default(1000),
});
const raw = process.env.SHIPOS_AGENT_CONFIG
  ? JSON.parse(readFileSync(process.env.SHIPOS_AGENT_CONFIG, "utf8"))
  : {};
if (process.env.SHIPOS_DATA_DIR) raw.dataDir = process.env.SHIPOS_DATA_DIR;
const config = schema.parse(raw);
const token = process.env.SHIPOS_AGENT_TOKEN;
if (!token || token.length < 16)
  throw Error("SHIPOS_AGENT_TOKEN must contain at least 16 characters");
mkdirSync(config.dataDir, { recursive: true });
const logger = createLogger(join(config.dataDir, "logs"));
const release = acquireLock(join(config.dataDir, "agent.lock"));
process.once("exit", release);
const spool = new Spool(config.dataDir);
const tailer = new Tailer(config.journalDir, spool, (detail) =>
  logger.warn(detail, "Agent diagnostic"),
);
const transport = new Transport(spool, { ...config, token }, (code) =>
  logger.warn({ code }, "Agent connection"),
);
tailer.start(config.pollMs);
transport.start();
const pump = setInterval(() => transport.pump(), config.pollMs);
logger.info({ agentId: spool.state.agentId }, "ShipOS Agent started");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    clearInterval(pump);
    tailer.stop();
    transport.stop();
    spool.save();
    logger.info("Agent stopped");
  });
