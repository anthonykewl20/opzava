import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import type { OperationalEventStorageRecord } from '@/opzava/platform/runner/repository-contracts'
import { createMockSeoBriefProvider } from '../steps/seo-brief-provider'
import { createMockOutlineProvider } from '../steps/outline-provider'
import { createMockBrandReviewProvider } from '../steps/brand-review-provider'
import { createMockAntiSlopReviewProvider } from '../steps/anti-slop-review-provider'
import { createMockHumanApprovalProvider } from '../steps/human-approval-provider'
import { createMockWordpressDraftProvider } from '../steps/wordpress-draft-provider'
import { createMockContentWorkflowProviderAdapters, type ContentWorkflowRecordingDeps } from './content-workflow-recording-executor'
import { createArtifactRepository } from '../artifacts/artifact-repository'
import { runAndRecordContentWorkflow } from './run-and-record-content-workflow'

const RAW_IDEA = Object.freeze({
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'Cold Brew Guide',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z',
})

function sink() {
  const events: OperationalEventStorageRecord[] = []
  return {
    events,
    appendOperationalEvent: (r: OperationalEventStorageRecord) => {
      events.push(r)
    },
  }
}

function baseDeps(): ContentWorkflowRecordingDeps {
  const now = () => '2026-06-17T00:00:00.000Z'
  let n = 0
  return {
    adapters: createMockContentWorkflowProviderAdapters({ now }),
    transformProviders: {
      seoBrief: createMockSeoBriefProvider(),
      outline: createMockOutlineProvider(),
      brandReview: createMockBrandReviewProvider(),
      antiSlopReview: createMockAntiSlopReviewProvider(),
      humanApproval: createMockHumanApprovalProvider(),
      wordpressDraft: createMockWordpressDraftProvider(),
    },
    eventSink: sink(),
    newId: () => `id_${++n}`,
    now,
    actorId: 'system@opzava',
    requesterId: 'system@opzava',
    clock: { now: () => new Date('2026-06-17T00:00:00.000Z') },
  }
}

describe('runAndRecordContentWorkflow', () => {
  it('persists every produced artifact into the repository', async () => {
    const db = new Database(':memory:')
    const repository = createArtifactRepository(db)
    const out = await runAndRecordContentWorkflow({ ...baseDeps(), repository }, RAW_IDEA)
    expect(out.recordedArtifactIds.length).toBe(8)
    for (const id of out.recordedArtifactIds) {
      expect(repository.getArtifactById(id)).not.toBeNull()
    }
    expect(repository.listArtifacts().length).toBe(8)
  })

  it('associates artifacts with the run id derived from the idea', async () => {
    const db = new Database(':memory:')
    const repository = createArtifactRepository(db)
    await runAndRecordContentWorkflow({ ...baseDeps(), repository }, RAW_IDEA)
    expect(
      repository.listArtifacts({ workflowRunId: 'content-workflow:idea_001' }).length,
    ).toBe(8)
  })

  it('returns the workflow result unchanged alongside the recorded ids', async () => {
    const db = new Database(':memory:')
    const repository = createArtifactRepository(db)
    const out = await runAndRecordContentWorkflow({ ...baseDeps(), repository }, RAW_IDEA)
    expect(out.result.ideaIntake.ideaId).toBe('idea_001')
    expect(out.result.wordpressDraftRequest).toBeDefined()
  })
})
