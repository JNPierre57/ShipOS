import { test, expect } from "vitest";
import { ObsAdapter, obsSchema } from "../../apps/core/src/obs.js";
test("OBS optional and allowlist enforced even when unavailable", async () => {
  const disabled = new ObsAdapter(obsSchema.parse({}));
  await disabled.connect();
  expect(disabled.status).toBe("DISABLED");
  await expect(disabled.mute("Foreign source", true)).rejects.toThrow(
    "allowlisted",
  );
  const enabled = new ObsAdapter(
    obsSchema.parse({ enabled: true, port: 1, allowedInputs: ["ShipOS"] }),
  );
  await enabled.connect();
  expect(enabled.status).toBe("DEGRADED");
  expect(await enabled.mute("ShipOS", true)).toBe(false);
  await expect(enabled.mute("Foreign source", true)).rejects.toThrow();
  await enabled.close();
});
