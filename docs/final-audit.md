# Final repository audit — 2026-09-08

Implementation and automated gates for phases 0–10 are complete. Native Shadow/OBS/Tailscale smoke checks remain operational validation, not executed tests. The accepted implementation limits are listed in [deviations](deviations.md); in particular, SDK hooks are synchronous.

## Reproducible results

Validated on macOS using an isolated Node **24.20.0**, TypeScript **6.0.3**, and the committed dependency lockfile. The machine's global Node installation was not modified.

| Command / check | Final result |
|---|---|
| `npm run verify:final` | PASS, exit 0 |
| ESLint / strict TypeScript | PASS |
| Unit | 26 passed |
| Integration | 20 passed |
| Golden replay | 9 passed |
| Playwright Chromium | 3 passed |
| Node and both browser production builds | PASS |
| Architectural boundary checks | PASS |
| `npm run verify:clean` | PASS: fresh npm ci and full verify:final in a path containing spaces |
| `npm run verify:agent-install` | PASS: fresh selected workspace installation/build, no better-sqlite3 runtime |
| `npm run package:agent` | PASS: release/shipos-agent with production manifest and lockfile |
| `npm audit --omit=dev --json` | 0 reported vulnerabilities on audit date |

The 58 passing test cases include parameterized cases; they are not 58 separate requirements. The mapping below identifies the combined scenarios that exercise the specification's mandatory cases. CI is configured for Node24 on macOS/Windows/Linux but remote CI and native Windows have not been executed in this session. CryptoJS has an upstream deprecation warning through the optional OBS dependency; the production audit reports no known vulnerability.

## Phase and invariant review

| Phase / specification sections | Delivered and checked |
|---|---|
| 0 — foundation (§1–7) | Four apps, shared contracts/SDK/renderer/testkit, pinned dependencies, strict TS, technical facts and source ledger. Existing external apps were not modified. |
| 1 — ingestion (§8–12) | Read-only byte-offset tailer, partial-line preservation, malformed quarantine, rotation, bounded reconciliation, Status/NavRoute hash dedupe, durable spool/checkpoint, authenticated versioned WS, bounded inflight, reconnect, ACK only after inbox COMMIT. |
| 2 — vertical slice (§17) | Real Gateway→SQLite→context-gated Died→DomainEvent→Director→browser flow. |
| 3 — infrastructure (§13–16,22–28,41) | Unknown-aware reducer, immutable body observations, deterministic IDs, durable outbox, two independent dispatch branches, scoped module storage/records, circuit breaker, decisions/budget/queue/clock, SQLite migrations/backup/restore, sessions/expeditions/milestones. |
| 4 — presentation (§32–35,42) | Cancellable engine, eight renderer slots, GlobalFx, reconnect snapshots, audio buses/catalogue/cancellation/degraded state, optional allowlisted OBS mute. No idle animation loop. |
| 5 — modules (§14,17–21) | All five modules, main-ship pre-state guard, hull episode reset, low-fuel transition, catalogue estimates and actual sales, multi-source body reasons and WasFootfalled tri-state. Config and policies are validated; unknown config keys are rejected. |
| 6 — control (§37–40) | Twelve pages, paginated Event Inspector, Director decisions, editable module config/policy, Agent cursor/spool status, world/expedition/records, audio/overlay/system/backup controls; secrets external, rotating structured logs. |
| 7 — replay (§28–31) | Three simulation levels, Everything Goes Wrong scenario, historical replay clocks at 1x/5x/20x/instant, original payload retention, separate memory stores, nine golden fixtures. |
| 8 — External API (§36) | Read-only DomainEvents, exact/prefix filters, monotone sequence/cursor, reconnect/dedupe consumer fixture, explicit gap resync, independence from presentation suppression. |
| 9 — hardening (§43–46) | Killed-process recovery, transaction fault injection, reconnect/window tests, port collisions without fallback, migration/checksum/restore, isolation, package boundary enforcement and fresh Agent install. |
| 10 — operations (§48–59) | Installation/reinstallation, Tailscale, OBS audio, configuration, protocol, backup/restore, troubleshooting, provenance/notices, testing/deviations and this audit. |

## Mandatory test mapping (§44)

Paths below are relative to the repository. Several assertions share one end-to-end test.

| Mandatory cases | Automated evidence |
|---|---|
| 1–5 network interruption, reconnect, retransmission, no loss/duplicate | tests/integration/transport.test.ts; ingest.test.ts; recovery.test.ts |
| 6 Agent crash after spool before checkpoint | tests/integration/ingest.test.ts; fixtures/agent-kill-worker.mjs |
| 7–8 durable ACK/Core crash/recovery | tests/integration/recovery.test.ts; fixtures/core-kill-worker.mjs |
| 9–11 rotation, partial EOF, malformed line | tests/integration/ingest.test.ts |
| 12–13 low-fuel initialization and transition | tests/unit/business.test.ts |
| 14–15 urgent hull interruption and episode dedupe | tests/unit/director.test.ts; business.test.ts |
| 16–18 main ship/on-foot/unknown Died | tests/unit/vertical.test.ts; tests/e2e/vertical.spec.ts |
| 19 exclusive death queue handling | tests/unit/director.test.ts |
| 20–23 simulation/replay world, records, expedition and external isolation | tests/integration/isolation.test.ts |
| 24–25 module failure/circuit breaker | tests/unit/business.test.ts |
| 26–27 missing Overlay/reconnect | tests/unit/director.test.ts; tests/e2e/vertical.spec.ts |
| 28–30 port collisions/no fallback | tests/integration/recovery.test.ts |
| 31–33 missing audio, cancellation, timer cleanup | tests/e2e/control.spec.ts; tests/unit/director.test.ts |
| 34–37 migration idempotence/checksum/backup/restore | tests/integration/recovery.test.ts |
| 38 Agent protocol mismatch | tests/integration/ingest.test.ts |
| 39–41 External API cursor/dedupe/gap | tests/integration/external.test.ts; tests/unit/foundation.test.ts |
| 42–47 catalogue, Analyse, sales, remarkable coalescing, unknown fields/WasFootfalled | tests/unit/business.test.ts; tests/golden/replay.test.ts |

## Final source inspection

- No structural TODO/FIXME found in apps, packages, modules or scripts.
- No SQL, Core internal imports or process.env in modules; Agent has no Core/SQLite dependency; renderer has no Frontier field interpretation. The root architecture command enforces these boundaries.
- Non-live RunContext refuses a persistent Store. Negative tests compare live state/records/expeditions/events before and after all simulation levels and replay speeds.
- Production default ports occur only in validated Core config and documented example configs. Tests use explicit isolated ports. Collisions fail rather than selecting another port.
- No real credentials were introduced. Shared token and optional OBS password are read from private environment files; fixture tokens are synthetic. Build artifacts, runtime state and secrets are ignored.
- Documentation links and required guides checked. Technical claims distinguish verified facts, choices, configurable values and hypotheses in [technical-validation](technical-validation.md).
- Source was reinstalled and rebuilt from a clean directory; generated Agent release was refreshed after final changes.

## Remaining native checks

Follow [Shadow installation](installation-shadow.md), [Tailscale](tailscale.md) and [OBS setup](obs-setup.md): verify native Windows filesystem/reboot recovery, actual tailnet forwarding and OBS monitoring/output/autoplay. No live Elite session, Shadow host, OBS output or tailnet credentials were accessed. There is no external blocker to using the local Core and isolated simulations; deployment to the user's two machines still requires their configuration and these smoke checks.
