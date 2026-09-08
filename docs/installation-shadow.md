# Shadow Windows installation

Install Node 24 LTS on Shadow. Check `node --version` in PowerShell. Tailscale connectivity with the Mac must already exist.

## Preferred: Agent release

On the Mac/build machine, run `npm run package:agent`. Copy `release/shipos-agent` to a directory on Shadow, including its lockfile and dist folder. In that directory run `npm ci --omit=dev`. This release depends only on ws, Zod and Pino; no better-sqlite3.

Create `C:\ShipOS Config\agent.json`:

```json
{"journalDir":"C:\\Users\\YOUR_USER\\Saved Games\\Frontier Developments\\Elite Dangerous","dataDir":"C:\\ShipOS Data\\Agent","url":"ws://YOUR-MAC-TAILSCALE-HOST:48101/agent/v1/ws"}
```

Replace placeholders with real paths/hostname. When journalDir is omitted the default is the current user's home/Saved Games/Frontier Developments/Elite Dangerous. A relocated Saved Games folder requires the explicit override. The folder must exist and be readable; ShipOS never modifies game files.

Store in a private environment file (not committed):

```text
SHIPOS_AGENT_CONFIG=C:\ShipOS Config\agent.json
SHIPOS_AGENT_TOKEN=the-same-private-token-as-core
```

Start in the release directory:

```powershell
node --env-file="C:\ShipOS Config\shipos.env" dist/apps/agent/src/main.js
```

Default Agent data: `%LOCALAPPDATA%\ShipOS\Agent`. Identity is generated once and stored in checkpoint.json. Keep the identity, checkpoint and spool together across upgrades. JSONL logs are in logs; malformed Journal records are diagnosed in quarantine.jsonl. Watcher notifications are supplemented by one-second reconciliation. Initial history from the current Journal session is bootstrap-only.

## From source, Agent only

From a complete source checkout on Windows:

```powershell
npm ci --workspace @shipos/agent --workspace @shipos/contracts --include=dev
npm run build:agent
node --env-file="C:\ShipOS Config\shipos.env" dist/apps/agent/src/main.js
```

The selected workspace includes its own TS/types dev dependencies; Core SQLite is not installed. `npm run verify:agent-install` verifies this in a fresh temporary folder.

## Reconnect test

Start Core, verify Agent connected and rising ACK sequence in Control Panel. Stop Core briefly while Elite generates records. Spool grows. Restart Core; Agent reconnects automatically, ACK catches up and only ACKed records compact. Repeat with an Agent stop/start. Never delete an unACKed spool to clear a connectivity problem.

Windows native behavior must additionally be smoke-tested on Shadow. Cross-platform filesystem tests and Windows CI are supplied; this build session ran on macOS.
