import {
  openSync,
  closeSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
export function acquireLock(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  try {
    const fd = openSync(path, "wx", 0o600);
    writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    closeSync(fd);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    )
      throw error;
    let owner;
    try {
      owner = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw Error(
        "Invalid process lock; inspect running processes before removing " +
          path,
      );
    }
    try {
      process.kill(owner.pid, 0);
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ESRCH") {
        unlinkSync(path);
        return acquireLock(path);
      }
      throw e;
    }
    throw Error("ShipOS already owns data directory; PID " + owner.pid);
  }
  return () => {
    try {
      if (JSON.parse(readFileSync(path, "utf8")).pid === process.pid)
        unlinkSync(path);
    } catch {
      /* Already released. */
    }
  };
}
