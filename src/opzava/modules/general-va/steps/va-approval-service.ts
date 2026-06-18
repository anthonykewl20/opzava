import { parseApproval, type Approval } from '@/opzava/core/approvals/contracts';

export type VaApprovalDecision = Readonly<{
  status: 'approved' | 'rejected';
  approverId: string;
  decisionReason: string;
}>;

export type VaApprovalProvider = (
  input: Readonly<{ taskDraftArtifactId: string }>,
) => VaApprovalDecision;

export type VaApprovalStepInput = Readonly<{
  taskDraftArtifactId: string;
  requesterId: string;
  requestedAt: string;
}>;

export function parseVaApprovalStepInput(payload: unknown): VaApprovalStepInput {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('invalid va approval input');
  }
  const p = payload as Record<string, unknown>;
  const taskDraftArtifactId = p['taskDraftArtifactId'];
  const requesterId = p['requesterId'];
  const requestedAt = p['requestedAt'];
  if (typeof taskDraftArtifactId !== 'string' || taskDraftArtifactId.length === 0) {
    throw new Error('invalid va approval input');
  }
  if (typeof requesterId !== 'string' || requesterId.length === 0) {
    throw new Error('invalid va approval input');
  }
  if (typeof requestedAt !== 'string' || requestedAt.length === 0) {
    throw new Error('invalid va approval input');
  }
  return Object.freeze({ taskDraftArtifactId, requesterId, requestedAt });
}

export function createMockVaApprovalProvider(): VaApprovalProvider {
  return () =>
    Object.freeze({
      status: 'approved' as const,
      approverId: 'va-lead@opzava.test',
      decisionReason: 'Task completed to spec.',
    });
}

export type VaApprovalStepDeps = Readonly<{
  provider: VaApprovalProvider;
  newId: () => string;
  now: () => string;
}>;

export function createVaApprovalStepService(
  deps: VaApprovalStepDeps,
): Readonly<{ run: (payload: unknown) => Approval }> {
  return Object.freeze({
    run(payload: unknown): Approval {
      const input = parseVaApprovalStepInput(payload);
      const decision = deps.provider({ taskDraftArtifactId: input.taskDraftArtifactId });
      return parseApproval({
        schemaVersion: 1,
        approvalId: deps.newId(),
        requestedAction: 'va-task-complete',
        target: { kind: 'artifact', id: input.taskDraftArtifactId },
        status: decision.status,
        requesterId: input.requesterId,
        approverId: decision.approverId,
        decisionReason: decision.decisionReason,
        requestedAt: input.requestedAt,
        decidedAt: deps.now(),
        expiresAt: null,
      });
    },
  });
}
