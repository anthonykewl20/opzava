import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, Message } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { eventBus } from '@/lib/event-bus'
import { logger } from '@/lib/logger'

/**
 * DM membership predicate for mutating a message's read state. Unlike the GET
 * list (where operator/admin see all rows for triage), PATCH is a write against
 * another member's read state, so party membership is required of every caller
 * — an operator/admin who is neither from_agent nor to_agent of a private DM
 * must not clear read-state on it (CHAT-5). The route's `requireRole('viewer')`
 * gate (parity with the GET list) supplies the auth floor; this predicate
 * supplies the party check. Identity contract mirrors the GET list: display_name
 * OR username, case-insensitive. Broadcasts (to_agent IS NULL) are workspace-wide.
 */
function canAccessMessage(user: { display_name: string; username: string }, message: Message): boolean {
  const viewer = (user.display_name || user.username || '').toLowerCase()
  return (
    (message.from_agent || '').toLowerCase() === viewer ||
    (message.to_agent || '').toLowerCase() === viewer ||
    message.to_agent === null
  )
}

/**
 * GET /api/chat/messages/[id] - Get a single message
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const { id } = await params
    const workspaceId = auth.user.workspace_id ?? 1

    const message = db
      .prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?')
      .get(parseInt(id), workspaceId) as Message | undefined

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    return NextResponse.json({
      message: {
        ...message,
        metadata: message.metadata ? JSON.parse(message.metadata) : null
      }
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/chat/messages/[id] error')
    return NextResponse.json({ error: 'Failed to fetch message' }, { status: 500 })
  }
}

/**
 * PATCH /api/chat/messages/[id] - Mark message as read
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const { id } = await params
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    const message = db
      .prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?')
      .get(parseInt(id), workspaceId) as Message | undefined

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // CHAT-5: membership authz. A caller may only mutate read-state on a DM they
    // are a party to; an operator/admin who is neither endpoint is rejected.
    if (!canAccessMessage(auth.user, message)) {
      return NextResponse.json({ error: 'Forbidden: not a participant of this conversation' }, { status: 403 })
    }

    if (body.read) {
      const now = Math.floor(Date.now() / 1000)
      db.prepare('UPDATE messages SET read_at = ? WHERE id = ? AND workspace_id = ?').run(now, parseInt(id), workspaceId)

      // Broadcast the read-state change so other SSE clients reconcile read_at.
      // Fired only on an actual write, keeping the path idempotent.
      eventBus.broadcast('chat.message.read', { id: message.id, workspace_id: workspaceId, read_at: now })
    }

    const updated = db
      .prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?')
      .get(parseInt(id), workspaceId) as Message

    return NextResponse.json({
      message: {
        ...updated,
        metadata: updated.metadata ? JSON.parse(updated.metadata) : null
      }
    })
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/chat/messages/[id] error')
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  }
}
