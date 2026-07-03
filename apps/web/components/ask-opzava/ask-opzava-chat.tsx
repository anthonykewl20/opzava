"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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
  askOpzavaShellSummary,
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
    return "Ask Admin Opzava";
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

function AskOpzavaAvatar({
  role,
  name,
}: {
  readonly role: AskAdminTurnView["role"] | "draft";
  readonly name: string;
}) {
  if (role === "assistant" || role === "tool" || role === "draft") {
    return (
      <span className="sb-avatar sb-avatar--ai ask-opzava-avatar-ai" aria-label="Opzava AI">
        O
      </span>
    );
  }

  return (
    <span className="sb-avatar ask-opzava-avatar-user" aria-label={name}>
      {initials(name)}
    </span>
  );
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
      <article className="ask-opzava-row" aria-label="Opzava tool result">
        <AskOpzavaAvatar role={turn.role} name={label} />
        <div className="ask-opzava-stack">
          <div className="ask-opzava-meta">
            <strong>{label}</strong>
            <span className="sb-badge sb-badge--secondary">tool</span>
            <span className="ask-opzava-time">{turnTime(turn.createdAt)}</span>
          </div>
          <details className="ask-opzava-tool-card">
            <summary>
              <span aria-hidden="true">⚙</span>
              Tool outcome
              <span
                className={turn.status === "failed" ? "badge badge-danger" : "badge badge-success"}
              >
                {turn.status === "failed" ? "failed" : "recorded"}
              </span>
            </summary>
            <pre>{text}</pre>
          </details>
        </div>
      </article>
    );
  }

  return (
    <article className={isUser ? "ask-opzava-row ask-opzava-row-user" : "ask-opzava-row"}>
      <AskOpzavaAvatar role={turn.role} name={label} />
      <div className="ask-opzava-stack">
        <div className="ask-opzava-meta">
          <strong>{label}</strong>
          {turn.role === "assistant" ? (
            <span className="sb-badge sb-badge--accent">AI</span>
          ) : null}
          {turn.status === "failed" ? <span className="badge badge-danger">Failed</span> : null}
          <span className="ask-opzava-time">{turnTime(turn.createdAt)}</span>
        </div>
        <div
          className={isUser ? "ask-opzava-bubble ask-opzava-bubble-user" : "ask-opzava-bubble"}
        >
          {text}
        </div>
      </div>
    </article>
  );
}

function AskOpzavaDraftMessage({ draft }: { readonly draft: AskAdminDraft }) {
  const status = askOpzavaStatusView(draft.status);

  return (
    <article className="ask-opzava-row">
      <AskOpzavaAvatar role="draft" name="Ask Admin Opzava" />
      <div className="ask-opzava-stack">
        <div className="ask-opzava-meta">
          <strong>{askOpzavaDraftTitle(draft)}</strong>
          <span className={status.badgeClassName}>{status.label}</span>
        </div>
        <div className="ask-opzava-bubble ask-opzava-bubble-draft">
          <p>{draftText(draft)}</p>
          {draft.activeToolName === null ? null : (
            <div className="ask-opzava-status-pill" role="status">
              <span aria-hidden="true">◔</span>
              running {draft.activeToolName}
            </div>
          )}
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
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTurns(initialTurns);
  }, [initialTurns]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, draft]);

  const visibleTurns = useMemo(() => visibleAskOpzavaTurns(turns), [turns]);
  const status = askOpzavaStatusView(draft.status);
  const shellSummary = askOpzavaShellSummary({
    turnCount: visibleTurns.length,
    workspaceName,
    status: draft.status,
  });

  const applyEvent = (event: AskAdminClientStreamEvent) => {
    setDraft((current) => applyAskAdminStreamEvent(current, event));
    if (
      event.type === "tool.succeeded" ||
      event.type === "assistant.final" ||
      event.type === "failed"
    ) {
      router.refresh();
    }
    if (event.type === "assistant.final") {
      // The finalized turn is now persisted and reloaded via router.refresh();
      // clear the draft to idle so it stops rendering a duplicate of the same
      // final message below the persisted turn.
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
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <section className="ask-opzava-page" aria-label="Ask Admin Opzava">
      <div className="ask-opzava-title-strip">
        <div>
          <div className="ask-opzava-title-row">
            <h1>Ask Admin Opzava</h1>
            <span className="u-subtle" aria-hidden="true">
              ·
            </span>
            <span className="ask-opzava-title-sub">
              Platform oversight across tasks, tools, and admin decisions
            </span>
          </div>
          <p className="page-sub">{shellSummary}</p>
        </div>

        <div className="ask-opzava-title-actions">
          <span className={status.badgeClassName}>{status.label}</span>
          <span className="health-pill">
            <span
              className={status.isBusy ? "dot dot-accent live" : "dot dot-success"}
              aria-hidden="true"
            />
            {organizationName}
          </span>
          <details className="ask-opzava-help">
            <summary>What's this?</summary>
            <p>
              Ask Admin Opzava uses the Slice 2 assistant loop and Opzava task tools. It never
              grants Docker, admin, filesystem mutation, or secret scopes to the assistant.
            </p>
          </details>
        </div>
      </div>

      <div
        className="ask-opzava-log"
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with Opzava"
      >
        <div className="ask-opzava-log-inner">
          {visibleTurns.length === 0 ? (
            <div className="ask-opzava-empty">
              <span className="sb-avatar sb-avatar--ai ask-opzava-avatar-ai" aria-hidden="true">
                O
              </span>
              <h2>No conversation yet</h2>
              <p>
                Start with a task question or choose a prompt. Each chip prepares a live request
                for the existing Ask Admin stream.
              </p>
              <div className="ask-opzava-example-chips" aria-label="Example prompts">
                {askOpzavaPromptActions.map((action) => (
                  <button
                    className="ask-opzava-example-chip"
                    type="button"
                    key={action.id}
                    onClick={() => choosePromptAction(action.prompt)}
                    title={action.description}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            visibleTurns.map((turn) => (
              <AskOpzavaTurn key={turn.id} turn={turn} currentUserName={currentUserName} />
            ))
          )}

          {shouldShowAskOpzavaDraft(draft) ? <AskOpzavaDraftMessage draft={draft} /> : null}

          <details className="ask-opzava-state-panel">
            <summary>
              <span aria-hidden="true">◔</span>
              Conversation states and recovery paths
              <span className="u-subtle">Loading · offline · empty</span>
            </summary>
            <div className="ask-opzava-state-grid">
              <div>
                <strong>Loading reply</strong>
                <p>Queued, working, tool-running, and finalizing states render from SSE events.</p>
              </div>
              <div>
                <strong>Offline</strong>
                <p>Gateway failures keep the draft visible and surface a retry-safe error state.</p>
              </div>
              <div>
                <strong>Empty chat</strong>
                <p>Prompt chips prepare task-focused requests for this workspace.</p>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="ask-opzava-composer-wrap">
        <form
          className="ask-opzava-composer"
          onSubmit={submitPrompt}
          aria-label="Message Ask Admin Opzava"
        >
          <label className="u-sr-only" htmlFor="ask-opzava-message">
            Message Ask Admin Opzava
          </label>
          <textarea
            id="ask-opzava-message"
            ref={inputRef}
            rows={1}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Message Ask Admin Opzava..."
            aria-label="Message Ask Admin Opzava"
            maxLength={4000}
          />
          <span className="ask-opzava-composer-hint" aria-hidden="true">
            <kbd className="kbd">Enter</kbd> send
          </span>
          <button
            className="ask-opzava-send"
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
