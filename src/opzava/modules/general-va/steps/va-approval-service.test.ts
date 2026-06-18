import { describe, it, expect } from 'vitest';
import {
  createVaApprovalStepService,
  createMockVaApprovalProvider,
  parseVaApprovalStepInput,
  type VaApprovalProvider,
} from './va-approval-service';

function deps(provider?: VaApprovalProvider) {
  return {
    provider: provider ?? createMockVaApprovalProvider(),
    newId: () => 'apr-va-1',
    now: () => '2026-07-02T00:00:00.000Z',
  };
}

const validInput = {
  taskDraftArtifactId: 'va-1',
  requesterId: 'system',
  requestedAt: '2026-07-01T00:00:00.000Z',
};

describe('va-approval-service', () => {
  it('produces an approved Approval targeting the task draft', () => {
    const ap = createVaApprovalStepService(deps()).run(validInput);
    expect(ap.status).toBe('approved');
    expect(ap.target).toEqual({ kind: 'artifact', id: 'va-1' });
    expect(ap.requestedAction).toBe('va-task-complete');
    expect(ap.approverId).toBe('va-lead@opzava.test');
    expect(ap.decidedAt).toBe('2026-07-02T00:00:00.000Z');
    expect(ap.approvalId).toBe('apr-va-1');
  });

  it('produces a rejected Approval with the decision reason', () => {
    const provider: VaApprovalProvider = () => ({
      status: 'rejected',
      approverId: 'va-lead@opzava.test',
      decisionReason: 'Needs the receipts attached.',
    });
    const ap = createVaApprovalStepService(deps(provider)).run(validInput);
    expect(ap.status).toBe('rejected');
    expect(ap.decisionReason).toBe('Needs the receipts attached.');
    expect(ap.approverId).toBe('va-lead@opzava.test');
  });

  it('the result is a frozen Approval (not an Artifact)', () => {
    const ap = createVaApprovalStepService(deps()).run(validInput);
    expect(Object.isFrozen(ap)).toBe(true);
    expect(ap).not.toHaveProperty('artifactType');
    expect(ap).toHaveProperty('approvalId');
  });

  it('parseVaApprovalStepInput rejects a missing field', () => {
    expect(() =>
      parseVaApprovalStepInput({ taskDraftArtifactId: 'a', requesterId: 'r' }),
    ).toThrow(/invalid va approval input/);
  });

  it('createMockVaApprovalProvider returns a deterministic approved decision', () => {
    const d = createMockVaApprovalProvider()({ taskDraftArtifactId: 'x' });
    expect(d.status).toBe('approved');
    expect(d.approverId).toBeTruthy();
    expect(d.decisionReason).toBeTruthy();
  });
});
