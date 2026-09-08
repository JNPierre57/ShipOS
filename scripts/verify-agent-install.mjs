import { cpSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const directory = mkdtempSync(join(tmpdir(), "ShipOS Agent install "));
for (const file of ["package.json", "package-lock.json", "tsconfig.json"])
  cpSync(file, join(directory, file));
for (const group of ["apps", "packages"])
  for (const entry of readdirSync(group)) {
    const manifest = join(group, entry, "package.json");
    if (existsSync(manifest))
      cpSync(manifest, join(directory, manifest), { recursive: true });
  }
for (const path of ["apps/agent", "packages/contracts"])
  cpSync(path, join(directory, path), {
    recursive: true,
    filter: (p) => !p.includes("/build"),
  });
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const options = {
  cwd: directory,
  stdio: "inherit",
  shell: process.platform === "win32",
};
execFileSync(
  npm,
  [
    "ci",
    "--workspace",
    "@shipos/agent",
    "--workspace",
    "@shipos/contracts",
    "--include=dev",
    "--no-audit",
    "--no-fund",
  ],
  options,
);
assert(
  !existsSync(join(directory, "node_modules", "better-sqlite3")),
  "Agent installation pulled SQLite",
);
execFileSync(npm, ["run", "build:agent"], options);
console.log(
  "Agent-only clean install and build: no better-sqlite3 runtime. " + directory,
);
