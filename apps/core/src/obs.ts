import {
  OBSWebSocket,
  EventSubscription,
  type OBSRequestTypes,
  type OBSResponseTypes,
} from "obs-websocket-js";
import { z } from "zod";
export const obsSchema = z.strictObject({
  enabled: z.boolean().default(false),
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(4455),
  allowedInputs: z.array(z.string().min(1)).default([]),
});
export interface BroadcastState {
  connected: boolean;
  active: boolean;
  startedAt: number | null;
  stopped?: boolean;
  newBroadcast?: boolean;
}
export class ObsAdapter {
  broadcastListeners = new Set<(state: BroadcastState) => void>();
  private broadcastStartedAt: number | null = null;
  private broadcast(state: Partial<BroadcastState> = {}) {
    for (const listener of this.broadcastListeners)
      listener({
        connected: this.status === "READY",
        active: this.streamActive,
        startedAt: this.broadcastStartedAt,
        ...state,
      });
  }
  status: "DISABLED" | "READY" | "DEGRADED" = "DISABLED";
  streamActive = false;
  revision = 0;
  streamEpoch = 0;
  transitioning = false;
  versions: { obs: string; websocket: string } | null = null;
  screenshotReady = false;
  constructor(
    readonly config: z.infer<typeof obsSchema>,
    private client = new OBSWebSocket(),
  ) {
    this.client.on("ConnectionClosed", () => {
      if (config.enabled) this.status = "DEGRADED";
      this.streamActive = false;
      this.revision++;
      this.broadcast();
    });
    this.client.on("ConnectionError", () => {
      this.status = "DEGRADED";
      this.streamActive = false;
      this.revision++;
      this.broadcast();
    });
    this.client.on("StreamStateChanged", (e) => {
      const started = e.outputState === "OBS_WEBSOCKET_OUTPUT_STARTED";
      this.streamActive =
        started || e.outputState === "OBS_WEBSOCKET_OUTPUT_RECONNECTED";
      if (started) this.streamEpoch++;
      this.revision++;
      const stopped = e.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED";
      if (stopped || started) this.broadcastStartedAt = null;
      this.broadcast({ stopped, newBroadcast: started });
      if (this.streamActive) void this.streamStatus(false).catch(() => {});
    });
    this.client.on("SceneTransitionStarted", () => {
      this.transitioning = true;
      this.revision++;
    });
    this.client.on("SceneTransitionEnded", () => {
      this.transitioning = false;
      this.revision++;
    });
    for (const event of [
      "CurrentProgramSceneChanged",
      "SceneItemEnableStateChanged",
      "SceneItemTransformChanged",
      "SceneItemListReindexed",
      "SceneItemCreated",
      "SceneItemRemoved",
      "CurrentSceneCollectionChanging",
      "InputSettingsChanged",
      "SourceFilterEnableStateChanged",
    ] as const)
      this.client.on(event, () => {
        this.revision++;
      });
  }
  private async request<K extends keyof OBSRequestTypes>(
    type: K,
    data?: OBSRequestTypes[K],
  ): Promise<OBSResponseTypes[K]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.client.call(type, data),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.status = "DEGRADED";
            this.streamActive = false;
            this.revision++;
            this.broadcast();
            reject(Error("obs_timeout"));
          }, 4000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async connect(password?: string) {
    if (!this.config.enabled) return;
    this.status = "DEGRADED";
    try {
      await this.client.connect(
        `ws://${this.config.host}:${this.config.port}`,
        password,
        {
          rpcVersion: 1,
          eventSubscriptions:
            EventSubscription.All | EventSubscription.SceneItemTransformChanged,
        },
      );
      this.status = "READY";
      const version = await this.request("GetVersion");
      this.versions = {
        obs: version.obsVersion,
        websocket: version.obsWebSocketVersion,
      };
      this.screenshotReady =
        [
          "GetSourceScreenshot",
          "GetStreamStatus",
          "GetCurrentProgramScene",
          "GetCurrentSceneTransitionCursor",
          "GetSceneItemList",
          "GetGroupSceneItemList",
          "GetGroupList",
        ].every((r) => version.availableRequests.includes(r)) &&
        version.supportedImageFormats.some((f) => ["jpg", "jpeg"].includes(f));
      await this.streamStatus(false);
    } catch {
      this.status = "DEGRADED";
      this.broadcast();
    }
  }
  async streamStatus(requireActive = true) {
    if (this.status !== "READY") throw Error("obs_unavailable");
    const revision = this.revision;
    const s = await this.request("GetStreamStatus");
    if (revision !== this.revision) throw Error("obs_context_changed");
    this.streamActive = s.outputActive && !s.outputReconnecting;
    if (this.streamActive && Number.isFinite(s.outputDuration))
      this.broadcastStartedAt = Date.now() - s.outputDuration;
    const stopped = !s.outputActive && !s.outputReconnecting;
    if (stopped) this.broadcastStartedAt = null;
    this.broadcast({ stopped });
    if (
      (requireActive && !this.streamActive) ||
      !Number.isFinite(s.outputDuration)
    )
      throw Error("stream_inactive");
    return {
      startedAt: Date.now() - s.outputDuration,
      epoch: this.streamEpoch,
    };
  }
  private async visible(
    sceneName: string,
    target: string,
    group = false,
    visited = new Set<string>(),
    groups = new Set<string>(),
  ): Promise<boolean> {
    if (visited.has(sceneName) || visited.size >= 32) return false;
    visited.add(sceneName);
    const list = await this.request(
      group ? "GetGroupSceneItemList" : "GetSceneItemList",
      { sceneName },
    );
    for (const raw of list.sceneItems) {
      const item = raw as Record<string, unknown>;
      if (item.sceneItemEnabled !== true || typeof item.sourceName !== "string")
        continue;
      if (item.sourceName === target) return true;
      if (
        (item.isGroup === true ||
          item.sourceType === "OBS_SOURCE_TYPE_SCENE" ||
          (typeof item.sourceName === "string" &&
            groups.has(item.sourceName))) &&
        (await this.visible(
          item.sourceName,
          target,
          item.isGroup === true,
          visited,
          groups,
        ))
      )
        return true;
    }
    return false;
  }
  async captureProgram(scene: string, requiredSource: string) {
    const began = Date.now();
    if (!this.screenshotReady) throw Error("obs_capture_unavailable");
    const stream = await this.streamStatus(),
      revision = this.revision;
    const groups = new Set<string>(
      (
        (await this.request("GetGroupList")).groups as Array<{
          groupName?: string;
        }>
      )
        .map((g) => g.groupName)
        .filter((g): g is string => typeof g === "string"),
    );
    const check = async () => {
      const program = await this.request("GetCurrentProgramScene");
      if (!scene || program.currentProgramSceneName !== scene)
        throw Error("target_not_in_program");
      const cursor = await this.request("GetCurrentSceneTransitionCursor");
      if (
        this.transitioning ||
        (cursor.transitionCursor !== 0 && cursor.transitionCursor !== 1)
      )
        throw Error("obs_transition");
      if (
        requiredSource &&
        !(await this.visible(scene, requiredSource, false, new Set(), groups))
      )
        throw Error("source_not_visible");
      if (revision !== this.revision || !this.streamActive)
        throw Error("obs_context_changed");
    };
    await check();
    if (Date.now() - began > 10000) throw Error("obs_timeout");
    const shot = await this.request("GetSourceScreenshot", {
      sourceName: scene,
      imageFormat: "jpg",
      imageWidth: 1280,
      imageCompressionQuality: 80,
    });
    await this.streamStatus();
    await check();
    return { imageData: shot.imageData, ...stream, revision };
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
