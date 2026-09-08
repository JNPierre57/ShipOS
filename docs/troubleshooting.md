# Troubleshooting

| Symptom | Probable cause | Diagnostic | Resolution |
|---|---|---|---|
| Journal folder not found | relocated Saved Games or wrong override | inspect configured folder in PowerShell | set journalDir to actual readable Elite folder |
| Agent cannot connect | Core/Serve/firewall unavailable | Core health, Agent logs, tailscale ping/status | start Core, correct hostname/port, fix network policy |
| Token mismatch | different secrets | Agent connection error and gateway401 | load same private token on both; never paste it in logs/URLs |
| Tailscale Serve issue | wrong forward or ACL | tailscale serve status, verify local48101 | apply documented TCP forward and restrictive grant manually |
| 48100 occupied | another local listener | lsof or Get-NetTCPConnection | stop conflict or intentionally change Core port/client URLs |
| 48101 occupied | stale Core/direct bind/Serve conflict | inspect listener and bind mode | select one gateway exposure mode; no fallback |
| Protocol mismatch | incompatible builds | explicit WS error/close1008 | align Agent and Core v1 versions |
| Status unreadable | transient file replacement/permissions | sidecar_unreadable log | wait for bounded retry/reconciliation; verify access |
| Journal malformed | incomplete/invalid record | quarantine filename and byte offsets | inspect preserved record; later complete lines continue |
| Spool growing | Core unavailable or rejected events | compare Agent pending/ACK and gateway error | fix connection or source issue; retain all unACKed data |
| Resync required after DB restore | restored Core behind Agent ACK | checkpoint ACK vs ingest sequence | restore consistent recent DB/spool archive; do not reset ACK blindly |
| DB migration fails | checksum mismatch, disk full, invalid SQL | startup error and backups | restore previous release+pre-migration backup; retain failed DB |
| Overlay blank | no active run or missing build | health, /overlay, preview simulation | build, correct URL, launch preview |
| Overlay disconnected | Core restart/network closure | Control Panel Overlay count | restart Core; client retries every second |
| Audio silent | suspended context, zero volume, OBS routing | Audio state, mixer and recorded test | user gesture/OBS settings; raise buses and test cue |
| Browser Source stale | cached previous build | reload after npm run build | refresh browser-source cache/source |
| OBS websocket unavailable | disabled adapter, auth or missing OBS | System obs status | leave optional adapter off or fix private password/host |
| Module DEGRADED | detector/factory exception | Modules lastFailure and Source Inspector | correct config/cause; other modules continue |
| Module auto-disabled | consecutive failures reached threshold | health DISABLED, error count | fix cause then re-enable manually |
| Backup/restore failed | filesystem/disk/integrity problem | backup error and integrity check | free space/fix permissions, use a known-good snapshot |
| Already owns data directory | second live process or lock owner | inspect PID in core.lock/agent.lock | stop owner; stale PID locks recover automatically; inspect invalid lock before removing |

Logs rotate at5MiB, retaining four rotated files plus current file. Paths are dataDir/logs/core.jsonl or agent.jsonl. Correlated source/domain IDs aid diagnosis. Do not share raw private Journals publicly without reviewing them. No normal recovery procedure requires deleting the database.
