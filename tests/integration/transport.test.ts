import { test, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Spool } from "../../apps/agent/src/spool.js";
import { Transport } from "../../apps/agent/src/transport.js";
import { Store } from "../../apps/core/src/store.js";
import { createGateway } from "../../apps/core/src/gateway.js";
import { source } from "../../packages/testkit/src/index.js";
test("network loss after commit before ACK; native client reconnect, ACK resume, Agent restart and in-flight window", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shipos-transport "));
  let spool = new Spool(dir);
  const first = source({ event: "Status", Flags: 0 });
  spool.append(first);
  const store = new Store(":memory:");
  await store.migrate();
  let drop = true;
  const gateway = await createGateway(
    store,
    "transport-token",
    () => {},
    20,
    200,
    () => {
      if (drop) {
        drop = false;
        return false;
      }
      return true;
    },
  );
  await gateway.app.listen({ host: "127.0.0.1", port: 0 });
  const port = (gateway.app.server.address() as { port: number }).port;
  const config = {
    url: `ws://127.0.0.1:${port}/agent/v1/ws`,
    token: "transport-token",
    heartbeatMs: 20,
    staleMs: 200,
    reconnectMs: 20,
    maxBackoffMs: 50,
    window: 2,
  };
  let client = new Transport(spool, config);
  try {
    client.start();
    await expect.poll(() => spool.state.acked).toBe(1);
    expect(store.pendingSources()).toHaveLength(1);
    gateway.dropConnection();
    for (let i = 2; i <= 8; i++)
      spool.append(source({ event: "Unknown", value: i }, i));
    await expect.poll(() => spool.state.acked).toBe(8);
    expect(store.pendingSources()).toHaveLength(8);
    client.stop();
    spool = new Spool(dir);
    spool.append(source({ event: "Shutdown" }, 9));
    client = new Transport(spool, config);
    client.start();
    await expect.poll(() => spool.state.acked).toBe(9);
    expect(store.pendingSources()).toHaveLength(9);
    expect(spool.pending()).toHaveLength(0);
  } finally {
    client.stop();
    await gateway.app.close();
    store.close();
  }
});
