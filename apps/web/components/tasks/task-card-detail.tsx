"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import type { CardDetailDto, TaskDto, TaskPriority, TaskStepDto } from "@opzava/project-management";

import {
  markTaskDoneAction,
  toggleTaskStepAction,
  updateTaskCardAction,
} from "@/app/(app)/tasks/[cardId]/actions";
import {
  applyStepToggle,
  dueDateLabel,
  formatCardId,
  initials,
  isAssistantAssignee,
  priorityLabel,
  relativeTimeLabel,
  statusBadgeClassName,
  statusLabel,
  stepProgress,
  taskCardTabs,
  watcherOverflow,
  type TaskCardTab,
} from "@/lib/task-card-format";

interface TaskCardDetailProps {
  readonly card: CardDetailDto;
  readonly currentUser: {
    readonly id: string;
    readonly name: string;
  };
  readonly workspaceName: string;
}

const priorities: readonly TaskPriority[] = ["low", "normal", "high", "urgent"];

function actionMessage(
  result:
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly error: { readonly code: string; readonly message: string };
      },
): string | null {
  return result.ok ? null : result.error.message;
}

function splitLabels(value: string): readonly string[] {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

function cardBorderClassName(task: TaskDto): string {
  if (task.status === "blocked") {
    return "task-card-detail-card task-card-detail-card-warning";
  }

  if (task.status === "done") {
    return "task-card-detail-card task-card-detail-card-success";
  }

  return "task-card-detail-card task-card-detail-card-accent";
}

function deferredPanelCopy(tab: Exclude<TaskCardTab, "overview">): {
  readonly title: string;
  readonly description: string;
} {
  if (tab === "ai-run") {
    return {
      title: "AI Run arrives in 2.5c-2",
      description:
        "This panel will read runtime-control assistant turns and tool outcomes for this card. There is no run trace to show in this shell slice.",
    };
  }

  if (tab === "evidence") {
    return {
      title: "No evidence or files yet",
      description:
        "The Evidence & Files data source lands in 2.5f with ObjectStore-backed uploads. This placeholder is intentionally empty until then.",
    };
  }

  return {
    title: "No quality review yet",
    description:
      "Quality checks and reviewer approval land in 2.5f. This tab is live navigation only and does not show fake review rows.",
  };
}

function StepAssignee({
  step,
  currentUser,
}: {
  readonly step: TaskStepDto;
  readonly currentUser: TaskCardDetailProps["currentUser"];
}) {
  if (step.assigneeUserId === null) {
    return null;
  }

  const name = step.assigneeUserId === currentUser.id ? currentUser.name : step.assigneeUserId;

  return (
    <span className="task-card-mini-avatar" aria-label={`Assigned to ${name}`} title={name}>
      {initials(name)}
    </span>
  );
}

function EditTaskModal({
  task,
  onClose,
  onSaved,
}: {
  readonly task: TaskDto;
  readonly onClose: () => void;
  readonly onSaved: (task: TaskDto) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "");
    const description = String(formData.get("description") ?? "");
    const priority = String(formData.get("priority") ?? "");
    const labels = String(formData.get("labels") ?? "");

    startTransition(async () => {
      const result = await updateTaskCardAction({
        taskId: task.id,
        title,
        description,
        priority,
        labels,
      });
      const message = actionMessage(result);
      setError(message);

      if (result.ok) {
        onSaved(result.value);
      }
    });
  };

  return (
    <div className="task-modal-backdrop" role="presentation">
      <section
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-card-edit-title"
      >
        <div className="task-modal-head">
          <h2 className="task-modal-title" id="task-card-edit-title">
            Edit card
          </h2>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            aria-label="Close edit card"
            onClick={onClose}
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <form className="task-form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="task-card-edit-title-input">
              Title
            </label>
            <input
              className="input"
              id="task-card-edit-title-input"
              name="title"
              type="text"
              required
              maxLength={180}
              defaultValue={task.title}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="task-card-edit-description">
              Description
            </label>
            <textarea
              className="textarea"
              id="task-card-edit-description"
              name="description"
              maxLength={4000}
              defaultValue={task.description}
            />
          </div>

          <div className="task-form-grid">
            <div className="field">
              <label className="label" htmlFor="task-card-edit-priority">
                Priority
              </label>
              <select
                className="select"
                id="task-card-edit-priority"
                name="priority"
                defaultValue={task.priority}
              >
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priorityLabel(priority)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field task-card-edit-labels">
              <label className="label" htmlFor="task-card-edit-labels">
                Labels
              </label>
              <input
                className="input"
                id="task-card-edit-labels"
                name="labels"
                type="text"
                defaultValue={task.labels.join(", ")}
              />
            </div>
          </div>

          {error === null ? null : (
            <p className="hint task-card-action-error" role="alert">
              {error}
            </p>
          )}

          <div className="task-modal-foot">
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save card"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function TaskCardDetail({ card, currentUser, workspaceName }: TaskCardDetailProps) {
  const [task, setTask] = useState(card.task);
  const [steps, setSteps] = useState<readonly TaskStepDto[]>(card.steps);
  const [activeTab, setActiveTab] = useState<TaskCardTab>("overview");
  const [copied, setCopied] = useState<"id" | "link" | null>(null);
  const [idPopoverOpen, setIdPopoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isMarkDonePending, startMarkDoneTransition] = useTransition();
  const [isStepPending, startStepTransition] = useTransition();

  useEffect(() => {
    setTask(card.task);
    setSteps(card.steps);
  }, [card]);

  const cardId = useMemo(
    () => formatCardId(workspaceName, task.cardNumber),
    [workspaceName, task.cardNumber],
  );
  const progress = stepProgress(steps);
  const watchers = watcherOverflow(card.watchers);
  const assignedName = task.assigneeName ?? "Unassigned";
  const assignedIsAssistant = isAssistantAssignee(task);
  const provenance = `${relativeTimeLabel(task.createdAt)} from ${task.provenanceSource}`;

  const copyText = async (text: string, kind: "id" | "link") => {
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text);
    }

    setCopied(kind);
    window.setTimeout(() => {
      setCopied(null);
    }, 1200);
  };

  const handleCopyLink = () => {
    const href =
      typeof window === "undefined" ? `/tasks/${cardId.routeSegment}` : window.location.href;
    void copyText(href, "link");
    setMenuOpen(false);
  };

  const handleMarkDone = () => {
    startMarkDoneTransition(async () => {
      const result = await markTaskDoneAction({ taskId: task.id });
      const message = actionMessage(result);
      setActionError(message);

      if (result.ok) {
        setTask(result.value.task);
      }
    });
  };

  const handleToggleStep = (step: TaskStepDto) => {
    const nextDone = !step.done;
    const previousSteps = steps;
    setSteps((current) => applyStepToggle(current, step.id, nextDone));

    startStepTransition(async () => {
      const result = await toggleTaskStepAction({
        taskId: task.id,
        stepId: step.id,
        done: nextDone,
      });
      const message = actionMessage(result);
      setActionError(message);

      if (result.ok) {
        setSteps((current) =>
          current.map((currentStep) =>
            currentStep.id === result.value.id ? result.value : currentStep,
          ),
        );
      } else {
        setSteps(previousSteps);
      }
    });
  };

  const handleSaved = (updatedTask: TaskDto) => {
    setTask(updatedTask);
    setEditOpen(false);
    setMenuOpen(false);
  };

  return (
    <div className="page task-card-detail-page">
      <nav className="sb-breadcrumb task-card-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span className="sep" aria-hidden="true">
          /
        </span>
        <a href="/tasks">Tasks</a>
        <span className="sep" aria-hidden="true">
          /
        </span>
        <span className="current">{cardId.cardId}</span>
      </nav>

      <article className={`card ${cardBorderClassName(task)}`} aria-labelledby="task-card-title">
        <div className="card-body task-card-detail-body">
          <div className="task-card-detail-top">
            <div className="u-row task-card-id-tools">
              <span className="task-card-id-chip">
                <span className="u-subtle">#</span>
                {cardId.cardId}
                <button
                  className="task-card-id-copy"
                  type="button"
                  aria-label={`Copy ${cardId.cardId}`}
                  onClick={() => void copyText(cardId.cardId, "id")}
                >
                  {copied === "id" ? "Copied" : "Copy"}
                </button>
              </span>

              <div className="task-card-popover-wrap">
                <button
                  className="btn btn-sm btn-ghost"
                  type="button"
                  aria-expanded={idPopoverOpen}
                  aria-controls="task-card-id-popover"
                  onClick={() => setIdPopoverOpen((open) => !open)}
                >
                  What's this ID?
                  <span aria-hidden="true">v</span>
                </button>
                {idPopoverOpen ? (
                  <div className="sb-popover task-card-id-popover" id="task-card-id-popover">
                    <strong>Standardized workspace ID</strong>
                    <p className="u-muted">
                      Cards in {workspaceName} use a stable {cardId.prefix}-N handle. People,
                      agents, MCP tools, and links can refer to {cardId.cardId} without trusting
                      caller-supplied tenant or workspace ids.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="u-row task-card-header-actions">
              <button
                className="btn"
                type="button"
                disabled={task.status === "done" || isMarkDonePending}
                onClick={handleMarkDone}
              >
                <span aria-hidden="true">✓</span>
                {task.status === "done" ? "Done" : isMarkDonePending ? "Marking..." : "Mark done"}
              </button>

              <div className="task-card-popover-wrap">
                <button
                  className="btn btn-icon"
                  type="button"
                  aria-label="Card actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <span aria-hidden="true">...</span>
                </button>
                {menuOpen ? (
                  <div className="sb-menu task-card-actions-menu" role="menu">
                    <div className="sb-menu-label">Card</div>
                    <button
                      className="sb-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={handleCopyLink}
                    >
                      <span aria-hidden="true">↗</span>
                      {copied === "link" ? "Copied link" : "Copy link"}
                    </button>
                    <button
                      className="sb-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setEditOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      <span aria-hidden="true">✎</span>
                      Edit
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <h1 className="task-card-detail-title" id="task-card-title">
            {task.title}
          </h1>

          <div className="task-card-chip-row" aria-label="Task card metadata">
            <span className={statusBadgeClassName(task.status)}>{statusLabel(task.status)}</span>
            {task.labels.length === 0 ? (
              <span className="sb-badge">No labels</span>
            ) : (
              task.labels.map((label) => (
                <span className="sb-badge sb-badge--outline" key={label}>
                  {label}
                </span>
              ))
            )}
            <span className="sb-badge sb-badge--warning">
              <span className="dot dot-warning" aria-hidden="true" />
              {dueDateLabel(task.dueAt)}
            </span>
          </div>

          <div className="task-card-meta-grid">
            <div className="task-card-meta">
              <b>Assigned to</b>
              <span className="u-row">
                <span
                  className={assignedIsAssistant ? "task-avatar task-avatar-ai" : "task-avatar"}
                >
                  {initials(assignedName)}
                </span>
                <span>{assignedName}</span>
                {assignedIsAssistant ? <span className="sb-badge sb-badge--accent">AI</span> : null}
              </span>
            </div>

            <div className="task-card-meta">
              <b>Added</b>
              <span>{provenance}</span>
            </div>

            <div className="task-card-meta">
              <b>Watching</b>
              {watchers.visible.length === 0 ? (
                <span className="u-subtle">No watchers</span>
              ) : (
                <span className="task-card-avatar-group" aria-label={watchers.label}>
                  {watchers.visible.map((watcher) => (
                    <span
                      className="task-card-mini-avatar"
                      key={watcher.userId}
                      title={watcher.name ?? watcher.userId}
                    >
                      {initials(watcher.name ?? watcher.userId)}
                    </span>
                  ))}
                  {watchers.overflowCount === 0 ? null : (
                    <span className="task-card-mini-avatar">+{watchers.overflowCount}</span>
                  )}
                </span>
              )}
            </div>
          </div>

          {actionError === null ? null : (
            <div className="sb-alert sb-alert--destructive task-card-action-alert" role="alert">
              <span className="ico" aria-hidden="true">
                !
              </span>
              <span className="sb-alert-title">Card action failed</span>
              <span className="sb-alert-desc">{actionError}</span>
            </div>
          )}

          <div className="sb-tabs task-card-tabs" role="tablist" aria-label="Card sections">
            {taskCardTabs.map((tab) => (
              <button
                className="sb-tab"
                type="button"
                role="tab"
                key={tab.id}
                aria-selected={activeTab === tab.id}
                aria-controls={`task-card-panel-${tab.id}`}
                id={`task-card-tab-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <section
            className="task-card-tabpanel"
            id="task-card-panel-overview"
            role="tabpanel"
            aria-labelledby="task-card-tab-overview"
            hidden={activeTab !== "overview"}
          >
            <p className="task-card-description">
              {task.description.trim() === "" ? "No description yet." : task.description}
            </p>

            <div className="task-card-section-head">
              <h2>Steps</h2>
              <span className="u-subtle">{progress.label}</span>
            </div>

            {steps.length === 0 ? (
              <div className="task-card-empty-inline">
                <p className="empty-title">No steps yet</p>
                <p className="empty-desc">
                  Add steps through the MCP task tools or a later card edit slice.
                </p>
              </div>
            ) : (
              <div className="task-card-steps">
                {steps.map((step) => (
                  <label
                    className={step.done ? "task-card-step task-card-step-done" : "task-card-step"}
                    key={step.id}
                  >
                    <input
                      className="sb-check"
                      type="checkbox"
                      checked={step.done}
                      disabled={isStepPending}
                      aria-label={step.text}
                      onChange={() => handleToggleStep(step)}
                    />
                    <span className="task-card-step-text">{step.text}</span>
                    <StepAssignee step={step} currentUser={currentUser} />
                  </label>
                ))}
              </div>
            )}

            <p className="task-card-provenance">
              Added {relativeTimeLabel(task.createdAt)} from {task.provenanceSource}
              {task.provenanceExternalRef === null ? "." : ` (${task.provenanceExternalRef}).`}
            </p>
          </section>

          {(["ai-run", "evidence", "quality"] as const).map((tab) => {
            const copy = deferredPanelCopy(tab);

            return (
              <section
                className="task-card-tabpanel"
                id={`task-card-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`task-card-tab-${tab}`}
                hidden={activeTab !== tab}
                key={tab}
              >
                <div className="task-card-empty-inline">
                  <p className="empty-title">{copy.title}</p>
                  <p className="empty-desc">{copy.description}</p>
                </div>
              </section>
            );
          })}
        </div>
      </article>

      {editOpen ? (
        <EditTaskModal task={task} onClose={() => setEditOpen(false)} onSaved={handleSaved} />
      ) : null}
    </div>
  );
}
