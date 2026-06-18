import { createGeneralVaArtifact } from '../artifacts/general-va-artifact';
import { type Artifact } from '@/opzava/core/artifacts/contracts';

export type VaTaskDraftInput = Readonly<{
  taskIntakeArtifactId: string;
  request: string;
  sourceStepRunId: string;
}>;

export type VaTaskDraft = Readonly<{
  summary: string;
  steps: readonly string[];
}>;

export type VaTaskDraftProvider = (input: VaTaskDraftInput) => VaTaskDraft;

export function parseVaTaskDraftInput(payload: unknown): VaTaskDraftInput {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('invalid va task draft input');
  }
  const record = payload as Record<string, unknown>;
  const taskIntakeArtifactId = record['taskIntakeArtifactId'];
  const request = record['request'];
  const sourceStepRunId = record['sourceStepRunId'];
  if (typeof taskIntakeArtifactId !== 'string' || taskIntakeArtifactId.length === 0) {
    throw new Error('invalid va task draft input');
  }
  if (typeof request !== 'string' || request.length === 0) {
    throw new Error('invalid va task draft input');
  }
  if (typeof sourceStepRunId !== 'string' || sourceStepRunId.length === 0) {
    throw new Error('invalid va task draft input');
  }
  return Object.freeze({
    taskIntakeArtifactId,
    request,
    sourceStepRunId,
  });
}

export function createMockVaTaskDraftProvider(): VaTaskDraftProvider {
  return (input) =>
    Object.freeze({
      summary: `Plan: ${input.request}`,
      steps: Object.freeze(['Clarify the request', 'Do the work', 'Report back']),
    });
}

export type VaTaskDraftStepDeps = Readonly<{
  provider: VaTaskDraftProvider;
  newId: () => string;
  now: () => string;
}>;

export function createVaTaskDraftStepService(
  deps: VaTaskDraftStepDeps,
): Readonly<{ run: (payload: unknown) => Artifact }> {
  return Object.freeze({
    run: (payload: unknown): Artifact => {
      const input = parseVaTaskDraftInput(payload);
      const draft = deps.provider(input);
      return createGeneralVaArtifact({
        artifactId: deps.newId(),
        artifactType: 'va-task-draft',
        sourceStepRunId: input.sourceStepRunId,
        content: draft,
        inputArtifactIds: [input.taskIntakeArtifactId],
        validatedAt: deps.now(),
      });
    },
  });
}
