"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CardDetailDto,
  TaskCommentDto,
  TaskDto,
  TaskEvidenceDto,
  TaskPriority,
  TaskQualityCheckState,
  TaskQualityReviewDto,
  TaskStepDto,
} from "@opzava/project-management";

import {
  addTaskEvidenceLinkAction,
  addTaskQualityCheckAction,
  approveTaskQualityReviewAction,
  markTaskDoneAction,
  markTaskCommentsReadAction,
  postTaskCommentAction,
  prepareTaskEvidenceUploadAction,
  presignTaskEvidenceDownloadAction,
  toggleTaskQualityCheckAction,
  toggleTaskStepAction,
  updateTaskCardAction,
} from "@/app/(app)/tasks/[cardId]/actions";
import { parseAskAdminSseBuffer } from "@/lib/ask-admin-stream";
import type { TaskCardAssistantRunView } from "@/lib/task-card-ai-run-view";
import {
  assistantActivityState,
  assistantActivityLabel,
  parseTaskCardActivitySseBuffer,
  taskCardAiRunProjectionFromState,
  type TaskCardAssistantActivityState,
} from "@/lib/task-card-activity";
import { commentReadState, upsertComment } from "@/lib/task-card-comments";
import {
  assistantPrechecksFromRuns,
  evidenceCountLabel,
  evidenceSizeLabel,
  qualityReviewProjection,
  validateEvidenceUploadSize,
} from "@/lib/task-card-evidence-quality";
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
import { targetMentionKey, type MentionTarget } from "@/lib/task-card-mentions";

interface TaskCardDetailProps {
  readonly card: CardDetailDto;
  readonly assistantRuns: readonly TaskCardAssistantRunView[];
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

function cardBorderClassName(task: TaskDto): string {
  if (task.status === "blocked") {
    return "task-card-detail-card task-card-detail-card-warning";
  }

  if (task.status === "done") {
    return "task-card-detail-card task-card-detail-card-success";
  }

  return "task-card-detail-card task-card-detail-card-accent";
}

function deferredPanelCopy(): {
  readonly title: string;
  readonly description: string;
} {
  return {
    title: "No assistant runs yet",
    description:
      "Mention Ask Admin Opzava in a comment or use task tools to create an auditable run.",
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

function commentAuthorName(
  comment: TaskCommentDto,
  input: {
    readonly currentUser: TaskCardDetailProps["currentUser"];
    readonly userNamesById: Readonly<Record<string, string>>;
  },
): string {
  if (comment.authorKind === "assistant") {
    return comment.assistantKey ?? "Ask Admin Opzava";
  }

  if (comment.authorUserId === input.currentUser.id) {
    return input.currentUser.name;
  }

  return comment.authorUserId === null
    ? "Unknown"
    : (input.userNamesById[comment.authorUserId] ?? comment.authorUserId);
}

function commentRelativeTime(value: string): string {
  return relativeTimeLabel(value);
}

function textFromActivityState(state: TaskCardAssistantActivityState): string | null {
  return state === "idle" ? null : assistantActivityLabel(state);
}

function githubIssueLink(
  value: string | null,
): { readonly label: string; readonly href: string } | null {
  if (value === null) {
    return null;
  }

  const shortRef = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([1-9]\d*)$/i.exec(value);
  if (shortRef !== null) {
    const repository = shortRef[1];
    const number = shortRef[2];
    if (repository === undefined || number === undefined) {
      return null;
    }

    return {
      label: `#${number}`,
      href: `https://github.com/${repository}/issues/${number}`,
    };
  }

  const urlRef =
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/([1-9]\d*)$/i.exec(value);
  if (urlRef !== null) {
    const number = urlRef[1];
    return number === undefined ? null : { label: `#${number}`, href: value };
  }

  return null;
}

function mentionTargets(
  currentUser: TaskCardDetailProps["currentUser"],
  watchers: CardDetailDto["watchers"],
): readonly MentionTarget[] {
  const targets = new Map<string, MentionTarget>();
  targets.set(currentUser.id, {
    key: targetMentionKey({ key: currentUser.id, label: currentUser.name }),
    label: currentUser.name,
    kind: "human",
    userId: currentUser.id,
  });

  for (const watcher of watchers) {
    const label = watcher.name ?? watcher.userId;
    targets.set(watcher.userId, {
      key: targetMentionKey({ key: watcher.userId, label }),
      label,
      kind: "human",
      userId: watcher.userId,
    });
  }

  return [
    ...targets.values(),
    {
      key: "ask-admin-opzava",
      label: "Ask Admin Opzava",
      kind: "assistant",
      assistantKey: "ask-admin-opzava",
    },
  ];
}

function shouldShowMentionPopover(body: string): boolean {
  return /(^|\s)@[a-z0-9-]*$/i.test(body);
}

function insertMention(body: string, target: MentionTarget): string {
  const token = `@${target.key}`;
  if (/(^|\s)@[a-z0-9-]*$/i.test(body)) {
    return body.replace(/(^|\s)@[a-z0-9-]*$/i, (match, prefix: string) => `${prefix}${token} `);
  }

  return `${body}${body.endsWith(" ") || body === "" ? "" : " "}${token} `;
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

export function TaskCardDetail({
  card,
  assistantRuns,
  currentUser,
  workspaceName,
}: TaskCardDetailProps) {
  const router = useRouter();
  const [task, setTask] = useState(card.task);
  const [steps, setSteps] = useState<readonly TaskStepDto[]>(card.steps);
  const [comments, setComments] = useState<readonly TaskCommentDto[]>(card.comments);
  const [evidence, setEvidence] = useState<readonly TaskEvidenceDto[]>(card.evidence);
  const [qualityReview, setQualityReview] = useState<TaskQualityReviewDto | null>(
    card.qualityReview,
  );
  const [runs, setRuns] = useState<readonly TaskCardAssistantRunView[]>(assistantRuns);
  const [assistantState, setAssistantState] = useState<TaskCardAssistantActivityState>(() =>
    assistantActivityState(assistantRuns),
  );
  const [commentBody, setCommentBody] = useState("");
  const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
  const [tickerNow, setTickerNow] = useState(() => new Date());
  const [activeTab, setActiveTab] = useState<TaskCardTab>("overview");
  const [copied, setCopied] = useState<"id" | "link" | null>(null);
  const [idPopoverOpen, setIdPopoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [evidenceMessage, setEvidenceMessage] = useState<string | null>(null);
  const [qualityMessage, setQualityMessage] = useState<string | null>(null);
  const [isMarkDonePending, startMarkDoneTransition] = useTransition();
  const [isStepPending, startStepTransition] = useTransition();
  const [isCommentPending, startCommentTransition] = useTransition();
  const [isEvidencePending, startEvidenceTransition] = useTransition();
  const [isQualityPending, startQualityTransition] = useTransition();

  useEffect(() => {
    setTask(card.task);
    setSteps(card.steps);
    setComments(card.comments);
    setEvidence(card.evidence);
    setQualityReview(card.qualityReview);
  }, [card]);

  useEffect(() => {
    setRuns(assistantRuns);
    setAssistantState(assistantActivityState(assistantRuns));
  }, [assistantRuns]);

  const cardId = useMemo(
    () => formatCardId(workspaceName, task.cardNumber),
    [workspaceName, task.cardNumber],
  );
  const memberNamesById = useMemo(() => {
    return Object.fromEntries([
      [currentUser.id, currentUser.name],
      ...card.watchers.map((watcher) => [watcher.userId, watcher.name ?? watcher.userId] as const),
    ]);
  }, [card.watchers, currentUser.id, currentUser.name]);
  const targets = useMemo(
    () => mentionTargets(currentUser, card.watchers),
    [card.watchers, currentUser],
  );
  const progress = stepProgress(steps);
  const watchers = watcherOverflow(card.watchers);
  const aiProjection = taskCardAiRunProjectionFromState({ runs }, tickerNow);
  const qualityProjection = qualityReviewProjection(qualityReview);
  const qualityReviewApproved = qualityReview?.status === "approved";
  const assistantPrechecks = assistantPrechecksFromRuns(runs);
  const evidenceFiles = evidence.filter((item) => item.kind === "file");
  const evidenceLinks = evidence.filter((item) => item.kind === "link");
  const assignedName = task.assigneeName ?? "Unassigned";
  const assignedIsAssistant = isAssistantAssignee(task);
  const linkedIssue = githubIssueLink(task.provenanceExternalRef);
  const provenance = `${relativeTimeLabel(task.createdAt)} from ${task.provenanceSource}`;
  const assistantActivityText = textFromActivityState(assistantState);

  useEffect(() => {
    if (!aiProjection.live) {
      return;
    }

    const interval = window.setInterval(() => {
      setTickerNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [aiProjection.live]);

  useEffect(() => {
    const unreadCommentIds = comments
      .filter((comment) => !comment.readByUserIds.includes(currentUser.id))
      .map((comment) => comment.id);
    if (unreadCommentIds.length === 0) {
      return;
    }

    let cancelled = false;
    void markTaskCommentsReadAction({
      taskId: task.id,
      commentIds: unreadCommentIds,
    }).then((result) => {
      if (!cancelled && result.ok) {
        setComments(result.value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [comments, currentUser.id, task.id]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/tasks/${cardId.routeSegment}/activity`, {
          headers: { accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!response.ok || response.body === null) {
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) {
            break;
          }

          buffer += decoder.decode(chunk.value, { stream: true });
          const parsed = parseTaskCardActivitySseBuffer(buffer);
          buffer = parsed.remainder;
          for (const event of parsed.events) {
            if (event.type === "comment-added") {
              setComments((current) => upsertComment(current, event.comment));
            } else if (event.type === "step-toggled") {
              setSteps((current) =>
                current.map((step) => (step.id === event.step.id ? event.step : step)),
              );
            } else {
              setAssistantState(event.state);
              setRuns(event.runs);
            }
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setAssistantState("failed");
        }
      }
    })();

    return () => controller.abort();
  }, [cardId.routeSegment]);

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

  const dispatchAssistantMention = async (dispatch: {
    readonly conversationId: string;
    readonly prompt: string;
    readonly idempotencyKey: string;
  }) => {
    setAssistantState("assistant_replying");
    try {
      const response = await fetch("/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: dispatch.conversationId,
          prompt: dispatch.prompt,
          idempotencyKey: dispatch.idempotencyKey,
        }),
      });

      if (!response.ok || response.body === null) {
        setAssistantState("failed");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }

        buffer += decoder.decode(chunk.value, { stream: true });
        const parsed = parseAskAdminSseBuffer(buffer);
        buffer = parsed.remainder;
        for (const event of parsed.events) {
          if (event.type === "tool.started" || event.type === "tool.succeeded") {
            setAssistantState("assistant_working");
          } else if (event.type === "finalizing") {
            setAssistantState("assistant_finalizing");
          } else if (event.type === "assistant.final") {
            setAssistantState("idle");
            router.refresh();
          } else if (event.type === "failed") {
            setAssistantState("failed");
          } else if (event.type === "delta" || event.type === "queued") {
            setAssistantState("assistant_replying");
          }
        }
      }
    } catch {
      setAssistantState("failed");
    }
  };

  const handlePostComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = commentBody.trim();
    if (body === "" || isCommentPending) {
      return;
    }

    startCommentTransition(async () => {
      const result = await postTaskCommentAction({
        taskId: task.id,
        body,
        mentionChainDepth: 0,
      });
      const message = actionMessage(result);
      setActionError(message);

      if (result.ok) {
        setComments((current) => upsertComment(current, result.value.comment));
        setCommentBody("");
        setMentionPopoverOpen(false);
        if (result.value.assistantDispatch !== null) {
          await dispatchAssistantMention(result.value.assistantDispatch);
        }
      }
    });
  };

  const handleEvidenceUpload = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file");
    const file =
      fileInput instanceof HTMLInputElement && fileInput.files !== null
        ? fileInput.files.item(0)
        : null;
    if (file === null || isEvidencePending) {
      return;
    }

    const size = validateEvidenceUploadSize(file.size);
    if (!size.ok) {
      setEvidenceMessage(size.message);
      return;
    }

    startEvidenceTransition(async () => {
      setEvidenceMessage("Preparing upload...");
      const prepared = await prepareTaskEvidenceUploadAction({
        taskId: task.id,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      if (!prepared.ok) {
        setEvidenceMessage(prepared.error.message);
        return;
      }

      try {
        const upload = await fetch(prepared.value.upload.url, {
          method: prepared.value.upload.method,
          headers: prepared.value.upload.headers,
          body: file,
        });
        if (!upload.ok) {
          setEvidenceMessage("Upload failed. The file row remains for retry or cleanup.");
          return;
        }

        setEvidence((current) => [prepared.value.evidence, ...current]);
        setEvidenceMessage("Upload complete.");
        form.reset();
      } catch {
        setEvidenceMessage("Evidence storage is temporarily unavailable.");
      }
    });
  };

  const handleEvidenceLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const url = String(formData.get("url") ?? "");
    const title = String(formData.get("title") ?? "");
    if (url.trim() === "" || isEvidencePending) {
      return;
    }

    startEvidenceTransition(async () => {
      const result = await addTaskEvidenceLinkAction({
        taskId: task.id,
        url,
        ...(title.trim() === "" ? {} : { title }),
      });
      if (!result.ok) {
        setEvidenceMessage(result.error.message);
        return;
      }

      setEvidence((current) => [result.value, ...current]);
      setEvidenceMessage("Link added.");
    });
  };

  const handleEvidenceDownload = (item: TaskEvidenceDto) => {
    startEvidenceTransition(async () => {
      const result = await presignTaskEvidenceDownloadAction({
        taskId: task.id,
        evidenceId: item.id,
      });
      if (!result.ok) {
        setEvidenceMessage(result.error.message);
        return;
      }

      window.open(result.value.url, "_blank", "noopener,noreferrer");
    });
  };

  const handleAddQualityCheck = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const label = String(formData.get("label") ?? "");
    if (label.trim() === "" || isQualityPending) {
      return;
    }

    startQualityTransition(async () => {
      if (qualityReviewApproved) {
        setQualityMessage("Approved quality reviews cannot be changed.");
        return;
      }

      const result = await addTaskQualityCheckAction({
        taskId: task.id,
        label,
      });
      if (!result.ok) {
        setQualityMessage(result.error.message);
        return;
      }

      setQualityReview(result.value);
      setQualityMessage("Quality check added.");
    });
  };

  const handleToggleQualityCheck = (checkId: string, state: TaskQualityCheckState) => {
    startQualityTransition(async () => {
      if (qualityReviewApproved) {
        setQualityMessage("Approved quality reviews cannot be changed.");
        return;
      }

      const result = await toggleTaskQualityCheckAction({
        taskId: task.id,
        checkId,
        state,
      });
      if (!result.ok) {
        setQualityMessage(result.error.message);
        return;
      }

      setQualityReview(result.value);
      setQualityMessage(null);
    });
  };

  const handleApproveQualityReview = () => {
    startQualityTransition(async () => {
      const result = await approveTaskQualityReviewAction({
        taskId: task.id,
        ...(qualityReview?.id === undefined ? {} : { expectedReviewId: qualityReview.id }),
      });
      if (!result.ok) {
        setQualityMessage(result.error.message);
        return;
      }

      setQualityReview(result.value);
      setQualityMessage("Quality review approved.");
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

            <div className="task-card-meta">
              <b>Issue</b>
              {linkedIssue === null ? (
                <span className="u-subtle">No GitHub issue</span>
              ) : (
                <a
                  className="sb-badge sb-badge--outline"
                  href={linkedIssue.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {linkedIssue.label}
                </a>
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
                {tab.id === "evidence" ? (
                  <span className="sb-badge sb-badge--secondary task-card-tab-count">
                    {evidence.length}
                  </span>
                ) : null}
                {tab.id === "quality" && qualityProjection.remainingCount > 0 ? (
                  <span className="sb-badge sb-badge--warning task-card-tab-count">
                    {qualityProjection.remainingCount}
                  </span>
                ) : null}
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

            <div className="task-card-section-head">
              <h2>Comments</h2>
              <span className="u-subtle">{comments.length} total</span>
            </div>

            <div className="task-card-comments" role="log" aria-label="Task card comments">
              {comments.length === 0 ? (
                <div className="task-card-empty-inline">
                  <p className="empty-title">No comments yet</p>
                  <p className="empty-desc">Post the first comment for this card.</p>
                </div>
              ) : (
                comments.map((comment) => {
                  const authorName = commentAuthorName(comment, {
                    currentUser,
                    userNamesById: memberNamesById,
                  });
                  const readState = commentReadState(comment, {
                    currentUserId: currentUser.id,
                    userNamesById: memberNamesById,
                  });

                  return (
                    <article
                      className={
                        comment.authorKind === "assistant"
                          ? "task-card-comment task-card-comment-ai"
                          : "task-card-comment"
                      }
                      key={comment.id}
                    >
                      <span
                        className={
                          comment.authorKind === "assistant"
                            ? "task-avatar task-avatar-ai"
                            : "task-avatar"
                        }
                        aria-hidden="true"
                      >
                        {initials(authorName)}
                      </span>
                      <div className="u-grow">
                        <div className="task-card-comment-meta">
                          <strong>{authorName}</strong>
                          {comment.authorKind === "assistant" ? (
                            <span className="sb-badge sb-badge--accent">AI</span>
                          ) : comment.authorUserId === currentUser.id ? (
                            <span className="sb-badge sb-badge--secondary">You</span>
                          ) : null}
                          <span className="u-subtle">{commentRelativeTime(comment.createdAt)}</span>
                        </div>
                        <p className="task-card-comment-body">{comment.body}</p>
                        <span
                          className={
                            readState.unread
                              ? "task-card-read-state task-card-read-state-unread"
                              : "task-card-read-state"
                          }
                        >
                          <span className="task-card-read-dots" aria-hidden="true">
                            {readState.readers.slice(0, 2).map((reader) => (
                              <span className="task-card-reader-avatar" key={reader.userId}>
                                {initials(reader.name)}
                              </span>
                            ))}
                            {readState.readers.length === 0 ? <span className="dot" /> : null}
                          </span>
                          {readState.label}
                        </span>
                      </div>
                    </article>
                  );
                })
              )}

              {assistantActivityText === null ? null : (
                <div className="task-card-typing" role="status" aria-live="polite">
                  <span className="task-avatar task-avatar-ai" aria-hidden="true">
                    A
                  </span>
                  <span className="u-muted">
                    <strong>Ask Admin Opzava</strong> {assistantActivityText}
                  </span>
                  <span className="task-card-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              )}

              {commentBody.trim() === "" ? null : (
                <div className="task-card-typing task-card-typing-human" role="status">
                  <span className="u-subtle">You're typing</span>
                  <span className="task-card-dots task-card-dots-human" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              )}
            </div>

            <form className="task-card-comment-form" onSubmit={handlePostComment}>
              <span className="task-avatar" aria-hidden="true">
                {initials(currentUser.name)}
              </span>
              <div className="u-grow task-card-comment-compose">
                <label className="u-sr-only" htmlFor="task-card-comment">
                  Add a comment
                </label>
                <textarea
                  className="textarea"
                  id="task-card-comment"
                  rows={2}
                  placeholder="Write a comment... type @ to mention Ask Admin Opzava"
                  value={commentBody}
                  onChange={(event) => {
                    setCommentBody(event.currentTarget.value);
                    setMentionPopoverOpen(shouldShowMentionPopover(event.currentTarget.value));
                  }}
                  onFocus={() => setMentionPopoverOpen(shouldShowMentionPopover(commentBody))}
                />
                {mentionPopoverOpen ? (
                  <div className="mention-pop" role="listbox" aria-label="Mention someone">
                    <div className="mention-hd">Mention</div>
                    {targets.map((target) => (
                      <button
                        className="mention-item"
                        role="option"
                        type="button"
                        key={`${target.kind}:${target.key}`}
                        onClick={() => {
                          setCommentBody((current) => insertMention(current, target));
                          setMentionPopoverOpen(false);
                        }}
                      >
                        <span
                          className={
                            target.kind === "assistant"
                              ? "task-avatar task-avatar-ai"
                              : "task-avatar"
                          }
                          aria-hidden="true"
                        >
                          {initials(target.label)}
                        </span>
                        <span className="mention-nm">{target.label}</span>
                        <span className="mention-sub">
                          {target.kind === "assistant" ? "AI assistant" : "workspace member"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div>
                  <button className="btn" type="submit" disabled={isCommentPending}>
                    {isCommentPending ? "Posting..." : "Post comment"}
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section
            className="task-card-tabpanel"
            id="task-card-panel-ai-run"
            role="tabpanel"
            aria-labelledby="task-card-tab-ai-run"
            hidden={activeTab !== "ai-run"}
          >
            {aiProjection.steps.length === 0 ? (
              <div className="task-card-empty-inline">
                <p className="empty-title">{deferredPanelCopy().title}</p>
                <p className="empty-desc">{deferredPanelCopy().description}</p>
              </div>
            ) : (
              <>
                <div className="u-between task-card-ai-run-head">
                  <p className="u-muted">
                    Plain-language trace of assistant turns and tool outcomes linked to this card.
                  </p>
                  {aiProjection.elapsedLabel === null ? null : (
                    <span className="u-row u-subtle">
                      <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
                      live · {aiProjection.elapsedLabel}
                    </span>
                  )}
                </div>
                <ol className="task-card-run-steps" aria-label="Assistant run steps">
                  {aiProjection.steps.map((step) => (
                    <li
                      className={`task-card-run-step task-card-run-step-${step.state}`}
                      key={step.id}
                    >
                      <span className="task-card-run-glyph" aria-hidden="true">
                        {step.state === "failed" ? "!" : step.state === "working" ? "..." : "✓"}
                      </span>
                      <span>{step.text}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>

          <section
            className="task-card-tabpanel"
            id="task-card-panel-evidence"
            role="tabpanel"
            aria-labelledby="task-card-tab-evidence"
            hidden={activeTab !== "evidence"}
          >
            <div className="task-card-section-head">
              <div>
                <h2>Evidence & Files</h2>
                <p className="u-muted">{evidenceCountLabel(evidence)} attached to this card.</p>
              </div>
            </div>

            {evidenceMessage === null ? null : (
              <div className="sb-alert task-card-action-alert" role="status">
                <span className="ico" aria-hidden="true">
                  i
                </span>
                <span className="sb-alert-title">Evidence</span>
                <span className="sb-alert-desc">{evidenceMessage}</span>
              </div>
            )}

            <div className="task-card-evidence-grid">
              <form className="task-card-evidence-upload" onSubmit={handleEvidenceUpload}>
                <div className="field">
                  <label className="label" htmlFor="task-card-evidence-file">
                    Upload file
                  </label>
                  <input className="input" id="task-card-evidence-file" name="file" type="file" />
                </div>
                <button className="btn" type="submit" disabled={isEvidencePending}>
                  {isEvidencePending ? "Working..." : "Upload"}
                </button>
              </form>

              <form className="task-card-evidence-upload" onSubmit={handleEvidenceLink}>
                <div className="field">
                  <label className="label" htmlFor="task-card-evidence-link">
                    Add link
                  </label>
                  <input
                    className="input"
                    id="task-card-evidence-link"
                    name="url"
                    type="url"
                    placeholder="https://..."
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="task-card-evidence-link-title">
                    Link title
                  </label>
                  <input
                    className="input"
                    id="task-card-evidence-link-title"
                    name="title"
                    type="text"
                    maxLength={240}
                  />
                </div>
                <button className="btn" type="submit" disabled={isEvidencePending}>
                  Add link
                </button>
              </form>
            </div>

            {evidence.length === 0 ? (
              <div className="task-card-empty-inline">
                <p className="empty-title">No evidence yet</p>
                <p className="empty-desc">
                  Upload a file or add a source link. Evidence rows are saved only after an
                  authorized card action.
                </p>
              </div>
            ) : (
              <>
                <div className="task-card-evidence-section">
                  <h3>Files</h3>
                  {evidenceFiles.length === 0 ? (
                    <p className="u-muted">No files uploaded yet.</p>
                  ) : (
                    <div className="task-card-evidence-list">
                      {evidenceFiles.map((item) => (
                        <article className="task-card-evidence-row" key={item.id}>
                          <div>
                            <strong>{item.filename}</strong>
                            <p className="u-muted">
                              {item.provenance} · {evidenceSizeLabel(item.sizeBytes)}
                            </p>
                          </div>
                          <button
                            className="btn btn-sm"
                            type="button"
                            disabled={isEvidencePending}
                            onClick={() => handleEvidenceDownload(item)}
                          >
                            Download
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="task-card-evidence-section">
                  <h3>Links</h3>
                  {evidenceLinks.length === 0 ? (
                    <p className="u-muted">No links added yet.</p>
                  ) : (
                    <div className="task-card-evidence-list">
                      {evidenceLinks.map((item) => (
                        <article className="task-card-evidence-row" key={item.id}>
                          <div>
                            <strong>{item.filename}</strong>
                            <p className="u-muted">
                              {item.provenance} · {evidenceSizeLabel(item.sizeBytes)}
                            </p>
                          </div>
                          {item.url === null ? null : (
                            <a
                              className="btn btn-sm"
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          <section
            className="task-card-tabpanel"
            id="task-card-panel-quality"
            role="tabpanel"
            aria-labelledby="task-card-tab-quality"
            hidden={activeTab !== "quality"}
          >
            <div className="task-card-section-head">
              <div>
                <h2>Quality Review</h2>
                <p className="u-muted">{qualityProjection.itemLeftLabel}</p>
              </div>
              <button
                className="btn"
                type="button"
                disabled={!qualityProjection.canApprove || isQualityPending}
                onClick={handleApproveQualityReview}
              >
                {qualityReview?.status === "approved" ? "Approved" : "Approve"}
              </button>
            </div>

            {qualityProjection.hasChangesRequested ? (
              <div className="sb-alert sb-alert--warning task-card-action-alert" role="status">
                <span className="ico" aria-hidden="true">
                  !
                </span>
                <span className="sb-alert-title">Changes requested</span>
                <span className="sb-alert-desc">
                  One or more checks failed. Resolve them before approval.
                </span>
              </div>
            ) : null}

            {qualityMessage === null ? null : (
              <div className="sb-alert task-card-action-alert" role="status">
                <span className="ico" aria-hidden="true">
                  i
                </span>
                <span className="sb-alert-title">Quality review</span>
                <span className="sb-alert-desc">{qualityMessage}</span>
              </div>
            )}

            <form className="task-card-quality-form" onSubmit={handleAddQualityCheck}>
              <label className="u-sr-only" htmlFor="task-card-quality-label">
                Add quality check
              </label>
              <input
                className="input"
                id="task-card-quality-label"
                name="label"
                type="text"
                maxLength={240}
                placeholder="Add a human review check"
              />
              <button
                className="btn"
                type="submit"
                disabled={qualityReviewApproved || isQualityPending}
              >
                Add check
              </button>
            </form>

            {assistantPrechecks.length === 0 && (qualityReview?.checks.length ?? 0) === 0 ? (
              <div className="task-card-empty-inline">
                <p className="empty-title">No quality checks yet</p>
                <p className="empty-desc">
                  Assistant pre-checks appear from completed tool receipts, and human checks can be
                  added here.
                </p>
              </div>
            ) : (
              <div className="task-card-quality-list">
                {assistantPrechecks.map((check) => (
                  <article className="task-card-quality-row" key={check.id}>
                    <span
                      className={`task-card-quality-state task-card-quality-state-${check.state}`}
                    >
                      {check.state === "pass" ? "Pass" : "Fail"}
                    </span>
                    <div>
                      <strong>{check.label}</strong>
                      <p className="u-muted">{check.actor}</p>
                    </div>
                  </article>
                ))}
                {(qualityReview?.checks ?? []).map((check) => (
                  <article className="task-card-quality-row" key={check.id}>
                    <span
                      className={`task-card-quality-state task-card-quality-state-${check.state}`}
                    >
                      {check.state === "pass"
                        ? "Pass"
                        : check.state === "fail"
                          ? "Fail"
                          : "Pending"}
                    </span>
                    <div className="u-grow">
                      <strong>{check.label}</strong>
                      <p className="u-muted">
                        {check.kind === "ai_precheck" ? "AI pre-check" : check.actor}
                      </p>
                    </div>
                    <div className="u-row">
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={qualityReviewApproved || isQualityPending}
                        onClick={() => handleToggleQualityCheck(check.id, "pass")}
                      >
                        Pass
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        type="button"
                        disabled={qualityReviewApproved || isQualityPending}
                        onClick={() => handleToggleQualityCheck(check.id, "fail")}
                      >
                        Request changes
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="task-card-reviewers">
              <h3>Reviewers</h3>
              {qualityReview?.reviewers.length ? (
                qualityReview.reviewers.map((reviewer) => (
                  <span className="task-card-reviewer" key={reviewer.id}>
                    <span className="task-card-mini-avatar" aria-hidden="true">
                      {initials(reviewer.reviewerName ?? reviewer.reviewerUserId)}
                    </span>
                    {reviewer.reviewerName ?? reviewer.reviewerUserId} · {reviewer.state}
                  </span>
                ))
              ) : (
                <p className="u-muted">No reviewer decisions yet.</p>
              )}
            </div>
          </section>
        </div>
      </article>

      {editOpen ? (
        <EditTaskModal task={task} onClose={() => setEditOpen(false)} onSaved={handleSaved} />
      ) : null}
    </div>
  );
}
