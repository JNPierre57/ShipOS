import { EventVisual, timeline, type VisualCard } from "./visuals.js";
import { TerminalSequence, type TerminalDefinition } from "./terminal.js";
import { useEffect, useState } from "react";
import type { PresentationAction } from "../../contracts/src/index.js";
export const assetCatalog: Record<
  string,
  { frequency: number; duration: number; preload: "eager"; provenance: string }
> = Object.fromEntries(
  [
    "ship-destroyed",
    "hull-critical",
    "low-fuel",
    "high-value-exobiology",
    "remarkable-body",
    "test",
    "context-novel",
    "context-tension",
    "context-critical",
    "context-recovery",
  ].map((name, i) => [
    "audio.alert." + name,
    {
      frequency: 220 + i * 110,
      duration: name.startsWith("context-") ? 0.12 : 0.35,
      preload: "eager",
      provenance: "ShipOS original synthesized sine cue",
    },
  ]),
);
export class AudioEngine {
  context?: AudioContext;
  nodes = new Map<string, Set<OscillatorNode>>();
  buses = new Map<string, GainNode>();
  status = "SUSPENDED";
  volumes: Record<string, number> = {
    master: 0.5,
    alerts: 0.7,
    effects: 0.6,
    ambience: 0.3,
    voice: 0.8,
  };
  async init() {
    this.context ??= new AudioContext();
    if (this.buses.size === 0) {
      for (const name of Object.keys(this.volumes)) {
        const gain = this.context.createGain();
        gain.gain.value = this.volumes[name] ?? 0.5;
        this.buses.set(name, gain);
      }
      this.buses.get("master")!.connect(this.context.destination);
      for (const [name, node] of this.buses)
        if (name !== "master") node.connect(this.buses.get("master")!);
    }
    await this.context.resume();
    this.status = this.context.state === "running" ? "READY" : "SUSPENDED";
  }
  volume(name: string, value: number) {
    this.volumes[name] = value;
    const gain = this.buses.get(name);
    if (gain) gain.gain.value = value;
  }
  play(runId: string, assetId: string, bus = "alerts") {
    const asset = assetCatalog[assetId];
    if (!asset) {
      this.status = "DEGRADED";
      console.warn("ShipOS audio asset missing", { assetId });
      return;
    }
    if (!this.context || this.context.state !== "running") {
      this.status = "SUSPENDED";
      return;
    }
    const osc = this.context.createOscillator();
    osc.frequency.value = asset.frequency;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.001, this.context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(
      0.16,
      this.context.currentTime + 0.02,
    );
    envelope.gain.exponentialRampToValueAtTime(
      0.001,
      this.context.currentTime + asset.duration,
    );
    osc.connect(envelope);
    envelope.connect(this.buses.get(bus) ?? this.buses.get("alerts")!);
    const sources = this.nodes.get(runId) ?? new Set();
    sources.add(osc);
    this.nodes.set(runId, sources);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
      sources.delete(osc);
      if (sources.size === 0) this.nodes.delete(runId);
    };
    osc.start();
    osc.stop(this.context.currentTime + asset.duration);
  }
  stop(runId: string) {
    for (const osc of this.nodes.get(runId) ?? []) {
      try {
        osc.stop();
      } catch {
        /* Already ended. */
      }
      osc.disconnect();
    }
    this.nodes.delete(runId);
  }
  clear() {
    for (const id of [...this.nodes.keys()]) this.stop(id);
  }
}
export function Overlay() {
  const [cards, setCards] = useState<VisualCard[]>([]);
  const [connected, setConnected] = useState(false);
  const [audio] = useState(() => new AudioEngine());
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    const sendStatus = () => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(
          JSON.stringify({
            type: "audio_status",
            status: audio.status,
            activeSources: audio.nodes.size,
          }),
        );
    };
    const handle = (a: PresentationAction) => {
      if (a.type === "overlay.show") {
        if (Number(a.payload.endsAt) <= Date.now()) return;
        setCards((old) => [
          ...old.filter((c) => c.id !== a.presentationRunId),
          {
            terminal: a.payload.terminal as TerminalDefinition | undefined,
            visual: String(a.payload.visual ?? "orbital"),
            detail:
              typeof a.payload.detail === "string" ? a.payload.detail : "",
            metric:
              typeof a.payload.metric === "string" ? a.payload.metric : "",
            metricLabel: String(a.payload.metricLabel ?? ""),
            tags: Array.isArray(a.payload.tags)
              ? a.payload.tags.filter((t): t is string => typeof t === "string")
              : [],
            gauge: typeof a.payload.gauge === "number" ? a.payload.gauge : 0,
            startedAt:
              typeof a.payload.startedAt === "number"
                ? a.payload.startedAt
                : Date.now(),
            id: a.presentationRunId,
            title: String(a.payload.title),
            subtitle: String(a.payload.subtitle),
            accent: String(a.payload.accent),
            profile: String(a.payload.profile),
            mode: String(a.payload.mode),
            endsAt: Number(a.payload.endsAt),
            slot: a.target,
            effect:
              Array.isArray(a.payload.layers) &&
              a.payload.layers.includes("GlobalFxLayer"),
          },
        ]);
      }
      if (a.type === "overlay.hide")
        setCards((old) => old.filter((c) => c.id !== a.presentationRunId));
      if (a.type === "audio.play")
        audio.play(
          a.presentationRunId,
          String(a.payload.assetId),
          String(a.payload.bus),
        );
      if (a.type === "audio.stop") audio.stop(a.presentationRunId);
      if (a.type === "overlay.effect.start" || a.type === "overlay.effect.stop")
        setCards((old) =>
          old.map((c) =>
            c.id === a.presentationRunId
              ? { ...c, effect: a.type === "overlay.effect.start" }
              : c,
          ),
        );
      sendStatus();
    };
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/overlay/ws`,
      );
      socket.onopen = () => {
        setConnected(true);
        void audio.init().then(sendStatus).catch(sendStatus);
      };
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data) as {
          type: string;
          runs?: {
            id: string;
            profile: string;
            definition: Record<string, unknown>;
            startedAt: number;
            endsAt: number;
            mode: string;
          }[];
          action?: PresentationAction;
          volumes?: Record<string, number>;
        };
        if (m.type === "snapshot") {
          audio.clear();
          setCards([]);
          for (const r of m.runs ?? [])
            handle({
              id: r.id,
              presentationRunId: r.id,
              type: "overlay.show",
              target: String(r.definition.slot),
              issuedAt: Date.now(),
              payload: {
                ...r.definition,
                profile: r.profile,
                startedAt: r.startedAt,
                endsAt: r.endsAt,
                mode: r.mode,
              },
            });
        }
        if (m.type === "action" && m.action) handle(m.action);
        if (m.type === "volumes")
          for (const [name, value] of Object.entries(m.volumes ?? {}))
            audio.volume(name, value);
      };
      socket.onclose = () => {
        setConnected(false);
        audio.clear();
        setCards([]);
        if (!disposed) retry = setTimeout(connect, 1000);
      };
    };
    connect();
    const unlock = () => void audio.init().then(sendStatus).catch(sendStatus);
    window.addEventListener("pointerdown", unlock);
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket.close();
      audio.clear();
      void audio.context?.close();
      window.removeEventListener("pointerdown", unlock);
    };
  }, [audio]);
  useEffect(() => {
    const ends = cards.map((c) => c.endsAt);
    if (!ends.length) return;
    const timer = setTimeout(
      () => setCards((old) => old.filter((c) => c.endsAt > Date.now())),
      Math.max(0, Math.min(...ends) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [cards]);
  return (
    <main
      className="overlay"
      data-connected={connected}
      data-motion={
        new URLSearchParams(location.search).get("motion") === "full"
          ? "full"
          : "system"
      }
    >
      <div id="PersistentLayer" />
      <div id="EventLayer">
        {cards.map((c) =>
          c.terminal ? (
            <TerminalSequence key={c.id} card={c} />
          ) : (
            <EventVisual key={c.id} card={c} />
          ),
        )}
      </div>
      <div id="GlobalFxLayer">
        {cards
          .filter((c) => c.effect)
          .map((c) => (
            <div
              key={c.id}
              className={`global-pulse fx-${c.visual} ${c.profile.toLowerCase()}`}
              style={timeline(c)}
            />
          ))}
      </div>
    </main>
  );
}
