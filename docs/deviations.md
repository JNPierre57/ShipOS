# Deviations and operational limits

- TypeScript6.0.3 retained, although registry latest is7.0.2; this follows the requested baseline. Host Node23 was not used for validation; an isolated Node24.20.0 runtime was installed for this session.
- The historical NavRoute documentation labels the example event Route, while the modern event name is NavRoute; its sample also has malformed JSON. Adapter relies on a validated Route array, retains raw data and supports NavRouteClear. Tests cover both labels.
- EDDiscovery contains both pre-U14 and post-U14 exobiology tables. Import uses only the post-U14 table with provenance/Apache2.0 attribution. Old lower values are not current estimates. WasLogged is never used to guarantee bonuses; current-field support does not imply trustworthy achievement inference.
- Hull threshold fixed at0.2 in V1 to avoid advertising an arbitrary precision Frontier does not provide. Died uses a configurable30s context freshness guard; ambiguous/stale cases are diagnosed rather than misclassified.
- Module hooks are synchronous compiled V1 functions. Accidental Promise returns/rejections are isolated as errors; asynchronous enrichers are not supported in this implementation. No hostile-code sandbox claim.
- ReplayClock follows the historical epoch, while presentation deadlines are translated to browser wall time. Original payloads and Journal files are never modified; runs are ephemeral and at most20 are retained. Replay speed uses a50ms driver only while active. Other live services remain independent.
- Initial Agent bootstrap reads the latest Journal session/parts. Older historical files are cursor-skipped rather than transmitting an entire installation's history. Replay is the explicit path for historical files.
- File durability uses fsync on spool/checkpoint, rename replacement and POSIX directory fsync. Windows cannot use the same directory-fsync call; NTFS/power-loss details require native smoke verification. Tests exercise filesystem crash boundaries and paths with spaces locally; Windows CI is configured but not claimed executed.
- No real Shadow, OBS output or tailnet configuration was accessed or changed. Those are documented operational smoke checks, not simulated claims of hardware validation. OBS adapter scope is deliberately limited to allowlisted input mute; all V1 presentations work without it.

- After a Core restart, previously running and queued transients are explicitly marked interrupted/cancelled rather than replayed. Business outbox recovery remains independent and idempotent.
