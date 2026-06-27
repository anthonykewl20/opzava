import { describe, expect, it } from 'vitest'

import type { NeedsYouRollup, ProjectHealth } from '@/opzava/platform/project-health/needs-you-rollup'
import type { Approval } from '@/opzava/core/approvals/contracts'
import { composeDigest } from './digest'

function project(projectId: string, health: ProjectHealth['health']): ProjectHealth {
  return {
    projectId,
    name: `Project ${projectId}`,
    health,
    activity: 'idle',
    displayLabel: health ?? 'idle',
    summary: 'On track',
  }
}

function rollup(projects: ProjectHealth[]): NeedsYouRollup {
  let needsYou = 0
  let blocked = 0
  for (const p of projects) {
    if (p.health === 'blocked') blocked += 1
    else if (p.health === 'needs_you') needsYou += 1
  }
  return { needsYou, blocked, projects }
}

function requestedApproval(id: string, action: string, targetId: string): Approval {
  return {
    schemaVersion: 1,
    approvalId: id,
    requestedAction: action,
    target: { kind: 'external-action', id: targetId },
    status: 'requested',
    requesterId: 'system',
    approverId: null,
    decisionReason: null,
    requestedAt: 't',
    decidedAt: null,
    expiresAt: null,
    correlation: null,
  }
}

describe('composeDigest (deterministic, honest mixed-altitude)', () => {
  it('summarises per-project health and surfaces pending approvals as cards', () => {
    const digest = composeDigest(
      rollup([project('p1', 'needs_you'), project('p2', 'blocked'), project('p3', null)]),
      [requestedApproval('apr-1', 'campaign.send', 'campaign-send:c1')],
    )
    expect(digest.kind).toBe('digest')
    expect(digest.summary).toEqual({ needsYou: 1, blocked: 1, totalProjects: 3 })
    expect(digest.projects.map((p) => p.projectId)).toEqual(['p1', 'p2', 'p3'])
    expect(digest.pendingApprovals).toEqual([
      { approvalId: 'apr-1', requestedAction: 'campaign.send', targetId: 'campaign-send:c1' },
    ])
  })

  it('reports an all-clear digest when nothing needs you and no approvals pend', () => {
    const digest = composeDigest(rollup([project('p1', null)]), [])
    expect(digest.summary).toEqual({ needsYou: 0, blocked: 0, totalProjects: 1 })
    expect(digest.pendingApprovals).toEqual([])
  })

  it('includes only requested approvals (a decided one is not pending)', () => {
    const decided: Approval = { ...requestedApproval('apr-2', 'campaign.send', 'c2'), status: 'approved', approverId: 'admin', decisionReason: 'ok', decidedAt: 't1' }
    const digest = composeDigest(rollup([]), [requestedApproval('apr-1', 'campaign.send', 'c1'), decided])
    expect(digest.pendingApprovals.map((a) => a.approvalId)).toEqual(['apr-1'])
  })
})
