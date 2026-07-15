"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";
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
  taskCardTabDomId,
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

const taskCardDetailPageStyles = `
    .bc { min-height: 100vh; font-size: var(--text-base); }
    .topbar { position: sticky; top: 0; z-index: var(--z-sticky); display: flex; align-items: center; gap: var(--space-5); height: 60px; padding: 0 var(--space-6); background: var(--surface); border-bottom: 1px solid var(--border); }
    .topnav { display: flex; align-items: center; gap: var(--space-1); }
    .topnav a { display: inline-flex; align-items: center; height: 36px; padding: 0 var(--space-3); border-radius: var(--radius-full); color: var(--fg-muted); text-decoration: none; font-weight: var(--fw-medium); }
    .topnav a:hover { background: var(--surface-2); color: var(--fg); }
    .bc-wrap { max-width: 1080px; margin: 0 auto; padding: var(--space-6) var(--space-6) var(--space-16); }
    .id-chip { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: var(--text-sm); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 3px 4px 3px 9px; }
    .id-copy { border: 0; background: none; color: var(--fg-subtle); font: inherit; font-size: var(--text-xs); cursor: pointer; padding: 2px 6px; border-radius: var(--radius-sm); }
    .id-copy:hover { background: var(--surface-3); color: var(--fg); }
    .meta-grid { display: flex; flex-wrap: wrap; gap: var(--space-6); padding: var(--space-4) 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin: var(--space-5) 0; }
    .meta b { display: block; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-caps); color: var(--fg-subtle); font-weight: var(--fw-semibold); margin-bottom: 6px; }
    .sec-h { font-size: var(--text-md); font-weight: var(--fw-semibold); margin: var(--space-6) 0 var(--space-3); }
    .step { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
    .step:last-child { border-bottom: 0; }
    .step.done .step-text { color: var(--fg-subtle); text-decoration: line-through; }
    .comment { display: flex; gap: var(--space-3); padding: var(--space-4) 0; border-top: 1px solid var(--border); }
    .comment.ai { padding-left: var(--space-3); border-left: 2px solid var(--accent-soft); }
    .bmeta { display: flex; align-items: center; gap: var(--space-2); margin-bottom: 4px; }
    .read { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; font-size: var(--text-xs); color: var(--fg-subtle); }
    .rdot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); }
    .read.unread .rdot { background: var(--border-strong); }
    .typing { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; }
    .dots { display: inline-flex; gap: 4px; align-items: flex-end; height: 14px; }
    .dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: typ 1.2s infinite ease-in-out; }
    .dots.human i { background: var(--info); }
    .dots i:nth-child(2) { animation-delay: .15s; } .dots i:nth-child(3) { animation-delay: .3s; }
    @keyframes typ { 0%,70%,100% { transform: translateY(0); opacity: .4; } 35% { transform: translateY(-5px); opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .dots i { animation: none; opacity: .7; } }
    /* evidence */
    .ev-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-3); }
    .ev-thumb { aspect-ratio: 16/10; border-radius: var(--radius-md); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 26px; color: #fff; position: relative; overflow: hidden; }
    .ev-cap { padding: 8px 2px 0; font-size: var(--text-xs); color: var(--fg-muted); }
    .ev-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
    .ftype { width: 36px; height: 36px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; background: var(--surface-2); color: var(--fg-muted); font-size: var(--text-xs); font-weight: 700; flex: none; }
    .tabpanel[hidden] { display: none; }
    .mention-pop { position:absolute; left:0; top:calc(100% - 2px); z-index:var(--z-dropdown); width:320px; max-width:calc(100vw - 32px); background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-md); box-shadow:var(--shadow-lg); padding:6px; }
    .mention-pop[hidden] { display:none; }
    .mention-hd { font-size:var(--text-xs); color:var(--fg-subtle); text-transform:uppercase; letter-spacing:var(--tracking-caps); font-weight:var(--fw-semibold); padding:6px 8px 4px; }
    .mention-item { display:flex; align-items:center; gap:8px; width:100%; padding:7px 8px; border:0; background:none; border-radius:var(--radius-sm); cursor:pointer; font:inherit; text-align:left; color:var(--fg); }
    .mention-item:hover, .mention-item.active { background:var(--surface-2); }
    .mention-nm { font-size:var(--text-sm); font-weight:var(--fw-medium); }
    .mention-sub { font-size:var(--text-xs); color:var(--fg-subtle); margin-left:auto; }
    .mention-at { width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:var(--surface-3); color:var(--fg-muted); font-size:var(--text-sm); flex:none; }
    #p-airun .run-steps { list-style: none; margin: 0; padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2); }
    #p-airun .run-step { display: flex; align-items: flex-start; gap: var(--space-3); font-size: var(--text-sm); color: var(--fg); line-height: var(--lh-normal); }
    #p-airun .run-step .rs-g { flex: none; width: 18px; text-align: center; color: var(--fg-muted); }
    #p-airun .run-step strong { font-weight: var(--fw-semibold); color: var(--fg); }
    .bc .sb-tabs { margin-bottom: 0; }
    .bc .textarea { min-height: 72px; }
    .bc .ev-row .field { flex: 1 1 160px; min-width: 0; }
`;

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

function TaskCardPageStyles() {
  return <style>{taskCardDetailPageStyles}</style>;
}

function cardBorderColor(task: TaskDto): string {
  if (task.status === "blocked") {
    return "var(--warning)";
  }

  if (task.status === "done") {
    return "var(--success)";
  }

  return "var(--chart-1)";
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

function isAiIdentity(input: { readonly userId: string | null; readonly name: string | null }) {
  const userId = input.userId ?? "";
  const name = input.name ?? "";

  return (
    userId.startsWith("assistant:") ||
    userId.startsWith("ai:") ||
    /^ai[:\s-]/i.test(name) ||
    /\bassistant\b/i.test(name) ||
    /\bopzava\b/i.test(name)
  );
}

function avatarClassName(input: { readonly ai: boolean; readonly small?: boolean }): string {
  return [
    "sb-avatar",
    input.small === false ? "" : "sb-avatar--sm",
    input.ai ? "sb-avatar--ai" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function avatarBackground(input: { readonly ai: boolean; readonly index?: number }): string {
  if (input.ai) {
    return "var(--chart-5)";
  }

  const colors = ["var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-6)"];
  return colors[(input.index ?? 0) % colors.length] ?? "var(--chart-2)";
}

function aiRunGlyph(state: "queued" | "working" | "succeeded" | "failed"): string {
  if (state === "failed") {
    return "!";
  }

  if (state === "working") {
    return "◷";
  }

  if (state === "queued") {
    return "○";
  }

  return "✓";
}

function evidenceFileType(item: TaskEvidenceDto): string {
  const contentType = item.contentType ?? "";
  const filename = item.filename;
  const extension = filename.includes(".") ? filename.split(".").pop() : null;

  if (contentType.includes("json")) {
    return "JSON";
  }

  if (contentType.includes("pdf")) {
    return "PDF";
  }

  if (contentType.startsWith("image/")) {
    return "IMG";
  }

  if (contentType.startsWith("video/")) {
    return "VID";
  }

  return (extension ?? "FILE").slice(0, 4).toUpperCase();
}

function evidenceThumbStyle(
  index: number,
  item: TaskEvidenceDto,
): { readonly background: string; readonly color?: string } {
  if (item.contentType?.startsWith("video/")) {
    return { background: "#11131c", color: "#cbd5e1" };
  }

  const gradients = [
    "linear-gradient(135deg,var(--chart-1),var(--chart-6))",
    "linear-gradient(135deg,var(--chart-2),var(--chart-4))",
    "linear-gradient(135deg,var(--chart-3),var(--chart-5))",
  ];

  return {
    background:
      gradients[index % gradients.length] ??
      "linear-gradient(135deg,var(--chart-1),var(--chart-6))",
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
  const ai = isAiIdentity({ userId: step.assigneeUserId, name });

  return (
    <span
      className={avatarClassName({ ai })}
      style={{ background: avatarBackground({ ai }), width: 22, height: 22 }}
      aria-label={`Assigned to ${name}`}
      title={name}
    >
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

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: TaskCardTab) => {
    const currentIndex = taskCardTabs.findIndex((candidate) => candidate.id === tab);
    const nextIndex =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (currentIndex + 1) % taskCardTabs.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (currentIndex - 1 + taskCardTabs.length) % taskCardTabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? taskCardTabs.length - 1
              : null;

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextTab = taskCardTabs[nextIndex];
    if (nextTab === undefined) {
      return;
    }

    setActiveTab(nextTab.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`tab-${taskCardTabDomId(nextTab.id)}`)?.focus();
    });
  };

  const visualEvidenceFiles = evidenceFiles.filter(
    (item) => item.contentType?.startsWith("image/") || item.contentType?.startsWith("video/"),
  );
  const qualityChecks = qualityReview?.checks ?? [];
  const assistantDisplayName = assignedIsAssistant ? assignedName : "Ask Admin Opzava";
  const assignedAvatarAi = assignedIsAssistant;
  const currentUserInitials = initials(currentUser.name);

  return (
    <div className="bc">
      <TaskCardPageStyles />
      <main>
        <div className="bc-wrap">
          <nav
            className="sb-breadcrumb"
            aria-label="Breadcrumb"
            style={{ marginBottom: "var(--space-5)" }}
          >
            <a href="/">Home</a>
            <span className="sep" aria-hidden="true">
              ›
            </span>
            <a href="/tasks">{workspaceName}</a>
            <span className="sep" aria-hidden="true">
              ›
            </span>
            <a href="/tasks">Board</a>
            <span className="sep" aria-hidden="true">
              ›
            </span>
            <span className="current">{cardId.cardId}</span>
          </nav>

          <article
            className="card"
            aria-labelledby="task-card-title"
            style={{ borderTop: `3px solid ${cardBorderColor(task)}` }}
          >
            <div className="card-body" style={{ padding: "var(--space-6)" }}>
              <div
                className="u-between"
                style={{ gap: "var(--space-3)", marginBottom: "var(--space-3)" }}
              >
                <div className="u-row u-wrap" style={{ gap: "var(--space-3)" }}>
                  <span className="id-chip">
                    <span className="u-subtle">#</span>
                    {cardId.cardId}
                    <button
                      className="id-copy"
                      type="button"
                      aria-label={`Copy ${cardId.cardId}`}
                      onClick={() => void copyText(cardId.cardId, "id")}
                    >
                      {copied === "id" ? "Copied" : "Copy"}
                    </button>
                  </span>

                  <div style={{ position: "relative" }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      id="idInfo"
                      type="button"
                      aria-expanded={idPopoverOpen}
                      aria-controls="idPop"
                      aria-label="About this ID"
                      onClick={() => setIdPopoverOpen((open) => !open)}
                    >
                      What's this ID?
                      <span aria-hidden="true">▾</span>
                    </button>
                    <div
                      className="sb-popover"
                      id="idPop"
                      style={{
                        display: idPopoverOpen ? "block" : "none",
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        width: 300,
                        zIndex: "var(--z-dropdown)",
                      }}
                    >
                      <strong style={{ fontSize: "var(--text-sm)" }}>Standardized global ID</strong>
                      <p
                        className="u-muted"
                        style={{
                          fontSize: "var(--text-sm)",
                          marginTop: 6,
                          lineHeight: "var(--lh-normal)",
                        }}
                      >
                        Every card has a stable <code>{cardId.prefix}-N</code> handle. Agents and
                        people refer to it the same way in chat, the API and the CLI, for example{" "}
                        <em>"work {cardId.cardId}"</em>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="u-row" style={{ gap: "var(--space-2)" }}>
                  <button
                    className="btn"
                    id="doneBtn"
                    type="button"
                    disabled={task.status === "done" || isMarkDonePending}
                    onClick={handleMarkDone}
                  >
                    <span aria-hidden="true">✓</span>
                    {task.status === "done"
                      ? "Done"
                      : isMarkDonePending
                        ? "Marking..."
                        : "Mark done"}
                  </button>

                  <div style={{ position: "relative" }}>
                    <button
                      className="btn-icon btn"
                      id="menuBtn"
                      type="button"
                      aria-label="Card actions"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((open) => !open)}
                    >
                      <span aria-hidden="true">⋯</span>
                    </button>
                    <div
                      className="sb-menu"
                      id="cardMenu"
                      style={{
                        display: menuOpen ? "block" : "none",
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        zIndex: "var(--z-dropdown)",
                      }}
                      role="menu"
                    >
                      <div className="sb-menu-label">Card</div>
                      <button
                        className="sb-menu-item"
                        type="button"
                        role="menuitem"
                        onClick={handleCopyLink}
                      >
                        <span aria-hidden="true">🔗</span>
                        {copied === "link" ? "Copied link" : "Copy link"}
                        <span className="sb-shortcut">⌘L</span>
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
                        Edit card
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <h1 style={{ fontSize: "var(--text-xl)" }} id="task-card-title">
                {task.title}
              </h1>

              <div
                className="u-row u-wrap"
                style={{ gap: "var(--space-2)", marginTop: "var(--space-3)" }}
                aria-label="Task card metadata"
              >
                <span className={statusBadgeClassName(task.status)}>
                  {statusLabel(task.status)}
                </span>
                {task.labels.length === 0 ? (
                  <span className="sb-badge sb-badge--outline">No labels</span>
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

              <div className="meta-grid">
                <div className="meta">
                  <b>Assigned to</b>
                  <span className="sb-hc">
                    <span className="u-row" tabIndex={0} style={{ cursor: "default" }}>
                      <span
                        className={avatarClassName({ ai: assignedAvatarAi })}
                        style={{ background: avatarBackground({ ai: assignedAvatarAi }) }}
                      >
                        {initials(assignedName)}
                      </span>
                      &nbsp;{assignedName}&nbsp;
                      {assignedIsAssistant ? (
                        <span className="sb-badge sb-badge--accent">✦ AI</span>
                      ) : null}
                    </span>
                    <span className="sb-hovercard sb-popover">
                      <span className="u-row" style={{ gap: "var(--space-3)" }}>
                        <span
                          className={avatarClassName({ ai: assignedAvatarAi, small: false })}
                          style={{ background: avatarBackground({ ai: assignedAvatarAi }) }}
                        >
                          {initials(assignedName)}
                        </span>
                        <span>
                          <strong>{assignedName}</strong>
                          <br />
                          <span className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
                            {assignedIsAssistant ? "AI assistant" : "Workspace member"} ·{" "}
                            {workspaceName}
                          </span>
                        </span>
                      </span>
                      <p
                        className="u-muted"
                        style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-3)" }}
                      >
                        {assignedIsAssistant
                          ? "Handles triage and drafts replies with auditable task activity."
                          : "Owns the next visible action on this card."}
                      </p>
                    </span>
                  </span>
                </div>

                <div className="meta">
                  <b>Added</b>
                  <span>{provenance}</span>
                </div>

                <div className="meta">
                  <b>Watching</b>
                  {watchers.visible.length === 0 ? (
                    <span className="u-subtle">No watchers</span>
                  ) : (
                    <span className="sb-avatar-group" aria-label={watchers.label}>
                      {watchers.visible.map((watcher, index) => {
                        const name = watcher.name ?? watcher.userId;
                        const ai = isAiIdentity({ userId: watcher.userId, name });

                        return (
                          <span
                            className={avatarClassName({ ai })}
                            key={watcher.userId}
                            style={{ background: avatarBackground({ ai, index }) }}
                            title={name}
                          >
                            {initials(name)}
                          </span>
                        );
                      })}
                      {watchers.overflowCount === 0 ? null : (
                        <span className="sb-avatar sb-avatar--sm">+{watchers.overflowCount}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {actionError === null ? null : (
                <div className="sb-alert sb-alert--destructive" role="alert">
                  <span className="ico" aria-hidden="true">
                    !
                  </span>
                  <span className="sb-alert-title">Card action failed</span>
                  <span className="sb-alert-desc">{actionError}</span>
                </div>
              )}

              <div className="sb-tabs" role="tablist" aria-label="Card sections">
                {taskCardTabs.map((tab) => {
                  const domId = taskCardTabDomId(tab.id);

                  return (
                    <button
                      className="sb-tab"
                      type="button"
                      role="tab"
                      key={tab.id}
                      data-panel={`p-${domId}`}
                      aria-selected={activeTab === tab.id}
                      aria-controls={`p-${domId}`}
                      id={`tab-${domId}`}
                      tabIndex={activeTab === tab.id ? 0 : -1}
                      onClick={() => setActiveTab(tab.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                    >
                      {tab.label}
                      {tab.id === "evidence" ? (
                        <span
                          className="sb-badge sb-badge--secondary"
                          style={{ height: 18, marginLeft: 4 }}
                        >
                          {evidence.length}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <section
                className="tabpanel"
                id="p-overview"
                role="tabpanel"
                aria-labelledby="tab-overview"
                tabIndex={0}
                hidden={activeTab !== "overview"}
                style={{ marginTop: "var(--space-5)" }}
              >
                <p style={{ lineHeight: "var(--lh-normal)" }}>
                  {task.description.trim() === "" ? "No description yet." : task.description}
                </p>

                <h2 className="sec-h">
                  Steps{" "}
                  <span
                    className="u-subtle"
                    style={{ fontSize: "var(--text-xs)", fontWeight: 400 }}
                  >
                    · {progress.label}
                  </span>
                </h2>

                {steps.length === 0 ? (
                  <div className="ev-row">
                    <p className="empty-title">No steps yet</p>
                    <p className="empty-desc">
                      Add steps through the MCP task tools or a later card edit slice.
                    </p>
                  </div>
                ) : (
                  <div>
                    {steps.map((step) => (
                      <div className={step.done ? "step done" : "step"} key={step.id}>
                        <input
                          className="sb-check"
                          type="checkbox"
                          checked={step.done}
                          disabled={isStepPending}
                          aria-label={step.text}
                          onChange={() => handleToggleStep(step)}
                        />
                        <span className="step-text u-grow">{step.text}</span>
                        <StepAssignee step={step} currentUser={currentUser} />
                      </div>
                    ))}
                  </div>
                )}

                <h2 className="sec-h">Comments</h2>

                <div role="log" aria-label="Task card comments">
                  {comments.length === 0 ? (
                    <div className="ev-row">
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
                      const authorIsCurrentUser = comment.authorUserId === currentUser.id;
                      const displayAuthorName = authorIsCurrentUser ? "You" : authorName;
                      const authorAi = comment.authorKind === "assistant";

                      return (
                        <article className={authorAi ? "comment ai" : "comment"} key={comment.id}>
                          <span
                            className={avatarClassName({ ai: authorAi, small: false })}
                            style={{ background: avatarBackground({ ai: authorAi }) }}
                            aria-hidden="true"
                          >
                            {initials(authorName)}
                          </span>
                          <div className="u-grow">
                            <div className="bmeta">
                              <strong>{displayAuthorName}</strong>
                              {authorAi ? (
                                <span className="sb-badge sb-badge--accent">✦ AI</span>
                              ) : authorIsCurrentUser ? (
                                <span className="sb-badge sb-badge--secondary">You</span>
                              ) : null}
                              <span className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
                                {commentRelativeTime(comment.createdAt)}
                              </span>
                            </div>
                            <p style={{ lineHeight: "var(--lh-normal)" }}>{comment.body}</p>
                            <span className={readState.unread ? "read unread" : "read"}>
                              <span className="u-row" style={{ gap: 3 }} aria-hidden="true">
                                <span className="rdot" />
                                <span className="rdot" />
                              </span>
                              {readState.label}
                            </span>
                          </div>
                        </article>
                      );
                    })
                  )}

                  {assistantActivityText === null ? null : (
                    <div className="typing" role="status" aria-live="polite">
                      <span
                        className="sb-avatar sb-avatar--ai"
                        style={{ background: "var(--chart-5)" }}
                        aria-hidden="true"
                      >
                        {initials(assistantDisplayName)}
                      </span>
                      <span className="u-muted">
                        <strong>{assistantDisplayName}</strong>{" "}
                        <span className="sb-badge sb-badge--accent">✦ AI</span>{" "}
                        {assistantActivityText}
                      </span>
                      <span className="dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  )}

                  <div
                    className="typing"
                    id="you"
                    role="status"
                    style={{ display: commentBody.trim() === "" ? "none" : "flex", padding: 0 }}
                  >
                    <span className="u-subtle">You're typing</span>
                    <span className="dots human" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </div>

                <form
                  className="u-row"
                  style={{
                    gap: "var(--space-3)",
                    alignItems: "flex-start",
                    marginTop: "var(--space-4)",
                  }}
                  onSubmit={handlePostComment}
                >
                  <span
                    className="sb-avatar"
                    style={{ background: "var(--chart-2)" }}
                    aria-hidden="true"
                  >
                    {currentUserInitials}
                  </span>
                  <div className="u-grow u-col-2">
                    <label className="u-sr-only" htmlFor="c">
                      Add a comment
                    </label>
                    <div style={{ position: "relative" }}>
                      <textarea
                        className="textarea"
                        id="c"
                        rows={2}
                        placeholder={`Write a comment… type @ to mention · ${assistantDisplayName} sees it in realtime`}
                        value={commentBody}
                        onChange={(event) => {
                          setCommentBody(event.currentTarget.value);
                          setMentionPopoverOpen(
                            shouldShowMentionPopover(event.currentTarget.value),
                          );
                        }}
                        onFocus={() => setMentionPopoverOpen(shouldShowMentionPopover(commentBody))}
                      />
                      <div
                        className="mention-pop"
                        id="mentionPop"
                        role="listbox"
                        aria-label="Mention someone"
                        hidden={!mentionPopoverOpen}
                      >
                        <div className="mention-hd">Mention</div>
                        {targets.map((target, index) => (
                          <button
                            className={index === 0 ? "mention-item active" : "mention-item"}
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
                                  ? "sb-avatar sb-avatar--ai sb-avatar--sm"
                                  : "sb-avatar sb-avatar--sm"
                              }
                              style={{
                                background: avatarBackground({
                                  ai: target.kind === "assistant",
                                  index,
                                }),
                              }}
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
                    </div>
                    <div>
                      <button className="btn" type="submit" disabled={isCommentPending}>
                        {isCommentPending ? "Posting..." : "Post comment"}
                      </button>
                    </div>
                  </div>
                </form>
              </section>

              <section
                className="tabpanel"
                id="p-airun"
                role="tabpanel"
                aria-labelledby="tab-airun"
                tabIndex={0}
                hidden={activeTab !== "ai-run"}
                style={{ marginTop: "var(--space-5)" }}
              >
                {aiProjection.steps.length === 0 ? (
                  <div className="ev-row">
                    <p className="empty-title">{deferredPanelCopy().title}</p>
                    <p className="empty-desc">{deferredPanelCopy().description}</p>
                  </div>
                ) : (
                  <>
                    <div className="u-between" style={{ marginBottom: "var(--space-3)" }}>
                      <p className="u-muted" style={{ fontSize: "var(--text-sm)" }}>
                        How <strong>{assistantDisplayName}</strong> worked this card, step by step,
                        so you and other agents can audit what it did.
                      </p>
                      {aiProjection.elapsedLabel === null ? null : (
                        <span
                          className="u-row u-subtle"
                          style={{ fontSize: "var(--text-xs)", gap: 6 }}
                        >
                          <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
                          live · {aiProjection.elapsedLabel}
                        </span>
                      )}
                    </div>
                    <ol
                      className="run-steps"
                      role="list"
                      aria-label={`How ${assistantDisplayName} worked this card, step by step`}
                    >
                      {aiProjection.steps.map((step) => (
                        <li className="run-step" data-step={step.state} key={step.id}>
                          <span className="rs-g" aria-hidden="true">
                            {aiRunGlyph(step.state)}
                          </span>
                          <span>{step.text}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </section>

              <section
                className="tabpanel"
                id="p-evidence"
                role="tabpanel"
                aria-labelledby="tab-evidence"
                tabIndex={0}
                hidden={activeTab !== "evidence"}
                style={{ marginTop: "var(--space-5)" }}
              >
                {evidenceMessage === null ? null : (
                  <div
                    className="sb-alert"
                    role="status"
                    style={{ marginBottom: "var(--space-4)" }}
                  >
                    <span className="ico" aria-hidden="true">
                      i
                    </span>
                    <span className="sb-alert-title">Evidence</span>
                    <span className="sb-alert-desc">{evidenceMessage}</span>
                  </div>
                )}

                <h2 className="sec-h" style={{ marginTop: 0 }}>
                  Add evidence
                </h2>
                <div className="u-col-2">
                  <form className="ev-row u-wrap" onSubmit={handleEvidenceUpload}>
                    <div className="field">
                      <label className="label" htmlFor="task-card-evidence-file">
                        Upload file
                      </label>
                      <input
                        className="input"
                        id="task-card-evidence-file"
                        name="file"
                        type="file"
                      />
                    </div>
                    <button className="btn" type="submit" disabled={isEvidencePending}>
                      {isEvidencePending ? "Working..." : "Upload"}
                    </button>
                  </form>

                  <form className="ev-row u-wrap" onSubmit={handleEvidenceLink}>
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

                <h2 className="sec-h">Screenshots &amp; video</h2>
                {visualEvidenceFiles.length === 0 ? (
                  <div className="ev-row">
                    <span className="ftype">0</span>
                    <div>
                      <strong style={{ fontSize: "var(--text-sm)" }}>
                        No screenshots or video yet
                      </strong>
                      <div className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
                        {evidenceCountLabel(evidence)} attached to this card.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="ev-grid">
                    {visualEvidenceFiles.map((item, index) => (
                      <div key={item.id}>
                        <div className="ev-thumb" style={evidenceThumbStyle(index, item)}>
                          <span aria-hidden="true">
                            {item.contentType?.startsWith("video/") ? "▶" : "🖼"}
                          </span>
                        </div>
                        <div className="ev-cap">
                          {item.filename} · {evidenceSizeLabel(item.sizeBytes)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <h2 className="sec-h">Files</h2>
                <div className="u-col-2">
                  {evidenceFiles.length === 0 ? (
                    <div className="ev-row">
                      <span className="ftype">--</span>
                      <div className="u-grow">
                        <strong style={{ fontSize: "var(--text-sm)" }}>
                          No files uploaded yet
                        </strong>
                        <div className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
                          Uploads appear here after storage accepts them.
                        </div>
                      </div>
                    </div>
                  ) : (
                    evidenceFiles.map((item) => (
                      <div className="ev-row" key={item.id}>
                        <span className="ftype">{evidenceFileType(item)}</span>
                        <div className="u-grow">
                          <strong style={{ fontSize: "var(--text-sm)" }}>{item.filename}</strong>
                          <div className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
                            {item.provenance} · {evidenceSizeLabel(item.sizeBytes)}
                          </div>
                        </div>
                        <button
                          className="btn btn-sm btn-ghost"
                          type="button"
                          disabled={isEvidencePending}
                          onClick={() => handleEvidenceDownload(item)}
                        >
                          Open
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <h2 className="sec-h">Links</h2>
                <div className="u-col-2">
                  {evidenceLinks.length === 0 && linkedIssue === null ? (
                    <div className="ev-row">
                      <span className="ftype">🔗</span>
                      <div className="u-grow">
                        <strong style={{ fontSize: "var(--text-sm)" }}>No links added yet</strong>
                        <div className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
                          Source URLs and linked issues appear here.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {evidenceLinks.map((item) =>
                        item.url === null ? null : (
                          <a
                            className="ev-row"
                            href={item.url}
                            style={{ textDecoration: "none", color: "inherit" }}
                            target="_blank"
                            rel="noreferrer"
                            key={item.id}
                          >
                            <span className="ftype">🔗</span>
                            <div className="u-grow">
                              <strong style={{ fontSize: "var(--text-sm)" }}>
                                {item.filename}
                              </strong>
                              <div className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
                                {item.provenance}
                              </div>
                            </div>
                            <span className="u-subtle" aria-hidden="true">
                              ↗
                            </span>
                          </a>
                        ),
                      )}
                      {linkedIssue === null ? null : (
                        <a
                          className="ev-row"
                          href={linkedIssue.href}
                          style={{ textDecoration: "none", color: "inherit" }}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="ftype">🔗</span>
                          <div className="u-grow">
                            <strong style={{ fontSize: "var(--text-sm)" }}>
                              Related issue {linkedIssue.label}
                            </strong>
                            <div className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
                              GitHub issue from task provenance
                            </div>
                          </div>
                          <span className="u-subtle" aria-hidden="true">
                            ↗
                          </span>
                        </a>
                      )}
                    </>
                  )}
                </div>
              </section>

              <section
                className="tabpanel"
                id="p-quality"
                role="tabpanel"
                aria-labelledby="tab-quality"
                tabIndex={0}
                hidden={activeTab !== "quality"}
                style={{ marginTop: "var(--space-5)" }}
              >
                {qualityProjection.hasChangesRequested ? (
                  <div className="sb-alert sb-alert--warning" role="status">
                    <span className="ico" aria-hidden="true">
                      ⚠
                    </span>
                    <span className="sb-alert-title">Changes requested</span>
                    <span className="sb-alert-desc">
                      The AI pre-checks and human review still have{" "}
                      {qualityProjection.itemLeftLabel}.
                    </span>
                  </div>
                ) : null}

                {qualityMessage === null ? null : (
                  <div className="sb-alert" role="status" style={{ marginTop: "var(--space-4)" }}>
                    <span className="ico" aria-hidden="true">
                      i
                    </span>
                    <span className="sb-alert-title">Quality review</span>
                    <span className="sb-alert-desc">{qualityMessage}</span>
                  </div>
                )}

                <h2 className="sec-h">Checks</h2>
                <div className="u-col-2">
                  {assistantPrechecks.length === 0 && qualityChecks.length === 0 ? (
                    <div className="ev-row">
                      <span className="ftype">QA</span>
                      <div className="u-grow">
                        <strong style={{ fontSize: "var(--text-sm)" }}>
                          No quality checks yet
                        </strong>
                        <div className="u-subtle" style={{ fontSize: "var(--text-xs)" }}>
                          Assistant pre-checks appear from completed tool receipts, and human checks
                          can be added here.
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {assistantPrechecks.map((check) => (
                    <div className="ev-row" key={check.id}>
                      <input
                        className="sb-check"
                        type="checkbox"
                        checked={check.state === "pass"}
                        disabled
                        aria-label={check.label}
                        readOnly
                      />
                      <span className="u-grow">{check.label}</span>
                      <span className="sb-badge sb-badge--accent">✦ AI pre-check</span>
                    </div>
                  ))}

                  {qualityChecks.map((check) => (
                    <div className="ev-row" key={check.id}>
                      <input
                        className="sb-check"
                        type="checkbox"
                        checked={check.state === "pass"}
                        disabled={qualityReviewApproved || isQualityPending}
                        aria-label={check.label}
                        onChange={(event) =>
                          handleToggleQualityCheck(
                            check.id,
                            event.currentTarget.checked ? "pass" : "fail",
                          )
                        }
                      />
                      <span className="u-grow">{check.label}</span>
                      <span className="sb-badge sb-badge--secondary">
                        {check.kind === "ai_precheck" ? "✦ AI pre-check" : check.actor}
                      </span>
                    </div>
                  ))}
                </div>

                <form
                  className="ev-row u-wrap"
                  style={{ marginTop: "var(--space-3)" }}
                  onSubmit={handleAddQualityCheck}
                >
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
                    style={{ flex: "1 1 240px" }}
                  />
                  <button
                    className="btn"
                    type="submit"
                    disabled={qualityReviewApproved || isQualityPending}
                  >
                    Add check
                  </button>
                </form>

                <h2 className="sec-h">Reviewers</h2>
                <div className="u-row" style={{ gap: "var(--space-5)", flexWrap: "wrap" }}>
                  {assistantPrechecks.length === 0 ? null : (
                    <span className="u-row" style={{ gap: "var(--space-2)" }}>
                      <span
                        className="sb-avatar sb-avatar--sm sb-avatar--ai"
                        style={{ background: "var(--chart-5)" }}
                      >
                        {initials(assistantDisplayName)}
                      </span>
                      {assistantDisplayName}
                      <span className="sb-badge sb-badge--success">Pre-check recorded</span>
                    </span>
                  )}
                  {qualityReview?.reviewers.length ? (
                    qualityReview.reviewers.map((reviewer) => (
                      <span className="u-row" style={{ gap: "var(--space-2)" }} key={reviewer.id}>
                        <span
                          className="sb-avatar sb-avatar--sm"
                          style={{ background: "var(--chart-2)" }}
                        >
                          {initials(reviewer.reviewerName ?? reviewer.reviewerUserId)}
                        </span>
                        {reviewer.reviewerName ?? reviewer.reviewerUserId}
                        <span
                          className={
                            reviewer.state === "approved"
                              ? "sb-badge sb-badge--success"
                              : reviewer.state === "changes_requested"
                                ? "sb-badge sb-badge--warning"
                                : "sb-badge sb-badge--secondary"
                          }
                        >
                          {reviewer.state}
                        </span>
                      </span>
                    ))
                  ) : (
                    <span className="u-row" style={{ gap: "var(--space-2)" }}>
                      <span
                        className="sb-avatar sb-avatar--sm"
                        style={{ background: "var(--chart-2)" }}
                      >
                        {currentUserInitials}
                      </span>
                      You
                      <span
                        className={
                          qualityProjection.hasChangesRequested
                            ? "sb-badge sb-badge--warning"
                            : qualityReview?.status === "approved"
                              ? "sb-badge sb-badge--success"
                              : "sb-badge sb-badge--secondary"
                        }
                      >
                        {qualityProjection.hasChangesRequested
                          ? "Changes requested"
                          : qualityReview?.status === "approved"
                            ? "Approved"
                            : "Review open"}
                      </span>
                    </span>
                  )}
                </div>
                <div style={{ marginTop: "var(--space-5)" }}>
                  {/* DESCOPE(customer-send): governed sends arrive with the deferred user-side CRM/support surface; keep this local approval copy until a real send command exists. */}
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!qualityProjection.canApprove || isQualityPending}
                    onClick={handleApproveQualityReview}
                  >
                    {qualityReview?.status === "approved"
                      ? "Approved"
                      : isQualityPending
                        ? "Approving..."
                        : "Approve review"}
                  </button>
                </div>
              </section>
            </div>
          </article>
        </div>
      </main>

      {editOpen ? (
        <EditTaskModal task={task} onClose={() => setEditOpen(false)} onSaved={handleSaved} />
      ) : null}
    </div>
  );
}
