import type { TaskDto, TaskStepDto, TaskWatcherDto } from "@opzava/project-management";

export interface CardIdDisplay {
  readonly prefix: string;
  readonly cardId: string;
  readonly routeSegment: string;
}

export interface StepProgress {
  readonly done: number;
  readonly total: number;
  readonly label: string;
}

export interface WatcherOverflow {
  readonly visible: readonly TaskWatcherDto[];
  readonly overflowCount: number;
  readonly label: string;
}

export type TaskCardTab = "overview" | "ai-run" | "evidence" | "quality";

export const taskCardTabs: readonly {
  readonly id: TaskCardTab;
  readonly label: string;
  readonly deferredTo: null;
}[] = [
  { id: "overview", label: "Overview", deferredTo: null },
  { id: "ai-run", label: "AI Run", deferredTo: null },
  { id: "evidence", label: "Evidence & Files", deferredTo: null },
  { id: "quality", label: "Quality Review", deferredTo: null },
];

const statusLabels: Readonly<Record<TaskDto["status"], string>> = {
  todo: "Backlog",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const priorityLabels: Readonly<Record<TaskDto["priority"], string>> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export function cardPrefixFromWorkspace(workspaceName: string): string {
  const words = workspaceName
    .trim()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);

  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");
  }

  const compact = (words[0] ?? "TASK").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return compact.slice(0, compact.length >= 2 ? 2 : 4) || "TASK";
}

export function formatCardId(workspaceName: string, cardNumber: number): CardIdDisplay {
  const prefix = cardPrefixFromWorkspace(workspaceName);

  return {
    prefix,
    cardId: `${prefix}-${cardNumber}`,
    routeSegment: String(cardNumber),
  };
}

export function parseCardNumberRouteSegment(cardId: string): number | null {
  const trimmed = cardId.trim();
  const match = /^(\d+)$/.exec(trimmed) ?? /^[A-Z0-9]+-(\d+)$/i.exec(trimmed);
  if (match === null) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function statusLabel(status: TaskDto["status"]): string {
  return statusLabels[status];
}

export function statusBadgeClassName(status: TaskDto["status"]): string {
  if (status === "done") {
    return "sb-badge sb-badge--success";
  }

  if (status === "blocked") {
    return "sb-badge sb-badge--warning";
  }

  if (status === "in_progress") {
    return "sb-badge sb-badge--accent";
  }

  return "sb-badge sb-badge--secondary";
}

export function priorityLabel(priority: TaskDto["priority"]): string {
  return priorityLabels[priority];
}

export function stepProgress(steps: readonly Pick<TaskStepDto, "done">[]): StepProgress {
  const done = steps.filter((step) => step.done).length;
  const total = steps.length;

  return {
    done,
    total,
    label: `${done} of ${total} done`,
  };
}

export function applyStepToggle(
  steps: readonly TaskStepDto[],
  stepId: string,
  done: boolean,
): readonly TaskStepDto[] {
  return steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          done,
        }
      : step,
  );
}

export function dueDateLabel(dueAt: string | null, now: Date = new Date()): string {
  if (dueAt === null) {
    return "No due date";
  }

  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    return "Due date unavailable";
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const dayDelta = Math.round((dueDay - nowDay) / dayMs);

  if (dayDelta === 0) {
    return "Due today";
  }

  if (dayDelta === 1) {
    return "Due tomorrow";
  }

  if (dayDelta === -1) {
    return "Due yesterday";
  }

  const weekday = new Intl.DateTimeFormat("en", {
    weekday: "long",
    timeZone: "UTC",
  }).format(dueDate);

  if (dayDelta > 1 && dayDelta < 7) {
    return `Due ${weekday}`;
  }

  if (dayDelta < -1 && dayDelta > -7) {
    return `Due last ${weekday}`;
  }

  return `Due ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dueDate)}`;
}

export function relativeTimeLabel(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absSeconds < 60) {
    return formatter.format(diffSeconds, "second");
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return formatter.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return formatter.format(diffMonths, "month");
  }

  return formatter.format(Math.round(diffMonths / 12), "year");
}

export function watcherOverflow(
  watchers: readonly TaskWatcherDto[],
  visibleLimit = 3,
): WatcherOverflow {
  const visible = watchers.slice(0, visibleLimit);
  const overflowCount = Math.max(0, watchers.length - visible.length);
  const names = watchers.map((watcher) => watcher.name ?? watcher.userId);

  return {
    visible,
    overflowCount,
    label: names.length === 0 ? "No watchers" : `Watchers: ${names.join(", ")}`,
  };
}

export function initials(name: string | null): string {
  if (name === null || name.trim() === "") {
    return "--";
  }

  const value = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return value === "" ? "--" : value;
}

export function isAssistantAssignee(
  task: Pick<TaskDto, "assigneeName" | "assigneeUserId">,
): boolean {
  const userId = task.assigneeUserId ?? "";
  const name = task.assigneeName ?? "";

  return (
    userId.startsWith("assistant:") ||
    userId.startsWith("ai:") ||
    /^ai[:\s-]/i.test(name) ||
    /\bassistant\b/i.test(name)
  );
}
