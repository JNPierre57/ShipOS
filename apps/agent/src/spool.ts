import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  sourceSchema,
  type SourceEvent,
} from "../../../packages/contracts/src/index.js";
export const hash = (content: string | Buffer) =>
  createHash("sha256").update(content).digest("hex");
export function durableWrite(path: string, data: string) {
  const tmp = path + ".tmp";
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
  if (process.platform !== "win32") {
    const dir = openSync(dirname(path), "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  }
}
export interface Checkpoint {
  agentId: string;
  nextSequence: number;
  acked: number;
  initialized: boolean;
  cursors: Record<string, number>;
  hashes: Record<string, string>;
  bootstrapEnds: Record<string, number>;
}
export class Spool {
  state: Checkpoint;
  events: SourceEvent[] = [];
  private file: string;
  private checkpoint: string;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    this.file = join(directory, "spool.jsonl");
    this.checkpoint = join(directory, "checkpoint.json");
    this.state = existsSync(this.checkpoint)
      ? (JSON.parse(readFileSync(this.checkpoint, "utf8")) as Checkpoint)
      : {
          agentId: randomUUID(),
          nextSequence: 1,
          acked: 0,
          initialized: false,
          cursors: {},
          hashes: {},
          bootstrapEnds: {},
        };
    if (existsSync(this.file)) {
      const buffer = readFileSync(this.file);
      const end = buffer.lastIndexOf(10) + 1;
      if (end < buffer.length) truncateSync(this.file, end);
      for (const line of buffer
        .subarray(0, end)
        .toString("utf8")
        .split("\n")
        .filter(Boolean)) {
        const e = sourceSchema.parse(JSON.parse(line));
        if (e.agentId !== this.state.agentId)
          throw Error("Spool identity mismatch");
        this.events.push(e);
        this.state.nextSequence = Math.max(
          this.state.nextSequence,
          e.sequence + 1,
        );
        this.applyCursor(e);
      }
    }
    this.save();
  }
  save() {
    durableWrite(this.checkpoint, JSON.stringify(this.state));
  }
  private applyCursor(e: SourceEvent) {
    if (e.source === "elite.journal")
      this.state.cursors[e.sourceRecord.filename] = Math.max(
        this.state.cursors[e.sourceRecord.filename] ?? 0,
        e.sourceRecord.byteEnd ?? 0,
      );
    else
      this.state.hashes[e.sourceRecord.filename] = e.sourceRecord.contentHash;
  }
  append(
    input: Omit<SourceEvent, "schemaVersion" | "sequence" | "agentId" | "id">,
    afterSpool?: () => void,
  ) {
    const id = hash(
      JSON.stringify([this.state.agentId, input.source, input.sourceRecord]),
    );
    const old = this.events.find((e) => e.id === id);
    if (old) {
      this.applyCursor(old);
      this.save();
      return old;
    }
    const event = sourceSchema.parse({
      ...input,
      id,
      schemaVersion: 1,
      agentId: this.state.agentId,
      sequence: this.state.nextSequence,
    });
    const fd = openSync(this.file, "a", 0o600);
    try {
      appendFileSync(fd, JSON.stringify(event) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    this.events.push(event);
    this.state.nextSequence++;
    afterSpool?.();
    this.applyCursor(event);
    this.save();
    return event;
  }
  ack(sequence: number) {
    if (sequence < this.state.acked || sequence >= this.state.nextSequence)
      throw Error("Invalid cumulative ACK; resync required");
    this.state.acked = sequence;
    this.save();
  }
  compact() {
    const keep = this.events.filter((e) => e.sequence > this.state.acked);
    durableWrite(this.file, keep.map((e) => JSON.stringify(e) + "\n").join(""));
    this.events = keep;
  }
  pending() {
    return this.events.filter((e) => e.sequence > this.state.acked);
  }
}
