import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  defaultPolicy,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";
import type { SourceEvent } from "../../../packages/contracts/src/index.js";
import { eventFactory, type RunContext } from "./runtime.js";
import { shipRequest } from "./ship-command.js";
import type { ObsAdapter } from "./obs.js";

export const screenConfig = z.strictObject({
  captureMode: z.literal("program").default("program"),
  programScene: z.string().max(200).default("Relay - In-Game (Purple)"),
  requiredSource: z.string().max(200).default(""),
  maxCaptures: z.number().int().min(1).max(100).default(30),
});
export const screenModule: ShipModule = {
  manifest: {
    id: "chat-screen",
    name: "Chat !screen",
    version: "1.0.0",
    eventType: "shipos.command.screen",
  },
  configSchema: screenConfig,
  policy: {
    ...defaultPolicy,
    importance: 10,
    urgency: 2,
    attentionCost: 1,
    cooldownMs: 60000,
    ttlMs: 10000,
  },
  detect: () => [],
  present: (e) => ({
    title: "SNAPSHOT CAPTURED",
    subtitle: "STREAM MEMORY",
    durationMs: 5000,
    accent: "#bacdaa",
    slot: "primary",
    layers: ["EventLayer"],
    audioAsset: "",
    terminal: {
      primitive: "ConsoleStrip",
      severity: "notice",
      label: "SHIPOS / SNAPSHOT",
      lines: ["SNAPSHOT CAPTURED"],
      timingMs: 120,
      emphasis: 0,
      imagePath:
        typeof e.payload.imagePath === "string"
          ? e.payload.imagePath
          : undefined,
    },
  }),
};
const manifestSchema = z.object({
  id: z.uuid(),
  startedAt: z.number(),
  lastAt: z.number(),
  endedAt: z.number().optional(),
  shots: z
    .array(
      z.object({
        id: z.uuid(),
        requestId: z.string(),
        at: z.number(),
        scene: z.string(),
      }),
    )
    .max(100),
});
type Manifest = z.infer<typeof manifestSchema>;
export class ScreenCommands {
  private busy = false;
  private requests = new Map<string, number>();
  private manifest: Manifest | null = null;
  private completed: Manifest | null = null;
  private epoch: number | null = null;
  private lastAttempt = 0;
  private closed = false;
  lastError: string | null = null;
  lastSuccess: number | null = null;
  private root: string;
  constructor(
    readonly run: RunContext,
    readonly obs: ObsAdapter,
    dataDir: string,
  ) {
    this.root = join(dataDir, "screens");
    const path = join(this.root, "active.json");
    if (existsSync(path)) {
      try {
        this.manifest = manifestSchema.parse(
          JSON.parse(readFileSync(path, "utf8")),
        );
      } catch {
        this.lastError = "manifest_invalid";
      }
    }
    const completedPath = join(this.root, "completed.json");
    if (existsSync(completedPath)) {
      try {
        this.completed = manifestSchema.parse(
          JSON.parse(readFileSync(completedPath, "utf8")),
        );
      } catch {
        this.lastError ??= "completed_manifest_invalid";
      }
    }
    this.lastSuccess =
      this.manifest?.lastAt || this.completed?.lastAt || null;
  }
  close() {
    this.closed = true;
  }
  config() {
    return screenConfig.parse(
      this.run.registry.status.get("chat-screen")?.config ?? {},
    );
  }
  snapshot() {
    const latest = this.latestShot();
    return {
      enabled: this.run.registry.status.get("chat-screen")?.enabled ?? false,
      obs: this.obs.status,
      streamActive: this.obs.streamActive,
      versions: this.obs.versions,
      config: this.config(),
      count:
        this.obs.streamActive &&
        this.epoch !== null &&
        this.epoch !== this.obs.streamEpoch
          ? 0
          : (this.manifest?.shots.length ?? 0),
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
      lastImagePath: latest
        ? `/api/v1/screens/gallery/${latest.session}/${latest.shot.id}`
        : null,
      lastCapture: latest
        ? {
            id: latest.shot.id,
            session: latest.session,
            at: latest.shot.at,
            scene: latest.shot.scene,
          }
        : null,
    };
  }
  private latestShot() {
    const candidates = [
      ...(this.manifest?.shots ?? []).map((shot) => ({
        session: this.manifest!.id,
        shot,
      })),
      ...(this.completed?.shots ?? []).map((shot) => ({
        session: this.completed!.id,
        shot,
      })),
    ];
    return candidates.sort((a, b) => b.shot.at - a.shot.at)[0] ?? null;
  }
  private persistJson(path: string, value: unknown) {
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const temp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    renameSync(temp, path);
  }
  private persistSession(manifest: Manifest) {
    this.persistJson(
      join(this.root, manifest.id, "manifest.json"),
      manifest,
    );
  }
  gallery() {
    const sessions = [this.completed, this.manifest]
      .filter((manifest): manifest is Manifest => Boolean(manifest?.shots.length))
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((manifest) => ({
        id: manifest.id,
        startedAt: manifest.startedAt,
        endedAt: manifest.endedAt ?? null,
        active: manifest.id === this.manifest?.id,
        shots: manifest.shots.map((shot) => ({
          id: shot.id,
          at: shot.at,
          scene: shot.scene,
          url: `/api/v1/screens/gallery/${manifest.id}/${shot.id}`,
        })),
      }));
    return {
      activeSessionId: this.manifest?.id ?? null,
      sessions,
    };
  }
  galleryImage(sessionId: string, id: string) {
    if (!z.uuid().safeParse(sessionId).success || !z.uuid().safeParse(id).success)
      return null;
    const manifest = [this.manifest, this.completed].find(
      (candidate) => candidate?.id === sessionId,
    );
    if (!manifest?.shots.some((shot) => shot.id === id)) return null;
    try {
      return readFileSync(join(this.root, sessionId, id + ".jpg"));
    } catch {
      return null;
    }
  }
  image(id: string) {
    if (
      !z.uuid().safeParse(id).success ||
      !this.manifest?.shots.some((s) => s.id === id)
    )
      return null;
    const shot = this.manifest.shots.find((s) => s.id === id)!;
    // Short-lived local URL: old confirmations are never an image gallery.
    if (Date.now() - shot.at > 120000) return null;
    try {
      return readFileSync(join(this.root, this.manifest.id, id + ".jpg"));
    } catch {
      return null;
    }
  }
  async execute(input: unknown) {
    const request = shipRequest.parse(input),
      now = Date.now();
    const refuse = (reason: string, status = "rejected") => {
      this.lastError = reason;
      return { status, reason };
    };
    if (this.run.mode !== "live" || request.platform !== "twitch")
      return refuse("mode_mismatch");
    const age = now - Date.parse(request.timestamp);
    if (age > 10000 || age < -2000) return refuse("request_expired");
    for (const [id, at] of this.requests)
      if (now - at > 60000) this.requests.delete(id);
    if (
      this.requests.has(request.requestId) ||
      this.manifest?.shots.some((s) => s.requestId === request.requestId)
    )
      return refuse("duplicate", "suppressed");
    if (this.requests.size >= 512)
      this.requests.delete(this.requests.keys().next().value!);
    this.requests.set(request.requestId, now);
    if (this.busy || now - this.lastAttempt < 2000)
      return refuse("busy", "suppressed");
    if (this.closed || !this.run.registry.status.get("chat-screen")?.enabled)
      return refuse("disabled");
    const config = this.config();
    if (!config.programScene) return refuse("target_unconfigured");
    this.busy = true;
    this.lastAttempt = now;
    let temp: string | undefined;
    let final: string | undefined;
    try {
      const stream = await this.obs.streamStatus();
      if (
        !this.manifest ||
        Math.abs(this.manifest.startedAt - stream.startedAt) > 5000 ||
        (this.epoch !== null && this.epoch !== stream.epoch)
      ) {
        if (this.manifest?.shots.length) {
          this.completed = { ...this.manifest, endedAt: stream.startedAt };
          this.persistJson(join(this.root, "completed.json"), this.completed);
        }
        this.manifest = {
          id: randomUUID(),
          startedAt: stream.startedAt,
          lastAt: 0,
          shots: [],
        };
      }
      this.epoch = stream.epoch;
      const session = this.manifest;
      const cooldown = this.run.modules.find(
        (m) => m.manifest.id === "chat-screen",
      )!.policy.cooldownMs;
      if (now - session.lastAt < cooldown)
        return refuse("cooldown", "suppressed");
      if (session.shots.length >= config.maxCaptures)
        return refuse("quota", "suppressed");
      const shot = await this.obs.captureProgram(
        config.programScene,
        config.requiredSource,
      );
      if (
        this.closed ||
        !this.obs.streamActive ||
        shot.revision !== this.obs.revision ||
        shot.epoch !== stream.epoch ||
        JSON.stringify(config) !== JSON.stringify(this.config()) ||
        !this.run.registry.status.get("chat-screen")?.enabled
      )
        throw Error("obs_context_changed");
      if (
        typeof shot.imageData !== "string" ||
        shot.imageData.length > 6_000_000 ||
        !/^data:image\/(jpeg|jpg);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          shot.imageData,
        )
      )
        throw Error("invalid_screenshot");
      const image = Buffer.from(
        shot.imageData.slice(shot.imageData.indexOf(",") + 1),
        "base64",
      );
      if (
        image.length < 100 ||
        image[0] !== 255 ||
        image[1] !== 216 ||
        image.at(-2) !== 255 ||
        image.at(-1) !== 217
      )
        throw Error("invalid_screenshot");
      const id = randomUUID(),
        directory = join(this.root, session.id);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      final = join(directory, id + ".jpg");
      temp = final + ".tmp";
      writeFileSync(temp, image, { mode: 0o600, flag: "wx" });
      renameSync(temp, final);
      temp = undefined;
      const next: Manifest = {
        ...session,
        lastAt: now,
        shots: [
          ...session.shots,
          {
            id,
            requestId: request.requestId,
            at: now,
            scene: config.programScene,
          },
        ],
      };
      this.persistSession(next);
      this.persistJson(join(this.root, "active.json"), next);
      this.manifest = next;
      final = undefined;
      this.lastSuccess = now;
      this.lastError = null;
      try {
        const event = eventFactory(
          "chat-screen",
          {
            type: "shipos.command.screen",
            semanticKey: "chat:screen",
            quality: "derived",
            sourceIds: [],
            payload: { imagePath: `/api/v1/screens/${id}`, session: next.id },
          },
          {
            id: request.requestId,
            observedAt: new Date(now).toISOString(),
            sourceTimestamp: new Date(now).toISOString(),
          } as SourceEvent,
          "live",
          this.run.clock,
        );
        event.id = "chat-screen:" + request.requestId;
        this.run.store.domain(event);
        this.run.dispatch();
      } catch {
        this.lastError = "confirmation_unavailable";
      }
      return {
        status: "accepted",
        reason: this.lastError ?? "captured",
        imageId: id,
      };
    } catch (error) {
      const reason =
        error instanceof Error &&
        /^(obs_|stream_|target_|source_|invalid_)/.test(error.message)
          ? error.message
          : "capture_or_storage_failed";
      return refuse(reason);
    } finally {
      if (temp)
        try {
          rmSync(temp, { force: true });
        } catch {
          /* next request remains usable */
        }
      if (final)
        try {
          rmSync(final, { force: true });
        } catch {
          /* unreferenced orphan, never served */
        }
      this.busy = false;
    }
  }
}
