import type { CSSProperties } from "react";
import type { VisualCard } from "./visuals.js";
const labels = {
  NAV: "NAVIGATION",
  SCI: "SCIENCE",
  ENG: "ENGINEERING",
  TAC: "TACTICAL",
};
const icons = {
  NAV: (
    <>
      <path d="M24 5 37 40 24 32 11 40Z" />
      <path d="M24 5v27" />
    </>
  ),
  SCI: (
    <>
      <circle cx="24" cy="24" r="5" />
      <ellipse cx="24" cy="24" rx="19" ry="9" transform="rotate(-45 24 24)" />
      <ellipse cx="24" cy="24" rx="19" ry="9" transform="rotate(45 24 24)" />
    </>
  ),
  ENG: (
    <>
      <path d="m12 7 7 7-5 5-7-7v12l17 17 9-9-17-17Z" />
      <path d="m28 14 7-7 6 6-7 7M7 41l9-9" />
    </>
  ),
  TAC: (
    <>
      <path d="M6 17V6h11m14 0h11v11M6 31v11h11m14 0h11V31M24 12v24M12 24h24" />
      <circle cx="24" cy="24" r="7" />
    </>
  ),
};
export function CrewCommunication({ card }: { card: VisualCard }) {
  const comm = card.comm!;
  const elapsed = Math.max(0, Date.now() - card.startedAt);
  return (
    <section
      className="card crew-comm"
      data-comm={comm.department}
      data-profile={card.profile}
      data-assignment={comm.assignment || undefined}
      style={
        {
          "--comm-accent": card.accent,
          "--comm-age": `-${elapsed}ms`,
        } as CSSProperties
      }
    >
      <header>
        <span className="comm-beacon" aria-hidden="true" />
        <span>
          {comm.assignment ? "CREW ASSIGNMENT" : "COMM"} //{" "}
          {labels[comm.department]}
        </span>
        <small>{card.mode === "live" ? "BRIDGE / LINK" : "SIMULATION"}</small>
      </header>
      <div className="comm-officer">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          {icons[comm.department]}
        </svg>
        <div>
          <small>
            {comm.assignment ? "AFFECTATION" : "OFFICIER DE PASSERELLE"}
          </small>
          <strong>@{comm.displayName.replace(/^@/, "")}</strong>
        </div>
      </div>
      <div className="comm-body">
        <p>{comm.message}</p>
        <div className="comm-facts">
          {comm.facts
            .slice(0, card.profile === "COMPACT" ? 1 : 3)
            .map((line, i) => (
              <div key={i}>{line}</div>
            ))}
        </div>
      </div>
      <footer>
        <span>SHIPOS / CREW</span>
        <i aria-hidden="true" />
        <span>{comm.department}</span>
      </footer>
    </section>
  );
}
