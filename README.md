# ShipOS V1

Commande chat `!loadout` : [faisabilité, utilisation et simulations](docs/chat-loadout.md).

Commande chat `!screen` : [audit, configuration et exploitation](docs/chat-screen.md).

Local flight telemetry and stream presentation for Elite Dangerous. Shadow Windows reads the game files; the Mac runs the durable Core, browser Overlay and Control Panel. Tailscale connects them. No cloud service, Docker or PM2 required.

The **Context & Broadcast POC** adds independent activity evidence, persistent ship/build memory and restrained OS terminal sequences. Open [Context Lab](http://127.0.0.1:48100/control/?view=context) while Core is running; use Simulation for Quiet Travel, Combat Escalation, Close Call, Powerplay Combat or New Build. [Feasibility, defaults, limitations and benchmark](docs/context-broadcast-poc.md). The approved pre-POC release is tagged `before-context-broadcast-poc`.

## Start on the Mac

Use **Node 24** (exact development runtime: 24.20.0). From this repository:

```sh
npm ci
npm run build
# Set SHIPOS_AGENT_TOKEN from your private secret file (minimum 16 characters).
node --env-file=/absolute/private/shipos.env dist/apps/core/src/main.js
```

The environment file contains `SHIPOS_AGENT_TOKEN=your-generated-secret`. Generate a random token locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; save it privately and use the same secret on Shadow. Never put it in a URL or a committed config file.

- Control Panel: http://127.0.0.1:48100/control
- OBS Browser Source: http://127.0.0.1:48100/overlay
- Stream Memory intermission Browser Source: http://127.0.0.1:48100/screens
- Health: http://127.0.0.1:48100/health
- Agent Gateway: `ws://YOUR-MAC-TAILSCALE-HOST:48101/agent/v1/ws`

Core must have its secret before startup. Simulation and replay work without Shadow or OBS credentials. Open Simulation → Launch simulation; open Overlay in another tab to see and hear it. Browser audio may need a click.

## Verification

```sh
npx playwright install chromium
npm run verify:final
npm run verify:agent-install
npm run verify:clean
```

The final suite includes lint, strict TypeScript, unit, integration, golden replay, real Chromium journeys and package-boundary checks. The Agent installation check creates a fresh temporary folder and asserts that `better-sqlite3` is absent. Native OBS/Shadow/Tailscale smoke tests are documented separately; automated tests use synthetic fixtures, real WebSockets, SQLite and browser audio.

## Architecture

`Agent → durable JSONL spool → authenticated WebSocket → committed SQLite inbox → pure WorldState reducer → SDK modules → persisted DomainEvents/outbox`.

The Domain Event Bus independently feeds the read-only External Event API and the Director. The Director schedules FULL/COMPACT/SILENT presentations. A cancellable engine sends PresentationActions to the browser renderer. Simulation and replay own separate in-memory stores and clocks.

Five public events: ship destroyed, critical hull, low fuel, high-value exobiology and remarkable body. `Died` requires a recent main-ship pre-state. `WasFootfalled` is observed state, never a claimed First Footfall achievement. Exobiology values remain estimates before sale.

# Reinstall ShipOS from zero

1. **Retrieve source:** clone your ShipOS remote, or restore this entire repository archive into a new folder. No remote URL is assumed. `cd` into the repository.
2. **Mac runtime:** install Node 24; check `node --version`. Run `npm ci`, `npx playwright install chromium`, `npm run verify:final`. This produces both static UIs and the Node build.
3. **Mac configuration:** create a private environment file containing the shared Agent token. Optionally copy `config/core.example.json` outside the repository and set `SHIPOS_CONFIG` to its absolute path. Set `SHIPOS_DATA_DIR` if restoring to a different data directory.
4. **Database:** for a fresh installation, Core creates and migrates SQLite. For a restore, stop Core, then follow `docs/backup-and-restore.md`; retain the original database and WAL files until verified.
5. **Core:** run the command above from the repository root. Confirm `/health`, Control Panel and configured ports. A port collision is an error; there is no port fallback.
6. **Shadow:** run `npm run package:agent` on the build machine, copy `release/shipos-agent` to Shadow, run `npm ci --omit=dev` there. Create an Agent config with the actual Journal folder and Core tailnet host. Store the same secret in a private environment file and start `node --env-file=C:\private\shipos.env dist/apps/agent/src/main.js` from the Agent release folder. See `docs/installation-shadow.md` for source-only installation too.
7. **Tailscale:** verify Mac/Shadow connectivity and restrictive ACL/grants. Configure the documented Serve TCP forward manually, or explicitly bind the gateway to the Mac Tailscale IP. Do not expose the Control Panel to the tailnet or public Internet.
8. **OBS:** add one Browser Source at the Overlay URL, recommended 1920×1080. Configure audio monitoring/output and follow the real OBS test. `obs-websocket` is optional, disabled by default.
9. **Final check:** health OK → Agent connected → Source Inspector receiving data → isolated simulation visible → test cue audible → manual backup created and integrity checked.

## Guides

[Commande Twitch !ship](docs/chat-ship.md).

[Mémoire éditoriale adaptative et scénarios de test](docs/editorial-memory.md).

[Choreographed FULL sequences](docs/choreography.md).

[Event-specific visuals and rollback](docs/visual-presentations.md).

[Démarrage automatique Mac et Shadow](docs/autostart.md).

**Installation sur Shadow depuis GitHub : [guide pas à pas en français](docs/demarrage-shadow.md).**

Start with [Mac installation](docs/installation-mac.md), [Shadow installation](docs/installation-shadow.md), [Tailscale](docs/tailscale.md), [OBS](docs/obs-setup.md), [configuration](docs/configuration.md), [troubleshooting](docs/troubleshooting.md). Developer guides: [architecture](docs/architecture.md), [module SDK](docs/module-development.md), [event catalogue](docs/event-catalog.md), [testing](docs/testing.md), [final audit](docs/final-audit.md), [technical validation](docs/technical-validation.md), [deviations](docs/deviations.md).
