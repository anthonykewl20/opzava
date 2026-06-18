import { describe, it, expect, vi } from 'vitest'
import {
  recordContentWorkflowArtifacts,
  type ContentArtifactSink,
  type ArtifactRecordContext,
} from './record-workflow-artifacts'

function art(id: string, type: string): any {
  return {
    schemaVersion: 1,
    artifactId: id,
    artifactType: type,
    sourceStepRunId: 'step-1',
    content: { k: id },
    validation: { status: 'valid', checkedAt: '2026-07-01T00:00:00.000Z' },
    lineage: { inputArtifactIds: ['idea-1'] },
  }
}

function result(): any {
  return {
    ideaIntake: { ideaId: 'idea-1' },
    keywordResearch: art('kw', 'keyword-research'),
    sourceCapture: art('sc', 'source-capture'),
    seoBrief: art('sb', 'seo-brief'),
    outline: art('ol', 'outline'),
    articleDraft: art('ad', 'article-draft'),
    factCheckReport: art('fc', 'fact-check-report'),
    brandReview: art('br', 'brand-review'),
    antiSlopReview: art('as', 'anti-slop-review'),
    approval: { approvalId: 'apr-1' },
    wordpressDraftRequest: { status: 'draft' },
  }
}

const ctx: ArtifactRecordContext = {
  workflowRunId: 'content-workflow:idea-1',
  createdAt: '2026-07-01T00:00:00.000Z',
}

describe('recordContentWorkflowArtifacts', () => {
  it('records each produced artifact through the sink in workflow order', () => {
    const sink = vi.fn() as unknown as ContentArtifactSink & { mock: { calls: any[][] } }
    const ids = recordContentWorkflowArtifacts(result(), sink, ctx)
    expect(ids).toEqual(['kw', 'sc', 'sb', 'ol', 'ad', 'fc', 'br', 'as'])
    expect(sink).toHaveBeenCalledTimes(8)
    expect(sink).toHaveBeenNthCalledWith(1, expect.objectContaining({ artifactId: 'kw' }), ctx)
    expect(sink).toHaveBeenLastCalledWith(expect.objectContaining({ artifactId: 'as' }), ctx)
  })

  it('ignores non-artifact fields (ideaIntake/approval/wordpressDraftRequest)', () => {
    const sink = vi.fn() as unknown as ContentArtifactSink & { mock: { calls: any[][] } }
    recordContentWorkflowArtifacts(result(), sink, ctx)
    expect(sink).toHaveBeenCalledTimes(8)
    expect(
      sink.mock.calls.every(([a]: any[]) => a.artifactId !== 'idea-1' && a.artifactId !== 'apr-1'),
    ).toBe(true)
  })

  it('skips a missing artifact field', () => {
    const r = result()
    delete r.outline
    const sink = vi.fn() as unknown as ContentArtifactSink & { mock: { calls: any[][] } }
    const ids = recordContentWorkflowArtifacts(r, sink, ctx)
    expect(ids).toEqual(['kw', 'sc', 'sb', 'ad', 'fc', 'br', 'as'])
    expect(sink).toHaveBeenCalledTimes(7)
  })
})
