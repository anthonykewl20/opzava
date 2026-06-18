import { describe, expect, it } from 'vitest'
import type { OperationalEventStorageRecord } from '@/opzava/platform/runner/repository-contracts'
import { parseWordpressDraftRequest } from '../contracts/wordpress-draft-request'
import { createMockWordpressPublishingProviderAdapter } from './wordpress-publishing-adapter'
import { runWordpressPublishingCall } from './wordpress-publishing-execution'

const DRAFT_REQUEST = {
  schemaVersion: 1,
  requestId: 'wpreq_001',
  ideaId: 'idea_001',
  draftId: 'draft_artifact_001',
  approvalId: 'appr_001',
  title: 'Cold Brew Guide',
  bodyMarkdown: '# Cold Brew Guide\n\nBody.',
  status: 'draft' as const,
  gateArtifacts: {
    sourceCaptureId: 'sc_art_1',
    factCheckReportId: 'fc_art_1',
    brandReviewId: 'br_art_1',
    antiSlopReviewId: 'as_art_1'
  },
  createdAt: '2026-06-17T00:00:00.000Z'
}

function sink() {
  const events: OperationalEventStorageRecord[] = []
  return {
    events,
    appendOperationalEvent: (r: OperationalEventStorageRecord) => {
      events.push(r)
    }
  }
}

function deps(s: ReturnType<typeof sink>) {
  let n = 0
  return {
    adapter: createMockWordpressPublishingProviderAdapter({ now: () => '2026-06-15T00:00:05.000Z' }),
    eventSink: s,
    newId: () => `id_${++n}`,
    now: () => '2026-06-15T00:00:00.000Z',
    actorId: 'system@opzava',
    clock: { now: () => new Date('2026-06-15T00:00:05.000Z') }
  }
}

describe('wordpress-publishing-execution', () => {
  it('routes the wordpress publishing call through the platform path', async () => {
    const s = sink()
    const execution = await runWordpressPublishingCall(deps(s), {
      draftRequest: parseWordpressDraftRequest(DRAFT_REQUEST),
      workflowRunId: 'run_001',
      stepRunId: 'step_run_wp_001'
    })
    expect(execution.result.status).toBe('succeeded')
    expect(execution.externalCallRecord.providerId).toBe('mock-wordpress')
    const output = execution.result.output as { status: string }
    expect(output.status).toBe('draft')
  })

  it('emits external-call, cost, and audit operational events', async () => {
    const s = sink()
    await runWordpressPublishingCall(deps(s), {
      draftRequest: parseWordpressDraftRequest(DRAFT_REQUEST),
      workflowRunId: 'run_001',
      stepRunId: 'step_run_wp_001'
    })
    const kinds = s.events.map((e) => e.kind)
    expect(kinds).toContain('external-call')
    expect(kinds).toContain('cost')
    expect(kinds).toContain('audit')
    expect(s.events.length).toBe(3)
  })
})
