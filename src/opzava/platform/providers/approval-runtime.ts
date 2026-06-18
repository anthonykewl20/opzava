import { isApprovalGranted, type Approval } from '../../core/approvals/contracts'
import type { ProviderAdapterRequest } from './contracts'

export type ProviderExecutionApprovalError =
  | Readonly<{ kind: 'approval-missing', providerId: string, operation: string }>
  | Readonly<{ kind: 'approval-not-granted', approvalId: string, status: Approval['status'] }>
  | Readonly<{ kind: 'approval-expired', approvalId: string, expiredAt: string }>
  | Readonly<{ kind: 'approval-expiry-required', approvalId: string }>
  | Readonly<{ kind: 'approval-target-mismatch', approvalId: string, expectedTarget: Readonly<{ kind: 'external-action', id: string }> }>
  | Readonly<{ kind: 'approval-action-mismatch', approvalId: string, expectedAction: string }>
  | Readonly<{ kind: 'approval-target-invalid', reason: 'empty' | 'too-long' }>

export type ProviderExecutionApprovalGrant = Readonly<{
  approvalId: string
  providerId: string
  operation: string
  approvalTargetId: string
  requestedAction: string
  expiresAt: string
}>

export type ProviderExecutionApprovalDecision =
  | Readonly<{ ok: true, value: ProviderExecutionApprovalGrant }>
  | Readonly<{ ok: false, error: ProviderExecutionApprovalError }>

export type ProviderExecutionApprovalInput = Readonly<{
  request: ProviderAdapterRequest
  approval: Approval | null
  approvalTargetId: string
  requestedAction: string
  now: Date
}>

export function evaluateProviderExecutionApproval(
  input: ProviderExecutionApprovalInput,
): ProviderExecutionApprovalDecision {
  const targetValidation = validateApprovalTargetId(input.approvalTargetId)
  if (!targetValidation.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'approval-target-invalid',
        reason: targetValidation.reason,
      }),
    })
  }

  if (input.approval === null) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'approval-missing',
        providerId: input.request.providerProfile.providerId,
        operation: input.request.operation,
      }),
    })
  }

  const approval = input.approval
  if (!isApprovalGranted(approval)) {
    return Object.freeze({
      ok: false,
      error: createNotGrantedError(approval),
    })
  }

  if (approval.target.kind !== 'external-action' || approval.target.id !== input.approvalTargetId) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'approval-target-mismatch',
        approvalId: approval.approvalId,
        expectedTarget: Object.freeze({
          kind: 'external-action',
          id: input.approvalTargetId,
        }),
      }),
    })
  }

  if (approval.requestedAction !== input.requestedAction) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'approval-action-mismatch',
        approvalId: approval.approvalId,
        expectedAction: input.requestedAction,
      }),
    })
  }

  if (approval.expiresAt === null) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'approval-expiry-required',
        approvalId: approval.approvalId,
      }),
    })
  }

  // The approval remains valid through the exact expiresAt instant.
  if (new Date(approval.expiresAt).getTime() < input.now.getTime()) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'approval-expired',
        approvalId: approval.approvalId,
        expiredAt: approval.expiresAt,
      }),
    })
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      approvalId: approval.approvalId,
      providerId: input.request.providerProfile.providerId,
      operation: input.request.operation,
      approvalTargetId: input.approvalTargetId,
      requestedAction: input.requestedAction,
      expiresAt: approval.expiresAt,
    }),
  })
}

type ApprovalTargetIdValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false, reason: 'empty' | 'too-long' }>

function validateApprovalTargetId(approvalTargetId: string): ApprovalTargetIdValidation {
  // Match the existing approval target id bounds without inventing an id format here.
  if (approvalTargetId.length === 0) {
    return Object.freeze({ ok: false, reason: 'empty' })
  }

  if (approvalTargetId.length > 120) {
    return Object.freeze({ ok: false, reason: 'too-long' })
  }

  return Object.freeze({ ok: true })
}

function createNotGrantedError(approval: Approval): ProviderExecutionApprovalError {
  if (approval.status === 'expired') {
    return Object.freeze({
      kind: 'approval-expired',
      approvalId: approval.approvalId,
      expiredAt: approval.expiresAt ?? approval.requestedAt,
    })
  }

  return Object.freeze({
    kind: 'approval-not-granted',
    approvalId: approval.approvalId,
    status: approval.status,
  })
}
