import { z } from 'zod'

export const APPROVAL_CONTRACT_SCHEMA_VERSION = 1 as const

export const approvalStatusSchema = z.enum([
  'requested',
  'approved',
  'rejected',
  'expired',
  'cancelled',
])

export type ApprovalStatus = z.infer<typeof approvalStatusSchema>

const approvalTargetSchema = z.object({
  kind: z.enum(['artifact', 'external-action']),
  id: z.string().min(1).max(120),
}).strict()

export const approvalSchema = z.object({
  schemaVersion: z.literal(APPROVAL_CONTRACT_SCHEMA_VERSION),
  approvalId: z.string().min(1).max(120),
  requestedAction: z.string().min(1).max(120),
  target: approvalTargetSchema,
  status: approvalStatusSchema,
  requesterId: z.string().min(1).max(200),
  approverId: z.string().min(1).max(200).nullable(),
  decisionReason: z.string().min(1).max(500).nullable(),
  requestedAt: z.string().min(1),
  decidedAt: z.string().min(1).nullable(),
  expiresAt: z.string().min(1).nullable(),
}).strict().superRefine((approval, ctx) => {
  if (approval.status === 'requested') {
    requireNoDecisionFields(approval, ctx)
    return
  }

  if (approval.status === 'approved' || approval.status === 'rejected') {
    requireDecisionFields(approval, ctx)
  }
})

const approvalDecisionSchema = z.object({
  status: approvalStatusSchema,
  approverId: z.string().min(1).max(200).nullable(),
  decisionReason: z.string().min(1).max(500).nullable(),
  decidedAt: z.string().min(1).nullable(),
}).strict()

export type Approval = Readonly<z.infer<typeof approvalSchema>>
export type ApprovalDecision = Readonly<z.infer<typeof approvalDecisionSchema>>

const approvalTransitions = {
  requested: ['approved', 'rejected', 'expired', 'cancelled'],
  approved: [],
  rejected: [],
  expired: [],
  cancelled: [],
} satisfies Record<ApprovalStatus, readonly ApprovalStatus[]>

export function parseApproval(input: unknown): Approval {
  return Object.freeze(approvalSchema.parse(input))
}

export function isApprovalGranted(approval: Approval): boolean {
  return approval.status === 'approved'
}

export function transitionApprovalStatus(approval: Approval, input: ApprovalDecision): Approval {
  const decision = approvalDecisionSchema.parse(input)
  const allowedTransitions = approvalTransitions[approval.status] as readonly ApprovalStatus[]

  if (!allowedTransitions.includes(decision.status)) {
    throw new Error(`invalid approval transition: ${approval.status} -> ${decision.status}`)
  }

  return parseApproval({ ...approval, ...decision })
}

function requireDecisionFields(approval: Approval, ctx: z.RefinementCtx): void {
  for (const field of ['approverId', 'decisionReason', 'decidedAt'] as const) {
    if (approval[field] === null) {
      ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required for ${approval.status} approvals` })
    }
  }
}

function requireNoDecisionFields(approval: Approval, ctx: z.RefinementCtx): void {
  for (const field of ['approverId', 'decisionReason', 'decidedAt'] as const) {
    if (approval[field] !== null) {
      ctx.addIssue({ code: 'custom', path: [field], message: `${field} must be empty while approval is requested` })
    }
  }
}
