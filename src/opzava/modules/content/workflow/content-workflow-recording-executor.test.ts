import { describe, expect, it } from 'vitest'
import type { OperationalEventStorageRecord } from '@/opzava/platform/runner/repository-contracts'
import { createMockSeoBriefProvider } from '../steps/seo-brief-provider'
import { createMockOutlineProvider } from '../steps/outline-provider'
import { createMockBrandReviewProvider } from '../steps/brand-review-provider'
import { createMockAntiSlopReviewProvider } from '../steps/anti-slop-review-provider'
import { createMockHumanApprovalProvider, type HumanApprovalProvider } from '../steps/human-approval-provider'
import { createMockWordpressDraftProvider } from '../steps/wordpress-draft-provider'
import {
  createMockContentWorkflowProviderAdapters,
  runContentWorkflowWithRecording,
  type ContentWorkflowRecordingDeps,
} from './content-workflow-recording-executor'

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
    appendOperationalEvent: (record: OperationalEventStorageRecord) => {
      events.push(record)
    },
  }
}

function deps(humanApproval: HumanApprovalProvider = createMockHumanApprovalProvider()): ContentWorkflowRecordingDeps {
  let n = 0
  const now = () => '2026-06-17T00:00:00.000Z'

  return {
    adapters: createMockContentWorkflowProviderAdapters({ now }),
    transformProviders: {
      seoBrief: createMockSeoBriefProvider(),
      outline: createMockOutlineProvider(),
      brandReview: createMockBrandReviewProvider(),
      antiSlopReview: createMockAntiSlopReviewProvider(),
      humanApproval,
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

describe('runContentWorkflowWithRecording', () => {
  it('runs the full workflow with recording and produces a draft-only request', async () => {
    const result = await runContentWorkflowWithRecording(deps(), RAW_IDEA)

    expect(result.wordpressDraftRequest.status).toBe('draft')
    expect(result.keywordResearch.artifactType).toBe('keyword-research')
    expect(result.sourceCapture.artifactType).toBe('source-capture')
    expect(result.seoBrief.artifactType).toBe('seo-brief')
    expect(result.outline.artifactType).toBe('outline')
    expect(result.articleDraft.artifactType).toBe('article-draft')
    expect(result.factCheckReport.artifactType).toBe('fact-check-report')
    expect(result.brandReview.artifactType).toBe('brand-review')
    expect(result.antiSlopReview.artifactType).toBe('anti-slop-review')
    expect(result.approval.status).toBe('approved')
  })

  it('emits operational events for all four provider-call steps', async () => {
    const events = sink()
    const recordingDeps = { ...deps(), eventSink: events }
    await runContentWorkflowWithRecording(recordingDeps, RAW_IDEA)

    expect(events.events.filter((event) => event.kind === 'external-call')).toHaveLength(4)
    expect(events.events.filter((event) => event.kind === 'cost')).toHaveLength(4)
    expect(events.events.filter((event) => event.kind === 'audit')).toHaveLength(4)
    expect(events.events).toHaveLength(12)
  })

  it('halts before the external action when approval is not granted', async () => {
    const rejectingApproval: HumanApprovalProvider = () => ({
      status: 'rejected',
      approverId: 'editor@opzava.test',
      decisionReason: 'Off-brand and unsupported claims',
    })

    await expect(runContentWorkflowWithRecording(deps(rejectingApproval), RAW_IDEA)).rejects.toThrow(/approval not granted/)
  })
})
