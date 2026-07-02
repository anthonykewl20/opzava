"use client";

import { useMemo, useState } from "react";

import {
  createTaskAction,
  moveTaskAction,
  updateTaskAction
} from "@/app/(app)/tasks/actions";
import {
  AskAdminPanel,
  type AskAdminPanelProps
} from "@/components/tasks/ask-admin-panel";
import type { TaskDto, TaskPriority, TaskStatus } from "@opzava/project-management";

interface TasksBoardProps {
  readonly tasks: readonly TaskDto[];
  readonly currentUser: {
    readonly id: string;
    readonly name: string;
  };
  readonly workspaceName: string;
  readonly askAdmin: Pick<AskAdminPanelProps, "conversationId" | "initialTurns">;
}

type BoardView = "kanban" | "list";

const statusColumns: readonly {
  readonly status: TaskStatus;
  readonly title: string;
  readonly shortTitle: string;
  readonly badgeClassName?: string;
}[] = [
  { status: "todo", title: "Backlog", shortTitle: "Backlog" },
  {
    status: "in_progress",
    title: "In progress",
    shortTitle: "Progress",
    badgeClassName: "badge-accent"
  },
  {
    status: "blocked",
    title: "Blocked",
    shortTitle: "Blocked",
    badgeClassName: "badge-warning"
  },
  { status: "done", title: "Done", shortTitle: "Done", badgeClassName: "badge-success" }
];

const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent"
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "Backlog",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done"
};

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

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Updated recently";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function priorityBadgeClassName(priority: TaskPriority): string {
  if (priority === "urgent") {
    return "badge badge-danger";
  }

  if (priority === "high") {
    return "badge badge-warning";
  }

  if (priority === "low") {
    return "badge";
  }

  return "badge badge-accent";
}

function TaskForm({
  mode,
  task,
  currentUser,
  onClose
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

        <form action={action} className="task-form">
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
        </form>
      </section>
    </div>
  );
}

function MoveTaskButton({
  task,
  targetStatus,
  targetTitle,
  position
}: {
  readonly task: TaskDto;
  readonly targetStatus: TaskStatus;
  readonly targetTitle: string;
  readonly position: number;
}) {
  return (
    <form action={moveTaskAction}>
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="status" value={targetStatus} />
      <input type="hidden" name="position" value={position} />
      <button
        className="btn btn-ghost btn-sm"
        type="submit"
        aria-label={`Move ${task.title} to ${targetTitle}`}
      >
        To {targetTitle}
      </button>
    </form>
  );
}

function TaskCard({
  task,
  nextPositions,
  onEdit
}: {
  readonly task: TaskDto;
  readonly nextPositions: Readonly<Record<TaskStatus, number>>;
  readonly onEdit: (task: TaskDto) => void;
}) {
  const assigneeName = task.assigneeName ?? "Unassigned";

  return (
    <article className="card task-card" aria-label={`Task: ${task.title}`}>
      <div className="task-card-main">
        <p className="task-card-title">{task.title}</p>
        {task.description.trim() === "" ? null : (
          <p className="task-card-desc">{task.description}</p>
        )}
      </div>

      <div className="task-card-meta">
        <span className="task-avatar" aria-hidden="true">
          {initials(assigneeName)}
        </span>
        <span className="u-subtle task-assignee">{assigneeName}</span>
        <span className={priorityBadgeClassName(task.priority)}>{priorityLabels[task.priority]}</span>
      </div>

      {task.labels.length === 0 ? null : (
        <div className="task-labels" aria-label="Task labels">
          {task.labels.map((label) => (
            <span className="badge" key={label}>
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="task-card-footer">
        <span className="u-subtle">Updated {formatUpdatedAt(task.updatedAt)}</span>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => onEdit(task)}
          aria-label={`Edit ${task.title}`}
        >
          Edit
        </button>
      </div>

      <div className="task-card-actions" aria-label={`Move ${task.title}`}>
        {statusColumns
          .filter((column) => column.status !== task.status)
          .map((column) => (
            <MoveTaskButton
              key={column.status}
              task={task}
              targetStatus={column.status}
              targetTitle={column.title}
              position={nextPositions[column.status]}
            />
          ))}
      </div>
    </article>
  );
}

function KanbanView({
  tasks,
  nextPositions,
  onEdit
}: {
  readonly tasks: readonly TaskDto[];
  readonly nextPositions: Readonly<Record<TaskStatus, number>>;
  readonly onEdit: (task: TaskDto) => void;
}) {
  return (
    <div className="board-columns" role="region" aria-label="Task board">
      {statusColumns.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status);
        const badgeClassName =
          column.badgeClassName === undefined ? "badge" : `badge ${column.badgeClassName}`;

        return (
          <section
            className="board-col"
            aria-labelledby={`tasks-col-${column.status}`}
            key={column.status}
          >
            <div className="board-col-header">
              <h2 className="board-col-title" id={`tasks-col-${column.status}`}>
                {column.title}
              </h2>
              <span
                className={badgeClassName}
                aria-label={`${columnTasks.length} tasks in ${column.title}`}
              >
                {columnTasks.length}
              </span>
            </div>
            <div className="board-col-cards">
              {columnTasks.length === 0 ? (
                <div className="task-empty">
                  <p className="empty-title">No tasks here</p>
                  <p className="empty-desc">Move or create a task in {column.title.toLowerCase()}.</p>
                </div>
              ) : (
                columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    nextPositions={nextPositions}
                    onEdit={onEdit}
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

function ListView({
  tasks,
  nextPositions,
  onEdit
}: {
  readonly tasks: readonly TaskDto[];
  readonly nextPositions: Readonly<Record<TaskStatus, number>>;
  readonly onEdit: (task: TaskDto) => void;
}) {
  if (tasks.length === 0) {
    return (
      <section className="card empty" aria-label="No tasks">
        <p className="empty-title">No tasks yet</p>
        <p className="empty-desc">Create the first task for this workspace.</p>
      </section>
    );
  }

  return (
    <div className="card task-list-card">
      <table className="table table-cards">
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>Labels</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td data-label="Task">
                <div>
                  <strong>{task.title}</strong>
                  {task.description.trim() === "" ? null : (
                    <p className="u-muted">{task.description}</p>
                  )}
                </div>
              </td>
              <td data-label="Status">{statusLabels[task.status]}</td>
              <td data-label="Priority">
                <span className={priorityBadgeClassName(task.priority)}>
                  {priorityLabels[task.priority]}
                </span>
              </td>
              <td data-label="Assignee">{task.assigneeName ?? "Unassigned"}</td>
              <td data-label="Labels">
                <div className="task-labels">
                  {task.labels.length === 0 ? (
                    <span className="u-subtle">None</span>
                  ) : (
                    task.labels.map((label) => (
                      <span className="badge" key={label}>
                        {label}
                      </span>
                    ))
                  )}
                </div>
              </td>
              <td data-label="Actions">
                <div className="task-row-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => onEdit(task)}
                    aria-label={`Edit ${task.title}`}
                  >
                    Edit
                  </button>
                  {task.status === "done" ? null : (
                    <MoveTaskButton
                      task={task}
                      targetStatus="done"
                      targetTitle="Done"
                      position={nextPositions.done}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TasksBoard({ tasks, currentUser, workspaceName, askAdmin }: TasksBoardProps) {
  const [view, setView] = useState<BoardView>("kanban");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDto | undefined>(undefined);

  const nextPositions = useMemo(() => {
    return statusColumns.reduce<Record<TaskStatus, number>>(
      (accumulator, column) => {
        const currentMax = tasks
          .filter((task) => task.status === column.status)
          .reduce((max, task) => Math.max(max, task.position), 0);
        accumulator[column.status] = currentMax + 1;
        return accumulator;
      },
      { todo: 1, in_progress: 1, blocked: 1, done: 1 }
    );
  }, [tasks]);

  const openCreateForm = () => {
    setEditingTask(undefined);
    setFormMode("create");
  };

  const openEditForm = (task: TaskDto) => {
    setEditingTask(task);
    setFormMode("edit");
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingTask(undefined);
  };

  return (
    <div className="page tasks-page">
      <div className="page-header tasks-page-header">
        <div>
          <h1>Tasks</h1>
          <p className="page-sub">{workspaceName} workspace board</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreateForm}>
          <span aria-hidden="true">+</span>
          New task
        </button>
      </div>

      <section className="task-toolbar" aria-label="Task board controls">
        <div className="sb-tabs" role="tablist" aria-label="Task views">
          <button
            className="sb-tab"
            type="button"
            role="tab"
            aria-selected={view === "kanban"}
            onClick={() => setView("kanban")}
          >
            Kanban
          </button>
          <button
            className="sb-tab"
            type="button"
            role="tab"
            aria-selected={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>

        <div
          className="task-count-summary"
          role="status"
          aria-label={`${tasks.length} total tasks`}
        >
          <span className="dot dot-accent" aria-hidden="true" />
          <strong>{tasks.length}</strong>
          <span className="u-subtle">total tasks</span>
        </div>
      </section>

      <div className="tasks-workspace">
        <div className="tasks-board-area">
          {view === "kanban" ? (
            <KanbanView tasks={tasks} nextPositions={nextPositions} onEdit={openEditForm} />
          ) : (
            <ListView tasks={tasks} nextPositions={nextPositions} onEdit={openEditForm} />
          )}
        </div>

        <AskAdminPanel
          conversationId={askAdmin.conversationId}
          initialTurns={askAdmin.initialTurns}
          currentUserName={currentUser.name}
        />
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
