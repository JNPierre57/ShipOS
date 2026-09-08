# Backup and restore

Default database `~/Library/Application Support/ShipOS/shipos.db`. WAL, FULL synchronous, foreign keys and a5s busy timeout are configured at open. schema_migrations stores ordered filenames/checksums. A changed applied checksum aborts startup. Never delete the database as a migration strategy.

Before unapplied migrations, Store creates a consistent backup using better-sqlite3's SQLite online backup API, then integrity-checks it. Backup failure aborts migration. Migrations run transactionally. Manual backup is Control Panel System → Create backup, or local POST /api/v1/backup. Default retention10 snapshots. Old backups are pruned only after a successful new backup. Runtime source/spool retention is independent.

## Restore

1. Stop Core with Ctrl-C and verify no Core process owns the data directory or ports. Keep Agent running/spooling if appropriate.
2. Retain the current DB and its WAL/SHM together. Do not copy only a live .db file.
3. From the repository after build:

```sh
npm run restore -- "/absolute/backups/shipos-snapshot.db" "/absolute/data/shipos.db" --core-stopped
```

The tool checks the backup, moves existing DB/WAL/SHM to timestamped pre-restore names, copies the snapshot and integrity-checks it. The explicit flag asserts you stopped Core; the tool does not stop other applications.

4. Restart Core, check health, source ACKs and settings, then run a simulation. If restoring an older snapshot than Agent's durable ACK, Agent must report a resync error rather than pretend missing source data can be recovered. Use a sufficiently recent backup or restore the matching Agent spool/checkpoint archive. Backups are not a substitute for retaining unACKed data.
5. To roll back a failed migration, stop Core, restore the pre-migration backup and run the matching earlier application revision. Preserve the failed DB for diagnosis.

Automated tests cover checksum mismatch, already-applied migration, backup-before-upgrade, restore integrity and retained settings.
