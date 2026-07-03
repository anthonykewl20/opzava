import type { AskAdminTurnView } from "@/lib/ask-admin-history";
import type { AskAdminDraft, AskAdminStreamState } from "@/lib/ask-admin-stream";

export interface AskOpzavaPromptAction {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly description: string;
}

export interface AskOpzavaStatusView {
  readonly label: string;
  readonly detail: string;
  readonly badgeClassName: string;
  readonly isBusy: boolean;
}

export const askOpzavaPromptActions: readonly AskOpzavaPromptAction[] = [
  {
    id: "summarize-open-tasks",
    label: "Summarize open tasks",
    prompt: "Summarize the open tasks in this workspace and call out blockers.",
    description: "Uses the Opzava task tools to read current workspace task state.",
  },
  {
    id: "create-follow-up-task",
    label: "Create a task",
    prompt:
      'Create a task called "Follow up on the highest priority blocker" with normal priority.',
    description: "Creates through Opzava task tools with the signed-in principal.",
  },
  {
    id: "what-changed-today",
    label: "What changed today?",
    prompt: "What changed in the task board today?",
    description: "Asks the assistant to explain recent task-board changes.",
  },
  {
    id: "next-best-action",
    label: "Next best action",
    prompt: "What is the next best action I should take for this workspace?",
    description: "Asks for a recommendation without granting admin, Docker, or secret access.",
  },
] as const;

export function visibleAskOpzavaTurns(
  turns: readonly AskAdminTurnView[],
): readonly AskAdminTurnView[] {
  return turns.filter((turn) => turn.role !== "system");
}

export function askOpzavaStatusView(status: AskAdminStreamState): AskOpzavaStatusView {
  if (status === "idle") {
    return {
      label: "Ready",
      detail: "The assistant will check the broker and gateway when you send.",
      badgeClassName: "badge",
      isBusy: false,
    };
  }

  if (status === "completed") {
    return {
      label: "Completed",
      detail: "The latest turn finalized and the history will refresh.",
      badgeClassName: "badge badge-success",
      isBusy: false,
    };
  }

  if (status === "gateway_unavailable") {
    return {
      label: "Gateway unavailable",
      detail: "The draft stayed local; retry when the broker is reachable.",
      badgeClassName: "badge badge-warning",
      isBusy: false,
    };
  }

  if (status === "policy_denied") {
    return {
      label: "Policy denied",
      detail: "The assistant was blocked by Opzava policy.",
      badgeClassName: "badge badge-danger",
      isBusy: false,
    };
  }

  if (status === "duplicate_send") {
    return {
      label: "Duplicate send",
      detail: "A turn is already active for this conversation.",
      badgeClassName: "badge badge-warning",
      isBusy: false,
    };
  }

  if (status === "failed") {
    return {
      label: "Failed",
      detail: "The assistant turn failed without exposing raw gateway frames.",
      badgeClassName: "badge badge-danger",
      isBusy: false,
    };
  }

  if (status === "tool_running") {
    return {
      label: "Tool running",
      detail: "Opzava is executing an approved task tool.",
      badgeClassName: "badge badge-accent",
      isBusy: true,
    };
  }

  if (status === "finalizing") {
    return {
      label: "Finalizing",
      detail: "The assistant is writing the durable final message.",
      badgeClassName: "badge badge-warning",
      isBusy: true,
    };
  }

  return {
    label: status === "queued" ? "Queued" : "Working",
    detail: status === "queued" ? "The assistant turn is queued." : "The assistant is replying.",
    badgeClassName: "badge badge-accent",
    isBusy: true,
  };
}

export function askOpzavaDraftTitle(draft: AskAdminDraft): string {
  return askOpzavaStatusView(draft.status).label;
}

export function shouldShowAskOpzavaDraft(draft: AskAdminDraft): boolean {
  return draft.status !== "idle";
}

export function askOpzavaShellSummary(input: {
  readonly turnCount: number;
  readonly workspaceName: string;
  readonly status: AskAdminStreamState;
}): string {
  const status = askOpzavaStatusView(input.status);
  if (input.turnCount === 0) {
    return `${input.workspaceName} workspace assistant is ${status.label.toLowerCase()}; no conversation yet.`;
  }

  return `${input.workspaceName} workspace assistant is ${status.label.toLowerCase()} with ${input.turnCount} persisted turns.`;
}
