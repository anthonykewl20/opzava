"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  CheckIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  SendIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Textarea } from "@/components/ui/textarea";

import type { AskAdminTurnView } from "@/lib/ask-admin-history";
import {
  applyAskAdminStreamEvent,
  drainAskAdminStream,
  emptyAskAdminDraft,
  type AskAdminClientStreamEvent,
  type AskAdminDraft,
} from "@/lib/ask-admin-stream";
import {
  askOpzavaDraftTitle,
  formatAskOpzavaTurnTime,
  hydrationSafeAskOpzavaTimeZone,
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

const emptyAssistantReply = "No reply — the turn did not complete.";

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

function isEmptyAssistantTurn(turn: AskAdminTurnView): boolean {
  return (
    turn.role === "assistant" && turn.text.trim() === "" && (turn.errorMessage?.trim() ?? "") === ""
  );
}

function messageText(turn: AskAdminTurnView): string {
  if (turn.text.trim() !== "") {
    return turn.text;
  }

  if (isEmptyAssistantTurn(turn)) {
    return emptyAssistantReply;
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

export function shouldSubmitAskOpzavaComposerKey(input: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}): boolean {
  return input.key === "Enter" && !input.shiftKey && !input.isComposing;
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
  readonly variant: "destructive" | "success" | "secondary";
  readonly label: string;
} {
  if (receipt.status === "failed") {
    return { variant: "destructive", label: "Failed" };
  }

  if (receipt.status === "running") {
    return { variant: "secondary", label: "Running" };
  }

  return { variant: "success", label: "Done" };
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
      <Avatar aria-label="Opzava AI" className="rounded-lg bg-[var(--chart-6)]">
        <AvatarFallback className="rounded-lg bg-[var(--chart-6)] text-white">O</AvatarFallback>
        <AvatarBadge aria-hidden="true">
          <SparklesIcon />
        </AvatarBadge>
      </Avatar>
    );
  }

  return (
    <Avatar aria-label={name} className="bg-[var(--chart-2)]">
      <AvatarFallback className="bg-[var(--chart-2)] text-white">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function ChatToolCard({ receipt }: { readonly receipt: StreamToolReceipt }) {
  const badge = toolBadge(receipt);

  return (
    <Accordion
      type="single"
      collapsible
      className="w-full overflow-hidden rounded-lg border bg-muted/40"
      aria-label={`Tool call: ${receipt.toolName}`}
    >
      <AccordionItem value={safeDomId(receipt.id)}>
        <AccordionTrigger className="min-h-11 px-3 py-2 hover:no-underline">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <WrenchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-mono text-xs text-muted-foreground">
              {receipt.toolName}
            </span>
            <Badge variant={badge.variant} className="ml-auto">
              {receipt.status === "succeeded" ? (
                <CheckIcon className="size-3" aria-hidden="true" />
              ) : null}
              {badge.label}
            </Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent className="border-t px-3 py-3">
          <pre className="m-0 whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
            {toolBodyText(receipt)}
          </pre>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
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

export function AskOpzavaTurn({
  turn,
  currentUserName,
  timeZone,
}: {
  readonly turn: AskAdminTurnView;
  readonly currentUserName: string;
  readonly timeZone: string;
}) {
  const label = turnLabel(turn, currentUserName);
  const text = messageText(turn);
  const isUser = turn.role === "user";
  const mutedFallback = isEmptyAssistantTurn(turn);
  const failed = turn.status === "failed";

  if (turn.role === "tool") {
    return (
      <Message align="start" aria-label="Opzava tool result">
        <MessageAvatar>
          <AskOpzavaAvatar role={turn.role} name={label} />
        </MessageAvatar>
        <MessageContent>
          <MessageHeader className="gap-2 px-0">
            <span>{label}</span>
            <Badge variant="outline">Tool</Badge>
          </MessageHeader>
          <Bubble variant="outline" className="w-full max-w-[min(44rem,90%)]">
            <BubbleContent className="w-full p-0">
              <ChatToolCard receipt={persistedToolReceipt(turn)} />
            </BubbleContent>
          </Bubble>
          <MessageFooter className="px-0 font-mono">
            {formatAskOpzavaTurnTime(turn.createdAt, timeZone)}
          </MessageFooter>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message
      align={isUser ? "end" : "start"}
      aria-label={`${isUser ? "You" : label}${failed ? ", failed" : ""}`}
    >
      <MessageAvatar>
        <AskOpzavaAvatar role={turn.role} name={label} />
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className="gap-2">
          <span>{isUser ? "You" : label}</span>
          {turn.role === "assistant" ? (
            <Badge variant="secondary">
              <SparklesIcon className="size-3" aria-hidden="true" />
              AI
            </Badge>
          ) : null}
          {failed ? (
            <Badge variant="destructive">
              <AlertCircleIcon className="size-3" aria-hidden="true" />
              Failed
            </Badge>
          ) : null}
        </MessageHeader>
        <Bubble variant={failed ? "destructive" : isUser ? "default" : "secondary"}>
          <BubbleContent className={mutedFallback ? "text-muted-foreground" : undefined}>
            {failed ? (
              <span className="flex items-start gap-2">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-medium">Failed. </span>
                  {text}
                </span>
              </span>
            ) : (
              text
            )}
          </BubbleContent>
        </Bubble>
        <MessageFooter className="font-mono">
          {formatAskOpzavaTurnTime(turn.createdAt, timeZone)}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

function AskOpzavaToolReceiptRow({
  receipt,
  timeZone,
}: {
  readonly receipt: StreamToolReceipt;
  readonly timeZone: string;
}) {
  return (
    <Message align="start" aria-label={`Opzava tool receipt: ${receipt.toolName}`}>
      <MessageAvatar>
        <AskOpzavaAvatar role="tool" name="Opzava tool" />
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className="gap-2 px-0">
          <span>Opzava</span>
          <Badge variant="outline">Tool</Badge>
        </MessageHeader>
        <Bubble variant="outline" className="w-full max-w-[min(44rem,90%)]">
          <BubbleContent className="w-full p-0">
            {/* DESCOPE(standup.report-sample): the mockup's canned trace is replaced by live Runtime-Control tool receipts; a named admin digest tool arrives with the P2 admin-attention projection. */}
            <ChatToolCard receipt={receipt} />
          </BubbleContent>
        </Bubble>
        <MessageFooter className="px-0 font-mono">
          {formatAskOpzavaTurnTime(receipt.createdAt, timeZone)}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

export function AskOpzavaDraftMessage({ draft }: { readonly draft: AskAdminDraft }) {
  const status = askOpzavaStatusView(draft.status);
  const failed = draft.errorMessage !== null;
  const visibleText = draft.text.trim() !== "" || failed;

  return (
    <Message align="start" aria-label={`Opzava response, ${status.label}`}>
      <MessageAvatar>
        <AskOpzavaAvatar role="draft" name="Opzava" />
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className="gap-2">
          <span>{askOpzavaDraftTitle(draft)}</span>
          <Badge variant={failed ? "destructive" : "secondary"}>{status.label}</Badge>
        </MessageHeader>
        <Bubble variant={failed ? "destructive" : "secondary"}>
          <BubbleContent
            {...(status.isBusy
              ? { role: "status", "aria-label": `${status.label}: ${status.detail}` }
              : {})}
          >
            {visibleText ? <span>{draftText(draft)}</span> : null}
            {status.isBusy ? (
              <span
                className={
                  visibleText
                    ? "ml-2 inline-flex items-center gap-1"
                    : "inline-flex items-center gap-1"
                }
                aria-hidden="true"
                data-loading-dots="true"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
                <span className="size-1.5 animate-pulse rounded-full bg-current delay-150 motion-reduce:animate-none" />
                <span className="size-1.5 animate-pulse rounded-full bg-current delay-300 motion-reduce:animate-none" />
              </span>
            ) : null}
          </BubbleContent>
        </Bubble>
        {draft.activeToolName === null ? null : (
          <Marker role="status" aria-label={`Running tool ${draft.activeToolName}`}>
            <MarkerIcon>
              <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
            </MarkerIcon>
            <MarkerContent>Running {draft.activeToolName}</MarkerContent>
          </Marker>
        )}
      </MessageContent>
    </Message>
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
    <Message align="start" aria-label="Opzava is ready">
      <MessageAvatar>
        <AskOpzavaAvatar role="assistant" name="Opzava" />
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className="gap-2">
          <span>Opzava</span>
          <Badge variant="secondary">
            <SparklesIcon className="size-3" aria-hidden="true" />
            AI
          </Badge>
        </MessageHeader>
        <Bubble variant="secondary" className="max-w-[min(44rem,90%)]">
          <BubbleContent className="space-y-4">
            {/* DESCOPE(proactive-digest): all-project status digest needs the P2 admin-attention projection; until then this cold-start message only offers live prompts backed by the existing Ask Admin SSE loop. */}
            <p>
              Ask me to check {workspaceName} tasks, blockers, approvals, or recent changes. I will
              use the live Opzava assistant stream and governed task tools for the request.
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Example prompts">
              {askOpzavaPromptActions.map((action) => (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  key={action.id}
                  onClick={() => onChoosePrompt(action.prompt)}
                  title={action.description}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </BubbleContent>
        </Bubble>

        <Card
          className="w-full max-w-[min(44rem,90%)] gap-4 border-l-4 border-l-primary py-4 shadow-none"
          role="group"
          aria-label="Ask Admin Opzava quick actions"
        >
          {/* DESCOPE(inline-approval-action): approval-specific records and send authority arrive with the P2 approval projection; these controls submit live assistant requests instead of rendering a dead Approve & send button. */}
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
              Admin attention checks
            </CardTitle>
            <CardDescription>
              Start with a real workspace scan, then Opzava will surface any actual task or approval
              action it is authorized to take.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 px-4">
            <Button
              type="button"
              disabled={sending}
              onClick={() =>
                onSendPrompt(
                  "Chase the highest priority blocker in this workspace. Use available Opzava task tools if an action is authorized; otherwise tell me what is needed.",
                )
              }
            >
              <CheckIcon aria-hidden="true" />
              Yes
            </Button>
            <Button
              variant="ghost"
              type="button"
              disabled={sending}
              onClick={() =>
                onSendPrompt(
                  "Do not chase blockers yet. Summarize the current workspace risks and pending approvals.",
                )
              }
            >
              No
            </Button>
            <Button variant="ghost" size="sm" asChild className="ml-auto text-muted-foreground">
              <a href="/tasks">
                View tasks
                <ExternalLinkIcon aria-hidden="true" />
              </a>
            </Button>
          </CardContent>
        </Card>
        <MessageFooter>Ready</MessageFooter>
      </MessageContent>
    </Message>
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
  const [turnTimeZone, setTurnTimeZone] = useState(hydrationSafeAskOpzavaTimeZone);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // Keep SSR and the first client render on UTC, then switch to the
    // browser timezone after hydration so chat timestamps stay local.
    setTurnTimeZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? hydrationSafeAskOpzavaTimeZone,
    );
  }, []);

  useEffect(() => {
    setTurns(initialTurns);
  }, [initialTurns]);

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

      await drainAskAdminStream(response.body, { onEvent: applyEvent });
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
    if (
      shouldSubmitAskOpzavaComposerKey({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
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
    <section
      className="flex h-[calc(100dvh-56px)] min-h-0 flex-col overflow-hidden bg-background"
      aria-label="Ask Admin Opzava"
    >
      <header className="shrink-0 border-b px-4 py-3 sm:px-6">
        <div
          className="mx-auto flex max-w-[860px] min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
          title={`${organizationName} · ${workspaceName}`}
        >
          <h1 className="shrink-0 font-semibold">Ask Admin Opzava</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline" aria-hidden="true">
            ·
          </span>
          <p className="min-w-0 text-xs text-muted-foreground sm:truncate">
            Platform oversight across projects, agents, integrations, and admin decisions
          </p>
        </div>
      </header>

      <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label="Conversation with Opzava">
            <MessageScrollerContent
              className="mx-auto w-full max-w-[892px] gap-5 px-4 py-6 sm:px-6"
              aria-busy={status.isBusy}
            >
              {visibleTurns.length === 0 ? (
                <MessageScrollerItem messageId="ask-opzava-cold-start">
                  <AskOpzavaColdStart
                    workspaceName={workspaceName}
                    sending={sending}
                    onChoosePrompt={choosePromptAction}
                    onSendPrompt={(nextPrompt) => void sendPrompt(nextPrompt)}
                  />
                </MessageScrollerItem>
              ) : (
                visibleTurns.map((turn) => (
                  <MessageScrollerItem
                    key={turn.id}
                    messageId={`ask-opzava-turn-${turn.id}`}
                    scrollAnchor={turn.role === "user"}
                  >
                    <AskOpzavaTurn
                      turn={turn}
                      currentUserName={currentUserName}
                      timeZone={turnTimeZone}
                    />
                  </MessageScrollerItem>
                ))
              )}

              {toolReceipts.map((receipt) => (
                <MessageScrollerItem key={receipt.id} messageId={`ask-opzava-tool-${receipt.id}`}>
                  <AskOpzavaToolReceiptRow receipt={receipt} timeZone={turnTimeZone} />
                </MessageScrollerItem>
              ))}

              {shouldShowAskOpzavaDraft(draft) ? (
                <MessageScrollerItem messageId="ask-opzava-active-response">
                  <AskOpzavaDraftMessage draft={draft} />
                </MessageScrollerItem>
              ) : null}

              {/* DESCOPE(conversation-state-annotation): the mockup's explanatory loading/offline/empty row is not product UI; the real queued, gateway_unavailable, and cold-start states render above from live stream state. */}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>

        <footer className="shrink-0 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
          <form
            className="mx-auto flex max-w-[860px] items-end gap-2 rounded-xl border bg-muted/40 p-2 shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
            id="composerForm"
            onSubmit={submitPrompt}
            aria-label="Message Ask Admin Opzava"
          >
            <label htmlFor="msgInput" className="sr-only">
              Message Ask Admin Opzava
            </label>
            <Textarea
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
              className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            />
            <span
              className="hidden pb-2 text-xs whitespace-nowrap text-muted-foreground sm:inline"
              aria-hidden="true"
            >
              <kbd className="kbd">↵</kbd> send
            </span>
            <Button
              size="icon"
              type="submit"
              aria-label="Send message"
              disabled={sending || prompt.trim() === ""}
            >
              {sending ? (
                <LoaderCircleIcon
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <SendIcon aria-hidden="true" />
              )}
            </Button>
          </form>
        </footer>
      </MessageScrollerProvider>
    </section>
  );
}
