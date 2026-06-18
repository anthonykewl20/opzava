import { describe, it, expect } from 'vitest';
import {
  createVaTaskReviewStepService,
  createMockVaTaskReviewProvider,
  parseVaTaskReviewInput,
  assertVaTaskReviewVerdict,
  type VaTaskReviewProvider,
  type VaTaskReviewStepDeps,
} from './va-task-review-service';

const validInput = {
  taskDraftArtifactId: 'va-1',
  summary: 'Travel booked',
  sourceStepRunId: 'step-2',
};

function deps(provider?: VaTaskReviewProvider): VaTaskReviewStepDeps {
  return {
    provider: provider ?? createMockVaTaskReviewProvider(),
    newId: () => 'var-1',
    now: () => '2026-07-01T00:00:00.000Z',
  };
}

describe('va-task-review-service', () => {
  it('produces a passed va-task-review artifact by default', () => {
    const art = createVaTaskReviewStepService(deps()).run(validInput);
    expect(art.artifactType).toBe('va-task-review');
    expect(art.lineage.inputArtifactIds).toEqual(['va-1']);
    const c = art.content as unknown as { status: string; issues: unknown[] };
    expect(c.status).toBe('passed');
    expect(c.issues).toEqual([]);
  });

  it('produces a rejected review with issues', () => {
    const provider: VaTaskReviewProvider = () => ({
      status: 'rejected',
      issues: [{ code: 'incomplete', reason: 'Missing the return leg.' }],
    });
    const art = createVaTaskReviewStepService(deps(provider)).run(validInput);
    const c = art.content as unknown as { status: string; issues: { reason: string }[] };
    expect(c.status).toBe('rejected');
    expect(c.issues[0].reason).toBe('Missing the return leg.');
  });

  it('assertVaTaskReviewVerdict rejects a passed verdict with issues', () => {
    expect(() =>
      assertVaTaskReviewVerdict({
        status: 'passed',
        issues: [{ code: 'x', reason: 'y' }],
      }),
    ).toThrow(/passed va task review must have no issues/);
  });

  it('assertVaTaskReviewVerdict rejects a rejected verdict with no issues', () => {
    expect(() =>
      assertVaTaskReviewVerdict({ status: 'rejected', issues: [] }),
    ).toThrow(/rejected va task review must list issues/);
  });

  it('assertVaTaskReviewVerdict rejects a rejected issue missing a reason', () => {
    expect(() =>
      assertVaTaskReviewVerdict({
        status: 'rejected',
        issues: [{ code: 'x', reason: '' }],
      }),
    ).toThrow();
  });

  it('parseVaTaskReviewInput rejects a missing field', () => {
    expect(() =>
      parseVaTaskReviewInput({ taskDraftArtifactId: 'a', summary: 's' }),
    ).toThrow(/invalid va task review input/);
  });
});
