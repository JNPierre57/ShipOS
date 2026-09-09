import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { ContextLab } from "./context-lab.js";
type Data = Record<string, unknown>;
const pages = [
  "Overview",
  "Context Lab",
  "Events",
  "Director",
  "Modules",
  "Simulation",
  "Replay",
  "Agent",
  "World State",
  "Expedition",
  "Overlay",
  "Audio",
  "System",
];
async function api(path: string, body?: unknown) {
  const response = await fetch(
    "/api/v1/" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw Error(
      typeof data.error === "string" ? data.error : JSON.stringify(data.error),
    );
  return data;
}
const Json = ({ value }: { value: unknown }) => (
  <pre>{JSON.stringify(value, (_k, v) => (v === null ? "UNKNOWN" : v), 2)}</pre>
);
function App() {
  const [page, setPage] = useState(
      new URLSearchParams(location.search).get("view") === "context"
        ? "Context Lab"
        : "Overview",
    ),
    [status, setStatus] = useState<Data>({}),
    [events, setEvents] = useState<Data[]>([]),
    [olderEvents, setOlderEvents] = useState<Data[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [detail, setDetail] = useState<unknown>(null),
    [extra, setExtra] = useState<unknown>(null),
    [runs, setRuns] = useState<Data[]>([]),
    [expeditionName, setExpeditionName] = useState("Into the black"),
    [level, setLevel] = useState("source"),
    [scenario, setScenario] = useState("Everything Goes Wrong"),
    [eventType, setEventType] = useState("elite.ship.destroyed"),
    [speed, setSpeed] = useState("instant"),
    [files, setFiles] = useState<File[]>([]),
    [volumes, setVolumes] = useState<Record<string, number>>({
      master: 0.5,
      alerts: 0.7,
      effects: 0.6,
      ambience: 0.3,
      voice: 0.8,
    });
  const refresh = async () => {
    const [s, e, r] = await Promise.all([
      api("status"),
      api("events"),
      api("runs"),
    ]);
    setStatus(s);
    setEvents(e);
    setRuns(r);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
    void api("audio").then(setVolumes);
    const timer = setInterval(
      () => void refresh().catch((e) => setError(String(e))),
      3000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    setDetail(null);
    setExtra(null);
    if (page === "Director") void api("decisions").then(setExtra);
    if (page === "Events") void api("sources").then(setExtra);
    if (page === "Expedition") void api("records").then(setExtra);
  }, [page]);
  const act = async (path: string, body: unknown) => {
    try {
      setError("");
      const value = await api(path, body);
      setNotice("Saved · " + new Date().toLocaleTimeString());
      await refresh();
      return value;
    } catch (e) {
      setError(String(e));
      return null;
    }
  };
  const agent = (status.agent ?? {}) as Data,
    director = (status.director ?? {}) as Data,
    world = (status.world ?? {}) as Data,
    modules = (status.modules ?? []) as Data[],
    activeExpedition = status.expedition as Data | null;
  const title = (text: string, description: string) => (
    <header className="page-heading">
      <div>
        <div className="eyebrow">COMMAND CENTER / {page.toUpperCase()}</div>
        <h1>{text}</h1>
        <p>{description}</p>
      </div>
      <span className="pill">
        <i /> LOCAL SYSTEM
      </span>
    </header>
  );
  const panel = (label: string, content: ReactNode) => (
    <section className="panel">
      <h2>{label}</h2>
      {content}
    </section>
  );
  const simulate = () =>
    act("simulation", {
      level,
      eventType,
      scenario: level === "source" ? scenario : "single",
      speed: 1,
    });
  let content: ReactNode;
  if (page === "Context Lab") content = <ContextLab />;
  else if (page === "Overview")
    content = (
      <>
        {title(
          "Your ship. In focus.",
          "A quiet view of the systems behind your stream.",
        )}
        <div className="metrics">
          {[
            ["Core", status.core ?? "CONNECTING", "Local orchestration"],
            [
              "Agent",
              agent.connected ? "CONNECTED" : "OFFLINE",
              "Shadow → Mac",
            ],
            [
              "Overlay",
              Number(status.overlay) > 0 ? "CONNECTED" : "OFFLINE",
              "Browser Source",
            ],
            ["Audio", status.audio ?? "DISCONNECTED", "Web Audio output"],
          ].map(([label, value, sub]) => (
            <section className="metric" key={String(label)}>
              <span>{String(label)}</span>
              <strong
                className={
                  ["OFFLINE", "DISCONNECTED"].includes(String(value))
                    ? "muted"
                    : "good"
                }
              >
                {value as string}
              </strong>
              <small>{String(sub)}</small>
            </section>
          ))}
        </div>
        <div className="grid two">
          {panel(
            "Flight context",
            <>
              <div className="system-name">
                {String(
                  (world.currentSystem as Data | undefined)?.name ??
                    "Awaiting telemetry",
                )}
              </div>
              <p className="muted">
                {String(world.commander ?? "Unknown commander")} /{" "}
                {String(world.vehicleContext ?? "unknown")}
              </p>
              <dl>
                <dt>Fuel warning</dt>
                <dd>
                  {String((world.fuel as Data | undefined)?.low ?? "unknown")}
                </dd>
                <dt>Hull integrity</dt>
                <dd>
                  {typeof world.hull === "number"
                    ? Math.round(world.hull * 100) + "%"
                    : "UNKNOWN"}
                </dd>
                <dt>Expedition</dt>
                <dd>
                  {String(activeExpedition?.name ?? "No active expedition")}
                </dd>
              </dl>
            </>,
          )}
          {panel(
            "Attention director",
            <>
              <div className="big-number">
                {Number(director.budget ?? 10).toFixed(1)}
                <small> / 10 units</small>
              </div>
              <div className="meter">
                <div
                  style={{
                    width:
                      Math.max(0, Number(director.budget ?? 10)) * 10 + "%",
                  }}
                />
              </div>
              <p className="muted">
                A bounded attention budget keeps the stream readable.
              </p>
              <button onClick={() => setPage("Director")}>
                Inspect decisions ↗
              </button>
            </>,
          )}
        </div>
        {panel(
          "Recent activity",
          events.length ? (
            <EventList
              events={events.slice(-5).reverse()}
              select={(e) => {
                setPage("Events");
                void api("events/" + e.id).then(setDetail);
              }}
            />
          ) : (
            <div className="empty">
              <span>◇</span>
              <h3>Ready for first contact</h3>
              <p>Connect the Shadow Agent or try an isolated simulation.</p>
              <button className="primary" onClick={() => setPage("Simulation")}>
                Open simulation →
              </button>
            </div>
          ),
        )}
      </>
    );
  else if (page === "Events")
    content = (
      <>
        {title(
          "Event history",
          "Follow the evidence from source telemetry to presentation.",
        )}
        {panel(
          "Live DomainEvents",
          <EventList
            events={[
              ...new Map(
                [...olderEvents, ...events].map((e) => [e.id, e]),
              ).values(),
            ].reverse()}
            select={(e) => void api("events/" + e.id).then(setDetail)}
          />,
        )}
        <button
          onClick={() => {
            const oldest = Math.min(
              ...[...olderEvents, ...events].map((e) => Number(e.sequence)),
            );
            if (Number.isFinite(oldest))
              void api("events?beforeSequence=" + oldest).then((rows: Data[]) =>
                setOlderEvents((old) => [...rows, ...old]),
              );
          }}
        >
          Load older events
        </button>
        {detail !== null &&
          panel(
            "Event Inspector · source → state → detector → decision → run",
            <Json value={detail} />,
          )}
        {panel(
          "Source Inspector · includes unclassified and bootstrap observations",
          <Json value={extra} />,
        )}
      </>
    );
  else if (page === "Director")
    content = (
      <>
        {title(
          "Attention, orchestrated.",
          "Every selection, interruption and suppression has a reason.",
        )}
        {panel("Current scheduler", <Json value={director} />)}
        {panel(
          "Decision history",
          <>
            <button onClick={() => void api("decisions").then(setExtra)}>
              Refresh decisions
            </button>
            <Json value={extra} />
          </>,
        )}
      </>
    );
  else if (page === "Modules")
    content = (
      <>
        {title(
          "Flight modules",
          "Five internal modules, one shared event pipeline.",
        )}
        <div className="grid two">
          {modules.map((m) => (
            <ModuleCard
              key={String(m.id)}
              module={m}
              save={(body) => act("modules/" + m.id, body)}
            />
          ))}
        </div>
      </>
    );
  else if (page === "Simulation")
    content = (
      <>
        {title(
          "A safe place to test.",
          "Simulation uses a separate world and database. Live records stay independent.",
        )}
        {panel(
          "Simulation controls",
          <>
            <label>
              Level
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="source">SourceEvent timeline</option>
                <option value="domain">DomainEvent → Director</option>
                <option value="presentation">Presentation only</option>
              </select>
            </label>
            {level !== "source" && (
              <label>
                Event
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                >
                  {[
                    "elite.ship.destroyed",
                    "elite.ship.hull.critical",
                    "elite.ship.fuel.low",
                    "elite.exobiology.highValueDiscovery",
                    "elite.exploration.remarkableBody",
                    "shipos.context.loadout.novel",
                    "shipos.broadcast.tension",
                    "shipos.broadcast.critical",
                    "shipos.broadcast.recovery",
                  ].map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </label>
            )}
            {level === "source" && (
              <label>
                Scenario
                <select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                >
                  {[
                    "Everything Goes Wrong",
                    "Quiet Travel",
                    "Combat Escalation",
                    "Close Call",
                    "Powerplay Combat",
                    "New Build",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
            {scenario === "Everything Goes Wrong" && (
              <div className="timeline">
                <span>00s · shields down</span>
                <span>02s · hull critical</span>
                <span>05s · low fuel</span>
                <span>08s · destroyed</span>
              </div>
            )}
            <button className="primary" onClick={() => void simulate()}>
              Launch simulation
            </button>
          </>,
        )}
        {panel(
          "Isolated run history",
          <>
            {runs.map((r) => (
              <div key={String(r.id)}>
                <button
                  onClick={() => void act("runs/" + r.id + "/cancel", {})}
                >
                  Cancel run
                </button>
                <Json value={r} />
              </div>
            ))}
          </>,
        )}
      </>
    );
  else if (page === "Replay")
    content = (
      <>
        {title(
          "Revisit the journey.",
          "Import Journal copies into an isolated replay session.",
        )}
        {panel(
          "Journal replay",
          <>
            <label>
              Journal files
              <input
                type="file"
                multiple
                accept=".log,.jsonl,.txt"
                onChange={(e) => setFiles([...(e.target.files ?? [])])}
              />
            </label>
            <label>
              Playback speed
              <select value={speed} onChange={(e) => setSpeed(e.target.value)}>
                {["1", "5", "20", "instant"].map((s) => (
                  <option key={s} value={s}>
                    {s === "instant" ? "Instant" : s + "×"}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={!files.length}
              onClick={() =>
                void Promise.all(
                  files.map(async (f) => ({
                    name: f.name,
                    content: await f.text(),
                  })),
                ).then((f) =>
                  act("replay", {
                    files: f,
                    speed: speed === "instant" ? "instant" : Number(speed),
                  }),
                )
              }
            >
              Start replay
            </button>
            <Json value={runs.filter((r) => r.mode === "replay")} />
          </>,
        )}
      </>
    );
  else if (page === "Agent")
    content = (
      <>
        {title(
          "Shadow connection",
          "Durable source delivery across your tailnet.",
        )}
        {panel("Agent diagnostics", <Json value={agent} />)}
      </>
    );
  else if (page === "World State")
    content = (
      <>
        {title(
          "World state",
          "Accumulated observations. Missing information remains UNKNOWN.",
        )}
        {panel("Live state · read only", <Json value={world} />)}
      </>
    );
  else if (page === "Expedition")
    content = (
      <>
        {title(
          "The longer journey.",
          "Keep discoveries together across multiple sessions.",
        )}
        {panel(
          "Current expedition",
          <>
            {activeExpedition ? (
              <>
                <h3>{String(activeExpedition.name)}</h3>
                <button onClick={() => void act("expeditions/end", {})}>
                  End expedition
                </button>
              </>
            ) : (
              <>
                <label>
                  Name
                  <input
                    value={expeditionName}
                    onChange={(e) => setExpeditionName(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  onClick={() =>
                    void act("expeditions/start", { name: expeditionName })
                  }
                >
                  Start expedition
                </button>
              </>
            )}
            <button onClick={() => void api("records").then(setExtra)}>
              Refresh records and sales
            </button>
            <Json value={extra} />
          </>,
        )}
      </>
    );
  else if (page === "Overlay")
    content = (
      <>
        {title(
          "Your broadcast surface.",
          "One transparent Browser Source for all ShipOS presentations.",
        )}
        {panel(
          "Preview",
          <>
            <p>
              <a href="/overlay" target="_blank" rel="noreferrer">
                Open overlay ↗
              </a>{" "}
              · 1920 × 1080 recommended
            </p>
            <button
              className="primary"
              onClick={() =>
                void act("simulation", {
                  level: "presentation",
                  scenario: "single",
                  eventType: "elite.ship.destroyed",
                  speed: 1,
                })
              }
            >
              Preview presentation
            </button>
            <iframe title="Overlay preview" src="/overlay" />
          </>,
        )}
      </>
    );
  else if (page === "Audio")
    content = (
      <>
        {title(
          "Sound, with restraint.",
          "Independent buses with short original cues and cancellable playback.",
        )}
        {panel(
          "Output mixer",
          <>
            <p className="pill">{String(status.audio ?? "DISCONNECTED")}</p>
            {Object.entries(volumes).map(([name, value]) => (
              <label className="volume" key={name}>
                {name}
                <input
                  aria-label={name + " volume"}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={value}
                  onChange={(e) =>
                    setVolumes({ ...volumes, [name]: Number(e.target.value) })
                  }
                />
                <output>{Math.round(value * 100)}%</output>
              </label>
            ))}
            <button
              className="primary"
              onClick={() => void act("audio", volumes)}
            >
              Save volumes
            </button>
            <button
              onClick={() =>
                void act("simulation", {
                  level: "presentation",
                  scenario: "single",
                  eventType: "elite.ship.fuel.low",
                  speed: 1,
                })
              }
            >
              Play test cue
            </button>
          </>,
        )}
      </>
    );
  else
    content = (
      <>
        {title(
          "System & recovery",
          "Local services, durable storage and operational checks.",
        )}
        {panel("Configuration", <Json value={status.system} />)}
        {panel(
          "Database backup",
          <>
            <button
              className="primary"
              onClick={() => void act("backup", {}).then(setDetail)}
            >
              Create backup
            </button>
            {detail !== null && <Json value={detail} />}
          </>,
        )}
      </>
    );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="brand-icon">◈</span> SHIP<span>OS</span>
        </div>
        <div className="version">FLIGHT SYSTEM / V1.0</div>
        <nav>
          {pages.map((p, i) => (
            <button
              className={p === page ? "selected" : ""}
              onClick={() => {
                setPage(p);
                setNotice("");
              }}
              key={p}
            >
              <span className="nav-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              {p}
              {p === page && <b>›</b>}
            </button>
          ))}
        </nav>
        <footer>
          <i /> LOCAL-FIRST
          <br />
          <small>Shadow ↔ Mac</small>
        </footer>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <span>
            SHIPOS <b>/</b> {page}
          </span>
          <span className="muted">ELITE DANGEROUS · STREAM SYSTEMS</span>
        </div>
        <main className="content">
          {error && (
            <div role="alert" className="error">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
            </div>
          )}
          {content}
        </main>
      </div>
    </div>
  );
}
function EventList({
  events,
  select,
}: {
  events: Data[];
  select: (event: Data) => void;
}) {
  return events.length ? (
    <div className="event-list">
      {events.map((e) => (
        <button key={String(e.id)} onClick={() => select(e)}>
          <span className="event-mark">◇</span>
          <span>
            <strong>{String(e.type)}</strong>
            <small>{String(e.occurredAt)}</small>
          </span>
          <span className="muted">#{String(e.sequence)} ↗</span>
        </button>
      ))}
    </div>
  ) : (
    <p className="muted">No live domain events yet.</p>
  );
}
function ModuleCard({
  module: m,
  save,
}: {
  module: Data;
  save: (body: unknown) => Promise<unknown>;
}) {
  const [config, setConfig] = useState(JSON.stringify(m.config, null, 2)),
    [policy, setPolicy] = useState(JSON.stringify(m.policy, null, 2)),
    [error, setError] = useState(""),
    [enabled, setEnabled] = useState(Boolean(m.enabled));
  useEffect(() => setEnabled(Boolean(m.enabled)), [m.enabled]);
  return (
    <section className="panel">
      <div className="row">
        <h2>{String(m.id)}</h2>
        <span className="pill">{String(m.health)}</span>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            void save({ enabled: e.target.checked });
          }}
        />
        Enabled
      </label>
      <label>
        Configuration
        <textarea value={config} onChange={(e) => setConfig(e.target.value)} />
      </label>
      <button
        onClick={() => {
          try {
            void save({ config: JSON.parse(config) });
            setError("");
          } catch {
            setError("Invalid JSON");
          }
        }}
      >
        Save configuration
      </button>
      <label>
        Presentation policy
        <textarea value={policy} onChange={(e) => setPolicy(e.target.value)} />
      </label>
      <button
        onClick={() => {
          try {
            void save({ policy: JSON.parse(policy) });
            setError("");
          } catch {
            setError("Invalid policy JSON");
          }
        }}
      >
        Save policy
      </button>
      {error && <p role="alert">{error}</p>}
      {m.lastFailure !== null && (
        <p className="error">{String(m.lastFailure)}</p>
      )}
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
