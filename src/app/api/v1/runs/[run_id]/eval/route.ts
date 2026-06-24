import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { attachEval, EvalSelfScoringError } from '@/lib/runs'
import { logger } from '@/lib/logger'

/**
 * PUT /api/v1/runs/:run_id/eval — Attach or update an eval result.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ run_id: string }> },
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { run_id } = await params
    const body = await request.json()
    const workspaceId = auth.user.workspace_id ?? 1

    if (body.pass === undefined || body.score === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: pass, score' },
        { status: 400 },
      )
    }

    // SEC-6: resolve the caller's agent identities server-side (never trust the
    // request body) and forward them so attachEval can reject self-scoring — an
    // agent scoring a run it originated. Only forwarded when the caller is an
    // agent-scoped principal; human operators carry no agent identity and may
    // score any run in their workspace.
    const callerAgentIdentities =
      typeof auth.user.agent_id === 'number'
        ? new Set(
            [auth.user.agent_name, auth.user.display_name, auth.user.username].filter(
              (v): v is string => typeof v === 'string' && v.length > 0,
            ),
          )
        : undefined

    const updated = attachEval(run_id, body, workspaceId, callerAgentIdentities)
    if (!updated) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

    return NextResponse.json(updated, {
      headers: { 'X-Agent-Run-Protocol': '0.1.0' },
    })
  } catch (error) {
    if (error instanceof EvalSelfScoringError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    logger.error({ err: error }, 'Failed to attach eval')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
