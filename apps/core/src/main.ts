import { join } from "node:path";
import { acquireLock } from "./process-lock.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
const token = process.env.SHIPOS_AGENT_TOKEN;
if (!token || token.length < 16)
  throw Error("SHIPOS_AGENT_TOKEN must contain at least 16 characters");
const config = loadConfig();
const release = acquireLock(join(config.dataDir, "core.lock"));
let server;
try {
  server = await createServer(config, token);
  await server.start();
} catch (error) {
  release();
  throw error;
}
process.once("exit", release);
console.log("ShipOS Core ready.");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
