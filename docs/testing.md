# Testing

Root scripts are the source of truth. Node24 required. `verify` runs ESLint, strict TypeScript6, unit, integration and production build. `verify:final` adds golden fixtures, Playwright Chromium and architectural checks. `verify:clean` copies source into a clean path with spaces, npm ci, then verify:final. `verify:agent-install` performs a selected-workspace install/build and asserts no native SQLite runtime.

Unit: source envelope/unknown preservation, filters, context-sensitive Died, bootstrap suppression, low-fuel transitions, hull episodes, WasFootfalled tri-state, reduced Scan merge, exobio estimates/sales, remarkable revisions, module failures/circuit breaker, Director TTL/scoring/budget/compact/silent/cooldown/queue/exclusive/interruption, cancellable virtual timers, optional OBS degradation and allowlist.

Integration: real WS handshake/ACK/duplicate retransmit; drop after SQLite commit before ACK; native Agent reconnect/restart/window; spool recovery after crash point; partial/malformed/rotation sources; Core restart/outbox; actual killed child process after durable inbox commit; database fault rollback/retry; migration/checksum/backups/restore; port collisions; isolated stores and replay parsing; read-only External API cursor/gap/filter/dedupe and SILENT independence.

Golden: nine synthetic journeys with exact expected public event sequences. Fixtures are explicitly not real player logs. Source fields are based on the validation ledger.

Browser: actual Gateway→Core→DOM slice; Overlay reconnect/cancellation; main Control Panel journeys; audio oscillator startup, stop and missing-asset degradation. Idle Overlay has no requestAnimationFrame loop. Screenshots are test artifacts.

GitHub Actions matrix supplies macOS, Windows and Linux Node24 runs when this repository is hosted there. This session did not run remote CI or a Windows VM. Native Shadow reboot/NTFS behavior, Tailscale Serve and OBS actual output require the installation smoke checks. No real credentials are required by automated tests.
