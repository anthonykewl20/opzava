import type { TaskCardAssistantRunView, TaskCardToolOutcomeView } from "@/lib/task-card-ai-run-view";
import type {
  TaskEvidenceDto,
  TaskQualityCheckDto,
  TaskQualityReviewDto,
} from "@opzava/project-management";

export const taskEvidenceMaxUploadBytes = 25 * 1024 * 1024;

export interface SizeCapResult {
  readonly ok: boolean;
  readonly message: string | null;
}

export interface QualityReviewProjection {
  readonly remainingCount: number;
  readonly itemLeftLabel: string;
  readonly hasChangesRequested: boolean;
  readonly canApprove: boolean;
}

export interface AssistantPrecheckProjection {
  readonly id: string;
  readonly label: string;
  readonly state: "pass" | "fail";
  readonly actor: string;
}

export type EvidenceUploadState =
  "idle" | "too_large" | "preparing" | "uploading" | "complete" | "degraded";

export function evidenceCountLabel(evidence: readonly TaskEvidenceDto[]): string {
  return evidence.length === 0
    ? "0 items"
    : `${evidence.length} item${evidence.length === 1 ? "" : "s"}`;
}

export function evidenceSizeLabel(sizeBytes: number | null): string {
  if (sizeBytes === null) {
    return "Link";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 102.4) / 10} KB`;
  }

  return `${Math.round(sizeBytes / 1024 / 102.4) / 10} MB`;
}

export function validateEvidenceUploadSize(sizeBytes: number): SizeCapResult {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return { ok: false, message: "File size is unavailable." };
  }

  if (sizeBytes > taskEvidenceMaxUploadBytes) {
    return { ok: false, message: "File is too large. Uploads are capped at 25 MB." };
  }

  return { ok: true, message: null };
}

export function evidenceProvenanceLabel(input: {
  readonly source: "assistant" | "upload" | "link";
  readonly assistantName?: string;
}): string {
  if (input.source === "assistant") {
    return `Drafted by ${input.assistantName ?? "Ask Admin Opzava"}`;
  }

  return input.source === "link" ? "Attached from link" : "Attached from upload";
}

export function qualityReviewProjection(
  review: TaskQualityReviewDto | null,
): QualityReviewProjection {
  if (review === null) {
    return {
      remainingCount: 0,
      itemLeftLabel: "0 items left",
      hasChangesRequested: false,
      canApprove: true,
    };
  }

  const remainingCount = review.checks.filter((check) => check.state !== "pass").length;
  const hasChangesRequested =
    review.status === "changes_requested" || review.checks.some((check) => check.state === "fail");

  return {
    remainingCount,
    itemLeftLabel: `${remainingCount} item${remainingCount === 1 ? "" : "s"} left`,
    hasChangesRequested,
    canApprove: remainingCount === 0 && review.status !== "approved",
  };
}

function outcomePrecheckState(outcome: TaskCardToolOutcomeView): "pass" | "fail" | null {
  if (outcome.status === "succeeded") {
    return "pass";
  }

  if (outcome.status === "failed") {
    return "fail";
  }

  return null;
}

export function assistantPrechecksFromRuns(
  runs: readonly TaskCardAssistantRunView[],
): readonly AssistantPrecheckProjection[] {
  const projected: AssistantPrecheckProjection[] = [];

  for (const run of runs) {
    for (const outcome of run.outcomes) {
      const state = outcomePrecheckState(outcome);
      if (state === null) {
        continue;
      }

      projected.push({
        id: `${run.turnId}:${outcome.id}`,
        label: `Assistant ${state === "pass" ? "completed" : "failed"} ${outcome.toolName}`,
        state,
        actor: "Ask Admin Opzava",
      });
    }
  }

  return projected;
}

export function applyQualityCheckState(
  checks: readonly TaskQualityCheckDto[],
  checkId: string,
  state: TaskQualityCheckDto["state"],
): readonly TaskQualityCheckDto[] {
  return checks.map((check) =>
    check.id === checkId
      ? {
          ...check,
          state,
        }
      : check,
  );
}
