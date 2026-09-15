import type { CSSProperties } from "react";
import type { PresentationDefinition } from "../../module-sdk/src/index.js";
import type { VisualCard } from "./visuals.js";
export type TerminalDefinition = NonNullable<
  PresentationDefinition["terminal"]
>;
export function TerminalSequence({ card }: { card: VisualCard }) {
  const terminal = card.terminal!;
  const elapsed = Math.max(0, Date.now() - card.startedAt);
  const lines = terminal.lines.slice(
    0,
    card.profile === "COMPACT"
      ? 1
      : terminal.maxLines
        ? Math.min(10, terminal.maxLines)
        : terminal.primitive === "IncidentPanel"
          ? 5
          : 3,
  );
  return (
    <section
      className={`card terminal terminal-${terminal.primitive} severity-${terminal.severity}`}
      data-primitive={terminal.primitive}
      data-loadout={terminal.label === "SHIPOS / LOADOUT" ? "true" : undefined}
      data-screenshot={terminal.imagePath ? "true" : undefined}
      data-visual={card.visual}
      data-profile={card.profile}
      style={{ "--terminal-age": `-${elapsed}ms` } as CSSProperties}
    >
      <header>
        <span className="terminal-mark">[ S / OS ]</span>
        <span>{terminal.label}</span>
        <span className="terminal-status">
          {card.mode === "live" ? "LINK / ACTIVE" : card.mode.toUpperCase()}
        </span>
      </header>
      <div className="terminal-lines">
        {lines.map((line, i) => (
          <div
            key={i}
            className={i === terminal.emphasis ? "terminal-emphasis" : ""}
            style={
              {
                animationDelay: `${i * terminal.timingMs - elapsed}ms`,
              } as CSSProperties
            }
          >
            <span aria-hidden="true">{String(i + 1).padStart(2, "0")} / </span>
            {line}
          </div>
        ))}
      </div>
      {terminal.imagePath &&
        (/^\/api\/v1\/screens\/(?:gallery\/[0-9a-f-]{36}\/)?[0-9a-f-]{36}$/.test(
          terminal.imagePath,
        ) ||
          terminal.imagePath === "/overlay/fixtures/screen.svg") && (
          <img
            className="screenshot-thumbnail"
            src={terminal.imagePath}
            alt="Capture du stream"
          />
        )}
      <footer>
        <span>TELEMETRY / {terminal.severity.toUpperCase()}</span>
        <i />
      </footer>
    </section>
  );
}
