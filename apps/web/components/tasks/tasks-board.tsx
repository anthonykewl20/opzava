"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import { createTaskAction, moveTaskAction, updateTaskAction } from "@/app/(app)/tasks/actions";
import { ActionStateForm } from "@/components/forms/action-state-form";
import { formatCardId } from "@/lib/task-card-format";
import {
  filterBoardTasks,
  nextTaskStatus,
  priorityBadgeClassName,
  priorityLabels,
  statusColumns,
  statusLabel,
  taskAvatarClassName,
  taskCardTimingLabel,
  taskStatusChip,
  type BoardTaskFilters,
} from "@/lib/tasks-board-view";
import type { TaskDto, TaskStatus } from "@opzava/project-management";

interface WorkspaceOption {
  readonly id: string;
  readonly name: string;
}

interface TasksBoardProps {
  readonly tasks: readonly TaskDto[];
  readonly currentUser: {
    readonly id: string;
    readonly name: string;
  };
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaces: readonly WorkspaceOption[];
  readonly renderedAtIso: string;
  readonly todayLabel: string;
}

const taskBoardPageStyles = `
    /* Page-specific layout only - no color, font-size, shadow, or radius overrides */
    .board-filter-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }
    .board-filter-row .search {
      max-width: 260px;
      flex: 1 1 200px;
    }
    .board-columns {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-4);
      align-items: start;
    }
    .board-col {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }
    .board-col-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) 0 var(--space-1);
    }
    .board-col-title {
      font-size: var(--text-sm);
      font-weight: var(--fw-semibold);
      color: var(--fg-muted);
    }
    .board-col-cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .task-card {
      padding: var(--space-4);
      cursor: pointer;
      transition: border-color var(--dur-fast) var(--ease-standard);
    }
    .task-card:hover {
      border-color: var(--border-strong);
    }
    .task-card-title {
      font-size: var(--text-sm);
      font-weight: var(--fw-medium);
      color: var(--fg);
      line-height: var(--lh-snug);
      margin-bottom: var(--space-3);
    }
    .task-card-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .task-avatar {
      width: 22px;
      height: 22px;
      border-radius: var(--radius-full);
      background: var(--surface-3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: var(--fw-semibold);
      color: var(--fg-muted);
      flex: none;
    }
    .task-avatar-accent {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .task-avatar-warn {
      background: var(--warning-soft);
      color: var(--warning);
    }
    .task-progress-wrap {
      margin-top: var(--space-3);
    }
    .notif-btn-wrap {
      position: relative;
    }
    .notif-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 16px;
      height: 16px;
      border-radius: var(--radius-full);
      background: var(--danger);
      color: #fff;
      font-size: 10px;
      font-weight: var(--fw-semibold);
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .header-avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-full);
      background: var(--surface-3);
      border: 1px solid var(--border-strong);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--text-xs);
      color: var(--fg-muted);
      flex: none;
      cursor: pointer;
      font-weight: var(--fw-semibold);
    }
    .nav-section-gap {
      margin-top: var(--space-2);
    }
    .tasks-page {
      max-width: 1240px;
    }
    .task-card {
      display: block;
      min-width: 0;
    }
    .task-card-title {
      display: block;
      overflow-wrap: anywhere;
      text-decoration: none;
    }
    .task-card-title:hover {
      text-decoration: none;
    }
    .task-status-chip-form {
      display: inline-flex;
      margin: 0;
    }
    .task-status-chip-form .badge {
      border: 0;
      font: inherit;
      cursor: pointer;
    }
    .task-search-input {
      min-width: 0;
      flex: 1 1 auto;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--fg);
      font: inherit;
    }
    .task-search-input::placeholder {
      color: var(--fg-subtle);
    }
`;

function initials(name: string | null): string {
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

function TaskBoardPageStyles() {
  return <style>{taskBoardPageStyles}</style>;
}

function createTaskIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `web.task.create:${crypto.randomUUID()}`;
  }

  return `web.task.create:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function TaskForm({
  mode,
  task,
  currentUser,
  onClose,
}: {
  readonly mode: "create" | "edit";
  readonly task?: TaskDto;
  readonly currentUser: TasksBoardProps["currentUser"];
  readonly onClose: () => void;
}) {
  const action = mode === "create" ? createTaskAction : updateTaskAction;
  const title = mode === "create" ? "New task" : "Edit task";
  const submitLabel = mode === "create" ? "Create task" : "Save task";
  const assigneeValue = task?.assigneeUserId === currentUser.id ? "me" : "";
  const [createTaskIdempotencyKeyValue] = useState(() =>
    mode === "create" ? createTaskIdempotencyKey() : "",
  );

  return (
    <div className="task-modal-backdrop" role="presentation">
      <section
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
      >
        <div className="task-modal-head">
          <h2 className="task-modal-title" id="task-form-title">
            {title}
          </h2>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            aria-label="Close task form"
            onClick={onClose}
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <ActionStateForm
          action={action}
          className="task-form"
          errorTitle={mode === "create" ? "Could not create task" : "Could not save task"}
        >
          {mode === "create" ? (
            <input type="hidden" name="idempotencyKey" value={createTaskIdempotencyKeyValue} />
          ) : null}
          {task === undefined ? null : <input type="hidden" name="taskId" value={task.id} />}

          <div className="field">
            <label className="label" htmlFor="task-title">
              Title
            </label>
            <input
              className="input"
              id="task-title"
              name="title"
              type="text"
              required
              maxLength={180}
              defaultValue={task?.title ?? ""}
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="task-description">
              Description
            </label>
            <textarea
              className="textarea"
              id="task-description"
              name="description"
              maxLength={4000}
              defaultValue={task?.description ?? ""}
            />
          </div>

          <div className="task-form-grid">
            {mode === "create" ? (
              <div className="field">
                <label className="label" htmlFor="task-status">
                  Status
                </label>
                <select
                  className="select"
                  id="task-status"
                  name="status"
                  defaultValue={task?.status ?? "todo"}
                >
                  {statusColumns.map((column) => (
                    <option key={column.status} value={column.status}>
                      {column.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="field">
              <label className="label" htmlFor="task-priority">
                Priority
              </label>
              <select
                className="select"
                id="task-priority"
                name="priority"
                defaultValue={task?.priority ?? "normal"}
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="task-assignee">
                Assignee
              </label>
              <select
                className="select"
                id="task-assignee"
                name="assignee"
                defaultValue={assigneeValue}
              >
                <option value="">Unassigned</option>
                <option value="me">{currentUser.name}</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="task-labels">
              Labels
            </label>
            <input
              className="input"
              id="task-labels"
              name="labels"
              type="text"
              placeholder="slice 1e, admin"
              defaultValue={task?.labels.join(", ") ?? ""}
            />
            <p className="hint">Separate labels with commas.</p>
          </div>

          <div className="task-modal-foot">
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              {submitLabel}
            </button>
          </div>
        </ActionStateForm>
      </section>
    </div>
  );
}

function TaskStatusChip({
  task,
  nextPositions,
}: {
  readonly task: TaskDto;
  readonly nextPositions: Readonly<Record<TaskStatus, number>>;
}) {
  const chip = taskStatusChip(task.status);
  const targetStatus = nextTaskStatus(task.status);
  const targetColumn = statusColumns.find((column) => column.status === targetStatus);
  const targetTitle = targetColumn?.title ?? statusLabel(targetStatus);

  return (
    <div className="task-status-chip-form" onClick={(event) => event.stopPropagation()}>
      <ActionStateForm action={moveTaskAction} errorTitle="Move failed">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="status" value={targetStatus} />
        <input type="hidden" name="position" value={nextPositions[targetStatus]} />
        <button
          className={chip.className}
          type="submit"
          aria-label={`Move ${task.title} to ${targetTitle}`}
          title={`Move to ${targetTitle}`}
        >
          {chip.dotClassName === null ? null : <span className={chip.dotClassName} aria-hidden />}
          {chip.label}
        </button>
      </ActionStateForm>
    </div>
  );
}

function TaskCard({
  task,
  workspaceNameById,
  renderedAt,
  nextPositions,
}: {
  readonly task: TaskDto;
  readonly workspaceNameById: ReadonlyMap<string, string>;
  readonly renderedAt: Date;
  readonly nextPositions: Readonly<Record<TaskStatus, number>>;
}) {
  const router = useRouter();
  const assigneeName = task.assigneeName ?? "Unassigned";
  const workspaceName = workspaceNameById.get(task.workspaceId) ?? "Workspace";
  const cardId = formatCardId(workspaceName, task.cardNumber);
  const href = `/tasks/${cardId.routeSegment}`;

  const shouldIgnoreCardEvent = (target: EventTarget | null): boolean => {
    return (
      target instanceof HTMLElement &&
      target.closest("a, button, input, select, textarea, label, form") !== null
    );
  };

  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || shouldIgnoreCardEvent(event.target)) {
      return;
    }

    router.push(href);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (shouldIgnoreCardEvent(event.target) || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    router.push(href);
  };

  return (
    <article
      className="card task-card"
      aria-label={`Task: ${task.title}`}
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <a className="task-card-title" href={href}>
        {task.title}
      </a>
      <div className="task-card-meta">
        <span className={taskAvatarClassName(task)} aria-hidden="true">
          {initials(assigneeName)}
        </span>
        <span
          className="u-subtle u-truncate"
          style={{ fontSize: "var(--text-xs)", flex: 1, minWidth: 0 }}
        >
          {assigneeName}
        </span>
        <TaskStatusChip task={task} nextPositions={nextPositions} />
        <span
          className={priorityBadgeClassName(task.priority)}
          aria-label={`Priority: ${priorityLabels[task.priority]}`}
        >
          {priorityLabels[task.priority]}
        </span>
      </div>
      {task.labels.length === 0 ? null : (
        <div className="task-card-meta" style={{ marginTop: "var(--space-2)" }}>
          {task.labels.map((label) => (
            <span className="badge" key={label}>
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="task-card-meta" style={{ marginTop: "var(--space-2)" }}>
        <span className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
          {taskCardTimingLabel(task, renderedAt)}
        </span>
        <span className="u-subtle" style={{ fontSize: "var(--text-xs)", marginLeft: "auto" }}>
          {cardId.cardId}
        </span>
      </div>
    </article>
  );
}

function EmptyColumnState({ title }: { readonly title: string }) {
  return (
    <div className="card">
      <div className="empty">
        <div className="empty-icon" aria-hidden="true">
          ✓
        </div>
        <p className="empty-title">No tasks here</p>
        <p className="empty-desc">Tasks will appear here when they enter {title.toLowerCase()}.</p>
      </div>
    </div>
  );
}

function KanbanView({
  tasks,
  workspaceNameById,
  renderedAt,
  nextPositions,
}: {
  readonly tasks: readonly TaskDto[];
  readonly workspaceNameById: ReadonlyMap<string, string>;
  readonly renderedAt: Date;
  readonly nextPositions: Readonly<Record<TaskStatus, number>>;
}) {
  return (
    <div className="board-columns" role="region" aria-label="Task board">
      {statusColumns.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status);
        const badgeClassName =
          column.badgeClassName === undefined ? "badge" : `badge ${column.badgeClassName}`;

        return (
          <section className="board-col" aria-labelledby={column.domId} key={column.status}>
            <div className="board-col-header">
              <h2 className="board-col-title" id={column.domId}>
                {column.title}
              </h2>
              <span className={badgeClassName} aria-label={column.countLabel(columnTasks.length)}>
                {columnTasks.length}
              </span>
            </div>
            <div className="board-col-cards">
              {columnTasks.length === 0 ? (
                <EmptyColumnState title={column.title} />
              ) : (
                columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    workspaceNameById={workspaceNameById}
                    renderedAt={renderedAt}
                    nextPositions={nextPositions}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardFilterRow({
  filters,
  workspaces,
  onFiltersChange,
}: {
  readonly filters: BoardTaskFilters;
  readonly workspaces: readonly WorkspaceOption[];
  readonly onFiltersChange: (filters: BoardTaskFilters) => void;
}) {
  return (
    <div
      className="board-filter-row"
      style={{ marginBottom: "var(--space-5)" }}
      role="search"
      aria-label="Filter tasks"
    >
      <label htmlFor="task-search" className="u-sr-only">
        Search tasks
      </label>
      <div className="search" style={{ maxWidth: 260, flex: "1 1 200px" }}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          style={{ flex: "none" }}
        >
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          className="task-search-input"
          id="task-search"
          type="search"
          value={filters.search}
          onChange={(event) => onFiltersChange({ ...filters, search: event.currentTarget.value })}
          placeholder="Search tasks..."
        />
      </div>

      <label htmlFor="project-filter" className="u-sr-only">
        Filter by project
      </label>
      <select
        id="project-filter"
        className="select"
        style={{ width: "auto", flex: "none" }}
        value={workspaces[0]?.id ?? ""}
        disabled
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TasksBoard({
  tasks,
  currentUser,
  workspaceId,
  workspaceName,
  renderedAtIso,
  todayLabel,
}: TasksBoardProps) {
  const [boardTasks, setBoardTasks] = useState<readonly TaskDto[]>(tasks);
  const [filters, setFilters] = useState<BoardTaskFilters>({
    search: "",
    status: "all",
    priority: "all",
  });
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDto | undefined>(undefined);

  useEffect(() => {
    setBoardTasks(tasks);
  }, [tasks]);

  const renderedAt = useMemo(() => new Date(renderedAtIso), [renderedAtIso]);
  const currentWorkspaceOptions = useMemo(
    () => [{ id: workspaceId, name: workspaceName }],
    [workspaceId, workspaceName],
  );
  const workspaceNameById = useMemo(
    () => new Map(currentWorkspaceOptions.map((workspace) => [workspace.id, workspace.name])),
    [currentWorkspaceOptions],
  );
  const visibleTasks = useMemo(() => filterBoardTasks(boardTasks, filters), [boardTasks, filters]);

  const nextPositions = useMemo(() => {
    return statusColumns.reduce<Record<TaskStatus, number>>(
      (accumulator, column) => {
        const currentMax = boardTasks
          .filter((task) => task.status === column.status)
          .reduce((max, task) => Math.max(max, task.position), 0);
        accumulator[column.status] = currentMax + 1;
        return accumulator;
      },
      { todo: 1, in_progress: 1, blocked: 1, done: 1 },
    );
  }, [boardTasks]);

  const openCreateForm = () => {
    setEditingTask(undefined);
    setFormMode("create");
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingTask(undefined);
  };

  return (
    <div className="page tasks-page">
      <TaskBoardPageStyles />
      <div className="page-header">
        <div>
          <h1>Tasks</h1>
          <p className="page-sub">
            {todayLabel} — {workspaceName}
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreateForm}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New task
        </button>
      </div>

      <BoardFilterRow
        filters={filters}
        workspaces={currentWorkspaceOptions}
        onFiltersChange={setFilters}
      />

      <KanbanView
        tasks={visibleTasks}
        workspaceNameById={workspaceNameById}
        renderedAt={renderedAt}
        nextPositions={nextPositions}
      />

      <div aria-label="Loading tasks" style={{ display: "none" }} aria-hidden="true">
        <div className="board-columns">
          <div className="board-col">
            <div className="card" style={{ padding: "var(--space-4)" }}>
              <div className="skeleton sk-line" style={{ width: "55%" }} />
              <div
                className="skeleton sk-line"
                style={{ width: "80%", marginTop: "var(--space-3)" }}
              />
              <div className="skeleton sk-line" style={{ width: "40%" }} />
            </div>
            <div className="card" style={{ padding: "var(--space-4)" }}>
              <div className="skeleton sk-line" style={{ width: "70%" }} />
              <div
                className="skeleton sk-line"
                style={{ width: "85%", marginTop: "var(--space-3)" }}
              />
              <div className="skeleton sk-line" style={{ width: "45%" }} />
            </div>
          </div>
        </div>
      </div>

      {formMode === "create" ? (
        <TaskForm mode="create" currentUser={currentUser} onClose={closeForm} />
      ) : null}
      {formMode === "edit" && editingTask !== undefined ? (
        <TaskForm mode="edit" task={editingTask} currentUser={currentUser} onClose={closeForm} />
      ) : null}
    </div>
  );
}
