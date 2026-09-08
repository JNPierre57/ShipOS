import { obsSchema } from "./obs.js";
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
export const coreSchema = z
  .strictObject({
    host: z.string().default("127.0.0.1"),
    port: z.number().int().min(1).max(65535).default(48100),
    gatewayHost: z.string().default("127.0.0.1"),
    gatewayPort: z.number().int().min(1).max(65535).default(48101),
    dataDir: z
      .string()
      .default(join(homedir(), "Library", "Application Support", "ShipOS")),
    moduleFailureThreshold: z.number().int().min(1).max(100).default(3),
    heartbeatMs: z.number().positive().default(10000),
    staleMs: z.number().positive().default(30000),
    externalWindow: z.number().int().positive().max(10000).default(1000),
    obs: obsSchema.default({
      enabled: false,
      host: "127.0.0.1",
      port: 4455,
      allowedInputs: [],
    }),
    backupRetention: z.number().int().positive().default(10),
  })
  .refine((c) => c.port !== c.gatewayPort, {
    message: "Core and gateway ports must differ",
  });
export type CoreConfig = z.infer<typeof coreSchema>;
export function loadConfig() {
  const input: Record<string, unknown> = process.env.SHIPOS_CONFIG
    ? JSON.parse(readFileSync(process.env.SHIPOS_CONFIG, "utf8"))
    : {};
  if (process.env.SHIPOS_DATA_DIR) input.dataDir = process.env.SHIPOS_DATA_DIR;
  return coreSchema.parse(input);
}
