import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { chromium } from "@playwright/test";
import { WebSocketServer } from "ws";
const root = resolve(process.argv[2] ?? "apps/overlay/build");
const server = createServer((req, res) => {
  const path = resolve(
    root,
    req.url === "/overlay/"
      ? "index.html"
      : req.url.replace(/^\/overlay\//, ""),
  );
  if (!path.startsWith(root + "/")) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      extname(path) === ".js"
        ? "application/javascript"
        : extname(path) === ".css"
          ? "text/css"
          : "text/html",
    );
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
const ws = new WebSocketServer({ server });
ws.on("connection", (socket) =>
  socket.send(JSON.stringify({ type: "snapshot", runs: [] })),
);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/overlay/`);
  await page.locator("main[data-connected=true]").waitFor();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const before = await cdp.send("Performance.getMetrics");
  await page.waitForTimeout(5000);
  const after = await cdp.send("Performance.getMetrics");
  const value = (r, name) => r.metrics.find((x) => x.name === name)?.value ?? 0;
  console.log(
    JSON.stringify(
      {
        root,
        sampleSeconds: 5,
        taskMs:
          (value(after, "TaskDuration") - value(before, "TaskDuration")) * 1000,
        scriptMs:
          (value(after, "ScriptDuration") - value(before, "ScriptDuration")) *
          1000,
        heapUsed: value(after, "JSHeapUsedSize"),
        animations: await page.evaluate(() => document.getAnimations().length),
        cards: await page.locator(".card").count(),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  ws.close();
  server.close();
}
