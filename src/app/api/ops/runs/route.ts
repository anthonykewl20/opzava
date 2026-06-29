import { NextRequest, NextResponse } from 'next/server'
import { withRequestContext } from '@/lib/request-context'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { listRecentWorkflowRuns } from '@/opzava/platform/runner/run-queries'
import { applyOpzavaRunnerRepositorySchema } from '@/opzava/platform/runner/migrations'
import { createArtifactRepository, runAndRecordContentWorkflow } from '@/opzava/modules/content'
import {
  createMockContentWorkflowProviderAdapters,
  createMockAntiSlopReviewProvider,
  createMockBrandReviewProvider,
  createMockHumanApprovalProvider,
  createMockOutlineProvider,
  createMockSeoBriefProvider,
  createMockWordpressDraftProvider,
} from '@/opzava/modules/content/mocks'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const url = new URL(request.url)
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : undefined
  const runs = listRecentWorkflowRuns(
    getDatabase(),
    Number.isFinite(limit) ? { limit: limit as number } : {}
  )
  return NextResponse.json({ runs })
}

const startContentRunBodySchema = z.object({
  title: z.string().min(3).max(200),
  topic: z.string().min(1).max(200),
  targetAudience: z.string().min(1).max(300).optional().default('General audience'),
  requestedBy: z.string().min(1).max(200).optional().default('operator@opzava'),
})

// Starts a content-department workflow run on mock providers (draft-only: the
// mock human-approval gate and mock WordPress provider never perform a real
// publish). Live providers are wired separately through admin connection settings.
async function handlePost(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = mutationLimiter(request)
  if (limited) return limited

  let parsed
  try {
    parsed = startContentRunBodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const db = getDatabase()
  applyOpzavaRunnerRepositorySchema(db)
  const insertOperationalEvent = db.prepare(`
    INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const now = () => new Date().toISOString()
  const deps = {
    adapters: createMockContentWorkflowProviderAdapters({ now }),
    transformProviders: {
      seoBrief: createMockSeoBriefProvider(),
      outline: createMockOutlineProvider(),
      brandReview: createMockBrandReviewProvider(),
      antiSlopReview: createMockAntiSlopReviewProvider(),
      humanApproval: createMockHumanApprovalProvider(),
      wordpressDraft: createMockWordpressDraftProvider(),
    },
    eventSink: {
      appendOperationalEvent: (record: any) =>
        insertOperationalEvent.run(
          record.recordId,
          record.kind,
          record.workflowRunId,
          record.stepRunId,
          record.occurredAt,
          JSON.stringify(record),
        ),
    },
    newId: () => randomUUID(),
    now,
    actorId: `user:${auth.user.id}`,
    requesterId: parsed.requestedBy,
    clock: { now: () => new Date() },
    repository: createArtifactRepository(db),
  }

  const idea = {
    schemaVersion: 1,
    ideaId: `idea_${randomUUID()}`,
    title: parsed.title,
    topic: parsed.topic,
    targetAudience: parsed.targetAudience,
    requestedBy: parsed.requestedBy,
    createdAt: now(),
  }

  try {
    const out = await runAndRecordContentWorkflow(deps, idea)
    return NextResponse.json(
      {
        workflowRunId: `content-workflow:${idea.ideaId}`,
        ideaId: idea.ideaId,
        artifactIds: out.recordedArtifactIds,
        wordpressDraftRequest: out.result.wordpressDraftRequest,
      },
      { status: 201 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'content run failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export const POST = withRequestContext(handlePost)
