import type { CSSProperties } from "react";
export interface VisualCard {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  profile: string;
  mode: string;
  startedAt: number;
  endsAt: number;
  slot: string;
  effect: boolean;
  visual: string;
  detail: string;
  metric: string;
  metricLabel: string;
  tags: string[];
  gauge: number;
}
export function timeline(card: VisualCard): CSSProperties {
  return {
    "--accent": card.accent,
    "--duration": `${Math.max(1, card.endsAt - card.startedAt)}ms`,
    "--offset": `${Math.min(0, card.startedAt - Date.now())}ms`,
    "--gauge": Math.max(0, Math.min(1, card.gauge)),
  } as CSSProperties;
}
function Instrument({ card }: { card: VisualCard }) {
  if (card.visual === "biology")
    return (
      <svg
        viewBox="0 0 200 200"
        className="instrument biology-instrument"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="86" className="guide" />
        <path
          d="M100 5V25 M100 175V195 M5 100H25 M175 100H195"
          className="ticks"
        />
        <g className="helix">
          <path d="M70 35C170 75 30 125 130 165 M130 35C30 75 170 125 70 165" />
          {[45, 65, 85, 105, 125, 145, 160].map((y, i) => (
            <g key={y}>
              <path
                d={`M${75 + (i % 3) * 8} ${y}H${125 - (i % 3) * 8}`}
                className="rung"
              />
              <circle cx={75 + (i % 3) * 8} cy={y} r="3" />
              <circle cx={125 - (i % 3) * 8} cy={y} r="3" />
            </g>
          ))}
        </g>
        <path d="M22 100H178" className="scan-beam" />
        <path
          d="M32 55V32H55 M145 32H168V55 M168 145V168H145 M55 168H32V145"
          className="brackets"
        />
      </svg>
    );
  if (card.visual === "orbital")
    return (
      <svg
        viewBox="0 0 200 200"
        className="instrument orbital-instrument"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="85" className="guide" />
        <circle cx="100" cy="100" r="47" className="planet" />
        <ellipse cx="100" cy="100" rx="22" ry="47" className="guide" />
        <path d="M55 86H145 M55 114H145 M100 53V147" className="guide" />
        <g className="orbit">
          <ellipse
            cx="100"
            cy="100"
            rx="91"
            ry="29"
            transform="rotate(-32 100 100)"
          />
          <circle cx="177" cy="55" r="5" />
        </g>
        <path
          d="M100 4V24 M100 176V196 M4 100H24 M176 100H196"
          className="ticks"
        />
      </svg>
    );
  if (card.visual === "signal-loss")
    return (
      <svg
        viewBox="0 0 200 200"
        className="instrument loss-instrument"
        aria-hidden="true"
      >
        <path
          className="signal-trace"
          d="M8 100H35L48 76L62 130L80 38L98 160L115 70L131 111L144 100H192"
        />
        <path className="flatline" d="M8 100H192" />
        <path
          className="brackets"
          d="M20 60V30H50 M150 30H180V60 M180 140V170H150 M50 170H20V140"
        />
      </svg>
    );
  return (
    <svg
      viewBox="0 0 200 200"
      className="instrument gauge-instrument"
      aria-hidden="true"
    >
      <path d="M48 154A74 74 0 1 1 104 174" className="gauge-track" />
      <path
        d="M48 154A74 74 0 1 1 104 174"
        pathLength="100"
        className="gauge-value"
        style={{
          strokeDasharray: `${Math.max(0, Math.min(1, card.gauge)) * 100} 100`,
        }}
      />
      {card.visual === "integrity" ? (
        <path
          className="hull-outline"
          d="M100 49L134 79L145 135L111 120L100 146L89 120L55 135L66 79Z M103 68L91 91L113 101L94 124"
        />
      ) : (
        <g className="fuel-icon">
          <path d="M72 133V68H115V133 M66 133H122 M80 78H107V99H80Z M115 88H127L139 101V125Q139 137 129 128V109H115" />
          <path d="M126 73L139 85V103" />
        </g>
      )}
    </svg>
  );
}
export function EventVisual({ card }: { card: VisualCard }) {
  return (
    <article
      data-run-id={card.id}
      data-slot={card.slot}
      data-visual={card.visual}
      className={`card ${card.profile.toLowerCase()} visual-${card.visual}`}
      style={timeline(card)}
    >
      <div className="card-grid" aria-hidden="true" />
      <div className="instrument-wrap">
        <Instrument card={card} />
        <span className="instrument-caption">
          {(
            {
              biology: "BIOSIGNATURE",
              orbital: "BODY CLASSIFICATION",
              fuel: "RESERVE WARNING",
              integrity: "DAMAGE REPORT",
              "signal-loss": "CONNECTION LOST",
            } as Record<string, string>
          )[card.visual] ?? "FLIGHT SYSTEMS"}
        </span>
      </div>
      <div className="event-copy">
        <div className="eyebrow">
          <span className="status-light" /> SHIPOS{" "}
          <span className="divider">/</span>{" "}
          {card.mode === "live" ? "FLIGHT SYSTEMS" : card.mode.toUpperCase()}
        </div>
        <h1>{card.title}</h1>
        <div className="reveal detail">{card.detail || card.subtitle}</div>
        {card.metric && (
          <div className="reveal metric-block">
            <strong>{card.metric}</strong>
            <span>{card.metricLabel}</span>
          </div>
        )}
        {card.tags.length > 0 && (
          <div className="reveal tags">
            {card.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
        {!card.detail && !card.metric && (
          <span className="sr-only">{card.subtitle}</span>
        )}
        <div className="sequence-label">
          <span className="phase-acquire">
            {card.visual === "signal-loss"
              ? "TELEMETRY INTERRUPTED"
              : "ACQUIRING SIGNAL"}
          </span>
          <span className="phase-resolved">
            {card.visual === "signal-loss"
              ? "SIGNAL LOST · EMERGENCY PROTOCOL"
              : "OBSERVATION CONFIRMED"}
          </span>
        </div>
      </div>
      <div className="life" />
    </article>
  );
}
