# Architecture

Four applications, four shared packages, five statically registered modules. `apps/core/src/modules.ts` is the registry. No arbitrary runtime code loading.

Agent has no SQL, modules, presentation or server. It uses deterministic record identity, JSONL durable append, checkpoint recovery and bounded in-flight WebSocket delivery. SQLite belongs solely to Core. Core listens locally on two configured ports; UI is a client and may be closed at any time.

`Store.accept` uses one SQLite transaction for inbox and contiguous ingest sequence; Gateway sends ACK only after it returns. No network exactly-once claim is made. Retransmission plus durable IDs gives effectively-once business processing. `RunContext.process` commits reducer state, module storage/records, DomainEvents and processed source marker together. The outbox dispatches afterwards. A retry preserves IDs. Director decisions keyed by event ID prevent repeated presentations after outbox redelivery.

WorldState is a pure reducer output and is frozen before entering modules. Unknown is explicit. Modules receive namespaced storage and records services, validated config and diagnostic logging. Exceptions roll back their savepoint and trip the configurable wrapper; SQL failures propagate to the durable processor. Module hooks are synchronous; an accidentally returned/rejected Promise is contained and marks the hook failed.

The bus branches independently to External API and Director. PresentationEngine owns timers and AbortController. A run owns its audio sources. Overlay uses CSS animation and Web Audio, no continuous idle animation loop. Closed/disconnected clients never own Core liveness.

Simulation and replay allocate new in-memory Store/RunContext/Clock instances. Non-live RunContext rejects persistent stores. External publication is structurally disabled. Up to 20 isolated runs are retained; older runs are cancelled and closed. Replay upload content is parsed in memory, not written into the Agent Journal directory.

Production serves Vite builds from Core. Dev Vite servers are unnecessary. Data, secrets and logs belong outside source control. Native Node processes acquire data-directory locks. Runtime filesystem/network/OBS responsibilities remain outside modules.
