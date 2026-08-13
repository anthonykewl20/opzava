import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

export const proposalLifecycleStates = [
  "draft",
  "awaiting_decision",
  "accepted",
  "merged",
  "rejected",
] as const;
export type ProposalLifecycleState = (typeof proposalLifecycleStates)[number];

export const blockingAssessments = ["blocking", "non_blocking"] as const;
export type BlockingAssessment = (typeof blockingAssessments)[number];

export interface Proposal {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly version: number;
  readonly lifecycleState: ProposalLifecycleState;
  readonly archivedAt: Date | null;
  readonly discoverySummary: string;
  readonly blockingAssessment: BlockingAssessment;
  readonly suggestedContract: Readonly<Record<string, unknown>>;
  readonly createdCommandId: string;
  readonly acceptedCommandId: string | null;
  readonly acceptedDevTicketId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const lifecycleStateSet = new Set<string>(proposalLifecycleStates);
const blockingAssessmentSet = new Set<string>(blockingAssessments);

function proposalError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

export function normalizeDiscoverySummary(value: string): Result<string> {
  const summary = value.trim().replace(/\s+/g, " ");
  if (summary.length === 0) {
    return err(
      proposalError("dev_board.discovery_summary_required", "Discovery summary is required."),
    );
  }
  if (summary.length > 4000) {
    return err(
      proposalError(
        "dev_board.discovery_summary_too_long",
        "Discovery summary must be 4000 characters or fewer.",
      ),
    );
  }
  return ok(summary);
}

export function parseBlockingAssessment(value: unknown): Result<BlockingAssessment> {
  return typeof value === "string" && blockingAssessmentSet.has(value)
    ? ok(value as BlockingAssessment)
    : err(
        proposalError(
          "dev_board.invalid_blocking_assessment",
          "Blocking assessment must be blocking or non_blocking.",
        ),
      );
}

export function parseProposalLifecycleState(value: unknown): Result<ProposalLifecycleState> {
  return typeof value === "string" && lifecycleStateSet.has(value)
    ? ok(value as ProposalLifecycleState)
    : err(
        proposalError(
          "dev_board.invalid_proposal_lifecycle_state",
          "Proposal lifecycle state is invalid.",
        ),
      );
}
