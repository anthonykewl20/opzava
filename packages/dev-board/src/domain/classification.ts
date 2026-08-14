import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

export const devTicketTypes = ["feature", "bug", "improvement", "technical_task", "research_spike", "maintenance"] as const;
export const workAreas = ["ui_ux", "frontend", "backend_api", "data_database", "infrastructure", "github_integration", "agent_runtime", "security", "documentation"] as const;
export const priorities = ["p0", "p1", "p2", "p3"] as const;
export const severities = ["s0", "s1", "s2", "s3"] as const;
export const changeRisks = ["low", "medium", "high", "critical"] as const;

export type DevTicketType = (typeof devTicketTypes)[number];
export type WorkArea = (typeof workAreas)[number];
export type Priority = (typeof priorities)[number];
export type Severity = (typeof severities)[number];
export type ChangeRisk = (typeof changeRisks)[number];

export const devTicketTypeLabels: Readonly<Record<DevTicketType, string>> = {
  feature: "Feature", bug: "Bug", improvement: "Improvement", technical_task: "Technical Task",
  research_spike: "Research/Spike", maintenance: "Maintenance",
};

function parse<T extends string>(value: unknown, values: readonly T[], label: string): Result<T> {
  return typeof value === "string" && values.includes(value as T)
    ? ok(value as T)
    : err(new DomainError({ code: "dev_board.classification_invalid", message: `${label} is invalid.` }));
}
export const parseDevTicketType = (value: unknown) => parse(value, devTicketTypes, "DevTicket type");
export const parseWorkArea = (value: unknown) => parse(value, workAreas, "Work area");
export const parsePriority = (value: unknown) => parse(value, priorities, "Priority");
export const parseSeverity = (value: unknown) => parse(value, severities, "Severity");
export const parseChangeRisk = (value: unknown) => parse(value, changeRisks, "Change risk");

export function compareChangeRisk(left: ChangeRisk, right: ChangeRisk): number {
  return changeRisks.indexOf(left) - changeRisks.indexOf(right);
}

export function normalizeWorkAreas(value: unknown): Result<readonly WorkArea[]> {
  if (!Array.isArray(value) || value.length === 0)
    return err(new DomainError({ code: "dev_board.classification_work_areas_required", message: "At least one work area is required." }));
  const parsed: WorkArea[] = [];
  for (const item of value) {
    const workArea = parseWorkArea(item);
    if (!workArea.ok) return workArea;
    parsed.push(workArea.value);
  }
  const normalized = [...new Set(parsed)].sort();
  if (normalized.length !== parsed.length)
    return err(new DomainError({ code: "dev_board.classification_invalid", message: "Work areas must not contain duplicates." }));
  return ok(normalized);
}
