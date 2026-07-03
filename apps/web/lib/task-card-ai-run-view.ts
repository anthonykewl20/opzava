export type TaskCardAssistantTurnStatus =
  "queued" | "streaming" | "finalizing" | "final" | "failed";

export type TaskCardToolOutcomeStatus = "started" | "succeeded" | "failed";

export interface TaskCardToolOutcomeView {
  readonly id: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly status: TaskCardToolOutcomeStatus;
  readonly requestSummary: Readonly<Record<string, unknown>>;
  readonly resultSummary: Readonly<Record<string, unknown>>;
  readonly targetRef: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface TaskCardAssistantRunView {
  readonly turnId: string;
  readonly status: TaskCardAssistantTurnStatus;
  readonly text: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finalizedAt: string | null;
  readonly outcomes: readonly TaskCardToolOutcomeView[];
}

export interface TaskCardAiRunStep {
  readonly id: string;
  readonly state: "queued" | "working" | "succeeded" | "failed";
  readonly text: string;
  readonly timestamp: string;
}

export interface TaskCardAiRunProjection {
  readonly steps: readonly TaskCardAiRunStep[];
  readonly live: boolean;
  readonly elapsedLabel: string | null;
}

function elapsedLabel(startedAt: string, now: Date): string {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) {
    return "live";
  }

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function outcomeText(outcome: TaskCardToolOutcomeView): string {
  if (outcome.status === "started") {
    return `Started ${outcome.toolName}.`;
  }

  if (outcome.status === "failed") {
    const message = outcome.resultSummary["message"];
    return `Tool ${outcome.toolName} failed${typeof message === "string" ? `: ${message}` : "."}`;
  }

  const kind = outcome.resultSummary["kind"];
  if (kind === "tasks.create") {
    return "Created a task card.";
  }

  if (kind === "tasks.update") {
    return "Updated this task card.";
  }

  if (kind === "tasks.list") {
    return "Listed the workspace tasks.";
  }

  return `Completed ${outcome.toolName}.`;
}

export function projectTaskCardAiRun(
  runs: readonly TaskCardAssistantRunView[],
  now: Date = new Date(),
): TaskCardAiRunProjection {
  const steps: TaskCardAiRunStep[] = [];
  let liveStartedAt: string | null = null;

  for (const run of runs) {
    const live =
      run.status === "queued" || run.status === "streaming" || run.status === "finalizing";
    if (live && liveStartedAt === null) {
      liveStartedAt = run.createdAt;
    }

    steps.push({
      id: `${run.turnId}:turn`,
      state: run.status === "failed" ? "failed" : live ? "working" : "succeeded",
      text:
        run.status === "queued"
          ? "Assistant queued a reply for this card."
          : run.status === "streaming"
            ? "Assistant is replying on this card."
            : run.status === "finalizing"
              ? "Assistant is finalizing the reply."
              : run.status === "failed"
                ? "Assistant run failed."
                : "Assistant finished the reply.",
      timestamp: run.updatedAt,
    });

    for (const outcome of run.outcomes) {
      steps.push({
        id: `${run.turnId}:${outcome.id}`,
        state:
          outcome.status === "started"
            ? "working"
            : outcome.status === "failed"
              ? "failed"
              : "succeeded",
        text: outcomeText(outcome),
        timestamp: outcome.completedAt ?? outcome.updatedAt,
      });
    }

    if (run.text.trim() !== "" && run.status === "final") {
      steps.push({
        id: `${run.turnId}:message`,
        state: "succeeded",
        text: "Saved the assistant reply for this card.",
        timestamp: run.finalizedAt ?? run.updatedAt,
      });
    }
  }

  return {
    steps,
    live: liveStartedAt !== null,
    elapsedLabel: liveStartedAt === null ? null : elapsedLabel(liveStartedAt, now),
  };
}
