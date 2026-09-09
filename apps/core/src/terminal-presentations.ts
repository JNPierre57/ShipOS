import type { DomainEvent } from "../../../packages/contracts/src/index.js";
import type { PresentationDefinition } from "../../../packages/module-sdk/src/index.js";
export function terminalPresentation(
  event: DomainEvent,
  definition: PresentationDefinition,
): PresentationDefinition {
  if (definition.terminal) return definition;
  const fatal = event.type === "elite.ship.destroyed",
    hull = event.type === "elite.ship.hull.critical",
    fuel = event.type === "elite.ship.fuel.low";
  const primitive = fatal
    ? "FatalSequence"
    : hull
      ? "IncidentPanel"
      : "ConsoleStrip";
  const lines = fatal
    ? [
        "VESSEL SIGNAL LOST",
        "COMMAND LINK TERMINATED",
        "SESSION RECORD PRESERVED",
      ]
    : hull
      ? ["HULL INTEGRITY CRITICAL", "PRIORITY OVERRIDE ENGAGED"]
      : fuel
        ? ["FUEL RESERVE WARNING"]
        : definition.visual === "biology"
          ? [
              definition.title,
              definition.detail ?? "BIOLOGICAL DISCOVERY",
              `${definition.metric ?? "UNKNOWN"} CR / ESTIMATED BASE`,
            ]
          : [
              definition.title,
              definition.subtitle,
              definition.detail ?? "",
            ].filter(Boolean);
  return {
    ...definition,
    layers: ["EventLayer"],
    durationMs: fatal ? 8000 : hull ? 6500 : 5000,
    terminal: {
      primitive,
      severity: fatal || hull ? "critical" : fuel ? "warning" : "notice",
      label: fatal
        ? "SHIPOS / FATAL"
        : hull
          ? "SHIPOS / INCIDENT"
          : fuel
            ? "SHIPOS / RESERVES"
            : "SHIPOS / DISCOVERY",
      lines: lines.slice(0, 3),
      timingMs: 450,
      emphasis: 0,
    },
  };
}
