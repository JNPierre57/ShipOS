# Simulation and replay

Control Panel Simulation supports SourceEvent, DomainEvent and presentation-only levels. Source scenario Everything Goes Wrong observes shield-down at0s, hull critical at2s, low fuel at5s, ship destruction at8s. Shield-down remains state, not a sixth public DomainEvent. Start an Overlay client to see it. Domain/presentation previews let you select each V1 event. Cancel a run from its history.

Each isolated run owns an in-memory SQLite Store, WorldState, module registry, records, expedition services and VirtualClock/ReplayClock. Non-live contexts refuse persistent DBs. External publishing is always off. Live persistence and world are not shared. At most20 run contexts are retained. Closing Control Panel does not cancel a running scenario.

Replay accepts one or more Journal files through the local upload UI. Choose1×/5×/20×/instant. Relative source timing and original payloads/timestamps are retained. ReplayClock follows the historical epoch; presentation deadlines are translated to browser wall time. The original uploaded file is not modified. Malformed lines are diagnosed; trailing incomplete line is not treated as a full record. Instant advances the virtual clock without real waits. Uploaded content is bounded at16MiB request,8MiB/file and50,000 records.

Simulation/replay results, decisions and isolated WorldState are visible in run history. Persistent Source Inspector only shows the live database. Live WorldState, records, milestones and expedition are snapshot-tested before/after all three simulation levels and replay speeds. Replay never writes to the Agent Journal folder.
