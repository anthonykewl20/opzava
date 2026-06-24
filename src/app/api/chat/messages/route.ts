import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, db_helpers, logAuditEvent, Message } from '@/lib/db'
import { runOpenClaw } from '@/lib/command'
import { getAllGatewaySessions } from '@/lib/sessions'
import { eventBus } from '@/lib/event-bus'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { scanForInjection, sanitizeForPrompt } from '@/lib/injection-guard'
import { callOpenClawGateway } from '@/lib/openclaw-gateway'
import { resolveCoordinatorDeliveryTarget } from '@/lib/coordinator-routing'

type ForwardInfo = {
  attempted: boolean
  delivered: boolean
  reason?: string
  session?: string
  runId?: string
}

type ToolEvent = {
  name: string
  input?: string
  output?: string
  status?: string
}

type ChatAttachmentInput = {
  name?: string
  type?: string
  dataUrl?: string
}

const COORDINATOR_AGENT =
  String(process.env.MC_COORDINATOR_AGENT || process.env.NEXT_PUBLIC_COORDINATOR_AGENT || 'coordinator').trim() ||
  'coordinator'

function parseGatewayJson(raw: string): any | null {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

function toGatewayAttachments(value: unknown): Array<{ type: 'image'; mimeType: string; fileName?: string; content: string }> | undefined {
  if (!Array.isArray(value)) return undefined

  const attachments = value.flatMap((entry) => {
    const file = entry as ChatAttachmentInput
    if (!file || typeof file !== 'object' || typeof file.dataUrl !== 'string') return []
    const match = /^data:([^;]+);base64,(.+)$/.exec(file.dataUrl)
    if (!match) return []
    if (!match[1].startsWith('image/')) return []
    return [{
      type: 'image' as const,
      mimeType: match[1],
      fileName: typeof file.name === 'string' ? file.name : undefined,
      content: match[2],
    }]
  })

  return attachments.length > 0 ? attachments : undefined
}

function safeParseMetadata(raw: string | null | undefined): any | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function createChatReply(
  db: ReturnType<typeof getDatabase>,
  workspaceId: number,
  conversationId: string,
  fromAgent: string,
  toAgent: string,
  content: string,
  messageType: 'text' | 'status' | 'tool_call' = 'status',
  metadata: Record<string, any> | null = null
) {
  const replyInsert = db
    .prepare(`
      INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, metadata, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      conversationId,
      fromAgent,
      toAgent,
      content,
      messageType,
      metadata ? JSON.stringify(metadata) : null,
      workspaceId
    )

  const row = db
    .prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?')
    .get(replyInsert.lastInsertRowid, workspaceId) as Message

  eventBus.broadcast('chat.message', {
    ...row,
    metadata: safeParseMetadata(row.metadata),
  })
}

function extractReplyText(waitPayload: any): string | null {
  if (!waitPayload || typeof waitPayload !== 'object') return null

  const directCandidates = [
    waitPayload.text,
    waitPayload.message,
    waitPayload.response,
    waitPayload.output,
    waitPayload.result,
  ]
  for (const value of directCandidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  if (typeof waitPayload.output === 'object' && waitPayload.output) {
    const nested = [
      waitPayload.output.text,
      waitPayload.output.message,
      waitPayload.output.content,
    ]
    for (const value of nested) {
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }

  if (Array.isArray(waitPayload.output)) {
    const parts: string[] = []
    for (const item of waitPayload.output) {
      if (!item || typeof item !== 'object') continue
      if (typeof item.text === 'string' && item.text.trim()) parts.push(item.text.trim())
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (!block || typeof block !== 'object') continue
          const blockType = String(block.type || '')
          if ((blockType === 'text' || blockType === 'output_text' || blockType === 'input_text') && typeof block.text === 'string' && block.text.trim()) {
            parts.push(block.text.trim())
          }
        }
      }
    }
    if (parts.length > 0) return parts.join('\n').slice(0, 8000)
  }

  return null
}

function normalizeToolEvent(raw: any): ToolEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const name = String(raw.name || raw.tool || raw.toolName || raw.function || raw.call || '').trim()
  if (!name) return null

  const inputRaw = raw.input ?? raw.args ?? raw.arguments ?? raw.params
  const outputRaw = raw.output ?? raw.result ?? raw.response
  const statusRaw =
    raw.status ??
    (raw.isError === true ? 'error' : undefined) ??
    (raw.ok === false ? 'error' : undefined) ??
    (raw.success === true ? 'ok' : undefined)

  const input =
    typeof inputRaw === 'string'
      ? inputRaw.slice(0, 2000)
      : inputRaw !== undefined
        ? JSON.stringify(inputRaw).slice(0, 2000)
        : undefined
  const output =
    typeof outputRaw === 'string'
      ? outputRaw.slice(0, 4000)
      : outputRaw !== undefined
        ? JSON.stringify(outputRaw).slice(0, 4000)
        : undefined
  const status = statusRaw !== undefined ? String(statusRaw).slice(0, 60) : undefined
  return { name, input, output, status }
}

function extractToolEvents(waitPayload: any): ToolEvent[] {
  if (!waitPayload || typeof waitPayload !== 'object') return []

  const candidates = [
    waitPayload.toolCalls,
    waitPayload.tools,
    waitPayload.calls,
    waitPayload.events,
    waitPayload.output?.toolCalls,
    waitPayload.output?.tools,
    waitPayload.output?.events,
  ]

  const events: ToolEvent[] = []
  for (const list of candidates) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const evt = normalizeToolEvent(item)
      if (evt) events.push(evt)
      if (events.length >= 20) return events
    }
  }

  // OpenAI Responses-style output array
  if (Array.isArray(waitPayload.output)) {
    for (const item of waitPayload.output) {
      if (!item || typeof item !== 'object') continue
      const itemType = String(item.type || '').toLowerCase()
      if (itemType === 'function_call' || itemType === 'tool_call') {
        const evt = normalizeToolEvent({
          name: item.name || item.tool_name || item.toolName,
          arguments: item.arguments || item.input,
          output: item.output || item.result,
          status: item.status,
        })
        if (evt) events.push(evt)
      } else if (itemType === 'message' && Array.isArray(item.content)) {
        for (const block of item.content) {
          const blockType = String(block?.type || '').toLowerCase()
          if (blockType === 'tool_use' || blockType === 'tool_call' || blockType === 'function_call') {
            const evt = normalizeToolEvent(block)
            if (evt) events.push(evt)
          }
        }
      }
      if (events.length >= 20) return events
    }
  }

  return events
}

/**
 * GET /api/chat/messages - List messages with filters
 * Query params: conversation_id, from_agent, to_agent, limit, offset, since
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const { searchParams } = new URL(request.url)

    const conversation_id = searchParams.get('conversation_id')
    const from_agent = searchParams.get('from_agent')
    const to_agent = searchParams.get('to_agent')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')
    const since = searchParams.get('since')

    // Chat DM membership ACL (Gap B REST parity). The SSE stream already
    // restricts chat.* events to their two participants unless the viewer is an
    // operator/admin; the REST read path must apply the same predicate so a
    // viewer cannot read another agent's DMs by hitting the list endpoint.
    // viewerName mirrors the SSE stream's identity resolution exactly.
    // Identity contract: a participant is identified by display_name OR username,
    // compared case-insensitively so a DM whose stored from_agent/to_agent differs
    // in casing (or username-vs-display_name) from the viewer is not dropped (P2-1).
    const viewerName = auth.user.display_name || auth.user.username
    const isPrivileged = auth.user.role === 'operator' || auth.user.role === 'admin'
    // Broadcasts (to_agent IS NULL) are workspace-wide and visible to all members —
    // parity with GET /api/chat/conversations and the SSE chat ACL, which treat only
    // real DMs (to_agent set) as private.
    const membershipClause = isPrivileged
      ? ''
      : ' AND (LOWER(from_agent) = LOWER(?) OR LOWER(to_agent) = LOWER(?) OR to_agent IS NULL)'
    const membershipParams = isPrivileged ? [] : [viewerName, viewerName]

    let query = 'SELECT * FROM messages WHERE workspace_id = ?'
    const params: any[] = [workspaceId]
    query += membershipClause
    params.push(...membershipParams)

    if (conversation_id) {
      query += ' AND conversation_id = ?'
      params.push(conversation_id)
    }

    if (from_agent) {
      query += ' AND from_agent = ?'
      params.push(from_agent)
    }

    if (to_agent) {
      query += ' AND to_agent = ?'
      params.push(to_agent)
    }

    if (since) {
      query += ' AND created_at > ?'
      params.push(parseInt(since))
    }

    query += ' ORDER BY created_at ASC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const messages = db.prepare(query).all(...params) as Message[]

    const parsed = messages.map((msg) => ({
      ...msg,
      metadata: safeParseMetadata(msg.metadata),
    }))

    // Get total count for pagination (same membership ACL applied for consistency)
    let countQuery = 'SELECT COUNT(*) as total FROM messages WHERE workspace_id = ?'
    const countParams: any[] = [workspaceId]
    countQuery += membershipClause
    countParams.push(...membershipParams)
    if (conversation_id) {
      countQuery += ' AND conversation_id = ?'
      countParams.push(conversation_id)
    }
    if (from_agent) {
      countQuery += ' AND from_agent = ?'
      countParams.push(from_agent)
    }
    if (to_agent) {
      countQuery += ' AND to_agent = ?'
      countParams.push(to_agent)
    }
    if (since) {
      countQuery += ' AND created_at > ?'
      countParams.push(parseInt(since))
    }
    const countRow = db.prepare(countQuery).get(...countParams) as { total: number }

    return NextResponse.json({ messages: parsed, total: countRow.total, page: Math.floor(offset / limit) + 1, limit })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/chat/messages error')
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

/**
 * POST /api/chat/messages - Send a new message
 * Body: { to, content, message_type, conversation_id, metadata }
 * Sender identity is always resolved server-side from authenticated user.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    // Sender identity is resolved server-side only. A client-supplied body.from is
    // never trusted on this human-authenticated route (P0-1 coordinator spoofing fix):
    // any operator could otherwise POST messages that appear to come from the
    // coordinator. body.from is intentionally ignored.
    const from = auth.user.display_name || auth.user.username || 'system'
    const to = body.to ? (body.to as string).trim() : null
    const content = (body.content || '').trim()
    const message_type = body.message_type || 'text'
    const conversation_id = body.conversation_id || `conv_${Date.now()}`
    const metadata = body.metadata || null

    if (!content) {
      return NextResponse.json(
        { error: '"content" is required' },
        { status: 400 }
      )
    }

    // Scan content for injection when it will be forwarded to an agent
    if (body.forward && to) {
      const injectionReport = scanForInjection(content, { context: 'prompt' })
      if (!injectionReport.safe) {
        const criticals = injectionReport.matches.filter(m => m.severity === 'critical')
        if (criticals.length > 0) {
          logger.warn({ to, rules: criticals.map(m => m.rule) }, 'Blocked chat message: injection detected')
          return NextResponse.json(
            { error: 'Message blocked: potentially unsafe content detected', injection: criticals.map(m => ({ rule: m.rule, description: m.description })) },
            { status: 422 }
          )
        }
      }
    }

    // P1-3 idempotency: when the caller supplies a client_message_id, a duplicate
    // POST returns the first committed message and forwards zero times. The partial
    // unique index idx_messages_client_message_id (migration 054) guards the insert;
    // this SELECT is the happy-path short-circuit before any write.
    const client_message_id =
      typeof body.client_message_id === 'string' && body.client_message_id.trim()
        ? body.client_message_id.trim()
        : null

    if (client_message_id) {
      const existing = db
        .prepare(
          `SELECT id FROM messages
           WHERE workspace_id = ? AND conversation_id = ? AND from_agent = ? AND client_message_id = ?`,
        )
        .get(workspaceId, conversation_id, from, client_message_id) as { id: number } | undefined

      if (existing) {
        const existingRow = db
          .prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?')
          .get(existing.id, workspaceId) as Message
        return NextResponse.json(
          {
            message: {
              ...existingRow,
              metadata: { ...(safeParseMetadata(existingRow.metadata) || {}), idempotent: true },
            },
            forward: null,
          },
          { status: 200 },
        )
      }
    }

    // P1-1 transactional outbox: every DURABLE write for this send — the message row,
    // the activity log, the recipient notification, the audit event, AND the
    // realtime_events outbox row for the chat.message event — shares ONE BEGIN
    // IMMEDIATE transaction on the singleton getDatabase() connection so they commit
    // atomically. A crash between commit and the in-process emit below still delivers
    // via the 1s SSE poller because the realtime_events row is durable in the tx.
    // The gateway forward (async network IO) stays OUTSIDE the tx to keep the SQLite
    // write lock held for the minimum time.
    let messageId = 0
    let outboxEvent: { id: number; type: string; data: any; timestamp: number; workspace_id: number | null } | null = null

    // The activity log + recipient notification are intentionally OUTSIDE this tx:
    // their eventBus broadcasts run recordServerEvent -> pruneRealtimeEvents (DELETE +
    // COUNT over the events table), which must NOT run while the BEGIN IMMEDIATE write
    // lock is held (it would widen the critical section past busy_timeout under load).
    const sendChatMessage = db.transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, metadata, workspace_id, client_message_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          conversation_id,
          from,
          to,
          content,
          message_type,
          metadata ? JSON.stringify(metadata) : null,
          workspaceId,
          client_message_id,
        )

      messageId = result.lastInsertRowid as number

      // Record the human send in the unified audit trail. Chat is an Engine-A surface
      // (inherited `messages`, `db_helpers`), so it joins the one audit surface via the
      // inherited `audit_log` that GET /api/audit projects (unified-audit.ts) — no new
      // table, no new boundary crossing. Only the user-originated send is audited;
      // system-generated replies (createChatReply) are deliberately excluded so the
      // compliance trail records human actions without agent chatter.
      logAuditEvent({
        action: 'chat_message_sent',
        actor: from,
        actor_id: auth.user.id,
        target_type: 'message',
        target_id: messageId,
        detail: { conversation_id, to, message_type },
      })

      // Durable outbox row for the chat.message event — mirrors recordServerEvent's
      // INSERT but runs in-tx so it commits atomically with the message. We emit the
      // in-process fast-path AFTER the tx (below); we do NOT call eventBus.broadcast
      // here, which would record a SECOND realtime_events row.
      const createdRow = db
        .prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?')
        .get(messageId, workspaceId) as Message
      const chatPayload = {
        ...createdRow,
        metadata: safeParseMetadata(createdRow.metadata),
      }
      const outboxResult = db
        .prepare(`
          INSERT INTO realtime_events (type, data, timestamp, workspace_id)
          VALUES (?, ?, ?, ?)
        `)
        .run('chat.message', JSON.stringify(chatPayload), Date.now(), workspaceId)
      outboxEvent = {
        id: Number(outboxResult.lastInsertRowid),
        type: 'chat.message',
        data: chatPayload,
        timestamp: Date.now(),
        workspace_id: workspaceId,
      }
    })

    try {
      sendChatMessage.immediate()
    } catch (err) {
      // P1-3 concurrent-duplicate race: two identical client_message_id POSTs can both
      // miss the pre-insert SELECT and both reach the INSERT; the partial unique index
      // (migration 054) makes the second throw SQLITE_CONSTRAINT -- the index already
      // prevented the double-insert/double-forward. Convert the conflict into the
      // idempotent return path instead of surfacing a spurious 500.
      if (
        client_message_id &&
        (err as { code?: string })?.code?.includes('SQLITE_CONSTRAINT')
      ) {
        const existing = db
          .prepare(
            `SELECT * FROM messages
             WHERE workspace_id = ? AND conversation_id = ? AND from_agent = ? AND client_message_id = ?`,
          )
          .get(workspaceId, conversation_id, from, client_message_id) as Message | undefined
        if (existing) {
          return NextResponse.json(
            {
              message: {
                ...existing,
                metadata: { ...(safeParseMetadata(existing.metadata) || {}), idempotent: true },
              },
              forward: null,
            },
            { status: 200 },
          )
        }
      }
      throw err
    }

    // P1-2 broadcast reorder: emit the originator event BEFORE the gateway forward
    // and BEFORE any createChatReply system replies (previously the broadcast ran at
    // the very end, after the gateway round-trip). emit ONLY — the durable row is
    // already committed in the tx above; broadcast would re-record a second row.
    if (outboxEvent) {
      eventBus.emit('server-event', outboxEvent)
    }

    // Activity log + recipient notification -- best-effort side-effects OUTSIDE the tx
    // (their broadcasts run recordServerEvent + prune; losing them on a crash is
    // tolerable, unlike the outbox row which is durable in the tx above).
    db_helpers.logActivity(
      'chat_message',
      'message',
      messageId,
      from,
      `Sent ${message_type} message${to ? ` to ${to}` : ' (broadcast)'}`,
      { conversation_id, to, message_type },
      workspaceId
    )
    if (to) {
      db_helpers.createNotification(
        to,
        'chat_message',
        `Message from ${from}`,
        content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        'message',
        messageId,
        workspaceId
      )
    }

    let forwardInfo: ForwardInfo | null = null

    // Optionally forward to agent via gateway (only when a recipient is specified)
    if (to && body.forward) {
      forwardInfo = { attempted: true, delivered: false }

      const agent = db
        .prepare('SELECT * FROM agents WHERE lower(name) = lower(?) AND workspace_id = ?')
        .get(to, workspaceId) as any

      const explicitSessionKey = typeof body.sessionKey === 'string' && body.sessionKey
        ? body.sessionKey
        : null
      const sessions = getAllGatewaySessions()
      const isCoordinatorSend = String(to).toLowerCase() === COORDINATOR_AGENT.toLowerCase()
      const allAgents = isCoordinatorSend
        ? (db
            .prepare('SELECT name, session_key, config FROM agents WHERE workspace_id = ?')
            .all(workspaceId) as Array<{ name: string; session_key?: string | null; config?: string | null }>)
        : []
      const configuredCoordinatorTarget = isCoordinatorSend
        ? (db
            .prepare("SELECT value FROM settings WHERE key = 'chat.coordinator_target_agent'")
            .get() as { value?: string } | undefined)?.value || null
        : null

      const coordinatorResolution = resolveCoordinatorDeliveryTarget({
        to: String(to),
        coordinatorAgent: COORDINATOR_AGENT,
        directAgent: agent
          ? {
              name: String(agent.name || to),
              session_key: typeof agent.session_key === 'string' ? agent.session_key : null,
              config: typeof agent.config === 'string' ? agent.config : null,
            }
          : null,
        allAgents,
        sessions,
        explicitSessionKey,
        configuredCoordinatorTarget,
      })

      // Use explicit session key from caller if provided, then DB, then on-disk lookup
      let sessionKey: string | null = coordinatorResolution.sessionKey

      // Fallback: derive session from on-disk gateway session stores
      if (!sessionKey) {
        const match = sessions.find(
          (s) =>
            s.agent.toLowerCase() === String(to).toLowerCase() ||
            s.agent.toLowerCase() === coordinatorResolution.deliveryName.toLowerCase() ||
            s.agent.toLowerCase() === String(coordinatorResolution.openclawAgentId || '').toLowerCase()
        )
        sessionKey = match?.key || match?.sessionId || null
      }

      // Prefer configured openclawId when present, fallback to normalized name
      let openclawAgentId: string | null = coordinatorResolution.openclawAgentId

      if (!sessionKey && !openclawAgentId) {
        forwardInfo.reason = 'no_active_session'

        // Emit an immediate visible status reply so the user isn't left with
        // silence when no live session exists — for both coordinator (coord:)
        // and direct agent (agent_<name>) conversations (issue #611).
        const isCoordConversation = typeof conversation_id === 'string' && conversation_id.startsWith('coord:')
        const isAgentConversation = typeof conversation_id === 'string' && conversation_id.startsWith('agent_')
        if (isCoordConversation || isAgentConversation) {
          const replyFrom = isCoordConversation ? COORDINATOR_AGENT : String(to)
          const replyText = isCoordConversation
            ? 'I received your message, but my live coordinator session is offline right now. Start/restore the coordinator session and retry.'
            : `Message received, but ${to} has no active gateway session right now. Start or restore the agent's session and retry.`
          try {
            createChatReply(
              db,
              workspaceId,
              conversation_id as string,
              replyFrom,
              from,
              replyText,
              'status',
              { status: 'offline', reason: 'no_active_session' }
            )
          } catch (e) {
            logger.error({ err: e }, 'Failed to create offline status reply')
          }
        }
      } else {
        try {
          // P1-3: derive a deterministic gateway idempotency key from client_message_id
          // when present so a retried POST dedupes at the gateway too. Fall back to the
          // per-message timestamped key only when no client_message_id was supplied.
          const idempotencyKey = client_message_id
            ? `mc-${client_message_id}`
            : `mc-${messageId}-${Date.now()}`

          if (sessionKey) {
            const acceptedPayload = await callOpenClawGateway<any>(
              'chat.send',
              {
                sessionKey,
                message: content,
                idempotencyKey,
                deliver: false,
                attachments: toGatewayAttachments(body.attachments),
              },
              12000,
            )
            const status = String(acceptedPayload?.status || '').toLowerCase()
            forwardInfo.delivered = status === 'started' || status === 'ok' || status === 'in_flight'
            forwardInfo.session = sessionKey
            if (typeof acceptedPayload?.runId === 'string' && acceptedPayload.runId) {
              forwardInfo.runId = acceptedPayload.runId
            }
          } else {
            const invokeParams: any = {
              message: `Message from ${from}: ${content}`,
              idempotencyKey,
              deliver: false,
            }
            invokeParams.agentId = openclawAgentId

            const invokeResult = await runOpenClaw(
              [
                'gateway',
                'call',
                'agent',
                '--timeout',
                '10000',
                '--params',
                JSON.stringify(invokeParams),
                '--json',
              ],
              { timeoutMs: 12000 }
            )
            const acceptedPayload = parseGatewayJson(invokeResult.stdout)
            forwardInfo.delivered = true
            forwardInfo.session = openclawAgentId || undefined
            if (typeof acceptedPayload?.runId === 'string' && acceptedPayload.runId) {
              forwardInfo.runId = acceptedPayload.runId
            }
          }
        } catch (err) {
          // OpenClaw may return accepted JSON on stdout but still emit a late stderr warning.
          // Treat accepted runs as successful delivery.
          const maybeStdout = String((err as any)?.stdout || '')
          const acceptedPayload = parseGatewayJson(maybeStdout)
          if (maybeStdout.includes('"status": "accepted"') || maybeStdout.includes('"status":"accepted"')) {
            forwardInfo.delivered = true
            forwardInfo.session = sessionKey || openclawAgentId || undefined
            if (typeof acceptedPayload?.runId === 'string' && acceptedPayload.runId) {
              forwardInfo.runId = acceptedPayload.runId
            }
          } else {
            forwardInfo.reason = 'gateway_send_failed'
            logger.error({ err }, 'Failed to forward message via gateway')

            // For coordinator messages, emit visible status when send fails
            if (typeof conversation_id === 'string' && conversation_id.startsWith('coord:')) {
              try {
                createChatReply(
                  db,
                  workspaceId,
                  conversation_id,
                  COORDINATOR_AGENT,
                  from,
                  'I received your message, but delivery to the live coordinator runtime failed. Please restart the coordinator/gateway session and retry.',
                  'status',
                  { status: 'delivery_failed', reason: 'gateway_send_failed' }
                )
              } catch (e) {
                logger.error({ err: e }, 'Failed to create gateway failure status reply')
              }
            }
          }
        }

        // Coordinator mode should always show visible coordinator feedback in thread.
        if (
          typeof conversation_id === 'string' &&
          conversation_id.startsWith('coord:') &&
          forwardInfo.delivered
        ) {
          try {
            createChatReply(
              db,
              workspaceId,
              conversation_id,
              COORDINATOR_AGENT,
              from,
              'Received. I am coordinating downstream agents now.',
              'status',
              { status: 'accepted', runId: forwardInfo.runId || null }
            )
          } catch (e) {
            logger.error({ err: e }, 'Failed to create accepted status reply')
          }

          // Best effort: wait briefly and surface completion/error feedback.
          if (forwardInfo.runId) {
            try {
              const waitResult = await runOpenClaw(
                [
                  'gateway',
                  'call',
                  'agent.wait',
                  '--timeout',
                  '8000',
                  '--params',
                  JSON.stringify({ runId: forwardInfo.runId, timeoutMs: 6000 }),
                  '--json',
                ],
                { timeoutMs: 9000 }
              )

              const waitPayload = parseGatewayJson(waitResult.stdout)
              const waitStatus = String(waitPayload?.status || '').toLowerCase()
              const toolEvents = extractToolEvents(waitPayload)

              if (toolEvents.length > 0) {
                for (const evt of toolEvents) {
                  createChatReply(
                    db,
                    workspaceId,
                    conversation_id,
                    COORDINATOR_AGENT,
                    from,
                    evt.name,
                    'tool_call',
                    {
                      event: 'tool_call',
                      toolName: evt.name,
                      input: evt.input || null,
                      output: evt.output || null,
                      status: evt.status || null,
                      runId: forwardInfo.runId || null,
                    }
                  )
                }
              }

              if (waitStatus === 'error') {
                const reason =
                  typeof waitPayload?.error === 'string'
                    ? waitPayload.error
                    : 'Unknown runtime error'
                createChatReply(
                  db,
                  workspaceId,
                  conversation_id,
                  COORDINATOR_AGENT,
                  from,
                  `I received your message, but execution failed: ${reason}`,
                  'status',
                  { status: 'error', runId: forwardInfo.runId }
                )
              } else if (waitStatus === 'timeout') {
                createChatReply(
                  db,
                  workspaceId,
                  conversation_id,
                  COORDINATOR_AGENT,
                  from,
                  'I received your message and I am still processing it. I will post results as soon as execution completes.',
                  'status',
                  { status: 'processing', runId: forwardInfo.runId }
                )
              } else {
                const replyText = extractReplyText(waitPayload)
                if (replyText) {
                  createChatReply(
                    db,
                    workspaceId,
                    conversation_id,
                    COORDINATOR_AGENT,
                    from,
                    replyText,
                    'text',
                    { status: waitStatus || 'completed', runId: forwardInfo.runId }
                  )
                } else {
                  createChatReply(
                    db,
                    workspaceId,
                    conversation_id,
                    COORDINATOR_AGENT,
                    from,
                    'Execution accepted and completed. No textual response payload was returned by the runtime.',
                    'status',
                    { status: waitStatus || 'completed', runId: forwardInfo.runId }
                  )
                }
              }
            } catch (waitErr) {
              const maybeWaitStdout = String((waitErr as any)?.stdout || '')
              const maybeWaitStderr = String((waitErr as any)?.stderr || '')
              const waitPayload = parseGatewayJson(maybeWaitStdout)
              const reason =
                typeof waitPayload?.error === 'string'
                  ? waitPayload.error
                  : (maybeWaitStderr || maybeWaitStdout || 'Unable to read completion status from coordinator runtime.').trim()

              createChatReply(
                db,
                workspaceId,
                conversation_id,
                COORDINATOR_AGENT,
                from,
                `I received your message, but I could not retrieve completion output yet: ${reason}`,
                'status',
                { status: 'unknown', runId: forwardInfo.runId }
              )
            }
          }
        }
      }
    }

    const created = db.prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?').get(messageId, workspaceId) as Message
    const parsedMessage = {
      ...created,
      metadata: {
        ...(safeParseMetadata(created.metadata) || {}),
        forwardInfo: forwardInfo || undefined,
      },
    }

    // The originator event was already emitted above (after the tx committed) via
    // eventBus.emit('server-event', outboxEvent). Do NOT broadcast again here — that
    // would re-record a second realtime_events row. parsedMessage carries forwardInfo
    // for the HTTP response only.
    return NextResponse.json({ message: parsedMessage, forward: forwardInfo }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/chat/messages error')
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
