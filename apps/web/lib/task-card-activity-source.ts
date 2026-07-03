import type { getCardDetail, listTasks } from "@opzava/project-management";
import {
  getCardDetail as defaultGetCardDetail,
  listTasks as defaultListTasks,
} from "@opzava/project-management";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  assistantActivityState,
  diffTaskCardActivitySnapshots,
  type TaskCardActivityEvent,
  type TaskCardActivitySnapshot,
} from "@/lib/task-card-activity";
import { listTaskCardAssistantRuns, type TaskCardAssistantRunView } from "@/lib/task-card-ai-run";
import { actorFromSessionContext } from "@/lib/task-card-detail";
import { parseCardNumberRouteSegment } from "@/lib/task-card-format";
import type { AppSessionContext } from "@/lib/session";

export interface TaskCardActivitySourceDependencies {
  readonly listTasks: typeof listTasks;
  readonly getCardDetail: typeof getCardDetail;
  readonly listTaskCardAssistantRuns: typeof listTaskCardAssistantRuns;
  readonly pollIntervalMs: number;
}

export const defaultTaskCardActivitySourceDependencies: TaskCardActivitySourceDependencies = {
  listTasks: defaultListTasks,
  getCardDetail: defaultGetCardDetail,
  listTaskCardAssistantRuns,
  pollIntervalMs: 1000,
};

function activityError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export async function loadTaskCardActivitySnapshot(
  context: AppSessionContext,
  cardId: string,
  dependencies: Pick<
    TaskCardActivitySourceDependencies,
    "listTasks" | "getCardDetail" | "listTaskCardAssistantRuns"
  > = defaultTaskCardActivitySourceDependencies,
): Promise<Result<TaskCardActivitySnapshot>> {
  const cardNumber = parseCardNumberRouteSegment(cardId);
  if (cardNumber === null) {
    return err(activityError("web.taskCardNotFound", "Task card was not found."));
  }

  const actor = actorFromSessionContext(context);
  const tasks = await dependencies.listTasks({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor,
  });
  if (!tasks.ok) {
    return err(tasks.error);
  }

  const task = tasks.value.find((candidate) => candidate.cardNumber === cardNumber);
  if (task === undefined) {
    return err(activityError("web.taskCardNotFound", "Task card was not found."));
  }

  const card = await dependencies.getCardDetail({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor,
    taskId: task.id,
  });
  if (!card.ok) {
    return err(card.error);
  }

  let runs: readonly TaskCardAssistantRunView[];
  try {
    runs = await dependencies.listTaskCardAssistantRuns(context, task.id);
  } catch (error) {
    return err(
      activityError(
        "web.taskCardActivityLoadFailed",
        "Task card assistant activity could not be loaded.",
        error,
      ),
    );
  }

  return ok({
    comments: card.value.comments,
    steps: card.value.steps,
    runs,
  });
}

export async function* pollTaskCardActivityEvents(
  context: AppSessionContext,
  cardId: string,
  signal: AbortSignal,
  dependencies: TaskCardActivitySourceDependencies = defaultTaskCardActivitySourceDependencies,
): AsyncIterable<TaskCardActivityEvent> {
  const first = await loadTaskCardActivitySnapshot(context, cardId, dependencies);
  if (!first.ok) {
    throw first.error;
  }

  let previous = first.value;
  yield {
    type: "assistant-state",
    state: assistantActivityState(previous.runs),
    runs: previous.runs,
  };

  while (!signal.aborted) {
    await sleep(dependencies.pollIntervalMs, signal);
    if (signal.aborted) {
      break;
    }

    const next = await loadTaskCardActivitySnapshot(context, cardId, dependencies);
    if (!next.ok) {
      // A transient snapshot error (momentary DB blip, brief authz race) must
      // NOT terminate the live stream — that would wipe the already-loaded
      // AI-Run trace and latch a false "assistant run failed". Skip this tick
      // and keep the last-known state; the next poll self-heals on recovery.
      continue;
    }

    for (const event of diffTaskCardActivitySnapshots(previous, next.value)) {
      yield event;
    }
    previous = next.value;
  }
}
