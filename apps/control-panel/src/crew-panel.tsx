import type { Crew } from "../../core/src/crew.js";
type Snapshot = ReturnType<Crew["snapshot"]>;
const labels = {
  NAV: "Navigation",
  SCI: "Science",
  ENG: "Engineering",
  TAC: "Tactical",
};
const reasons: Record<string, string> = {
  disabled: "Crew désactivé",
  obs_unavailable: "Connexion OBS indisponible — roster conservé",
  stream_inactive: "Stream arrêté",
  broadcast_unconfirmed: "Identification du live en cours",
  agent_unavailable: "Agent indisponible",
  game_not_active: "Elite inactif",
  awaiting_fresh_telemetry:
    "En attente d’une télémétrie de la session Elite courante",
  telemetry_stale: "Télémétrie non confirmée",
  no_active_officer: "Aucun officier récemment actif : présentation SYSTEM",
  manual_reset: "Remise à zéro manuelle",
  stream_stopped: "Fin du stream : roster supprimé",
  new_broadcast: "Nouveau live : roster vide",
  broadcast_changed: "Le live a changé : ancien roster supprimé",
};
const reason = (key: string | null) => (key ? (reasons[key] ?? key) : "Aucune");
const time = (at: number) => new Date(at).toLocaleString();
export function CrewPanel({
  data,
  act,
}: {
  data?: Snapshot;
  act?: (path: string, body: unknown) => Promise<unknown>;
}) {
  if (!data) return null;
  return (
    <section className="panel crew-panel">
      <h2>Crew · Officiers de passerelle</h2>
      <p>
        {data.available
          ? "Disponible — Stream et Elite actifs"
          : reason(data.reason)}
      </p>
      <p className="muted">
        !crew NAV / SCI / ENG / TAC · !crew leave. Plusieurs membres par
        département, un département par viewer. Les membres silencieux restent
        inscrits.
      </p>
      <dl className="crew-status">
        <dt>Crew</dt>
        <dd>{data.config.enabled ? "Activé" : "Désactivé"}</dd>
        <dt>Stream</dt>
        <dd>{data.streamActive ? "Actif" : "Inactif ou non confirmé"}</dd>
        <dt>Elite</dt>
        <dd>{data.eliteActive ? "Actif" : reason(data.eliteReason)}</dd>
        <dt>Live associé</dt>
        <dd>{data.broadcast === null ? "Aucun" : time(data.broadcast)}</dd>
      </dl>
      {act && (
        <div className="crew-controls">
          <label>
            <input
              type="checkbox"
              checked={data.config.enabled}
              onChange={(e) =>
                void act("crew/config", {
                  ...data.config,
                  enabled: e.target.checked,
                })
              }
            />{" "}
            Crew activé
          </label>
          <label>
            <input
              type="checkbox"
              checked={data.config.confirmations}
              onChange={(e) =>
                void act("crew/config", {
                  ...data.config,
                  confirmations: e.target.checked,
                })
              }
            />{" "}
            Confirmation des affectations
          </label>
          <label>
            Activité récente{" "}
            <select
              aria-label="Fenêtre active duty"
              value={data.config.activeDutyMs}
              onChange={(e) =>
                void act("crew/config", {
                  ...data.config,
                  activeDutyMs: Number(e.target.value),
                })
              }
            >
              {[
                ...new Set([
                  600000,
                  900000,
                  1200000,
                  1800000,
                  data.config.activeDutyMs,
                ]),
              ]
                .sort((a, b) => a - b)
                .map((ms) => (
                  <option key={ms} value={ms}>
                    {ms / 60000} min
                  </option>
                ))}
            </select>
          </label>
          <button onClick={() => void act("crew/reset", {})}>RESET CREW</button>
        </div>
      )}
      <div className="crew-roster">
        {Object.entries(labels).map(([d, label]) => (
          <article key={d}>
            <h3>
              {d} · {label}
            </h3>
            {data.departments[d]?.length ? (
              <ul>
                {data.departments[d]!.map((m, i) => (
                  <li key={i}>
                    <strong>@{m.displayName}</strong>
                    <span className={m.active ? "good" : "muted"}>
                      {m.active ? "En service" : "Silencieux"}
                    </span>
                    <small>Dernier message : {time(m.lastActivity)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Aucun membre</p>
            )}
          </article>
        ))}
      </div>
      <p>
        Dernier officier :{" "}
        {data.lastOfficer
          ? `@${data.lastOfficer.displayName} · ${data.lastOfficer.department} · ${time(data.lastOfficer.at)}`
          : "Aucun"}
      </p>
      <p>
        Dernière communication : {data.lastCommunication?.message ?? "Aucune"}
      </p>
      <p className="muted">
        Dernier repli / refus : {reason(data.lastSuppression)}
      </p>
    </section>
  );
}
