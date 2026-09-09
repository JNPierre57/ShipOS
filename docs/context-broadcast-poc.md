# Context & Broadcast POC — specification and feasibility gate

Baseline: `4f95b2a`, annotated GitHub tag `before-context-broadcast-poc`. The complete canonical verification passed before structural changes (61 tests plus architecture). Existing detector rules, transport and live data are preserved.

## Feasibility gate (2026-09-09)

Primary reference: [Frontier Journal manual v37](https://hosting.zaonce.net/community/journal/v37/Journal_Manual_v37.pdf), including Loadout, EngineerCraft, PowerplayCollect/Deliver, LaunchSRV, ScanOrganic, HullDamage, UnderAttack, MissionCompleted and Status. This manual documents up to May 2023; newer fields are not assumed supported. Fixtures are synthetic examples of documented fields, never private commander logs.

| Capability | Gate | Implementation boundary |
|---|---|---|
| Ship identity and equipment | FEASIBLE_VERIFIED | Commander + ShipID; Loadout.Modules, Slot, Item, Engineering.BlueprintName/Level/ExperimentalEffect |
| New to ShipOS | FEASIBLE_VERIFIED | First local observation only; bootstrap seeds history silently |
| SRV type | FEASIBLE_VERIFIED | LaunchSRV.SRVType retained verbatim, missing means unknown; no invented Rhino mapping |
| Travel, engineering, outfitting, trade, missions, exploration, biology | FEASIBLE_VERIFIED | Documented discrete actions; evidence remains bounded in time |
| Combat activity, danger | FEASIBLE_WITH_INFERENCE | UnderAttack/HullDamage plus fresh vehicle context; editorial state is derived, not intent |
| Space mining | FEASIBLE_VERIFIED | MiningRefined |
| Surface mining | FEASIBLE_WITH_INFERENCE | MaterialCollected in freshly observed SRV context; collecting is not proof of mining |
| Powerplay | FEASIBLE_VERIFIED | Collect/Deliver only, membership alone does not establish ongoing activity |
| Powerplay 2.0 | EXPERIMENTAL | No unverified new event rules |
| BGS | FEASIBLE_WITH_INFERENCE | Repeated faction-effect mission completions; always INFERRED, never a viewer assertion |
| On foot/SRV activity | FEASIBLE_VERIFIED | Fresh Status or explicit vehicle events |
| Broadcast tension, recovery | FEASIBLE_WITH_INFERENCE | Versioned thresholds, holds and expiry; no claim about emotions or player intent |
| Operations Frontier / first-ever usage / intention | NOT_CURRENTLY_FEASIBLE | Event census retained for investigation; no automatic claim |
| Deterministic replay | FEASIBLE_VERIFIED | Injected Clock, isolated memory, stable evidence identities |

## Architecture and defaults (v1)

Context runs inside Core with the existing transaction and Clock. The Agent is unchanged. Signal extraction is event-driven; one 1 Hz temporal tick performs linear decay and hysteresis. A category is independent of all others. No dominant activity excludes Powerplay or combat. Evidence includes source id, observed/derived/inferred quality, weight, confidence, TTL and current contribution. No LLM, network inference or new service.

Memory uses additive SQLite migration 002 with the existing backup/checksum process. Ship keys include commander; canonical fingerprints sort slots and normalize case, keeping module item and blueprint/level/experimental effect. Health, ammo, monetary values, power toggle/priority and engineering quality are excluded: those operational variations should not introduce a new build. Incomplete identities or malformed module arrays do not generate novelty. A new fingerprint is remembered before its one-time cue is dispatched. Returning to a known build is silent.

Activity evidence expires after 30–180 seconds and same-rule refreshes replace evidence rather than growing a list. Scores and confidence are separate. BGS and surface mining remain experimental in the Lab. Timeline and census are capped. Durable writes concern source processing, first observations, phase changes and session summaries, never a history row for each score tick.

Broadcast phases: CALM, ACTIVE, TRANSITION, TENSION, CRITICAL, RECOVERY. Intensity, danger, novelty and pace are independent 0–100 editorial dimensions. CRITICAL requires danger >=75 for 2 seconds; TENSION >=45 for 3 seconds; exit requires danger <25 for 8 seconds. Recovery requires a recent substantial critical episode, fresh safe telemetry, and no intervening death or disconnect; absence of data cannot establish safety. RECOVERY lasts at least 10 seconds. Cooldowns and attention budgets still belong to the existing Director.

Derived `shipos.*` events are internal; external subscribers still receive `elite.*`. HullCritical takes precedence over a redundant context critical cue. Context never replaces the five verified V1 detections.

## Visual contract

Generic OS primitives: SystemLine, ConsoleStrip, IncidentPanel, FatalSequence and RecoverySequence, sharing TerminalSequence (severity, label, lines, timing and emphasis). Monospace, dark translucent plates, thin rules and restrained amber/green/cyan; red is reserved for critical events. Short line reveals use CSS and the existing presentation lifetime, including reconnect offsets. No permanent HUD, autonomous audio loop, or intentionality prose. Motion override `?motion=full` remains available in OBS. FULL/COMPACT/SILENT, audio routing, cancellation and exclusive death sequencing remain Director-owned.

## Validation and stream use

The Context Lab is the primary inspection surface: dimensions, all activity scores, evidence and freshness, current ship/build diff, phase timeline and event census. Simulation scenarios and replay use isolated state, never live memory. During a stream inspect which raw evidence justified a transition, especially BGS/surface mining; no need to provoke damage. To add a rule: verify its fields against a primary source, add a sanitized fixture and negative case, document weight/TTL/confidence, then test replay determinism before enabling a viewer cue.

Baseline uses `scripts/benchmark-context.mjs` (one hour, 3,600 representative synthetic records, isolated SQLite, accelerated Clock). Measurements below are local observations, not a hardware-independent guarantee.

## Rule ledger and reasoning

Versioned defaults are in `apps/core/src/context.ts` (`rules` plus explicit vehicle/damage rules). Linear contribution is `weight × max(0, 1 − age/TTL)`; category score is the sum clamped to [0,1]. Confidence is a contribution-weighted mean of rule confidence, never a probability of the player's intent. Non-empty evidence remains OBSERVED/DERIVED/INFERRED even when activity is weak; no evidence means zero confidence. Categories with no evidence are not filled from loadout guesses.

| Evidence | Category | Weight | TTL seconds | Confidence / quality |
|---|---|---:|---:|---|
| UnderAttack.Target=You / Bounty / FactionKillBond | combat | .9 / .8 / .9 | 30 / 60 / 60 | 1 / OBSERVED |
| FSDJump / StartJump / SupercruiseEntry | travel | .8 / .7 / .6 | 90 / 45 / 60 | 1 / OBSERVED |
| MiningRefined | mining.space | .95 | 120 | 1 / OBSERVED |
| EngineerCraft | engineering | 1 | 180 | 1 / OBSERVED |
| ModuleBuy, ModuleSell, ModuleSwap | outfitting | 1 | 90 | 1 / OBSERVED |
| PowerplayCollect, PowerplayDeliver | powerplay | 1 | 180 | 1 / OBSERVED |
| MarketBuy, MarketSell | trading | .9 | 90 | 1 / OBSERVED |
| MissionAccepted / MissionCompleted | missioning | .8 / 1 | 120 | 1 / OBSERVED |
| Scan / SAASignalsFound | exploration | .7 / .9 | 90 | 1 / OBSERVED |
| ScanOrganic | exobiology | 1 | 120 | 1 / OBSERVED |
| LaunchSRV / Disembark | srv / onFoot | 1 | 90 | 1 / OBSERVED |
| Fresh Status vehicle flags | srv / onFoot | 1 | 30 | 1 / OBSERVED |
| MaterialCollected with SRV context ≤30s | mining.surface | .55 | 60 | .55 / INFERRED |
| ≥2 same-faction mission completions with FactionEffects in 180s | bgs | .6 | 180 | .45 / INFERRED |
| HullDamage, PlayerPilot, not fighter, fresh mainShip | weak combat evidence | .25 | 45 | .35 / DERIVED; damage alone does not establish combat |
| Fresh mainShip overheating flag | weak travel evidence | .2 | 15 | .9 / DERIVED |

Danger sums decayed contributions: UnderAttack 55; hull health ≤.2:100, ≤.5:60, otherwise25; overheating40. Intensity is the maximum recent signal intensity (15–85); pace counts distinct fresh evidence families over10s ×12, capped100. Pace deliberately measures diversity, not raw Status refresh rate. Novelty falls from100 to0 over30s. Non-danger ACTIVE requires intensity≥35, TRANSITION reflects fresh configuration novelty, otherwise CALM. Ordinary entry holds2s, tension3s, critical2s, danger exit8s, recovery10s minimum. Recovery additionally requires a safe sample newer than its pending transition and at most3s old at confirmation. Expired telemetry can return the editorial phase to CALM but cannot create a recovery cue.

## Memory, restart and bounds

Three tables follow the repository's id/data convention: `context_memory` (namespaced ship, fingerprint, raw vehicle records), `context_transitions`, `context_sessions`. Source memory changes share the existing processed-source transaction; a failed commit cannot consume novelty. Restart restores the current ship memory. On the first upgrade only, a complete persisted WorldState loadout seeds memory silently; it is not represented as a new Journal event. Commander name scopes ShipID; renamed commanders form another local identity (FID identity migration is deferred).

Live evidence starts cold after Core restart; it must not replay yesterday's danger as a current threat. Session summaries are approximate per Core session and written at phase transitions and session end. A sudden crash can lose the latest uncheckpointed diagnostic interval, but cannot repeat a committed fingerprint cue. Current evidence is capped96, broadcast/activity timelines200 each, build timeline50, faction observations16, census128 types (overflow Other). Director semantic keys age out after1hour. Historical source events and durable history intentionally grow on disk under the existing backup policy; “bounded” applies to transient context memory, not deletion of stream history.

## Performance impact

Measured locally with Node24.20.0, identical 3,600-record/one-hour synthetic exploration workload; no network or OBS rendering in the Core benchmark. The baseline was measured before implementation. The follow-up includes Context and additional registry adapters (which skip unnecessary source detection hooks).

| Metric | Baseline | Context POC |
|---|---:|---:|
| Accelerated wall time | 1502ms | 2104ms |
| CPU user + system | 1588ms | 2242ms |
| Ingest p50 / p95 | .392 / .580ms | .467 / .716ms |
| Maximum ingest | 5.067ms | 4.905ms |
| RSS start / end | 65.2 / 302.9MB | 65.7 / 348.9MB |
| Context evaluation total / count | — | 24.20ms / 3599 |
| Mean / maximum context evaluation | — | .0067 / 1.078ms |

RSS includes V8 allocation and an in-memory SQLite copy of the entire replay, not just evidence; it is not a measure of steady-state live heap. The pure two-hour stress test asserts context caps and serialized state <200KB. Persistent source history is intentionally retained. The added total CPU cost is about0.65s per simulated hour in this workload, not a claim that all possible Journals cost the same.

Overlay idle: `scripts/benchmark-overlay.mjs` compared the built tagged baseline and POC with an empty connected WebSocket over5s. Baseline/POC: browser TaskDuration1.721/.604ms, ScriptDuration0/0ms, heap2.474/2.474MB, zero cards and zero animations. The small task-duration difference is measurement noise, not an optimization claim. Both are idle without rendering loops. Run the scripts after `npm run build`; pass a build directory to the overlay benchmark to compare versions.

## Final scope and validation

No Agent upgrade or extra port is required. The five detection modules are unchanged; a Core presentation adapter migrates their visual output while retaining dynamic species/body fields. Illustrated legacy definitions remain supported and tested. New cues have original120ms synthesized tones; existing audio buses and cancellation remain intact. After deployment, reload the Control Panel and refresh the OBS browser source once to load the new renderer (`?motion=full` retained).

Automated coverage: baseline suite, fingerprint normalization/real module and engineering changes, atomic rollback/retry, restart memory, independent activities, decay/expiry, BGS confidence, unknown/malformed events, two-hour bounds, five deterministic scenarios, internal publication filter, HullCritical coalescing, all terminal primitives, queued/fatal interruption, reconnect, reduced-motion override and cleanup. Source-to-browser assertions now expect the new fatal terminal text; detector semantics were not weakened.

Explicit POC limits: no Operations Frontier classifier or guessed Rhino mapping; Powerplay2.0 events without verified fixtures remain census-only. Surface mining and BGS are experimental, with no viewer assertions. No live-memory import into replay; empty isolated memory is the reproducibility baseline. The real OBS compositor/audio chain still benefits from one normal stream check; browser verification is not a claim to have recorded the user's actual OBS output.

Next stream: play normally; inspect live Context Lab for supported evidence, open activity reasons and raw source, check known build and vehicle history, then examine phase transitions after the session. For a safe demonstration use Simulation and choose the isolated run in Inspect. There is no reason to damage an exploration vessel to validate the system.

Final canonical verification: **80 tests** (34 unit,23 integration,14 golden,9 browser), lint, TypeScript, production builds and architecture checks. All passed on this Mac. Windows Agent implementation and dependency graph have not changed. Browser screenshots were visually inspected for the terminal and Context Lab. Replay remains deterministic across independently allocated run/session identifiers; context recovery provenance includes the fresh confirming Status source, not just the preceding hazard.
