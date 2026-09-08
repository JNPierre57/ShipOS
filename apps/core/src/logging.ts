import { Writable } from "node:stream";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import pino from "pino";
export function createLogger(directory: string) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "core.jsonl");
  let size = existsSync(path) ? statSync(path).size : 0;
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      try {
        if (size + chunk.length > 5 * 1024 * 1024) {
          for (let n = 4; n >= 1; n--) {
            const old = path + "." + n,
              next = path + "." + (n + 1);
            if (n === 4 && existsSync(old)) unlinkSync(old);
            else if (existsSync(old)) renameSync(old, next);
          }
          if (existsSync(path)) renameSync(path, path + ".1");
          size = 0;
        }
        appendFileSync(path, chunk, { mode: 0o600 });
        size += chunk.length;
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
  return pino(
    {
      redact: {
        paths: [
          "token",
          "password",
          "authorization",
          "req.headers.authorization",
        ],
        censor: "[REDACTED]",
      },
    },
    pino.multistream([{ stream: process.stdout }, { stream }]),
  );
}
