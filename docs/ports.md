# Ports

| Service | Default bind | Port | Purpose |
|---|---|---|---|
| Core | 127.0.0.1 | 48100 | HTTP, Control UI, Overlay, local DomainEvent WS |
| Gateway | 127.0.0.1 | 48101 | authenticated Agent WS, tailnet TCP forward |
| Optional OBS | connect to127.0.0.1 |4455| outbound only, disabled by default |

All startup ports configurable. No automatic fallback. If either listener fails, startup fails and closes the other listener. On macOS inspect with `lsof -nP -iTCP:48100 -sTCP:LISTEN` (or48101). On Windows use `Get-NetTCPConnection -LocalPort 48101`. Stop the conflicting process or deliberately change config and all client URLs. Do not expose48100 publicly.
