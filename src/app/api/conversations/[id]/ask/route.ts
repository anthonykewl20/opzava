import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { eventBus } from '@/lib/event-bus'
import { mutationLimiter } from '@/lib/rate-limit'
import { askOrchestrator, type ConversationTurn } from '@/opzava/modules/conversations'

import { composeAskOrchestratorDeps, ensureOrchestratorConversation, orchestratorConversationId } from '../../compose'

// POST /api/conversations/[id]/ask — one Ask-Opzava conversational turn. Admin-only (v1). Calls the
// Concierge through askOrchestrator (narration-only over injected facts; Model-2 — no side effects
// here). Honest degradation: if the gateway is unreachable the human turn is still persisted and a
// plain-language offline turn is posted (the Digest + approvals path is unaffected).

function broadcastTurn(conversationId: string, turn: ConversationTurn, workspaceId: number): void {
  eventBus.broadcast('conversation.turn_added', { conversation_id: conversationId, turn, workspace_id: workspaceId })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = mutationLimiter(request)
  if (limited) return limited

  let body: { prompt?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body required' }, { status: 400 })
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  const db = getDatabase()
  const workspaceId = auth.user.workspace_id ?? 1
  const username = auth.user.username
  const { id } = await params
  const conversationId = id === 'ask-opzava' ? orchestratorConversationId(username) : id

  const deps = composeAskOrchestratorDeps(db, auth.user)
  if (conversationId === orchestratorConversationId(username)) {
    ensureOrchestratorConversation(deps.conversationRepo, conversationId, username, deps.now())
  }

  try {
    const result = await askOrchestrator(deps, { workspaceId, conversationId, actor: username, prompt })
    broadcastTurn(conversationId, result.humanTurn, workspaceId)
    broadcastTurn(conversationId, result.narrationTurn, workspaceId)
    return NextResponse.json(result)
  } catch {
    // Gateway/Concierge unreachable — the human turn is already persisted; post a plain offline turn.
    const offlineTurn: ConversationTurn = {
      turnId: deps.newId(),
      conversationId,
      parentTurnId: null,
      author: 'Opzava',
      role: 'system',
      body: 'Ask Opzava is offline right now — your message is saved. Try again once the gateway is connected.',
      refType: null,
      refId: null,
      messageAnchor: null,
      status: null,
      record: { degraded: true },
      createdAt: deps.now(),
    }
    deps.conversationRepo.appendTurn(offlineTurn)
    deps.conversationRepo.touchLastMessageAt(conversationId, deps.now())
    broadcastTurn(conversationId, offlineTurn, workspaceId)
    return NextResponse.json({ degraded: true, narrationTurn: offlineTurn, proposedActions: [] }, { status: 200 })
  }
}
