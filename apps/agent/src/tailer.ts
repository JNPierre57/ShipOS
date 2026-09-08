import {
  appendFileSync,
  readFileSync,
  readdirSync,
  statSync,
  watch,
  openSync,
  readSync,
  closeSync,
  type FSWatcher,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { hash, Spool } from "./spool.js";
const rawSchema = z.record(z.string(), z.unknown());
export class Tailer {
  private watcher?: FSWatcher;
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(
    readonly directory: string,
    readonly spool: Spool,
    readonly diagnostic: (detail: Record<string, unknown>) => void = () => {},
  ) {
    if (!statSync(directory).isDirectory())
      throw Error("Journal folder not found: " + directory);
  }
  reconcile() {
    if (this.busy) return;
    this.busy = true;
    try {
      const files = readdirSync(this.directory)
        .filter((f) => /^Journal\..*\.log$/i.test(f))
        .sort();
      if (!this.spool.state.initialized) {
        const latest = files.at(-1);
        const sessionPrefix = latest?.replace(/\.\d+\.log$/i, "");
        for (const f of files) {
          const size = statSync(join(this.directory, f)).size;
          if (sessionPrefix && f.replace(/\.\d+\.log$/i, "") === sessionPrefix)
            this.spool.state.bootstrapEnds[f] = size;
          else this.spool.state.cursors[f] = size;
        }
        this.spool.state.initialized = true;
        this.spool.save();
      }
      for (const filename of files) {
        let cursor = this.spool.state.cursors[filename] ?? 0;
        const size = statSync(join(this.directory, filename)).size;
        if (size < cursor) {
          this.diagnostic({ code: "journal_truncated", filename, cursor });
          continue;
        }
        const base = cursor;
        const fd = openSync(join(this.directory, filename), "r");
        const buffer = Buffer.alloc(Math.min(size - base, 4 * 1024 * 1024));
        try {
          readSync(fd, buffer, 0, buffer.length, base);
        } finally {
          closeSync(fd);
        }
        let local = 0;
        let end: number;
        while ((end = buffer.indexOf(10, local)) >= 0) {
          const bytes = buffer.subarray(local, end + 1);
          const start = base + local;
          local = end + 1;
          cursor = base + local;
          let payload: Record<string, unknown>;
          try {
            payload = rawSchema.parse(
              JSON.parse(
                new TextDecoder("utf-8", { fatal: true }).decode(bytes),
              ),
            );
          } catch {
            const detail = {
              code: "malformed_line",
              filename,
              byteStart: start,
              byteEnd: cursor,
              content: bytes.toString("base64"),
            };
            appendFileSync(
              join(this.spool.directory, "quarantine.jsonl"),
              JSON.stringify(detail) + "\n",
              { mode: 0o600 },
            );
            this.diagnostic(detail);
            this.spool.state.cursors[filename] = cursor;
            this.spool.save();
            continue;
          }
          this.spool.append({
            source: "elite.journal",
            mode:
              start < (this.spool.state.bootstrapEnds[filename] ?? 0)
                ? "bootstrap"
                : "live",
            observedAt: new Date().toISOString(),
            sourceTimestamp: z.iso.datetime().safeParse(payload.timestamp)
              .success
              ? String(payload.timestamp)
              : null,
            sourceRecord: {
              filename,
              byteStart: start,
              byteEnd: cursor,
              contentHash: hash(bytes),
            },
            payload,
          });
        }
      }
      for (const [filename, source] of [
        ["Status.json", "elite.status"],
        ["NavRoute.json", "elite.navroute"],
      ] as const) {
        let failure: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const bytes = readFileSync(join(this.directory, filename));
            const contentHash = hash(bytes);
            if (this.spool.state.hashes[filename] === contentHash) break;
            const payload = rawSchema.parse(JSON.parse(bytes.toString("utf8")));
            this.spool.append({
              source,
              mode:
                this.spool.state.hashes[filename] === undefined
                  ? "bootstrap"
                  : "live",
              observedAt: new Date().toISOString(),
              sourceTimestamp: z.iso.datetime().safeParse(payload.timestamp)
                .success
                ? String(payload.timestamp)
                : null,
              sourceRecord: { filename, contentHash },
              payload,
            });
            failure = undefined;
            break;
          } catch (err) {
            failure = err;
          }
        }
        if (
          failure &&
          !(
            failure instanceof Error &&
            "code" in failure &&
            failure.code === "ENOENT"
          )
        )
          this.diagnostic({ code: "sidecar_unreadable", filename });
      }
    } finally {
      this.busy = false;
    }
  }
  start(interval = 1000) {
    this.reconcile();
    try {
      this.watcher = watch(this.directory, () => this.safeReconcile());
      this.watcher.on("error", () =>
        this.diagnostic({ code: "watch_unavailable" }),
      );
    } catch {
      this.diagnostic({ code: "watch_unavailable" });
    }
    this.timer = setInterval(() => this.safeReconcile(), interval);
  }
  private safeReconcile() {
    try {
      this.reconcile();
    } catch (error) {
      this.diagnostic({ code: "reconcile_failed", error: String(error) });
    }
  }
  stop() {
    this.watcher?.close();
    clearInterval(this.timer);
  }
}
