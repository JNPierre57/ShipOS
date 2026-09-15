import { createHash } from "node:crypto";
import { z } from "zod";
import type { DomainEvent } from "../../../packages/contracts/src/index.js";
import {
  defaultPolicy,
  type PresentationDefinition,
  type ShipModule,
} from "../../../packages/module-sdk/src/index.js";
import type { RunContext } from "./runtime.js";
import type { BroadcastState } from "./obs.js";
import {
  crewConfig,
  crewRequest,
  crewActivityRequest,
  viewerKey,
  departments,
  departmentLabels,
  departmentColors,
  type CrewMember,
  type Department,
} from "./crew-model.js";
import { crewBanks, crewFacts, crewRoute } from "./crew-messages.js";
export const crewModule: ShipModule = {
  manifest: {
    id: "crew-assignment",
    name: "Crew assignment",
    version: "1.0.0",
    eventType: "shipos.crew.assignment",
  },
  configSchema: z.strictObject({}),
  policy: {
    ...defaultPolicy,
    importance: 5,
    urgency: 0,
    attentionCost: 0.5,
    cooldownMs: 4000,
    ttlMs: 4000,
  },
  detect: () => [],
  present: () => ({
    title: "CREW ASSIGNMENT",
    subtitle: "",
    durationMs: 3000,
    accent: "#8fbcc6",
    slot: "primary",
    layers: ["EventLayer"],
    audioAsset: "",
    terminal: {
      primitive: "SystemLine",
      severity: "notice",
      label: "CREW ASSIGNMENT",
      lines: ["CREW ASSIGNMENT"],
      timingMs: 120,
      emphasis: 0,
    },
  }),
};
interface CrewState {
  startedAt: number | null;
  members: CrewMember[];
  officers: Partial<Record<Department, string>>;
  phrases: Record<string, number[]>;
  receipts: { id: string; at: number }[];
}
const empty = (): CrewState => ({
  startedAt: null,
  members: [],
  officers: {},
  phrases: {},
  receipts: [],
});
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export class Crew {
  private state: CrewState;
  private broadcast: BroadcastState = {
    connected: false,
    active: false,
    startedAt: null,
  };
  private requests = new Map<string, number>();
  private assignments = new Map<
    string,
    { key: string; department: Department; at: number }
  >();
  private lastOfficer: {
    displayName: string;
    department: Department;
    at: number;
  } | null = null;
  private lastCommunication: {
    eventId: string;
    message: string;
    at: number;
  } | null = null;
  private lastSuppression: string | null = null;
  constructor(readonly run: RunContext) {
    this.state =
      run.store.get<CrewState>("settings", "crew:current") ?? empty();
  }
  config() {
    return crewConfig.parse(
      this.run.store.get("settings", "crew:config") ?? {},
    );
  }
  configure(input: unknown) {
    const config = crewConfig.parse(input);
    this.run.store.put("settings", "crew:config", config);
    this.revalidate();
    return config;
  }
  private save() {
    this.run.store.put("settings", "crew:current", this.state);
  }
  reset(reason = "manual_reset") {
    this.state = empty();
    if (reason === "manual_reset")
      this.state.startedAt = this.broadcast.startedAt;
    this.requests.clear();
    this.assignments.clear();
    this.lastOfficer = null;
    this.lastCommunication = null;
    this.lastSuppression = reason;
    this.run.store.db
      .prepare("DELETE FROM settings WHERE id = ?")
      .run("crew:current");
    for (const p of this.run.engine.snapshot())
      if (p.definition.comm) this.run.engine.finish(p.id, "interrupted");
  }
  observeBroadcast(state: BroadcastState) {
    this.broadcast = state;
    if (state.stopped || state.newBroadcast)
      this.reset(state.stopped ? "stream_stopped" : "new_broadcast");
    if (state.connected && state.active && state.startedAt !== null) {
      // OBS duration is sampled over a local round trip, not a persistent ID.
      if (
        this.state.startedAt !== null &&
        Math.abs(this.state.startedAt - state.startedAt) > 5000
      )
        this.reset("broadcast_changed");
      if (this.state.startedAt === null) {
        this.state.startedAt = state.startedAt;
        this.save();
      }
    }
    this.revalidate();
  }
  reason() {
    if (!this.config().enabled) return "disabled";
    if (!this.broadcast.connected) return "obs_unavailable";
    if (!this.broadcast.active) return "stream_inactive";
    if (this.state.startedAt === null || this.broadcast.startedAt === null)
      return "broadcast_unconfirmed";
    return this.run.shipCommands.eliteReason();
  }
  private active(m: CrewMember) {
    return this.run.clock.now() - m.lastActivity <= this.config().activeDutyMs;
  }
  snapshot() {
    return {
      config: this.config(),
      available: this.reason() === null,
      reason: this.reason(),
      streamActive: this.broadcast.connected && this.broadcast.active,
      eliteActive: this.run.shipCommands.eliteReason() === null,
      eliteReason: this.run.shipCommands.eliteReason(),
      broadcast: this.state.startedAt,
      departments: Object.fromEntries(
        departments.map((d) => [
          d,
          this.state.members
            .filter((m) => m.department === d)
            .map((m) => ({
              displayName: m.viewer.displayName,
              lastActivity: m.lastActivity,
              active: this.active(m),
            })),
        ]),
      ),
      lastOfficer: this.lastOfficer,
      lastCommunication: this.lastCommunication,
      lastSuppression: this.lastSuppression,
    };
  }
  private admit(
    request: z.infer<typeof crewActivityRequest>,
    command: boolean,
  ) {
    const now = this.run.clock.now(),
      at = Date.parse(request.timestamp),
      id = digest(request.requestId);
    if ((this.run.mode === "live") !== (request.platform === "twitch"))
      return "mode_mismatch";
    if (now - at > 10000 || at - now > 2000) return "request_expired";
    // Messages from a previous broadcast cannot enroll its roster again.
    if (this.state.startedAt !== null && at < this.state.startedAt - 2000)
      return "previous_broadcast";
    for (const [k, t] of this.requests)
      if (now - t > 15000) this.requests.delete(k);
    this.state.receipts = this.state.receipts.filter(
      (r) => now - r.at <= 15000,
    );
    if (this.requests.has(id) || this.state.receipts.some((r) => r.id === id))
      return "duplicate";
    const reason = this.reason();
    if (reason) return reason;
    if (this.requests.size >= 2048)
      this.requests.delete(this.requests.keys().next().value!);
    this.requests.set(id, now);
    if (command) {
      this.state.receipts.push({ id, at: now });
      this.state.receipts = this.state.receipts.slice(-512);
      this.save();
    }
    return null;
  }
  activity(input: unknown) {
    const request = crewActivityRequest.parse(input),
      reason = this.admit(request, false);
    if (reason) return { status: "ignored", reason };
    const m = this.state.members.find(
      (m) => m.key === viewerKey(request.viewer),
    );
    if (!m) return { status: "ignored", reason: "not_enrolled" };
    const at = Math.min(this.run.clock.now(), Date.parse(request.timestamp));
    if (at > m.lastActivity) {
      m.lastActivity = at;
      m.viewer = request.viewer;
      this.save();
    }
    return { status: "accepted", reason: "activity_updated" };
  }
  execute(input: unknown) {
    const request = crewRequest.parse(input),
      reason = this.admit(request, true);
    if (reason) {
      this.lastSuppression = reason;
      return { status: "rejected", reason };
    }
    const now = this.run.clock.now(),
      at = Math.min(now, Date.parse(request.timestamp));
    const key = viewerKey(request.viewer),
      member = this.state.members.find((m) => m.key === key);
    if (member && at < member.changedAt)
      return { status: "suppressed", reason: "out_of_order" };
    if (request.role === "LEAVE") {
      this.state.members = this.state.members.filter((m) => m.key !== key);
      for (const d of departments)
        if (this.state.officers[d] === key) delete this.state.officers[d];
      for (const [id, item] of this.assignments)
        if (item.key === key) this.assignments.delete(id);
      this.save();
      return { status: "accepted", reason: member ? "left" : "not_enrolled" };
    }
    if (member?.department === request.role) {
      member.lastActivity = Math.max(member.lastActivity, at);
      member.viewer = request.viewer;
      this.save();
      return { status: "accepted", reason: "already_enrolled" };
    }
    if (!member && this.state.members.length >= 1000)
      return { status: "rejected", reason: "roster_full" };
    if (member) {
      member.department = request.role;
      member.viewer = request.viewer;
      member.changedAt = at;
      member.lastActivity = Math.max(member.lastActivity, at);
    } else
      this.state.members.push({
        key,
        viewer: request.viewer,
        department: request.role,
        lastActivity: at,
        joinedAt: at,
        changedAt: at,
      });
    this.save();
    let confirmation: string | undefined;
    if (this.config().confirmations) {
      const id = "crew-assignment:" + digest(request.requestId);
      for (const [k, item] of this.assignments)
        if (now - item.at > 10000) this.assignments.delete(k);
      if (this.assignments.size >= 64)
        this.assignments.delete(this.assignments.keys().next().value!);
      this.assignments.set(id, { key, department: request.role, at: now });
      const e: DomainEvent = {
        schemaVersion: 1,
        id,
        sequence: 0,
        type: "shipos.crew.assignment",
        semanticKey: "crew-assignment",
        occurredAt: request.timestamp,
        emittedAt: new Date(now).toISOString(),
        sourceEventIds: [],
        payload: { department: request.role },
        provenance: { mode: this.run.mode, sourceIds: [], quality: "derived" },
      };
      this.run.store.domain(e);
      this.run.dispatch();
      const d = this.run.store.get<{ status: string; reasons: string[] }>(
        "director_decisions",
        id,
      );
      confirmation = d?.status;
      if (d && d.status !== "presented")
        this.lastSuppression = "assignment:" + d.reasons.at(-1);
    }
    return {
      status: "accepted",
      reason: member ? "department_changed" : "joined",
      confirmation,
    };
  }
  guard(event: DomainEvent) {
    if (event.type !== "shipos.crew.assignment") return null;
    const item = this.assignments.get(event.id);
    return (
      this.reason() ??
      (!item ||
      !this.state.members.some(
        (m) => m.key === item.key && m.department === item.department,
      )
        ? "assignment_expired"
        : null)
    );
  }
  revalidate() {
    if (this.reason() === null) return;
    for (const p of this.run.engine.snapshot())
      if (p.definition.comm) this.run.engine.finish(p.id, "interrupted");
  }
  decorate(
    event: DomainEvent,
    definition: PresentationDefinition,
  ): PresentationDefinition {
    const assignment = event.type === "shipos.crew.assignment";
    const route = assignment
      ? null
      : crewRoute(this.run.store, event, definition);
    if (!route && !assignment) return definition;
    const reason = this.reason();
    if (reason) {
      this.lastSuppression = reason;
      return definition;
    }
    let officer: CrewMember | undefined;
    if (assignment) {
      const item = this.assignments.get(event.id);
      officer = this.state.members.find(
        (m) => m.key === item?.key && m.department === item.department,
      );
    } else if (route) {
      const candidates = this.state.members.filter(
        (m) => m.department === route.department && this.active(m),
      );
      const last = candidates.findIndex(
        (m) => m.key === this.state.officers[route.department],
      );
      officer = candidates[(last + 1) % candidates.length];
    }
    if (!officer) {
      this.lastSuppression = "no_active_officer";
      return definition;
    }
    let message = "Affectation confirmée. Bienvenue à la passerelle.";
    if (route) {
      const bank = crewBanks[route.bank],
        recent = this.state.phrases[route.bank] ?? [];
      const last = recent.at(-1) ?? -1;
      let index = (last + 1) % bank.length;
      while (recent.includes(index)) index = (index + 1) % bank.length;
      message = bank[index]!;
      this.state.phrases[route.bank] = [...recent, index].slice(
        -Math.min(5, bank.length - 1),
      );
      this.state.officers[route.department] = officer.key;
      this.lastOfficer = {
        displayName: officer.viewer.displayName,
        department: officer.department,
        at: this.run.clock.now(),
      };
      this.lastCommunication = {
        eventId: event.id,
        message,
        at: this.run.clock.now(),
      };
    }
    this.lastSuppression = null;
    this.save();
    return {
      ...definition,
      audioAsset: "",
      accent: departmentColors[officer.department],
      comm: {
        department: officer.department,
        displayName: officer.viewer.displayName,
        message,
        facts: assignment
          ? [departmentLabels[officer.department]]
          : crewFacts(event, definition),
        assignment,
      },
    };
  }
}
