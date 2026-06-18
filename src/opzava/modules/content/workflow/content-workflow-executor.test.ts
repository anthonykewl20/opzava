import { describe, expect, it } from 'vitest'
import {
  runContentWorkflow,
  createMockContentWorkflowProviders,
  type ContentWorkflowProviders,
} from './content-workflow-executor'
import { createMockHumanApprovalProvider } from '../steps/human-approval-provider'

const RAW_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'Cold Brew Guide',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z',
}

function deps(providers: ContentWorkflowProviders) {
  let n = 0
  return {
    providers,
    newId: () => `id_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z',
    requesterId: 'system@opzava',
  }
}

describe('runContentWorkflow', () => {
  it('runs the full content workflow end-to-end to a draft-only wordpress request', () => {
    const result = runContentWorkflow(deps(createMockContentWorkflowProviders()), RAW_IDEA)

    expect(result.ideaIntake.ideaId).toBe('idea_001')
    expect(result.keywordResearch.artifactType).toBe('keyword-research')
    expect(result.sourceCapture.artifactType).toBe('source-capture')
    expect(result.seoBrief.artifactType).toBe('seo-brief')
    expect(result.outline.artifactType).toBe('outline')
    expect(result.articleDraft.artifactType).toBe('article-draft')
    expect(result.factCheckReport.artifactType).toBe('fact-check-report')
    expect(result.brandReview.artifactType).toBe('brand-review')
    expect(result.antiSlopReview.artifactType).toBe('anti-slop-review')
    expect(result.approval.status).toBe('approved')
    expect(result.wordpressDraftRequest.status).toBe('draft')
    expect(result.wordpressDraftRequest.approvalId).toBe(result.approval.approvalId)
    expect(result.wordpressDraftRequest.gateArtifacts.factCheckReportId).toBe(result.factCheckReport.artifactId)
  })

  it('chains lineage from the draft back to the idea', () => {
    const result = runContentWorkflow(deps(createMockContentWorkflowProviders()), RAW_IDEA)

    expect(result.wordpressDraftRequest.draftId).toBe(result.articleDraft.artifactId)
    expect(result.wordpressDraftRequest.ideaId).toBe('idea_001')
    const draftContent = result.articleDraft.content as { ideaId: string }
    expect(draftContent.ideaId).toBe('idea_001')
  })

  it('halts before the external action when approval is not granted', () => {
    const rejecting: ContentWorkflowProviders = {
      ...createMockContentWorkflowProviders(),
      humanApproval: () => ({
        status: 'rejected',
        approverId: 'editor@opzava.test',
        decisionReason: 'Off-brand and unsupported claims',
      }),
    }

    expect(() => runContentWorkflow(deps(rejecting), RAW_IDEA)).toThrow(/approval not granted/)
  })
})
