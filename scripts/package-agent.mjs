import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const target = join(process.cwd(), "release", "shipos-agent");
mkdirSync(target, { recursive: true });
for (const p of ["apps/agent", "packages/contracts"])
  cpSync(join("dist", p), join(target, "dist", p), { recursive: true });
const manifest = JSON.parse(readFileSync("apps/agent/package.json", "utf8"));
delete manifest.dependencies["@shipos/contracts"];
writeFileSync(
  join(target, "package.json"),
  JSON.stringify(
    {
      name: "shipos-agent-release",
      version: "1.0.0",
      private: true,
      type: "module",
      engines: { node: ">=24 <25" },
      scripts: { start: "node dist/apps/agent/src/main.js" },
      dependencies: manifest.dependencies,
    },
    null,
    2,
  ),
);
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  [
    "install",
    "--package-lock-only",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  { cwd: target, stdio: "inherit", shell: process.platform === "win32" },
);
console.log(target);
