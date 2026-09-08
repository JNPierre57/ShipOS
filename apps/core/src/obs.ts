import { OBSWebSocket } from "obs-websocket-js";
import { z } from "zod";
export const obsSchema = z.strictObject({
  enabled: z.boolean().default(false),
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(4455),
  allowedInputs: z.array(z.string().min(1)).default([]),
});
export class ObsAdapter {
  status: "DISABLED" | "READY" | "DEGRADED" = "DISABLED";
  private client = new OBSWebSocket();
  constructor(readonly config: z.infer<typeof obsSchema>) {
    this.client.on("ConnectionClosed", () => {
      if (config.enabled) this.status = "DEGRADED";
    });
    this.client.on("ConnectionError", () => {
      this.status = "DEGRADED";
    });
  }
  async connect(password?: string) {
    if (!this.config.enabled) return;
    this.status = "DEGRADED";
    try {
      await this.client.connect(
        `ws://${this.config.host}:${this.config.port}`,
        password,
        { rpcVersion: 1 },
      );
      this.status = "READY";
    } catch {
      this.status = "DEGRADED";
    }
  }
  async mute(inputName: string, inputMuted: boolean) {
    if (!this.config.enabled || !this.config.allowedInputs.includes(inputName))
      throw Error("OBS target is not allowlisted");
    if (this.status !== "READY") return false;
    try {
      await this.client.call("SetInputMute", { inputName, inputMuted });
      return true;
    } catch {
      this.status = "DEGRADED";
      return false;
    }
  }
  async close() {
    await this.client.disconnect();
  }
}
