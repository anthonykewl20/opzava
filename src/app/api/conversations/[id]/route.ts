import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'
import { createSqliteNeedsYouRollupReader } from '@/opzava/platform/project-health/needs-you-rollup'
import {
  composeDigest,
  createConversationRepository,
  readConversationThread,
} from '@/opzava/modules/conversations'

import { ensureOrchestratorConversation, orchestratorConversationId, readCoordinatorStatus } from '../compose'

// GET /api/conversations/[id] — the Ask-Opzava thread + a freshly composed Digest. Admin/Full-view
// only (v1; ARD 0028 Q6). Works WITHOUT the gateway: the thread and Digest are server-side reads,
// so they stay live even when the Concierge is offline. `id` may be the alias 'ask-opzava'.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = getDatabase()
  const workspaceId = auth.user.workspace_id ?? 1
  const username = auth.user.username
  const { id } = await params
  const conversationId = id === 'ask-opzava' ? orchestratorConversationId(username) : id

  const repo = createConversationRepository(db)
  if (conversationId === orchestratorConversationId(username)) {
    ensureOrchestratorConversation(repo, conversationId, username, new Date().toISOString())
  }

  const thread = readConversationThread(repo, conversationId, { role: auth.user.role, name: username })
  if (!thread) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const rollup = createSqliteNeedsYouRollupReader(db).read(workspaceId)
  const pendingApprovals = createApprovalRepository(db).listApprovals({ status: 'requested' })
  const digest = composeDigest(rollup, pendingApprovals)

  return NextResponse.json({
    conversation: thread.conversation,
    timeline: thread.timeline,
    digest,
    // Real coordinator liveness (doc 19 / 100 T3) — drives the offline card + its Technical-details
    // block; never a fabricated id. The thread + digest above stay live even when this is offline.
    coordinator: readCoordinatorStatus(),
  })
}
