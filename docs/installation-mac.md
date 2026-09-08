# Mac installation

Install Node 24 LTS from https://nodejs.org/ . Ensure `node --version` reports v24. Initial validation used an isolated Node24.20.0 binary. The development Mac now also has a durable Homebrew Node24 installation.

If your terminal reports `node: command not found`, Node is either missing or absent from PATH. On an Apple Silicon Mac with Homebrew installed at `/opt/homebrew`, use:

```sh
/opt/homebrew/bin/brew install node@24
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node --version
npm --version
```

Persist that PATH export at the end of `~/.zprofile` and `~/.zshrc`, then reopen Terminal. On the development Mac this has already been configured. A terminal that was open before the change needs the `export` command above. Other Homebrew locations require adapting the prefix.

Retrieve ShipOS source, enter the repository root, then run `npm ci`, `npx playwright install chromium`, `npm run verify:final`. Native better-sqlite3 is Core-only. npm uses its prebuilt binary when available; if a native build is required, install Xcode Command Line Tools. SQLite CLI is not required.

Create a private `shipos.env` containing a generated `SHIPOS_AGENT_TOKEN` of at least 16 characters; restrict file access. Optionally set `SHIPOS_CONFIG=/absolute/core.json` and `SHIPOS_DATA_DIR=/absolute/data`. Copy the example JSON first and edit it. JSON contains no secrets.

Default data directory: `~/Library/Application Support/ShipOS`. It contains `shipos.db`, WAL/SHM sidecars, backups, logs and process lock. Start from repository root:

```sh
node --env-file=/absolute/private/shipos.env dist/apps/core/src/main.js
```

`npm run start:core` also works when variables are already exported. Check `curl http://127.0.0.1:48100/health`. Open `/control`, then `/overlay`; launch a presentation preview and allow audio. Create a backup in System, inspect its path, and run the documented restore exercise on a separate data directory.

Ctrl-C performs graceful shutdown. Do not run multiple Core processes on the same data directory. Static UI build is served by Core; no Vite, Docker or process manager is needed in production.
