import type { Approval } from '@/opzava/core/approvals/contracts'
import type {
  DisplayLabel,
  HealthFacet,
  NeedsYouRollup,
} from '@/opzava/platform/project-health/needs-you-rollup'

// composeDigest — the deterministic `{digest}` action-block (ARD 0028 Q8; CONTEXT.md "Digest").
// The server composes the FACTS here; the Concierge model only narrates around them (never invents
// numbers). Honest mixed-altitude: per-project rows come from the rollup (tasks, which have a
// project_id); pendingApprovals are fleet-global (approvals carry no project_id), surfaced as their
// own cards rather than faked into a project.

export interface DigestProjectRow {
  readonly projectId: string
  readonly health: HealthFacet
  readonly displayLabel: DisplayLabel
}

export interface DigestApprovalCard {
  readonly approvalId: string
  readonly requestedAction: string
  readonly targetId: string
}

export interface DigestBlock {
  readonly kind: 'digest'
  readonly summary: Readonly<{ needsYou: number; blocked: number; totalProjects: number }>
  readonly projects: readonly DigestProjectRow[]
  readonly pendingApprovals: readonly DigestApprovalCard[]
}

export function composeDigest(
  rollup: NeedsYouRollup,
  pendingApprovals: readonly Approval[],
): DigestBlock {
  return Object.freeze({
    kind: 'digest',
    summary: {
      needsYou: rollup.needsYou,
      blocked: rollup.blocked,
      totalProjects: rollup.projects.length,
    },
    projects: rollup.projects.map((p) => ({
      projectId: p.projectId,
      health: p.health,
      displayLabel: p.displayLabel,
    })),
    pendingApprovals: pendingApprovals
      .filter((a) => a.status === 'requested')
      .map((a) => ({
        approvalId: a.approvalId,
        requestedAction: a.requestedAction,
        targetId: a.target.id,
      })),
  })
}
