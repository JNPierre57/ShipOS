# Technical validation

Verified 2026-09-08. Registry metadata was queried before installation; exact versions are in package-lock.json.

| Claim | Classification | Source | Conclusion / affected code / contradictions |
|---|---|---|---|
| Node 24, TS6, Fastify5, Zod4, SQLite13, React19.2, Vite8 | VERIFIED_FACT | https://registry.npmjs.org/ ; https://nodejs.org/en/about/previous-releases | Stable resolved versions in manifests. Host Node23 replaced for this task by isolated Node24 runtime; no global change. |
| WS handlers synchronous, errors caught explicitly | VERIFIED_FACT | https://github.com/fastify/fastify-websocket | Gateway attaches listeners before asynchronous work. |
| SQLite transactions, WAL, backup | VERIFIED_FACT | https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md | Core-only durable inbox and outbox; backup before migration. |
| Died means player killed | VERIFIED_FACT | https://elite-journal.readthedocs.io/en/latest/Combat.html | Require pre-state main ship; ambiguous contexts diagnostic only. |
| HullDamage in 20% steps, PlayerPilot/Fighter | VERIFIED_FACT | https://elite-journal.readthedocs.io/en/latest/Combat.html | Observable default 0.2; never claim continuous telemetry. |
| Status replaced; low fuel bit19; main ship24, fighter25, SRV26; Flags2 foot/taxi/multicrew | VERIFIED_FACT | https://raw.githubusercontent.com/EDCD/EDMarketConnector/main/edmc_data.py ; https://elite-journal.readthedocs.io/en/latest/Status%20File.html | First snapshot initializes, only false→true alerts. |
| WasFootfalled and WasLogged added | VERIFIED_FACT | https://github.com/Xjph/ObservatoryCore/releases ; https://github.com/Silarn/EDMC-BioScan/releases | Preserve optional booleans. No guaranteed achievement/bonus. Populated systems complicate footfall inference. |
| NavRoute historical event Route; Route array | VERIFIED_FACT | https://doc.elitedangereuse.fr/Travel/ | Normalize array independent of event-name variant. Example contains typo; do not copy invalid JSON. |
| Scan missing fields and terraform strings | VERIFIED_FACT | https://doc.elitedangereuse.fr/Exploration/ | Accumulate observations; absence never false. |
| Tailscale Serve TCP | VERIFIED_FACT | https://tailscale.com/docs/reference/tailscale-cli/serve | Document --bg --tcp=48101 tcp://127.0.0.1:48101; never execute tailnet changes. |
| Runtime isolation, deterministic identity, JSONL spool | ARCHITECTURAL_CHOICE | master-specification.md | Separate RunContext persistence, Core-only SQL. |
| Ports, heartbeat, reconnect, budget, thresholds | CONFIGURABLE_VALUE | master-specification.md | Validated config, no fallback port. |
| Actual OBS WebAudio behavior on this Mac | EXPERIMENTAL | https://obsproject.com/kb/browser-source | Browser tests plus separate real OBS smoke procedure, no assumed autoplay parity. |

## Further validation and code impact

All entries below verified 2026-09-08. EDDiscovery/EliteDangerousCore was inspected at commit `f21533ba1609d309fd6a96b9b3bb488df178a36e`; EDMC-BioScan at `5f0d2e445a95681bf2e85223f883d5c552a7726b`. Sources are upstream implementations, not inferred field names.

| Claim | Classification | Source / evidence | Code impact / conclusion |
|---|---|---|---|
| Health is fraction 0–1 | VERIFIED_FACT | [JournalHeatHullDamage.cs](https://github.com/EDDiscovery/EliteDangerousCore/blob/f21533ba1609d309fd6a96b9b3bb488df178a36e/EliteDangerous/JournalStatus/Events/JournalHeatHullDamage.cs) | HullCritical validates [0,1]; threshold 0.2. |
| RepairAll / Loadout HullHealth support reset | VERIFIED_FACT | [JournalRepair.cs](https://github.com/EDDiscovery/EliteDangerousCore/blob/f21533ba1609d309fd6a96b9b3bb488df178a36e/EliteDangerous/JournalStatus/Events/JournalRepair.cs), JournalModules.cs in same Events directory | World reducer resets episode only on explicit observation/lifecycle. |
| SurfaceGravity in m/s²; normalized using 9.80665 | VERIFIED_FACT | [JournalScan.cs](https://github.com/EDDiscovery/EliteDangerousCore/blob/f21533ba1609d309fd6a96b9b3bb488df178a36e/EliteDangerous/JournalStatus/Events/JournalScan.cs), FrontierData/Enumerations/PhysicalConstants.cs | RemarkableBody compares normalized g. Status.Gravity is a distinct field and is not reused. |
| Raw star types N/H/SupermassiveBlackHole and planet types Earthlike body/Ammonia world | VERIFIED_FACT | [FrontierData enumerations](https://github.com/EDDiscovery/EliteDangerousCore/tree/f21533ba1609d309fd6a96b9b3bb488df178a36e/EliteDangerous/FrontierData/Enumerations), [Journal appendix](https://doc.elitedangereuse.fr/Appendix/) | Raw values drive stable reason codes; labels/localization do not. |
| Biological signal type $SAA_SignalType_Biological; | VERIFIED_FACT | [Journal exploration](https://doc.elitedangereuse.fr/Exploration/) SAASignalsFound example | Accumulated BodyState count, absent remains unknown. |
| ScanOrganic ScanType Analyse with Genus/Species/Variant/SystemAddress/Body, no official Value | VERIFIED_FACT | [Odyssey manual](https://doc.elitedangereuse.fr/New%20in%20Odyssey/) | Strict adapter for consumed fields; catalogue estimate only. |
| SellOrganicData BioData array has Value/Bonus | VERIFIED_FACT | [Odyssey manual](https://doc.elitedangereuse.fr/New%20in%20Odyssey/) | Store actual sales/variance without rewriting estimates. |
| Post-U14 species credit catalogue | VERIFIED_FACT | [EstimatedValues.cs](https://github.com/EDDiscovery/EliteDangerousCore/blob/f21533ba1609d309fd6a96b9b3bb488df178a36e/EliteDangerous/FrontierData/Enumerations/EstimatedValues.cs) `valuelistU14` | Apache-2.0 data extraction, notices retained. The older table differs because of the U14 payout update, not conflicting current values. |
| WasLogged reliability sufficient to promise bonus | HYPOTHESIS (not adopted) | [BioScan release notes](https://github.com/Silarn/EDMC-BioScan/releases) | Raw field retained only. No bonus/achievement guarantee. |
| Native file watch can miss notifications; sync flush and rename primitives | VERIFIED_FACT | [Node24 fs](https://nodejs.org/docs/latest-v24.x/api/fs.html) | Agent periodic reconciliation, spool fsync before checkpoint; Windows directory-fsync limitations documented. |
| WebAudio oscillator stop/gain routing, context suspended/running | VERIFIED_FACT | [Web Audio specification](https://www.w3.org/TR/webaudio/) | Browser AudioEngine; Chromium tests demonstrate starts/stops and missing-asset fallback. Actual OBS requires smoke test. |
| OBS WS v5 connect, disconnect, call SetInputMute | VERIFIED_FACT | [obs-websocket-js](https://github.com/obs-websocket-community-projects/obs-websocket-js), installed typed protocol declarations | Optional allowlisted input mute only; unavailable adapter degrades. |
| Fastify5.12 LogController replaces deprecated disableRequestLogging option | VERIFIED_FACT | installed Fastify docs/Reference/Server.md and types/logger.d.ts | Server uses LogController; no deprecated TS6 options introduced. |
| Aggregate counts and discovery revisions | ARCHITECTURAL_CHOICE | ShipOS expeditions.ts | Values are sums of observed DomainEvents/sales; revisions are immutable, systems deduplicated by address. |
| Original cues and lightweight overlays | ARCHITECTURAL_CHOICE | packages/presentation-renderer | Oscillator catalogue requires no Frontier audio/image downloads; no idle rAF. |

Version resolution evidence is the exact manifests plus package-lock.json; all direct packages pinned to stable versions. `obs-websocket-js` currently brings the deprecated CryptoJS package transitively; this is an upstream maintenance warning, distinct from npm vulnerability findings. Audit results are recorded in final-audit.md.
