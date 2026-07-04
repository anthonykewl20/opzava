import type { IssueProjectionDto, IssueTriageFilter } from "@opzava/project-management";
import { issueFilterFromLabels } from "@opzava/project-management";

export interface IssueFilterTab {
  readonly id: IssueTriageFilter;
  readonly label: string;
}

export interface IssuePipelineStage {
  readonly id: Exclude<IssueTriageFilter, "all">;
  readonly label: string;
  readonly description: string;
  readonly count: number;
  readonly needsAttention: boolean;
}

export interface IssueLabelView {
  readonly primaryLabel: string;
  readonly hiddenLabels: readonly string[];
}

export type IssueSectionGroupId = "adr" | "prd" | "other";

export interface IssueSectionGroup {
  readonly id: IssueSectionGroupId;
  readonly label: string;
  readonly description: string;
  readonly count: number;
  readonly issues: readonly IssueProjectionDto[];
}

export interface IssuePageWindow {
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly totalCount: number;
  readonly startItem: number;
  readonly endItem: number;
  readonly issues: readonly IssueProjectionDto[];
}

export const issuePageSize = 18;

export const issueFilterTabs: readonly IssueFilterTab[] = [
  { id: "all", label: "All" },
  { id: "needs-triage", label: "Needs triage" },
  { id: "ready-for-agent", label: "Ready for agent" },
  { id: "ready-for-human", label: "Ready for human" },
  { id: "in-progress", label: "In progress" },
  { id: "closed", label: "Closed" },
] as const;

const workflowLabels = new Set([
  "needs-triage",
  "ready-for-agent",
  "ready-for-human",
  "in-progress",
]);

const issueSectionOrder: readonly Omit<IssueSectionGroup, "count" | "issues">[] = [
  {
    id: "adr",
    label: "ADRs",
    description: "Architecture decisions",
  },
  {
    id: "prd",
    label: "PRDs",
    description: "Product requirements",
  },
  {
    id: "other",
    label: "Other issues",
    description: "Bugs, chores, and uncategorized work",
  },
] as const;

export function parseIssueFilter(value: string | undefined): IssueTriageFilter {
  return issueFilterTabs.some((tab) => tab.id === value) ? (value as IssueTriageFilter) : "all";
}

export function filterIssues(
  issues: readonly IssueProjectionDto[],
  filter: IssueTriageFilter,
): readonly IssueProjectionDto[] {
  return filter === "all"
    ? issues
    : issues.filter((issue) => issueFilterFromLabels(issue) === filter);
}

function normalizedLabel(label: string): string {
  return label.trim().toLowerCase();
}

function isPriorityLabel(label: string): boolean {
  const normalized = normalizedLabel(label);
  return (
    /^p[0-4]$/.test(normalized) ||
    normalized.startsWith("p0:") ||
    normalized.startsWith("p1:") ||
    normalized.startsWith("p2:") ||
    normalized.startsWith("priority:") ||
    normalized.startsWith("priority/") ||
    normalized.startsWith("prio:") ||
    normalized === "critical" ||
    normalized === "blocker" ||
    normalized === "urgent" ||
    normalized === "high" ||
    normalized === "medium" ||
    normalized === "low"
  );
}

function primaryLabelIndex(labels: readonly string[]): number {
  const priorityIndex = labels.findIndex(isPriorityLabel);
  if (priorityIndex !== -1) {
    return priorityIndex;
  }

  const areaIndex = labels.findIndex((label) => {
    const normalized = normalizedLabel(label);
    return normalized !== "" && !workflowLabels.has(normalized);
  });
  if (areaIndex !== -1) {
    return areaIndex;
  }

  return labels.length > 0 ? 0 : -1;
}

export function issueLabelView(issue: IssueProjectionDto): IssueLabelView {
  const labels = issue.labels.filter((label) => label.trim() !== "");
  const primaryIndex = primaryLabelIndex(labels);
  if (primaryIndex === -1) {
    return {
      primaryLabel: issueFilterFromLabels(issue),
      hiddenLabels: [],
    };
  }

  return {
    primaryLabel: labels[primaryIndex] ?? issueFilterFromLabels(issue),
    hiddenLabels: labels.filter((_label, index) => index !== primaryIndex),
  };
}

function hasIssueTypeToken(value: string, token: "adr" | "prd"): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === token ||
    normalized.startsWith(`${token}-`) ||
    normalized.startsWith(`${token}:`) ||
    normalized.startsWith(`${token} `) ||
    normalized.includes(` ${token}-`) ||
    normalized.includes(` ${token}:`) ||
    normalized.includes(` ${token} `)
  );
}

function issueSectionGroupId(issue: IssueProjectionDto): IssueSectionGroupId {
  const searchableValues = [issue.title, ...issue.labels];
  if (searchableValues.some((value) => hasIssueTypeToken(value, "adr"))) {
    return "adr";
  }

  if (searchableValues.some((value) => hasIssueTypeToken(value, "prd"))) {
    return "prd";
  }

  return "other";
}

export function issueSectionGroups(
  issues: readonly IssueProjectionDto[],
): readonly IssueSectionGroup[] {
  return issueSectionOrder
    .map((section) => {
      const sectionIssues = issues.filter((issue) => issueSectionGroupId(issue) === section.id);
      return {
        ...section,
        count: sectionIssues.length,
        issues: sectionIssues,
      };
    })
    .filter((section) => section.count > 0);
}

export function issuePageCount(totalCount: number, pageSize = issuePageSize): number {
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize));
  return Math.max(1, Math.ceil(Math.max(0, totalCount) / normalizedPageSize));
}

function normalizedPage(value: number, totalCount: number, pageSize: number): number {
  const pageCount = issuePageCount(totalCount, pageSize);
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(1, Math.trunc(value)), pageCount);
}

export function parseIssuePage(
  value: string | undefined,
  totalCount: number,
  pageSize = issuePageSize,
): number {
  return normalizedPage(value === undefined ? 1 : Number(value), totalCount, pageSize);
}

export function issuePageWindow(
  issues: readonly IssueProjectionDto[],
  page: number,
  pageSize = issuePageSize,
): IssuePageWindow {
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize));
  const currentPage = normalizedPage(page, issues.length, normalizedPageSize);
  const startIndex = (currentPage - 1) * normalizedPageSize;
  const endIndex = Math.min(startIndex + normalizedPageSize, issues.length);

  return {
    page: currentPage,
    pageSize: normalizedPageSize,
    pageCount: issuePageCount(issues.length, normalizedPageSize),
    totalCount: issues.length,
    startItem: issues.length === 0 ? 0 : startIndex + 1,
    endItem: endIndex,
    issues: issues.slice(startIndex, endIndex),
  };
}

export function issuePipelineStages(
  issues: readonly IssueProjectionDto[],
): readonly IssuePipelineStage[] {
  const count = (filter: Exclude<IssueTriageFilter, "all">) =>
    issues.filter((issue) => issueFilterFromLabels(issue) === filter).length;

  return [
    {
      id: "needs-triage",
      label: "Needs triage",
      description: "no label yet",
      count: count("needs-triage"),
      needsAttention: true,
    },
    {
      id: "ready-for-agent",
      label: "Ready for agent",
      description: "fleet can pick up",
      count: count("ready-for-agent"),
      needsAttention: false,
    },
    {
      id: "ready-for-human",
      label: "Ready for human",
      description: "you must act",
      count: count("ready-for-human"),
      needsAttention: true,
    },
    {
      id: "in-progress",
      label: "In progress",
      description: "being worked",
      count: count("in-progress"),
      needsAttention: false,
    },
    {
      id: "closed",
      label: "Done this week",
      description: "closed",
      count: count("closed"),
      needsAttention: false,
    },
  ];
}

export function relativeIssueTime(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const diffMs = now.getTime() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) {
    return "now";
  }
  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))}m`;
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h`;
  }
  if (diffMs < 7 * day) {
    return `${Math.floor(diffMs / day)}d`;
  }

  return `${Math.floor(diffMs / (7 * day))}w`;
}

export function issueStatusView(issue: IssueProjectionDto): {
  readonly label: string;
  readonly dotClassName: string;
} {
  if (issue.state === "closed") {
    return { label: "Closed", dotClassName: "dot" };
  }

  const filter = issueFilterFromLabels(issue);
  if (filter === "ready-for-human" || filter === "in-progress") {
    return {
      label: filter === "ready-for-human" ? "In review" : "In progress",
      dotClassName: "dot dot-warning",
    };
  }

  return { label: "Open", dotClassName: "dot dot-accent" };
}

export function issueAssigneeView(
  assignee: string | null,
  currentUserName: string,
): {
  readonly label: string;
  readonly kind: "unassigned" | "current-user" | "ai-agent" | "human";
} {
  if (assignee === null || assignee.trim() === "") {
    return { label: "Unassigned", kind: "unassigned" };
  }

  if (assignee.toLowerCase() === currentUserName.toLowerCase()) {
    return { label: "You", kind: "current-user" };
  }

  if (/^(atlas|sage|cipher|nexus|echo)$/i.test(assignee)) {
    return { label: assignee, kind: "ai-agent" };
  }

  return { label: assignee, kind: "human" };
}

export function issueDivergenceLabel(issue: IssueProjectionDto): string | null {
  if (issue.linkedTaskId === null) {
    return null;
  }

  if (issue.state === "closed" && issue.linkedTaskStatus !== "done") {
    return "GitHub closed · task still open";
  }

  if (issue.state === "open" && issue.linkedTaskStatus === "done") {
    return "Task done · GitHub still open";
  }

  return null;
}
