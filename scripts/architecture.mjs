import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)],
  );
}
for (const path of files("modules").filter((p) => p.endsWith(".ts"))) {
  const text = readFileSync(path, "utf8");
  for (const pattern of [
    /better-sqlite3/,
    /fastify/,
    /apps\/core/,
    /process\.env/,
    /node:(?:net|http|fs)/,
    /\b(?:SELECT|INSERT|UPDATE|DELETE)\s/,
  ])
    assert(
      !pattern.test(text),
      `Forbidden module dependency: ${path}: ${pattern}`,
    );
}
for (const path of files("apps/agent/src"))
  assert(
    !/better-sqlite3|apps\/core|modules\//.test(readFileSync(path, "utf8")),
    `Agent boundary: ${path}`,
  );
for (const path of files("packages/presentation-renderer/src"))
  assert(
    !/ScanOrganic|HullDamage|SAASignalsFound|PlayerPilot/.test(
      readFileSync(path, "utf8"),
    ),
    `Renderer knows Frontier: ${path}`,
  );
assert(
  /new Store\(["']:memory:["']\)/.test(
    readFileSync("apps/core/src/isolated-runs.ts", "utf8"),
  ),
);
console.log("Architectural boundaries verified.");
