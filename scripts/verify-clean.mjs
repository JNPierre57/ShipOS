import { cpSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const directory = mkdtempSync(join(tmpdir(), "ShipOS clean install "));
for (const item of [
  "apps",
  "packages",
  "modules",
  "migrations",
  "tests",
  "fixtures",
  "scripts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "eslint.config.js",
  "playwright.config.ts",
])
  cpSync(item, join(directory, item), {
    recursive: true,
    filter: (p) => !p.includes("/build"),
  });
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const opts = {
  cwd: directory,
  stdio: "inherit",
  shell: process.platform === "win32",
};
execFileSync(npm, ["ci", "--no-audit", "--no-fund"], opts);
execFileSync(npm, ["run", "verify:final"], opts);
console.log("Clean installation verified: " + directory);
