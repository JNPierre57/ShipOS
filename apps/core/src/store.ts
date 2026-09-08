import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  SourceEvent,
  DomainEvent,
} from "../../../packages/contracts/src/index.js";
export type Table =
  | "director_decisions"
  | "presentation_runs"
  | "sessions"
  | "expeditions"
  | "records"
  | "milestones"
  | "settings"
  | "module_storage"
  | "world_state";
export class Store {
  db: Database.Database;
  constructor(
    readonly path: string,
    readonly migrations = join(process.cwd(), "migrations"),
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
  }
  async migrate(retention = 10) {
    try {
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL)",
      );
      const files = readdirSync(this.migrations)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const name of files) {
        const sql = readFileSync(join(this.migrations, name), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        const row = this.db
          .prepare("SELECT checksum FROM schema_migrations WHERE version=?")
          .get(name) as { checksum: string } | undefined;
        if (row) {
          if (row.checksum !== checksum)
            throw Error("Migration checksum mismatch: " + name);
          continue;
        }
        if (this.path !== ":memory:") await this.backup(retention);
        this.db.transaction(() => {
          this.db.exec(sql);
          this.db
            .prepare("INSERT INTO schema_migrations VALUES(?,?)")
            .run(name, checksum);
        })();
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  async backup(retention = 10) {
    if (this.path === ":memory:") return "in-memory";
    const dir = join(dirname(this.path), "backups");
    mkdirSync(dir, { recursive: true });
    const target = join(
      dir,
      `shipos-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
    );
    await this.db.backup(target);
    const check = new Database(target, { readonly: true });
    try {
      if (check.pragma("integrity_check", { simple: true }) !== "ok")
        throw Error("Backup integrity failed");
    } finally {
      check.close();
    }
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".db"))
      .sort()
      .reverse();
    for (const old of files.slice(retention)) unlinkSync(join(dir, old));
    return target;
  }
  ack(agentId: string) {
    return (
      (
        this.db
          .prepare("SELECT sequence FROM agent_ingest_state WHERE agent_id=?")
          .get(agentId) as { sequence: number } | undefined
      )?.sequence ?? 0
    );
  }
  accept(event: SourceEvent) {
    return this.db.transaction(() => {
      const ack = this.ack(event.agentId);
      const old = this.db
        .prepare(
          "SELECT data FROM source_events WHERE id=? OR (agent_id=? AND sequence=?)",
        )
        .get(event.id, event.agentId, event.sequence) as
        { data: string } | undefined;
      if (old) {
        const previous = JSON.parse(old.data) as SourceEvent;
        if (
          previous.id !== event.id ||
          previous.sequence !== event.sequence ||
          JSON.stringify(previous.payload) !== JSON.stringify(event.payload) ||
          previous.agentId !== event.agentId
        )
          throw Error("Source identity conflict");
        return ack;
      }
      if (event.sequence !== ack + 1)
        throw Error("Sequence gap; resync from " + ack);
      this.db
        .prepare(
          "INSERT INTO source_events(id,agent_id,sequence,data) VALUES(?,?,?,?)",
        )
        .run(event.id, event.agentId, event.sequence, JSON.stringify(event));
      this.db
        .prepare(
          "INSERT INTO agent_ingest_state VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET sequence=excluded.sequence",
        )
        .run(event.agentId, event.sequence);
      return event.sequence;
    })();
  }
  pendingSources() {
    return (
      this.db
        .prepare(
          "SELECT data FROM source_events WHERE processing_state='pending' ORDER BY rowid",
        )
        .all() as { data: string }[]
    ).map((r) => JSON.parse(r.data) as SourceEvent);
  }
  source(id: string) {
    const r = this.db
      .prepare("SELECT * FROM source_events WHERE id=?")
      .get(id) as { data: string; inspection: string } | undefined;
    return r
      ? {
          event: JSON.parse(r.data),
          inspection: r.inspection ? JSON.parse(r.inspection) : null,
        }
      : null;
  }
  processed(id: string, inspection: unknown) {
    this.db
      .prepare(
        "UPDATE source_events SET processing_state='done',inspection=? WHERE id=?",
      )
      .run(JSON.stringify(inspection), id);
  }
  domain(event: DomainEvent) {
    const old = this.db
      .prepare("SELECT sequence FROM domain_events WHERE id=?")
      .get(event.id) as { sequence: number } | undefined;
    if (old) return { ...event, sequence: old.sequence };
    const result = this.db
      .prepare("INSERT INTO domain_events(id,data) VALUES(?,?)")
      .run(event.id, JSON.stringify(event));
    event = { ...event, sequence: Number(result.lastInsertRowid) };
    this.db
      .prepare("UPDATE domain_events SET data=? WHERE id=?")
      .run(JSON.stringify(event), event.id);
    return event;
  }
  events(after = 0, limit = 1000, pending = false) {
    return (
      this.db
        .prepare(
          `SELECT data FROM domain_events WHERE sequence>? ${pending ? "AND dispatch_state='pending'" : ""} ORDER BY sequence LIMIT ?`,
        )
        .all(after, limit) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as DomainEvent);
  }
  event(id: string) {
    const row = this.db
      .prepare("SELECT data FROM domain_events WHERE id=?")
      .get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as DomainEvent) : undefined;
  }
  recentEvents(before = Number.MAX_SAFE_INTEGER, limit = 200) {
    return (
      this.db
        .prepare(
          "SELECT data FROM domain_events WHERE sequence<? ORDER BY sequence DESC LIMIT ?",
        )
        .all(before, limit) as { data: string }[]
    )
      .map((r) => JSON.parse(r.data) as DomainEvent)
      .reverse();
  }
  dispatched(id: string) {
    this.db
      .prepare("UPDATE domain_events SET dispatch_state='done' WHERE id=?")
      .run(id);
  }
  get<T>(table: Table, id: string): T | undefined {
    const key = table === "director_decisions" ? "event_id" : "id";
    const row = this.db
      .prepare(`SELECT data FROM ${table} WHERE ${key}=?`)
      .get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }
  put(table: Table, id: string, data: unknown) {
    const key = table === "director_decisions" ? "event_id" : "id";
    this.db
      .prepare(
        `INSERT INTO ${table}(${key},data) VALUES(?,?) ON CONFLICT(${key}) DO UPDATE SET data=excluded.data`,
      )
      .run(id, JSON.stringify(data));
  }
  all<T>(table: Table): T[] {
    return (
      this.db.prepare(`SELECT data FROM ${table}`).all() as { data: string }[]
    ).map((r) => JSON.parse(r.data) as T);
  }
  close() {
    if (this.db.open) this.db.close();
  }
}
export function validateBackup(path: string) {
  if (!existsSync(path)) throw Error("Backup not found");
  const db = new Database(path, { readonly: true });
  try {
    if (db.pragma("integrity_check", { simple: true }) !== "ok")
      throw Error("Restore integrity failed");
  } finally {
    db.close();
  }
}
