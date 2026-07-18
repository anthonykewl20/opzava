import { parseSseBuffer, readSseFrames } from "./sse";

export type AskAdminStreamState =
  | "idle"
  | "queued"
  | "working"
  | "tool_running"
  | "finalizing"
  | "completed"
  | "failed"
  | "gateway_unavailable"
  | "policy_denied"
  | "duplicate_send";

export type AskAdminClientStreamEvent =
  | {
      readonly type: "queued";
      readonly turnId: string;
      readonly userTurnId: string;
      readonly state: "queued";
    }
  | {
      readonly type: "delta";
      readonly turnId: string;
      readonly deltaText: string;
      readonly text: string;
      readonly state: "working";
    }
  | {
      readonly type: "tool.started";
      readonly turnId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly state: "tool_running";
    }
  | {
      readonly type: "tool.succeeded";
      readonly turnId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly output: Readonly<Record<string, unknown>>;
      readonly state: "tool_running";
    }
  | {
      readonly type: "tool.failed";
      readonly turnId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly code: string;
      readonly message: string;
      readonly state: "tool_running";
    }
  | {
      readonly type: "finalizing";
      readonly turnId: string;
      readonly text: string;
      readonly state: "finalizing";
    }
  | {
      readonly type: "assistant.final";
      readonly turnId: string;
      readonly text: string;
      readonly state: "completed";
    }
  | {
      readonly type: "failed";
      readonly turnId?: string;
      readonly code: string;
      readonly message: string;
      readonly state: "gateway_unavailable" | "policy_denied" | "duplicate_send" | "failed";
    };

export interface AskAdminDraft {
  readonly status: AskAdminStreamState;
  readonly turnId: string | null;
  readonly userTurnId: string | null;
  readonly text: string;
  readonly activeToolName: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

export interface AskAdminSseParseResult {
  readonly events: readonly AskAdminClientStreamEvent[];
  readonly remainder: string;
}

export function emptyAskAdminDraft(): AskAdminDraft {
  return {
    status: "idle",
    turnId: null,
    userTurnId: null,
    text: "",
    activeToolName: null,
    errorCode: null,
    errorMessage: null,
  };
}

export function askAdminStatusLabel(status: AskAdminStreamState): string {
  const labels: Record<AskAdminStreamState, string> = {
    idle: "Idle",
    queued: "Queued",
    working: "Working",
    tool_running: "Tool running",
    finalizing: "Finalizing",
    completed: "Completed",
    failed: "Failed",
    gateway_unavailable: "Gateway unavailable",
    policy_denied: "Policy denied",
    duplicate_send: "Duplicate send",
  };

  return labels[status];
}

export function askAdminStatusBadgeClassName(status: AskAdminStreamState): string {
  if (status === "completed") {
    return "badge badge-success";
  }

  if (status === "gateway_unavailable" || status === "duplicate_send" || status === "finalizing") {
    return "badge badge-warning";
  }

  if (status === "failed" || status === "policy_denied") {
    return "badge badge-danger";
  }

  if (status === "working" || status === "tool_running" || status === "queued") {
    return "badge badge-accent";
  }

  return "badge";
}

export function applyAskAdminStreamEvent(
  draft: AskAdminDraft,
  event: AskAdminClientStreamEvent,
): AskAdminDraft {
  if (draft.status === "completed" && event.type === "assistant.final") {
    return draft;
  }

  if (event.type === "queued") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      userTurnId: event.userTurnId,
      errorCode: null,
      errorMessage: null,
    };
  }

  if (event.type === "delta") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      text: event.text,
      errorCode: null,
      errorMessage: null,
    };
  }

  if (event.type === "tool.started" || event.type === "tool.succeeded") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      activeToolName: event.toolName,
    };
  }

  if (event.type === "tool.failed") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      activeToolName: event.toolName,
      errorCode: event.code,
      errorMessage: event.message,
    };
  }

  if (event.type === "finalizing") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      text: event.text,
    };
  }

  if (event.type === "assistant.final") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      text: event.text,
      activeToolName: null,
      errorCode: null,
      errorMessage: null,
    };
  }

  return {
    ...draft,
    status: event.state,
    turnId: event.turnId ?? draft.turnId,
    activeToolName: null,
    errorCode: event.code,
    errorMessage: event.message,
  };
}

export function isAskAdminTerminalStreamEvent(event: AskAdminClientStreamEvent): boolean {
  return event.type === "assistant.final" || event.type === "failed";
}

export function interruptedAskAdminStreamEvent(
  draft: AskAdminDraft,
): Extract<AskAdminClientStreamEvent, { readonly type: "failed" }> | null {
  if (
    draft.status === "idle" ||
    draft.status === "completed" ||
    draft.status === "failed" ||
    draft.status === "gateway_unavailable" ||
    draft.status === "policy_denied" ||
    draft.status === "duplicate_send"
  ) {
    return null;
  }

  return {
    type: "failed",
    ...(draft.turnId === null ? {} : { turnId: draft.turnId }),
    code: "webGateway.streamInterrupted",
    message: "Ask Admin Opzava stream ended before a final response.",
    state: "gateway_unavailable",
  };
}

const ASK_ADMIN_STREAM_EVENT_TYPES = new Set<string>([
  "queued",
  "delta",
  "tool.started",
  "tool.succeeded",
  "tool.failed",
  "finalizing",
  "assistant.final",
  "failed",
]);

function parseAskAdminStreamEvent(data: string): AskAdminClientStreamEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const type = (parsed as { readonly type?: unknown }).type;
  if (typeof type !== "string" || !ASK_ADMIN_STREAM_EVENT_TYPES.has(type)) {
    return null;
  }

  return parsed as AskAdminClientStreamEvent;
}

export function parseAskAdminSseBuffer(buffer: string): AskAdminSseParseResult {
  const { frames, remainder } = parseSseBuffer(buffer);
  const events: AskAdminClientStreamEvent[] = [];

  for (const frame of frames) {
    const event = parseAskAdminStreamEvent(frame.data);
    if (event !== null) {
      events.push(event);
    }
  }

  return { events, remainder };
}

/**
 * Drains a streamed Ask Admin response body end to end: parse, fold each event
 * into a local draft, forward every event to the sink, and — if the body ends
 * without a terminal event — synthesize the interrupt failure the browser used
 * to rebuild three times (see #165).
 *
 * The sink owns React state and side effects (router refresh, tool receipts);
 * this function owns only the byte stream and the recovery rule. A read failure
 * mid-stream propagates so the caller can map it, exactly as the hand-rolled
 * loops did.
 */
export async function drainAskAdminStream(
  body: ReadableStream<Uint8Array>,
  sink: { readonly onEvent: (event: AskAdminClientStreamEvent) => void },
): Promise<void> {
  let draft = emptyAskAdminDraft();
  let sawTerminal = false;

  for await (const frame of readSseFrames(body)) {
    const event = parseAskAdminStreamEvent(frame.data);
    if (event === null) {
      continue;
    }

    draft = applyAskAdminStreamEvent(draft, event);
    sawTerminal = sawTerminal || isAskAdminTerminalStreamEvent(event);
    sink.onEvent(event);
  }

  if (!sawTerminal) {
    const interrupted = interruptedAskAdminStreamEvent(
      draft.status === "idle" ? { ...draft, status: "working" } : draft,
    );
    if (interrupted !== null) {
      sink.onEvent(interrupted);
    }
  }
}
