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

export const issueFilterTabs: readonly IssueFilterTab[] = [
  { id: "all", label: "All" },
  { id: "needs-triage", label: "Needs triage" },
  { id: "ready-for-agent", label: "Ready for agent" },
  { id: "ready-for-human", label: "Ready for human" },
  { id: "in-progress", label: "In progress" },
  { id: "closed", label: "Closed" },
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

  if (
    assignee.toLowerCase() === currentUserName.toLowerCase() ||
    assignee.toLowerCase() === "anthony"
  ) {
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
