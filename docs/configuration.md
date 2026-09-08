# Configuration

Startup JSON is strict Zod: unknown keys and invalid values fail startup. Core file is selected by `SHIPOS_CONFIG`; Agent file by `SHIPOS_AGENT_CONFIG`. `SHIPOS_DATA_DIR` overrides either data directory. Secrets are `SHIPOS_AGENT_TOKEN` and optional `SHIPOS_OBS_PASSWORD`; use Node's `--env-file` and keep those files outside the repository. Tokens must be at least16 characters.

Core defaults: host127.0.0.1, port48100, gatewayHost127.0.0.1, gatewayPort48101, heartbeatMs10000, staleMs30000, externalWindow1000, backupRetention10. Ports must be 1–65535 and different. Defaults are product choices, not external facts. See core.example.json.

Agent requires `url`; default Journal path derives from homedir, default data from LOCALAPPDATA. pollMs1000 (minimum100), heartbeatMs10000, staleMs30000, reconnectMs1000, maxBackoffMs30000, window256 (1–1024). URL must use ws/wss and contain no query, credentials or fragment secrets. Backoff jitter is ±20%. WebSocket payload cap is1MiB.

Dynamic settings live in SQLite settings, through Control API: module config/enablement/presentation policies, Director budget, audio volumes. Modules receive only their validated config, never process.env. Hull threshold is deliberately fixed at observable0.2 in V1. Exobio threshold defaults to5,000,000 base credits; high gravity2g; many biological signals5; Died context freshness30s.

Core `obs` config: enabled false, host127.0.0.1, port4455, allowedInputs []. When enabled only explicitly allowlisted input mute operations are supported. Connection failure marks adapter DEGRADED; Browser Source continues. No scene/transform mutation is implemented.

Core moduleFailureThreshold config defaults3 consecutive errors; successful hook clears the counter. Re-enable through Modules after fixing the configuration/cause. Configuration and error state survive restart.

Data directories are independent of the repository. Maintain sufficient free space for a disconnected Agent's unACKed spool; durability takes priority over dropping old events.
