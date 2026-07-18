import type { TaskCommentDto, TaskStepDto } from "@opzava/project-management";

import {
  projectTaskCardAiRun,
  type TaskCardAiRunProjection,
  type TaskCardAssistantRunView,
} from "@/lib/task-card-ai-run-view";
import { parseSseBuffer } from "@/lib/sse";

export type TaskCardAssistantActivityState =
  "idle" | "assistant_replying" | "assistant_working" | "assistant_finalizing" | "failed";

export type TaskCardActivityEvent =
  | {
      readonly type: "comment-added";
      readonly comment: TaskCommentDto;
    }
  | {
      readonly type: "step-toggled";
      readonly step: TaskStepDto;
    }
  | {
      readonly type: "assistant-state";
      readonly state: TaskCardAssistantActivityState;
      readonly runs: readonly TaskCardAssistantRunView[];
    };

export interface TaskCardActivitySnapshot {
  readonly comments: readonly TaskCommentDto[];
  readonly steps: readonly TaskStepDto[];
  readonly runs: readonly TaskCardAssistantRunView[];
}

export interface TaskCardActivityState {
  readonly comments: readonly TaskCommentDto[];
  readonly steps: readonly TaskStepDto[];
  readonly assistantState: TaskCardAssistantActivityState;
  readonly runs: readonly TaskCardAssistantRunView[];
}

export interface TaskCardActivitySseParseResult {
  readonly events: readonly TaskCardActivityEvent[];
  readonly remainder: string;
}

export function assistantActivityState(
  runs: readonly TaskCardAssistantRunView[],
): TaskCardAssistantActivityState {
  const activeRuns = runs.filter(
    (run) => run.status === "queued" || run.status === "streaming" || run.status === "finalizing",
  );
  if (activeRuns.length === 0) {
    return runs.some((run) => run.status === "failed") ? "failed" : "idle";
  }

  if (activeRuns.some((run) => run.status === "finalizing")) {
    return "assistant_finalizing";
  }

  if (activeRuns.some((run) => run.outcomes.some((outcome) => outcome.status === "started"))) {
    return "assistant_working";
  }

  return "assistant_replying";
}

export function assistantActivityLabel(state: TaskCardAssistantActivityState): string {
  const labels: Record<TaskCardAssistantActivityState, string> = {
    idle: "Assistant idle",
    assistant_replying: "assistant is replying...",
    assistant_working: "assistant working...",
    assistant_finalizing: "assistant finalizing...",
    failed: "assistant run failed",
  };

  return labels[state];
}

export function taskCardAiRunProjectionFromState(
  state: Pick<TaskCardActivityState, "runs">,
  now: Date = new Date(),
): TaskCardAiRunProjection {
  return projectTaskCardAiRun(state.runs, now);
}

export function diffTaskCardActivitySnapshots(
  previous: TaskCardActivitySnapshot,
  next: TaskCardActivitySnapshot,
): readonly TaskCardActivityEvent[] {
  const events: TaskCardActivityEvent[] = [];
  const previousCommentIds = new Set(previous.comments.map((comment) => comment.id));
  const previousSteps = new Map(previous.steps.map((step) => [step.id, step]));

  for (const comment of next.comments) {
    if (!previousCommentIds.has(comment.id)) {
      events.push({ type: "comment-added", comment });
    }
  }

  for (const step of next.steps) {
    const previousStep = previousSteps.get(step.id);
    if (previousStep !== undefined && previousStep.done !== step.done) {
      events.push({ type: "step-toggled", step });
    }
  }

  const previousAssistant = assistantActivityState(previous.runs);
  const nextAssistant = assistantActivityState(next.runs);
  if (
    previousAssistant !== nextAssistant ||
    JSON.stringify(previous.runs) !== JSON.stringify(next.runs)
  ) {
    events.push({ type: "assistant-state", state: nextAssistant, runs: next.runs });
  }

  return events;
}

export function applyTaskCardActivityEvent(
  state: TaskCardActivityState,
  event: TaskCardActivityEvent,
): TaskCardActivityState {
  if (event.type === "comment-added") {
    const existing = state.comments.find((comment) => comment.id === event.comment.id);
    return {
      ...state,
      comments:
        existing === undefined
          ? [...state.comments, event.comment].sort((left, right) =>
              left.createdAt.localeCompare(right.createdAt),
            )
          : state.comments.map((comment) =>
              comment.id === event.comment.id ? event.comment : comment,
            ),
    };
  }

  if (event.type === "step-toggled") {
    return {
      ...state,
      steps: state.steps.map((step) => (step.id === event.step.id ? event.step : step)),
    };
  }

  return {
    ...state,
    assistantState: event.state,
    runs: event.runs,
  };
}

export function encodeTaskCardActivitySse(event: TaskCardActivityEvent): Uint8Array {
  return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

const TASK_CARD_ACTIVITY_EVENT_TYPES = new Set<string>([
  "comment-added",
  "step-toggled",
  "assistant-state",
]);

function parseTaskCardActivityEvent(data: string): TaskCardActivityEvent | null {
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
  if (typeof type !== "string" || !TASK_CARD_ACTIVITY_EVENT_TYPES.has(type)) {
    return null;
  }

  return parsed as TaskCardActivityEvent;
}

export function parseTaskCardActivitySseBuffer(buffer: string): TaskCardActivitySseParseResult {
  const { frames, remainder } = parseSseBuffer(buffer);
  const events: TaskCardActivityEvent[] = [];

  for (const frame of frames) {
    const event = parseTaskCardActivityEvent(frame.data);
    if (event !== null) {
      events.push(event);
    }
  }

  return { events, remainder };
}
