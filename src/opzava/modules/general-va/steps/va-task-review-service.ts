import { createGeneralVaArtifact } from '../artifacts/general-va-artifact';
import { type Artifact } from '@/opzava/core/artifacts/contracts';

export type VaTaskReviewInput = Readonly<{
  taskDraftArtifactId: string;
  summary: string;
  sourceStepRunId: string;
}>;

export type VaTaskReviewIssue = Readonly<{
  code: string;
  reason: string;
}>;

export type VaTaskReviewDraft = Readonly<{
  status: 'passed' | 'rejected';
  issues: readonly VaTaskReviewIssue[];
}>;

export type VaTaskReviewProvider = (input: VaTaskReviewInput) => VaTaskReviewDraft;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function parseVaTaskReviewInput(payload: unknown): VaTaskReviewInput {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('invalid va task review input');
  }
  const record = payload as Record<string, unknown>;
  const taskDraftArtifactId = record['taskDraftArtifactId'];
  const summary = record['summary'];
  const sourceStepRunId = record['sourceStepRunId'];
  if (
    !isNonEmptyString(taskDraftArtifactId) ||
    !isNonEmptyString(summary) ||
    !isNonEmptyString(sourceStepRunId)
  ) {
    throw new Error('invalid va task review input');
  }
  return Object.freeze({
    taskDraftArtifactId,
    summary,
    sourceStepRunId,
  });
}

export function assertVaTaskReviewVerdict(draft: VaTaskReviewDraft): VaTaskReviewDraft {
  if (draft.status === 'passed' && draft.issues.length > 0) {
    throw new Error('a passed va task review must have no issues');
  }
  if (draft.status === 'rejected') {
    if (draft.issues.length === 0) {
      throw new Error('a rejected va task review must list issues with reasons');
    }
    for (const issue of draft.issues) {
      if (!isNonEmptyString(issue.code) || !isNonEmptyString(issue.reason)) {
        throw new Error('a rejected va task review must list issues with reasons');
      }
    }
  }
  return draft;
}

export function createMockVaTaskReviewProvider(): VaTaskReviewProvider {
  return () => Object.freeze({ status: 'passed' as const, issues: Object.freeze([]) });
}

export type VaTaskReviewStepDeps = Readonly<{
  provider: VaTaskReviewProvider;
  newId: () => string;
  now: () => string;
}>;

export function createVaTaskReviewStepService(
  deps: VaTaskReviewStepDeps,
): Readonly<{ run: (payload: unknown) => Artifact }> {
  return Object.freeze({
    run(payload: unknown): Artifact {
      const input = parseVaTaskReviewInput(payload);
      const draft = assertVaTaskReviewVerdict(deps.provider(input));
      return createGeneralVaArtifact({
        artifactId: deps.newId(),
        artifactType: 'va-task-review',
        sourceStepRunId: input.sourceStepRunId,
        content: draft,
        inputArtifactIds: [input.taskDraftArtifactId],
        validatedAt: deps.now(),
      });
    },
  });
}
