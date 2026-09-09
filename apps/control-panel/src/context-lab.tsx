import { useEffect, useState } from "react";
import type { ContextState, Category } from "../../core/src/context.js";
import type { ShipMemory } from "../../core/src/context-service.js";
import type { Editorial } from "../../core/src/editorial.js";
type Snapshot = ContextState & {
  ship: ShipMemory | null;
  editorial?: ReturnType<Editorial["snapshot"]>;
};
export function ContextLab() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [category, setCategory] = useState<Category>("combat"),
    [error, setError] = useState(""),
    [rawEvidence, setRawEvidence] = useState<unknown>(null),
    [vehicles, setVehicles] = useState<unknown>(null),
    [runId, setRunId] = useState("live"),
    [runs, setRuns] = useState<
      { id: string; mode: string; state: string; context: Snapshot }[]
    >([]),
    [history, setHistory] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [live, isolated] = await Promise.all([
          fetch("/api/v1/context"),
          fetch("/api/v1/runs"),
        ]);
        if (!live.ok || !isolated.ok) throw Error("Context unavailable");
        const [s, r] = await Promise.all([live.json(), isolated.json()]);
        if (active) {
          setSnapshot(s);
          setRuns(r);
          setError("");
        }
      } catch (e) {
        if (active) setError(String(e));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const data =
    runId === "live" ? snapshot : runs.find((r) => r.id === runId)?.context;
  const selected = data?.activities.find((a) => a.category === category);
  const ship = data?.ship;
  return (
    <div className="context-lab">
      <header className="page-heading">
        <div>
          <div className="eyebrow">SHIPOS / CONTEXT LAB / RULESET 1</div>
          <h1>What the signals support.</h1>
          <p>
            Observed facts, derived states and labelled inferences. Scores
            describe recent evidence, never player intent.
          </p>
        </div>
      </header>
      <label>
        Inspect{" "}
        <select
          aria-label="Inspect run"
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
        >
          <option value="live">Live · persistent memory</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.mode} · {r.state} · {r.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Waiting for context…</p>
      ) : (
        <>
          <section className="panel">
            <div className="context-phase">
              <strong>{data.phase}</strong>
              <span>
                since {new Date(data.since).toLocaleTimeString()} ·{" "}
                {data.lastSourceAt === null
                  ? "No telemetry"
                  : `last observation ${new Date(data.lastSourceAt).toLocaleTimeString()}`}
              </span>
            </div>
            <div className="context-dimensions">
              {Object.entries(data.dimensions).map(([name, value]) => (
                <div key={name}>
                  <label>
                    {name}
                    <b>{Math.round(value)}</b>
                  </label>
                  <meter min={0} max={100} value={value} />
                </div>
              ))}
            </div>
          </section>
          <div className="context-columns">
            <section className="panel">
              <h2>Activity evidence</h2>
              {data.activities.map((a) => (
                <button
                  className={
                    "context-activity " +
                    (category === a.category ? "selected" : "")
                  }
                  key={a.category}
                  onClick={() => setCategory(a.category)}
                >
                  <span>
                    {a.category}
                    <small>
                      {a.status} · {a.quality}
                    </small>
                  </span>
                  <meter min={0} max={1} value={a.score} />
                  <span>
                    {Math.round(a.score * 100)}%
                    <small>confidence {Math.round(a.confidence * 100)}%</small>
                  </span>
                </button>
              ))}
            </section>
            <section className="panel">
              <h2>{category} / reasons</h2>
              <p>
                Contribution = weight × remaining TTL. Confidence measures the
                rule's evidential strength, not a probability of intent.
              </p>
              {!selected?.evidence.length ? (
                <p>No fresh supporting evidence.</p>
              ) : (
                selected.evidence.map((e) => (
                  <article className="context-evidence" key={e.id}>
                    <strong>{e.evidence}</strong>
                    <p>
                      {e.provenance} · {e.source}
                    </p>
                    <dl>
                      <dt>Weight / confidence</dt>
                      <dd>
                        {e.weight} / {e.confidence}
                      </dd>
                      <dt>Age / TTL</dt>
                      <dd>
                        {Math.round(e.ageMs / 1000)}s / {e.ttlMs / 1000}s
                      </dd>
                      <dt>Current contribution</dt>
                      <dd>{e.contribution.toFixed(3)}</dd>
                    </dl>
                    <code>{e.id}</code>
                    {runId === "live" && (
                      <button
                        onClick={() =>
                          void fetch(
                            "/api/v1/context/source/" +
                              encodeURIComponent(e.sourceEventId),
                          )
                            .then((r) => r.json())
                            .then(setRawEvidence)
                            .catch((err) => setError(String(err)))
                        }
                      >
                        Inspect source
                      </button>
                    )}
                  </article>
                ))
              )}
              {rawEvidence !== null && (
                <details open>
                  <summary>Raw source and reducer inspection</summary>
                  <pre>{JSON.stringify(rawEvidence, null, 2)}</pre>
                </details>
              )}
            </section>
          </div>
          <section className="panel">
            <h2>ShipOS memory</h2>
            {runId === "live" && (
              <details>
                <summary
                  onClick={() =>
                    void fetch("/api/v1/context/vehicles")
                      .then((r) => r.json())
                      .then(setVehicles)
                      .catch((err) => setError(String(err)))
                  }
                >
                  Observed vehicle types
                </summary>
                <pre>{JSON.stringify(vehicles, null, 2)}</pre>
              </details>
            )}
            {ship ? (
              <>
                <p>
                  <b>{String(ship.name ?? ship.type)}</b> · ShipID {ship.shipId}{" "}
                  · {String(ship.type)} · {String(ship.ident ?? "unknown")}
                </p>
                <p>
                  {ship.newToShipOS
                    ? "First observation of this signature by ShipOS"
                    : "Known configuration"}{" "}
                  · {ship.observations} loadout observations
                </p>
                <p>
                  First ship observation:{" "}
                  {new Date(ship.firstSeen).toLocaleString()}
                </p>
                <code>{ship.fingerprint.hash}</code>
                <p>Previous signature: {ship.previousFingerprint ?? "none"}</p>
                <details>
                  <summary>Changed slots ({ship.diff.length})</summary>
                  <pre>{JSON.stringify(ship.diff, null, 2)}</pre>
                </details>
              </>
            ) : (
              <p>
                No complete, identified Loadout observed. Unknown is not a new
                build.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Broadcast timeline</h2>
            <details>
              <summary>
                Activity changes ({data.activityTimeline.length})
              </summary>
              {data.activityTimeline
                .slice()
                .reverse()
                .map((a, i) => (
                  <p key={i}>
                    {new Date(a.at).toLocaleTimeString()} · {a.category} ·{" "}
                    {a.active ? "evidence active" : "evidence faded"} ·
                    confidence {Math.round(a.confidence * 100)}%
                  </p>
                ))}
            </details>
            <details>
              <summary>
                Configuration changes ({data.buildTimeline.length})
              </summary>
              {data.buildTimeline
                .slice()
                .reverse()
                .map((b, i) => (
                  <p key={i}>
                    {new Date(b.at).toLocaleTimeString()} ·{" "}
                    {b.newToShipOS ? "new to ShipOS" : "known build"} ·{" "}
                    {b.hash.slice(0, 12)} · {b.changedSlots.join(", ")}
                  </p>
                ))}
            </details>
            {data.timeline
              .slice()
              .reverse()
              .map((t) => (
                <details key={t.id}>
                  <summary>
                    {new Date(t.at).toLocaleTimeString()} · {t.from} → {t.to}
                  </summary>
                  <p>{t.reason}</p>
                  <pre>{JSON.stringify(t.evidence, null, 2)}</pre>
                </details>
              ))}
            {!data.timeline.length && <p>No significant transition.</p>}
          </section>
          <section className="panel">
            <h2>Editorial memory · why this alert?</h2>
            <p>
              First occurrences, observed returns and sustained progress.
              Routine suggestions are spaced by at least 90 seconds; progress
              needs new facts and four minutes. Danger takes precedence.
            </p>
            <p>
              These are observations recorded by ShipOS, not your complete game
              history. An eligible suggestion can still be held back by the
              Director.
            </p>
            {!data.editorial?.notes.length && (
              <p>No editorial observations yet.</p>
            )}
            {data.editorial?.notes.map((note) => (
              <details key={note.id}>
                <summary>
                  {new Date(note.at).toLocaleTimeString()} · {note.family} ·{" "}
                  {note.eligible ? "eligible" : "silent"} · {note.reason}
                </summary>
                <p>
                  {(note.chosenLines ?? note.lines).join(" · ") ||
                    "Collecting evidence before speaking."}
                </p>
                <pre>
                  {JSON.stringify(
                    {
                      facts: note.facts,
                      sourceIds: note.sourceIds,
                      decision: note.decision,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))}
            <details>
              <summary>Recent durable memories</summary>
              {data.editorial?.memory.map((m, i) => (
                <p key={i}>
                  {m.kind} · {m.name} · {m.count} observations / {m.sessions}{" "}
                  sessions · last seen {new Date(m.lastSeen).toLocaleString()}
                </p>
              ))}
            </details>
          </section>
          <section className="panel">
            <h2>Session event census</h2>
            <table>
              <thead>
                <tr>
                  <th>Raw event</th>
                  <th>Count</th>
                  <th>Last observation</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.census)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([name, e]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{e.count}</td>
                      <td>{new Date(e.lastSeen).toLocaleTimeString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <h2>Durable history</h2>
            <button
              onClick={() =>
                void fetch("/api/v1/context/history")
                  .then((r) => r.json())
                  .then(setHistory)
                  .catch((e) => setError(String(e)))
              }
            >
              Load recent history
            </button>
            {history !== null && <pre>{JSON.stringify(history, null, 2)}</pre>}
          </section>
        </>
      )}
    </div>
  );
}
