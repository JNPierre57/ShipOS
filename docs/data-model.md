# Data model

Migration001 creates source_events, agent_ingest_state, domain_events, director_decisions, presentation_runs, sessions, expeditions, records, milestones, settings, module_storage and world_state. schema_migrations is the migration ledger. Structured values are JSON; identity, sequences and processing/dispatch states are relational columns with unique constraints.

source_events has unique(agent_id,sequence) and primary key id. Processing snapshots contain relevant previous/next deltas and diagnostics for Inspector. domain_events has global AUTOINCREMENT sequence and unique id; dispatch state is independent of source processing. Decisions are keyed by event ID, runs by run ID. Namespaced module services share one writer connection and transactions.

Live session IDs may change after restart. Expedition start/end is explicit and there is one active pointer. DomainEvents capture sessionId and expeditionId. Expedition aggregates include unique system addresses, discovery revisions, exobiology estimates, actual sales, records and milestones. Records use deterministic maximum comparison; milestone identities include their supporting source. Sale observations retain official Value/Bonus separately from estimates.

Agent checkpoint includes installation identity, next sequence, ACK, journal cursors, bootstrap boundaries and current sidecar hashes. Spool is append-only JSONL between compactions; compaction writes a new file then replaces the old one. Crash after spool fsync before checkpoint is recovered from retained records. Torn final JSONL append is truncated to its last completed newline; malformed completed spool records fail recovery for diagnosis, never silently skip accepted data. Source game files are read-only.
