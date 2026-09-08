# Protocol v1

Agent endpoint `/agent/v1/ws`, Authorization: Bearer <private token>. Max WS payload1MiB. First message:

```json
{"type":"hello","protocolVersion":1,"agentId":"persistent-installation-id","agentVersion":"1.0.0","lastAckedSequence":0,"spoolDepth":0}
```

Welcome contains protocolVersion1, serverVersion and highest contiguous durable `sequence`. Source message `{type:"source_event",event:SourceEvent}` receives `{type:"ack",sequence:N}` only after commit. Unexpected protocol, identity conflict or gap gets explicit error with afterSequence, then close1008. No silent protocol downgrade. Native ping/pong and stale timeout detect half-open connections. Optional agent_status frames report current spoolDepth; accepted source metadata supplies filename and byte offset in Agent diagnostics. Agent resumes from ACK, bounds in-flight delivery, backs off with jitter, and compacts only ACKed records. Restoring a Core DB behind Agent ACK is an explicit resync failure.

External endpoint `/api/v1/events/ws` on localhost48100 is read-only. Subscribe:

```json
{"type":"subscribe","patterns":["elite.ship.*"],"afterSequence":12}
```

Patterns accept exact names or one terminal prefix wildcard, e.g. elite.*, elite.ship.*, elite.exobiology.highValueDiscovery. Invalid patterns close1008. A subscription without cursor starts with future events. Reply subscribed includes latestSequence. Delivery is `{type:"domain_event",event:DomainEvent}`. Reconnect with last fully consumed sequence; dedupe by event.id. Cursor outside the bounded window yields resync_required with earliest/latest sequence. A slow socket closes1013; reconnect with cursor. Filtered sequence gaps are expected, retention gaps are never concealed. Current window defaults1000 events; database history itself is retained separately.

No SourceEvents or PresentationActions enter the External API. No external endpoint creates elite.* events. Simulation POSTs use separate stores, never the live event endpoint. The DynamicChatOverlay-style consumer exists only as ShipOS test code; the real repository is untouched.
