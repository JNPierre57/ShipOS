import { z } from "zod";
import {
  defaultPolicy,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";
const labels = {
  novel: "CONFIGURATION SIGNATURE UNKNOWN",
  tension: "THREAT PROFILE RISING",
  critical: "PRIORITY OVERRIDE ENGAGED",
  recovery: "RECOVERY STATE CONFIRMED",
} as const;
export const contextModules: ShipModule[] = Object.entries(labels).map(
  ([key, label]) => ({
    manifest: {
      id: "context-" + key,
      version: "1.0.0",
      name: "Context " + key,
      eventType:
        key === "novel"
          ? "shipos.context.loadout.novel"
          : (`shipos.broadcast.${key}` as "shipos.broadcast.tension"),
    },
    configSchema: z.strictObject({}),
    policy: {
      ...defaultPolicy,
      importance: key === "critical" ? 85 : 35,
      urgency: key === "critical" ? 85 : 20,
      attentionCost: key === "critical" ? 5 : 2,
      cooldownMs: key === "novel" ? 60000 : 90000,
      interruptPolicy: key === "critical" ? "if-lower-priority" : "never",
    },
    detect: () => [],
    present: () => ({
      title: label,
      subtitle:
        key === "novel"
          ? "TELEMETRY PROFILE ACQUIRED"
          : key === "recovery"
            ? "SYSTEMS STABLE"
            : "CONTEXT MONITOR",
      accent: key === "critical" ? "#db6156" : "#bacdaa",
      durationMs: key === "critical" ? 6500 : 4500,
      slot: "event",
      layers: ["EventLayer"],
      audioAsset: "audio.alert.context-" + key,
      terminal: {
        primitive:
          key === "critical"
            ? "IncidentPanel"
            : key === "recovery"
              ? "RecoverySequence"
              : key === "novel"
                ? "ConsoleStrip"
                : "SystemLine",
        severity: key === "critical" ? "critical" : "notice",
        label: "SHIPOS / " + key.toUpperCase(),
        lines: [
          label,
          ...(key === "novel"
            ? ["TELEMETRY PROFILE ACQUIRED"]
            : key === "recovery"
              ? ["SYSTEMS STABLE"]
              : []),
        ],
        timingMs: 450,
        emphasis: 0,
      },
    }),
  }),
);
