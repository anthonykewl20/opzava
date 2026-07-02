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
    errorMessage: null
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
    duplicate_send: "Duplicate send"
  };

  return labels[status];
}

export function askAdminStatusBadgeClassName(status: AskAdminStreamState): string {
  if (status === "completed") {
    return "badge badge-success";
  }

  if (
    status === "gateway_unavailable" ||
    status === "duplicate_send" ||
    status === "finalizing"
  ) {
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
  event: AskAdminClientStreamEvent
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
      errorMessage: null
    };
  }

  if (event.type === "delta") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      text: event.text,
      errorCode: null,
      errorMessage: null
    };
  }

  if (event.type === "tool.started" || event.type === "tool.succeeded") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      activeToolName: event.toolName
    };
  }

  if (event.type === "tool.failed") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      activeToolName: event.toolName,
      errorCode: event.code,
      errorMessage: event.message
    };
  }

  if (event.type === "finalizing") {
    return {
      ...draft,
      status: event.state,
      turnId: event.turnId,
      text: event.text
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
      errorMessage: null
    };
  }

  return {
    ...draft,
    status: event.state,
    turnId: event.turnId ?? draft.turnId,
    activeToolName: null,
    errorCode: event.code,
    errorMessage: event.message
  };
}

function parseEventBlock(block: string): AskAdminClientStreamEvent | null {
  const dataLine = block
    .split("\n")
    .map((line) => line.trimEnd())
    .find((line) => line.startsWith("data: "));

  if (dataLine === undefined) {
    return null;
  }

  try {
    return JSON.parse(dataLine.slice("data: ".length)) as AskAdminClientStreamEvent;
  } catch {
    return null;
  }
}

export function parseAskAdminSseBuffer(buffer: string): AskAdminSseParseResult {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const events = parts.flatMap((part) => {
    const parsed = parseEventBlock(part);
    return parsed === null ? [] : [parsed];
  });

  return { events, remainder };
}
