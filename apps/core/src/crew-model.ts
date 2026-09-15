import { z } from "zod";
import { shipRequest } from "./ship-command.js";
export const departments = ["NAV", "SCI", "ENG", "TAC"] as const;
export type Department = (typeof departments)[number];
export const departmentLabels = {
  NAV: "NAVIGATION",
  SCI: "SCIENCE",
  ENG: "ENGINEERING",
  TAC: "TACTICAL",
};
export const departmentColors = {
  NAV: "#d3ae69",
  SCI: "#8fbcc6",
  ENG: "#d79b70",
  TAC: "#db8078",
};
export const crewConfig = z.strictObject({
  enabled: z.boolean().default(true),
  activeDutyMs: z.number().int().min(60000).max(3600000).default(1200000),
  confirmations: z.boolean().default(true),
});
export const viewerSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[0-9]{1,30}$/)
    .optional(),
  login: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{1,25}$/)
    .transform((s) => s.toLowerCase())
    .optional(),
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .refine(
      (s) => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(s),
    ),
});
export const crewActivityRequest = shipRequest.extend({ viewer: viewerSchema });
export const crewRequest = crewActivityRequest.extend({
  role: z
    .string()
    .trim()
    .transform((s) => (s.toUpperCase() === "ING" ? "ENG" : s.toUpperCase()))
    .pipe(z.enum([...departments, "LEAVE"])),
});
export type Viewer = z.infer<typeof viewerSchema>;
export function viewerKey(viewer: Viewer) {
  return viewer.id
    ? "id:" + viewer.id
    : viewer.login
      ? "login:" + viewer.login
      : "name:" + viewer.displayName.normalize("NFKC").toLowerCase();
}
export interface CrewMember {
  key: string;
  viewer: Viewer;
  department: Department;
  lastActivity: number;
  joinedAt: number;
  changedAt: number;
}
