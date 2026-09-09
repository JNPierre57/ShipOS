// Isolated visual probe: intercepts the socket; sends nothing to the live Core/OBS.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  let peer;
  await page.routeWebSocket("**/overlay/ws", (socket) => {
    peer = socket;
    socket.send(JSON.stringify({ type: "snapshot", runs: [] }));
  });
  await page.goto("http://127.0.0.1:48100/overlay/?motion=full");
  await page.locator("main[data-connected=true]").waitFor();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  let override;
  for (const variant of ["mask", "opacity-transform", "mask-repeat"]) {
    if (override) await override.evaluate((e) => e.remove());
    override = await page.addStyleTag({
      content:
        variant === "opacity-transform"
          ? "@keyframes os-arrive {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}"
          : "@keyframes os-arrive {from{opacity:0;transform:none;clip-path:inset(0 100% 0 0)}to{opacity:1;transform:none;clip-path:inset(0)}}",
    });
    const trace = [];
    const collect = (e) => trace.push(...e.value);
    cdp.on("Tracing.dataCollected", collect);
    await cdp.send("Tracing.start", {
      categories: "devtools.timeline",
      transferMode: "ReportEvents",
    });
    const before = await cdp.send("Performance.getMetrics");
    for (let i = 0; i < 3; i++) {
      const at = Date.now(),
        id = "probe-" + variant + i;
      peer.send(
        JSON.stringify({
          type: "action",
          action: {
            id,
            presentationRunId: id,
            type: "overlay.show",
            target: "primary",
            issuedAt: at,
            payload: {
              title: "PROBE",
              profile: "FULL",
              mode: "simulation",
              startedAt: at,
              endsAt: at + 1200,
              layers: ["EventLayer"],
              terminal: {
                primitive: "ConsoleStrip",
                severity: "notice",
                label: "SHIPOS / DIAGNOSTIC",
                lines: [
                  "TELEMETRY PROFILE ACQUIRED",
                  "SYNTHETIC VISUAL PROBE",
                  "NO LIVE EVENT",
                ],
                timingMs: 450,
                emphasis: 0,
              },
            },
          },
        }),
      );
      await page.waitForTimeout(1400);
    }
    const after = await cdp.send("Performance.getMetrics");
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.end");
    await done;
    cdp.off("Tracing.dataCollected", collect);
    const value = (r, key) => r.metrics.find((x) => x.name === key)?.value ?? 0;
    const paint = trace.filter((e) => e.name === "Paint" && e.ph === "X");
    console.log(
      JSON.stringify({
        variant,
        alerts: 3,
        taskMs:
          (value(after, "TaskDuration") - value(before, "TaskDuration")) * 1000,
        paintEvents: paint.length,
        paintMs: paint.reduce((n, e) => n + (e.dur ?? 0), 0) / 1000,
        remainingCards: await page.locator(".card").count(),
      }),
    );
  }
} finally {
  await browser.close();
}
