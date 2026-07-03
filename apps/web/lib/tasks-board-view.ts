import type { TaskDto, TaskPriority, TaskStatus } from "@opzava/project-management";

import { dueDateLabel, relativeTimeLabel } from "@/lib/task-card-format";

export type BoardView = "kanban" | "list";

export type TaskFilterValue<T extends string> = "all" | T;

export interface BoardTaskFilters {
  readonly search: string;
  readonly status: TaskFilterValue<TaskStatus>;
  readonly priority: TaskFilterValue<TaskPriority>;
}

export interface TaskStatusColumn {
  readonly status: TaskStatus;
  readonly title: string;
  readonly domId: string;
  readonly countLabel: (count: number) => string;
  readonly badgeClassName?: string;
}

export interface TaskChipView {
  readonly label: string;
  readonly className: string;
  readonly dotClassName: string | null;
}

export const statusColumns: readonly TaskStatusColumn[] = [
  {
    status: "todo",
    title: "Backlog",
    domId: "col-backlog",
    countLabel: (count) => `${count} tasks in backlog`,
  },
  {
    status: "in_progress",
    title: "In progress",
    domId: "col-inprogress",
    countLabel: (count) => `${count} tasks in progress`,
    badgeClassName: "badge-accent",
  },
  {
    status: "blocked",
    title: "Review",
    domId: "col-review",
    countLabel: (count) => `${count} tasks in review`,
    badgeClassName: "badge-info",
  },
  {
    status: "done",
    title: "Done",
    domId: "col-done",
    countLabel: (count) => `${count} tasks done`,
  },
];

export const priorityLabels: Readonly<Record<TaskPriority, string>> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const statusLabels: Readonly<Record<TaskStatus, string>> = {
  todo: "Backlog",
  in_progress: "In progress",
  blocked: "Review",
  done: "Done",
};

const statusChipViews: Readonly<Record<TaskStatus, TaskChipView>> = {
  todo: {
    label: "Queued",
    className: "badge",
    dotClassName: null,
  },
  in_progress: {
    label: "Running",
    className: "badge badge-accent",
    dotClassName: "dot dot-accent",
  },
  blocked: {
    label: "Review",
    className: "badge badge-info",
    dotClassName: null,
  },
  done: {
    label: "Done",
    className: "badge badge-success",
    dotClassName: null,
  },
};

export function statusLabel(status: TaskStatus): string {
  return statusLabels[status];
}

export function taskStatusChip(status: TaskStatus): TaskChipView {
  return statusChipViews[status];
}

export function nextTaskStatus(status: TaskStatus): TaskStatus {
  if (status === "todo") {
    return "in_progress";
  }

  if (status === "in_progress") {
    return "blocked";
  }

  if (status === "blocked") {
    return "done";
  }

  return "todo";
}

export function priorityBadgeClassName(priority: TaskPriority): string {
  if (priority === "urgent") {
    return "badge badge-danger";
  }

  if (priority === "high") {
    return "badge badge-warning";
  }

  if (priority === "normal") {
    return "badge badge-accent";
  }

  return "badge";
}

export function taskAvatarClassName(task: Pick<TaskDto, "priority" | "status">): string {
  if (task.priority === "urgent" || task.priority === "high" || task.status === "blocked") {
    return "task-avatar task-avatar-warn";
  }

  if (task.status === "in_progress") {
    return "task-avatar task-avatar-accent";
  }

  return "task-avatar";
}

export function taskSearchText(task: TaskDto): string {
  return [
    task.title,
    task.description,
    String(task.cardNumber),
    task.assigneeName ?? "Unassigned",
    statusLabel(task.status),
    taskStatusChip(task.status).label,
    priorityLabels[task.priority],
    ...task.labels,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterBoardTasks(
  tasks: readonly TaskDto[],
  filters: BoardTaskFilters,
): readonly TaskDto[] {
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return tasks.filter((task) => {
    if (filters.status !== "all" && task.status !== filters.status) {
      return false;
    }

    if (filters.priority !== "all" && task.priority !== filters.priority) {
      return false;
    }

    if (terms.length === 0) {
      return true;
    }

    const searchable = taskSearchText(task);
    return terms.every((term) => searchable.includes(term));
  });
}

export function taskCardTimingLabel(task: TaskDto, now: Date = new Date()): string {
  if (task.status === "in_progress") {
    return `Started ${relativeTimeLabel(task.updatedAt, now)}`;
  }

  if (task.dueAt !== null) {
    return dueDateLabel(task.dueAt, now);
  }

  if (task.status === "done") {
    return `Completed ${relativeTimeLabel(task.updatedAt, now)}`;
  }

  return `Updated ${relativeTimeLabel(task.updatedAt, now)}`;
}
