"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import type { AskAdminTurnView } from "@/lib/ask-admin-history";
import {
  applyAskAdminStreamEvent,
  emptyAskAdminDraft,
  interruptedAskAdminStreamEvent,
  isAskAdminTerminalStreamEvent,
  parseAskAdminSseBuffer,
  type AskAdminClientStreamEvent,
  type AskAdminDraft,
} from "@/lib/ask-admin-stream";
import {
  askOpzavaDraftTitle,
  askOpzavaPromptActions,
  askOpzavaStatusView,
  shouldShowAskOpzavaDraft,
  visibleAskOpzavaTurns,
} from "@/lib/ask-opzava-page-state";

export interface AskOpzavaChatProps {
  readonly conversationId: string;
  readonly initialTurns: readonly AskAdminTurnView[];
  readonly currentUserName: string;
  readonly organizationName: string;
  readonly workspaceName: string;
}

type ChatRole = AskAdminTurnView["role"] | "draft";

interface StreamToolReceipt {
  readonly id: string;
  readonly turnId: string;
  readonly toolName: string;
  readonly status: "running" | "succeeded" | "failed";
  readonly createdAt: string;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly outputText?: string;
  readonly code?: string;
  readonly message?: string;
}

const assistantStackStyle: CSSProperties = { maxWidth: "80%" };
const assistantAvatarStyle: CSSProperties = { background: "var(--chart-6)", flex: "none" };
const userAvatarStyle: CSSProperties = { background: "var(--chart-2)", flex: "none" };

const askOpzavaPageStyles = `
    /* Page-specific LAYOUT only — no color, font-size, radius, or shadow overrides */

    .nav-section-gap { margin-top: var(--space-2); }
    .header-avatar {
      width: 32px; height: 32px;
      border-radius: var(--radius-full);
      background: var(--surface-3);
      border: 1px solid var(--border-strong);
      display: flex; align-items: center; justify-content: center;
      font-size: var(--text-xs); color: var(--fg-muted);
      font-weight: var(--fw-semibold); flex: none; cursor: pointer;
    }

    /* ── Chat canvas ── */
    .chat-canvas {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 56px); /* subtract header (tools bar is essential-only) */
      overflow: hidden;
    }
    .chat-log {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6) var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }
    .chat-log-inner {
      max-width: 860px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    /* ── Chat rows ── */
    .chat-row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      min-width: 0;
    }
    .chat-row--user {
      flex-direction: row-reverse;
    }
    .chat-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      max-width: 72%;
      min-width: 0;
    }
    .chat-row--user .chat-stack {
      align-items: flex-end;
    }
    .chat-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-xs);
      color: var(--fg-subtle);
    }
    .chat-meta strong {
      color: var(--fg-muted);
      font-weight: var(--fw-semibold);
    }
    .chat-row--user .chat-meta {
      flex-direction: row-reverse;
    }
    .chat-time {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--fg-subtle);
    }
    .chat-bubble {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: var(--space-3) var(--space-4);
      font-size: var(--text-sm);
      line-height: var(--lh-normal);
      color: var(--fg);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .chat-bubble--user {
      background: var(--accent-soft);
      border-color: var(--accent-soft);
      color: var(--fg);
    }

    /* ── Tool card ── */
    .chat-tool-card {
      background: var(--surface-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      font-size: var(--text-sm);
    }
    .chat-tool-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      cursor: pointer;
      user-select: none;
    }
    .chat-tool-head:hover { background: var(--surface-2); }
    .chat-tool-head .tname { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-muted); }
    .chat-tool-body {
      border-top: 1px solid var(--border);
      padding: var(--space-3);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--fg-muted);
      line-height: 1.6;
      display: none;
    }
    .chat-tool-body.is-open { display: block; }

    /* ── Status pill ── */
    .chat-status-pill {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: 4px var(--space-3);
      border-radius: var(--radius-full);
      background: var(--surface-3);
      border: 1px solid var(--border);
      font-size: var(--text-xs);
      color: var(--fg-subtle);
      width: fit-content;
    }

    /* ── Digest card inside bubble ── */
    .digest-card {
      background: var(--surface-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      margin-top: var(--space-3);
      max-width: 100%;
    }
    .digest-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--border);
      font-size: var(--text-sm);
    }
    .digest-row:last-of-type { border-bottom: 0; }
    .digest-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-size: var(--text-xs);
      font-weight: var(--fw-semibold);
      white-space: nowrap;
      flex: none;
      min-width: 96px;
      justify-content: center;
    }
    .digest-pill--ok   { background: var(--success-soft); color: var(--success); }
    .digest-pill--warn { background: var(--warning-soft); color: var(--warning); }
    .digest-pill--err  { background: var(--danger-soft);  color: var(--danger);  }
    .digest-summary { flex: 1; min-width: 0; color: var(--fg-muted); font-size: var(--text-sm); }
    .digest-actions { display: flex; gap: var(--space-2); flex: none; }

    /* ── Inline action bubble ── */
    .action-bubble {
      background: var(--surface-2);
      border: 1px solid var(--border-strong);
      border-left: 3px solid var(--accent);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      font-size: var(--text-sm);
      line-height: var(--lh-normal);
    }
    .action-bubble-title {
      font-weight: var(--fw-semibold);
      color: var(--fg);
    }
    .action-row { display: flex; gap: var(--space-2); align-items: center; }

    /* ── Composer ── */
    .composer-wrap {
      border-top: 1px solid var(--border);
      padding: var(--space-4);
      background: var(--surface);
    }
    .composer {
      max-width: 860px;
      margin: 0 auto;
      display: flex;
      align-items: flex-end;
      gap: var(--space-3);
      background: var(--surface-2);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-lg);
      padding: var(--space-2) var(--space-3);
    }
    .composer textarea {
      flex: 1;
      background: transparent;
      border: 0;
      outline: none;
      resize: none;
      color: var(--fg);
      font-size: var(--text-sm);
      font-family: var(--font-sans);
      line-height: var(--lh-normal);
      padding: var(--space-2) 0;
      min-height: 40px;
      max-height: 160px;
    }
    .composer textarea::placeholder { color: var(--fg-subtle); }
    .composer-hint { font-size: var(--text-xs); color: var(--fg-subtle); white-space: nowrap; padding-bottom: var(--space-2); }
    .composer-send {
      flex: none;
      width: 34px; height: 34px;
      border-radius: var(--radius-md);
      background: var(--accent);
      color: var(--accent-fg);
      border: 0;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
    }
    .composer-send:hover { opacity: .88; }

    /* ── Example chips (cold-start) ── */
    .example-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: center;
      margin-top: var(--space-4);
    }
    .example-chip {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-full);
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--fg-muted);
      font-size: var(--text-sm);
      cursor: pointer;
    }
    .example-chip:hover { background: var(--surface-3); color: var(--fg); border-color: var(--border-strong); }

    .ops-state-panel {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .ops-state-panel summary {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      cursor: pointer;
      color: var(--fg-muted);
      font-size: var(--text-sm);
      font-weight: var(--fw-medium);
      list-style: none;
    }
    .ops-state-panel summary::-webkit-details-marker { display: none; }
    .ops-state-panel summary:hover { background: var(--surface-3); color: var(--fg); }
    .ops-state-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3);
      padding: 0 var(--space-4) var(--space-4);
    }
    .ops-state-card {
      padding: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
    }
    .ops-state-card strong {
      display: block;
      margin-bottom: 4px;
      font-size: var(--text-sm);
    }
    .ops-state-card p {
      margin: 0;
      color: var(--fg-muted);
      font-size: var(--text-xs);
      line-height: var(--lh-snug);
    }

    .chat-title-strip {
      border-bottom: 1px solid var(--border);
      padding: var(--space-3) var(--space-6);
    }
    .chat-title-inner {
      max-width: 860px;
      margin: 0 auto;
    }
    .chat-title-row {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-width: 0;
    }
    .chat-title-name {
      font-size: var(--text-md);
      font-weight: var(--fw-semibold);
      color: var(--fg);
      white-space: nowrap;
    }
    .chat-title-sub {
      color: var(--fg-subtle);
      font-size: var(--text-xs);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── Mobile collapse ── */
    @media (max-width: 640px) {
      /* Rail collapses to hidden; a mobile nav/hamburger would replace it.
         Chat log goes full-width; chat-stack max-width relaxes.
         Composer pinned at bottom of viewport. */
      .app {
        grid-template-columns: 1fr;
        height: auto;
        min-height: 100vh;
      }
      .rail { display: none; }
      .main-col,
      .main {
        width: 100%;
        min-width: 0;
      }
      .header {
        gap: var(--space-2);
        min-width: 0;
      }
      .header .sb-breadcrumb,
      .header > .u-row,
      .header .health-pill {
        display: none;
      }
      .chat-title-strip {
        padding: var(--space-3) var(--space-4);
      }
      .chat-title-row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2px;
      }
      .chat-title-name {
        white-space: normal;
      }
      .chat-title-row > .u-subtle[aria-hidden="true"] {
        display: none;
      }
      .chat-title-sub {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        line-height: var(--lh-snug);
      }
      .chat-canvas,
      .main[style] {
        height: calc(100vh - 56px);
        min-height: 0;
        overflow: hidden;
      }
      .chat-stack { max-width: 90%; }
      .digest-actions { display: none; } /* actions overflow to a tap-through link */
      .digest-row {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-2);
        align-items: start;
      }
      .digest-pill {
        min-width: 0;
        width: fit-content;
      }
      .digest-summary span {
        display: block;
        margin-left: 0 !important;
        margin-top: 2px;
      }
      .composer-hint { display: none; }
      .chat-log { padding: var(--space-4); }
      .chat-log {
        min-height: 0;
        padding-bottom: 104px;
      }
      .chat-stack,
      .chat-stack[style] { max-width: 100% !important; }
      .ops-state-grid { grid-template-columns: 1fr; }
      .composer-wrap {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 40px;
        z-index: var(--z-sticky);
        padding: var(--space-3) var(--space-4);
      }
    }
`;

function AskOpzavaPageStyles() {
  return <style>{askOpzavaPageStyles}</style>;
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initials(name: string): string {
  const value = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return value === "" ? "U" : value;
}

function turnLabel(turn: AskAdminTurnView, currentUserName: string): string {
  if (turn.role === "user") {
    return currentUserName;
  }

  if (turn.role === "assistant") {
    return "Opzava";
  }

  if (turn.role === "tool") {
    return "Opzava tool";
  }

  return "System";
}

function turnTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function messageText(turn: AskAdminTurnView): string {
  if (turn.text.trim() !== "") {
    return turn.text;
  }

  return turn.errorMessage ?? "";
}

function draftText(draft: AskAdminDraft): string {
  if (draft.text.trim() !== "") {
    return draft.text;
  }

  if (draft.errorMessage !== null) {
    return draft.errorMessage;
  }

  return askOpzavaStatusView(draft.status).detail;
}

function safeDomId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function toolBodyText(receipt: StreamToolReceipt): string {
  if (receipt.outputText !== undefined) {
    return receipt.outputText;
  }

  if (receipt.status === "running") {
    return `${receipt.toolName} is running through the governed Runtime-Control tool executor.`;
  }

  if (receipt.status === "failed") {
    return `${receipt.code ?? "runtimeControl.toolFailed"}: ${
      receipt.message ?? "The tool call failed."
    }`;
  }

  return JSON.stringify(receipt.output ?? {}, null, 2);
}

function toolBadge(receipt: StreamToolReceipt): {
  readonly className: string;
  readonly label: string;
} {
  if (receipt.status === "failed") {
    return { className: "sb-badge sb-badge--destructive", label: "failed" };
  }

  if (receipt.status === "running") {
    return { className: "sb-badge sb-badge--accent", label: "running" };
  }

  return { className: "sb-badge sb-badge--success", label: "done" };
}

function upsertToolReceipt(
  receipts: readonly StreamToolReceipt[],
  event: Extract<
    AskAdminClientStreamEvent,
    { readonly type: "tool.started" | "tool.succeeded" | "tool.failed" }
  >,
): readonly StreamToolReceipt[] {
  const now = new Date().toISOString();
  const current = receipts.find((receipt) => receipt.id === event.toolCallId);
  const next: StreamToolReceipt = {
    id: event.toolCallId,
    turnId: event.turnId,
    toolName: event.toolName,
    status:
      event.type === "tool.failed"
        ? "failed"
        : event.type === "tool.succeeded"
          ? "succeeded"
          : "running",
    createdAt: current?.createdAt ?? now,
    ...(event.type === "tool.succeeded" ? { output: event.output } : {}),
    ...(event.type === "tool.failed" ? { code: event.code, message: event.message } : {}),
  };

  if (current === undefined) {
    return [...receipts, next];
  }

  return receipts.map((receipt) => (receipt.id === event.toolCallId ? next : receipt));
}

function AskOpzavaAvatar({ role, name }: { readonly role: ChatRole; readonly name: string }) {
  if (role === "assistant" || role === "tool" || role === "draft") {
    return (
      <span className="sb-avatar sb-avatar--ai" style={assistantAvatarStyle} aria-label="Opzava AI">
        O
      </span>
    );
  }

  return (
    <span className="sb-avatar" style={userAvatarStyle} aria-label={name}>
      {initials(name)}
    </span>
  );
}

function ChatToolCard({ receipt }: { readonly receipt: StreamToolReceipt }) {
  const [open, setOpen] = useState(false);
  const badge = toolBadge(receipt);
  const bodyId = `toolBody-${safeDomId(receipt.id)}`;
  const headId = `toolHead-${safeDomId(receipt.id)}`;

  const toggleTool = () => {
    setOpen((value) => !value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleTool();
    }
  };

  return (
    <div className="chat-tool-card" role="group" aria-label={`Tool call: ${receipt.toolName}`}>
      <div
        className="chat-tool-head"
        id={headId}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggleTool}
        onKeyDown={handleKeyDown}
      >
        <span aria-hidden="true" style={{ color: "var(--fg-subtle)" }}>
          ⚙
        </span>
        <span className="tname">{receipt.toolName}</span>
        <span className={badge.className} style={{ marginLeft: "auto" }}>
          {receipt.status === "succeeded" ? "✓ " : ""}
          {badge.label}
        </span>
        <span
          aria-hidden="true"
          style={{
            color: "var(--fg-subtle)",
            fontSize: "var(--text-xs)",
            marginLeft: "var(--space-2)",
          }}
        >
          {open ? "▾" : "▸"}
        </span>
      </div>
      <div
        className={open ? "chat-tool-body is-open" : "chat-tool-body"}
        id={bodyId}
        role="region"
        aria-label={`${receipt.toolName} output`}
      >
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{toolBodyText(receipt)}</pre>
      </div>
    </div>
  );
}

function persistedToolReceipt(turn: AskAdminTurnView): StreamToolReceipt {
  return {
    id: turn.id,
    turnId: turn.id,
    toolName: "tool.outcome",
    status: turn.status === "failed" ? "failed" : "succeeded",
    createdAt: turn.createdAt,
    outputText: messageText(turn),
    ...(turn.errorCode === null ? {} : { code: turn.errorCode }),
    ...(turn.errorMessage === null ? {} : { message: turn.errorMessage }),
  };
}

function AskOpzavaTurn({
  turn,
  currentUserName,
}: {
  readonly turn: AskAdminTurnView;
  readonly currentUserName: string;
}) {
  const label = turnLabel(turn, currentUserName);
  const text = messageText(turn);
  const isUser = turn.role === "user";

  if (turn.role === "tool") {
    return (
      <article className="chat-row" aria-label="Opzava tool result">
        <AskOpzavaAvatar role={turn.role} name={label} />
        <div className="chat-stack" style={assistantStackStyle}>
          <div className="chat-meta">
            <strong>{label}</strong>
            <span className="sb-badge sb-badge--secondary">tool</span>
            <span className="chat-time">{turnTime(turn.createdAt)}</span>
          </div>
          <ChatToolCard receipt={persistedToolReceipt(turn)} />
        </div>
      </article>
    );
  }

  return (
    <article className={isUser ? "chat-row chat-row--user" : "chat-row"}>
      <AskOpzavaAvatar role={turn.role} name={label} />
      <div className="chat-stack" style={isUser ? undefined : assistantStackStyle}>
        <div className="chat-meta">
          <strong>{isUser ? "You" : label}</strong>
          {turn.role === "assistant" ? (
            <span className="sb-badge sb-badge--accent">✦ AI</span>
          ) : null}
          {turn.status === "failed" ? (
            <span className="sb-badge sb-badge--destructive">Failed</span>
          ) : null}
          <span className="chat-time">{turnTime(turn.createdAt)}</span>
        </div>
        <div className={isUser ? "chat-bubble chat-bubble--user" : "chat-bubble"}>{text}</div>
      </div>
    </article>
  );
}

function AskOpzavaToolReceiptRow({ receipt }: { readonly receipt: StreamToolReceipt }) {
  return (
    <article className="chat-row" aria-label={`Opzava tool receipt: ${receipt.toolName}`}>
      <AskOpzavaAvatar role="tool" name="Opzava tool" />
      <div className="chat-stack" style={assistantStackStyle}>
        <div className="chat-meta">
          <strong>Opzava</strong>
          <span className="sb-badge sb-badge--secondary">tool</span>
          <span className="chat-time">{turnTime(receipt.createdAt)}</span>
        </div>
        {/* DESCOPE(standup.report-sample): the mockup's canned trace is replaced by live Runtime-Control tool receipts; a named admin digest tool arrives with the P2 admin-attention projection. */}
        <ChatToolCard receipt={receipt} />
      </div>
    </article>
  );
}

function AskOpzavaDraftMessage({ draft }: { readonly draft: AskAdminDraft }) {
  const status = askOpzavaStatusView(draft.status);

  return (
    <article className="chat-row">
      <AskOpzavaAvatar role="draft" name="Opzava" />
      <div className="chat-stack" style={assistantStackStyle}>
        <div className="chat-meta">
          <strong>{askOpzavaDraftTitle(draft)}</strong>
          <span className={status.badgeClassName}>{status.label}</span>
        </div>
        <div className="chat-bubble">
          <p style={{ margin: 0 }}>{draftText(draft)}</p>
        </div>
        {draft.activeToolName === null ? null : (
          <div className="chat-status-pill" role="status">
            <span aria-hidden="true">◔</span>
            running {draft.activeToolName}
          </div>
        )}
        {status.isBusy ? (
          <div className="chat-status-pill" role="status">
            <span aria-hidden="true">◔</span>
            coordinating downstream agents…
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AskOpzavaColdStart({
  workspaceName,
  sending,
  onChoosePrompt,
  onSendPrompt,
}: {
  readonly workspaceName: string;
  readonly sending: boolean;
  readonly onChoosePrompt: (prompt: string) => void;
  readonly onSendPrompt: (prompt: string) => void;
}) {
  return (
    <article className="chat-row">
      <AskOpzavaAvatar role="assistant" name="Opzava" />
      <div className="chat-stack" style={assistantStackStyle}>
        <div className="chat-meta">
          <strong>Opzava</strong>
          <span className="sb-badge sb-badge--accent">✦ AI</span>
          <span className="chat-time">Ready</span>
        </div>
        <div className="chat-bubble">
          {/* DESCOPE(proactive-digest): all-project status digest needs the P2 admin-attention projection; until then this cold-start message only offers live prompts backed by the existing Ask Admin SSE loop. */}
          <p style={{ margin: "0 0 var(--space-2)" }}>
            Ask me to check {workspaceName} tasks, blockers, approvals, or recent changes. I will
            use the live Opzava assistant stream and governed task tools for the request.
          </p>
          <div className="example-chips" aria-label="Example prompts">
            {askOpzavaPromptActions.map((action) => (
              <button
                className="example-chip"
                type="button"
                key={action.id}
                onClick={() => onChoosePrompt(action.prompt)}
                title={action.description}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="action-bubble" role="group" aria-label="Ask Admin Opzava quick actions">
          {/* DESCOPE(inline-approval-action): approval-specific records and send authority arrive with the P2 approval projection; these controls submit live assistant requests instead of rendering a dead Approve & send button. */}
          <div className="action-bubble-title">
            <span aria-hidden="true">▲</span> Admin attention checks
          </div>
          <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: 0 }}>
            Start with a real workspace scan, then Opzava will surface any actual task or approval
            action it is authorized to take.
          </p>
          <div className="action-row">
            <button
              className="btn btn-primary"
              type="button"
              disabled={sending}
              onClick={() =>
                onSendPrompt(
                  "Chase the highest priority blocker in this workspace. Use available Opzava task tools if an action is authorized; otherwise tell me what is needed.",
                )
              }
            >
              <span aria-hidden="true">✓</span> Yes
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={sending}
              onClick={() =>
                onSendPrompt(
                  "Do not chase blockers yet. Summarize the current workspace risks and pending approvals.",
                )
              }
            >
              No
            </button>
            <a
              href="/tasks"
              className="btn btn-ghost btn-sm u-subtle"
              style={{ marginLeft: "auto" }}
            >
              View tasks ↗
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

export function AskOpzavaChat({
  conversationId,
  initialTurns,
  currentUserName,
  organizationName,
  workspaceName,
}: AskOpzavaChatProps) {
  const router = useRouter();
  const [turns, setTurns] = useState<readonly AskAdminTurnView[]>(initialTurns);
  const [draft, setDraft] = useState<AskAdminDraft>(() => emptyAskAdminDraft());
  const [toolReceipts, setToolReceipts] = useState<readonly StreamToolReceipt[]>([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTurns(initialTurns);
  }, [initialTurns]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, toolReceipts, draft]);

  useEffect(() => {
    if (prompt === "") {
      inputRef.current?.style.setProperty("height", "auto");
    }
  }, [prompt]);

  const visibleTurns = useMemo(() => visibleAskOpzavaTurns(turns), [turns]);
  const status = askOpzavaStatusView(draft.status);

  const resizeComposer = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  };

  const applyEvent = (event: AskAdminClientStreamEvent) => {
    if (
      event.type === "tool.started" ||
      event.type === "tool.succeeded" ||
      event.type === "tool.failed"
    ) {
      setToolReceipts((current) => upsertToolReceipt(current, event));
    }

    setDraft((current) => applyAskAdminStreamEvent(current, event));
    if (
      event.type === "tool.succeeded" ||
      event.type === "assistant.final" ||
      event.type === "failed"
    ) {
      router.refresh();
    }
    if (event.type === "assistant.final") {
      // The finalized turn is persisted and reloaded via router.refresh(); clear
      // the draft so it stops duplicating the durable assistant message.
      setDraft(emptyAskAdminDraft());
    }
  };

  const sendPrompt = async (rawPrompt: string) => {
    const normalizedPrompt = rawPrompt.trim();
    if (normalizedPrompt === "" || sending) {
      return;
    }

    const key = idempotencyKey();
    setSending(true);
    setPrompt("");
    setDraft({
      ...emptyAskAdminDraft(),
      status: "queued",
    });
    setTurns((current) => [
      ...current,
      {
        id: `optimistic-user-${key}`,
        role: "user",
        status: "final",
        text: normalizedPrompt,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        finalizedAt: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch("/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          prompt: normalizedPrompt,
          idempotencyKey: key,
        }),
      });

      if (!response.ok || response.body === null) {
        applyEvent({
          type: "failed",
          code: response.status === 409 ? "runtimeControl.idempotencyConflict" : "askAdmin.failed",
          message: "Ask Admin Opzava request failed.",
          state: response.status === 409 ? "duplicate_send" : "failed",
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawTerminal = false;
      let streamDraft = emptyAskAdminDraft();

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }

        buffer += decoder.decode(chunk.value, { stream: true });
        const parsed = parseAskAdminSseBuffer(buffer);
        buffer = parsed.remainder;
        for (const streamEvent of parsed.events) {
          streamDraft = applyAskAdminStreamEvent(streamDraft, streamEvent);
          applyEvent(streamEvent);
          sawTerminal = sawTerminal || isAskAdminTerminalStreamEvent(streamEvent);
        }
      }

      buffer += decoder.decode();
      const parsed = parseAskAdminSseBuffer(`${buffer}\n\n`);
      for (const streamEvent of parsed.events) {
        streamDraft = applyAskAdminStreamEvent(streamDraft, streamEvent);
        applyEvent(streamEvent);
        sawTerminal = sawTerminal || isAskAdminTerminalStreamEvent(streamEvent);
      }

      if (!sawTerminal) {
        const interrupted = interruptedAskAdminStreamEvent(
          streamDraft.status === "idle" ? { ...streamDraft, status: "working" } : streamDraft,
        );
        if (interrupted !== null) {
          applyEvent(interrupted);
        }
      }
    } catch {
      applyEvent({
        type: "failed",
        code: "webGateway.gatewayUnavailable",
        message: "Gateway broker internal stream endpoint is unreachable.",
        state: "gateway_unavailable",
      });
    } finally {
      setSending(false);
    }
  };

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendPrompt(prompt);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendPrompt(prompt);
    }
  };

  const choosePromptAction = (nextPrompt: string) => {
    setPrompt(nextPrompt);
    requestAnimationFrame(() => {
      if (inputRef.current !== null) {
        resizeComposer(inputRef.current);
        inputRef.current.focus();
      }
    });
  };

  return (
    <section className="chat-canvas" aria-label="Ask Admin Opzava">
      <AskOpzavaPageStyles />

      <div className="chat-title-strip">
        <div className="chat-title-inner">
          <div className="chat-title-row" title={`${organizationName} · ${workspaceName}`}>
            <span className="chat-title-name">Ask Admin Opzava</span>
            <span className="u-subtle" style={{ fontSize: "var(--text-xs)" }} aria-hidden="true">
              ·
            </span>
            <span className="chat-title-sub">
              Platform oversight across projects, agents, integrations, and admin decisions
            </span>
          </div>
        </div>
      </div>

      <div
        className="chat-log"
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with Opzava"
        aria-busy={status.isBusy}
      >
        <div className="chat-log-inner">
          {visibleTurns.length === 0 ? (
            <AskOpzavaColdStart
              workspaceName={workspaceName}
              sending={sending}
              onChoosePrompt={choosePromptAction}
              onSendPrompt={(nextPrompt) => void sendPrompt(nextPrompt)}
            />
          ) : (
            visibleTurns.map((turn) => (
              <AskOpzavaTurn key={turn.id} turn={turn} currentUserName={currentUserName} />
            ))
          )}

          {toolReceipts.map((receipt) => (
            <AskOpzavaToolReceiptRow key={receipt.id} receipt={receipt} />
          ))}

          {shouldShowAskOpzavaDraft(draft) ? <AskOpzavaDraftMessage draft={draft} /> : null}

          <details className="ops-state-panel">
            <summary>
              <span aria-hidden="true">◔</span>
              Conversation states and recovery paths
              <span className="u-subtle" style={{ marginLeft: "auto" }}>
                Loading · offline · empty
              </span>
            </summary>
            <div className="ops-state-grid">
              <div className="ops-state-card">
                <strong>Loading reply</strong>
                <p>Queued, working, tool-running, and finalizing states render from SSE events.</p>
              </div>
              <div className="ops-state-card">
                <strong>Offline</strong>
                <p>Gateway failures keep the draft visible and surface a retry-safe error state.</p>
              </div>
              <div className="ops-state-card">
                <strong>Empty chat</strong>
                <p>Prompt chips prepare live requests for {workspaceName}.</p>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="composer-wrap">
        <form
          className="composer"
          id="composerForm"
          onSubmit={submitPrompt}
          aria-label="Message Ask Admin Opzava"
        >
          <label htmlFor="msgInput" className="u-sr-only">
            Message Ask Admin Opzava
          </label>
          <textarea
            id="msgInput"
            ref={inputRef}
            rows={1}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              resizeComposer(event.target);
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder="Message Ask Admin Opzava..."
            aria-label="Message Ask Admin Opzava"
            autoComplete="off"
            maxLength={4000}
          />
          <span className="composer-hint" aria-hidden="true">
            <kbd className="kbd">↵</kbd> send
          </span>
          <button
            className="composer-send"
            type="submit"
            aria-label="Send message"
            disabled={sending || prompt.trim() === ""}
          >
            ↑
          </button>
        </form>
      </div>
    </section>
  );
}
