"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { AskAdminTurnView } from "@/lib/ask-admin-history";
import {
  applyAskAdminStreamEvent,
  askAdminStatusBadgeClassName,
  askAdminStatusLabel,
  emptyAskAdminDraft,
  parseAskAdminSseBuffer,
  type AskAdminClientStreamEvent,
  type AskAdminDraft,
  type AskAdminStreamState
} from "@/lib/ask-admin-stream";

export interface AskAdminPanelProps {
  readonly conversationId: string;
  readonly initialTurns: readonly AskAdminTurnView[];
  readonly currentUserName: string;
  readonly onToolSucceeded?: (
    event: Extract<AskAdminClientStreamEvent, { readonly type: "tool.succeeded" }>
  ) => void;
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function turnLabel(turn: AskAdminTurnView, currentUserName: string): string {
  if (turn.role === "user") {
    return currentUserName;
  }

  if (turn.role === "assistant") {
    return "Ask Admin Opzava";
  }

  return turn.role;
}

function messageText(turn: AskAdminTurnView): string {
  if (turn.text.trim() !== "") {
    return turn.text;
  }

  return turn.errorMessage ?? "";
}

function shouldShowDraft(draft: AskAdminDraft): boolean {
  return draft.status !== "idle";
}

function draftTitle(draft: AskAdminDraft): string {
  if (draft.status === "gateway_unavailable") {
    return "Gateway unavailable";
  }

  if (draft.status === "policy_denied") {
    return "Policy denied";
  }

  if (draft.status === "duplicate_send") {
    return "Duplicate send";
  }

  if (draft.status === "failed") {
    return "Failed";
  }

  return "Ask Admin Opzava";
}

export function AskAdminStatusBadge({ status }: { readonly status: AskAdminStreamState }) {
  return (
    <span className={askAdminStatusBadgeClassName(status)}>
      {askAdminStatusLabel(status)}
    </span>
  );
}

export function AskAdminPanel({
  conversationId,
  initialTurns,
  currentUserName,
  onToolSucceeded
}: AskAdminPanelProps) {
  const router = useRouter();
  const [turns, setTurns] = useState<readonly AskAdminTurnView[]>(initialTurns);
  const [draft, setDraft] = useState<AskAdminDraft>(() => emptyAskAdminDraft());
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setTurns(initialTurns);
  }, [initialTurns]);

  const visibleTurns = useMemo(
    () => turns.filter((turn) => turn.role === "user" || turn.role === "assistant"),
    [turns]
  );

  const applyEvent = (event: AskAdminClientStreamEvent) => {
    setDraft((current) => applyAskAdminStreamEvent(current, event));
    if (event.type === "tool.succeeded") {
      onToolSucceeded?.(event);
    }
    if (
      event.type === "tool.succeeded" ||
      event.type === "assistant.final" ||
      event.type === "failed"
    ) {
      router.refresh();
    }
  };

  const submitPrompt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt === "" || sending) {
      return;
    }

    const key = idempotencyKey();
    setSending(true);
    setPrompt("");
    setDraft({
      ...emptyAskAdminDraft(),
      status: "queued"
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
        finalizedAt: new Date().toISOString()
      }
    ]);

    try {
      const response = await fetch("/api/tasks/ask-admin/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          prompt: normalizedPrompt,
          idempotencyKey: key
        })
      });

      if (!response.ok || response.body === null) {
        applyEvent({
          type: "failed",
          code: response.status === 409 ? "runtimeControl.idempotencyConflict" : "askAdmin.failed",
          message: "Ask Admin Opzava request failed.",
          state: response.status === 409 ? "duplicate_send" : "failed"
        });
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
        for (const streamEvent of parsed.events) {
          applyEvent(streamEvent);
        }
      }

      buffer += decoder.decode();
      const parsed = parseAskAdminSseBuffer(`${buffer}\n\n`);
      for (const streamEvent of parsed.events) {
        applyEvent(streamEvent);
      }
    } catch {
      applyEvent({
        type: "failed",
        code: "webGateway.gatewayUnavailable",
        message: "Gateway broker internal stream endpoint is unreachable.",
        state: "gateway_unavailable"
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="card ask-admin-panel" aria-label="Ask Admin Opzava">
      <div className="ask-admin-head">
        <div>
          <h2 className="ask-admin-title">Ask Admin Opzava</h2>
          <p className="page-sub">Tasks</p>
        </div>
        <AskAdminStatusBadge status={draft.status} />
      </div>

      <div className="ask-admin-messages" role="log" aria-live="polite">
        {visibleTurns.length === 0 ? (
          <div className="task-empty ask-admin-empty">
            <p className="empty-title">No conversation yet</p>
          </div>
        ) : (
          visibleTurns.map((turn) => (
            <article className={`ask-admin-message ask-admin-message-${turn.role}`} key={turn.id}>
              <div className="ask-admin-message-top">
                <span className="u-caps">{turnLabel(turn, currentUserName)}</span>
                {turn.status === "failed" ? (
                  <span className="badge badge-danger">Failed</span>
                ) : null}
              </div>
              <p>{messageText(turn)}</p>
            </article>
          ))
        )}

        {shouldShowDraft(draft) ? (
          <article className="ask-admin-message ask-admin-message-assistant">
            <div className="ask-admin-message-top">
              <span className="u-caps">{draftTitle(draft)}</span>
              <AskAdminStatusBadge status={draft.status} />
            </div>
            <p>
              {draft.text.trim() !== ""
                ? draft.text
                : draft.errorMessage ?? askAdminStatusLabel(draft.status)}
            </p>
            {draft.activeToolName === null ? null : (
              <p className="u-subtle">Tool: {draft.activeToolName}</p>
            )}
          </article>
        ) : null}
      </div>

      <form className="ask-admin-form" onSubmit={submitPrompt}>
        <textarea
          className="textarea ask-admin-input"
          aria-label="Message Ask Admin Opzava"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={4000}
          placeholder="Ask about tasks..."
        />
        <button className="btn btn-primary" type="submit" disabled={sending || prompt.trim() === ""}>
          Send
        </button>
      </form>
    </aside>
  );
}
