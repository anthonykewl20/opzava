import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Capture the audit writer so we can assert the chat send joins the unified audit
// surface (Gap B). Hoisted so the vi.mock factories can reference it.
const { logAuditEventMock, logActivityMock, broadcastMock, preparedStmt, preparedQueries, requireRoleMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(),
  logActivityMock: vi.fn(),
  broadcastMock: vi.fn(),
  preparedStmt: {
    run: vi.fn(() => ({ lastInsertRowid: 42 })),
    get: vi.fn(() => ({
      id: 42,
      workspace_id: 1,
      conversation_id: 'conv_unit',
      from_agent: 'Anthony',
      to_agent: null,
      content: 'hi',
      message_type: 'text',
      metadata: null,
      read_at: null,
      created_at: 1700000000,
    })),
    all: vi.fn(() => []),
  },
  // Records every SQL string handed to db.prepare() so the GET ACL test can
  // assert the membership predicate is added (or not) based on viewer role.
  preparedQueries: [] as string[],
  requireRoleMock: vi.fn(() => ({
    user: {
      id: 7,
      username: 'anthony',
      display_name: 'Anthony',
      role: 'operator',
      workspace_id: 1,
      tenant_id: 1,
    },
  })),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({
    prepare: (sql: string) => {
      preparedQueries.push(sql)
      return preparedStmt
    },
  }),
  db_helpers: { logActivity: logActivityMock, createNotification: vi.fn() },
  logAuditEvent: logAuditEventMock,
}))

vi.mock('@/lib/auth', () => ({
  requireRole: requireRoleMock,
}))
vi.mock('@/lib/event-bus', () => ({ eventBus: { broadcast: broadcastMock } }))
vi.mock('@/lib/command', () => ({ runOpenClaw: vi.fn() }))
vi.mock('@/lib/sessions', () => ({ getAllGatewaySessions: vi.fn(() => []) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/injection-guard', () => ({
  scanForInjection: vi.fn(() => ({ safe: true, matches: [] })),
  sanitizeForPrompt: vi.fn(),
}))
vi.mock('@/lib/openclaw-gateway', () => ({ callOpenClawGateway: vi.fn() }))
vi.mock('@/lib/coordinator-routing', () => ({ resolveCoordinatorDeliveryTarget: vi.fn() }))

describe('POST /api/chat/messages — unified audit (Gap B)', () => {
  beforeEach(() => {
    logAuditEventMock.mockClear()
    logActivityMock.mockClear()
    broadcastMock.mockClear()
    preparedStmt.run.mockClear()
    preparedStmt.get.mockClear()
  })

  it('a human send records exactly one chat_message_sent audit event', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    const request = new NextRequest('http://localhost/api/chat/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hi' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(201)

    // The send is audited exactly once, with the resolved human actor + the message id.
    expect(logAuditEventMock).toHaveBeenCalledTimes(1)
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'chat_message_sent',
        actor: 'Anthony',
        actor_id: 7,
        target_type: 'message',
        target_id: 42,
        detail: { conversation_id: expect.any(String), to: null, message_type: 'text' },
      }),
    )

    // The activity feed entry and the SSE broadcast still fire alongside it.
    expect(logActivityMock).toHaveBeenCalledTimes(1)
    expect(broadcastMock).toHaveBeenCalledWith('chat.message', expect.objectContaining({ id: 42 }))
  })

  it('ignores a client-supplied body.from === "coordinator" and resolves the sender server-side (P0-1)', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    const request = new NextRequest('http://localhost/api/chat/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'x', from: 'coordinator' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(201)

    // The persisted from_agent must be the authenticated user's display_name, NOT "coordinator".
    // stmt.run(conversation_id, from, to, content, message_type, metadata, workspaceId)
    expect(preparedStmt.run).toHaveBeenCalledWith(
      expect.any(String), // conversation_id
      'Anthony', // from_agent — resolved server-side, spoofed value rejected
      null, // to
      'x', // content
      'text', // message_type
      null, // metadata
      1, // workspaceId
    )

    // The SSE broadcast carries the authenticated sender.
    expect(broadcastMock).toHaveBeenCalledWith(
      'chat.message',
      expect.objectContaining({ id: 42, from_agent: 'Anthony' }),
    )

    // The audit event records the real human actor, not the spoofed coordinator.
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'chat_message_sent',
        actor: 'Anthony',
        actor_id: 7,
      }),
    )
  })
})

describe('GET /api/chat/messages — DM membership ACL (Gap B REST parity)', () => {
  beforeEach(() => {
    preparedQueries.length = 0
    preparedStmt.all.mockClear()
    preparedStmt.get.mockClear()
    requireRoleMock.mockReset()
  })

  it('restricts a non-participant viewer to only their own from_agent/to_agent rows', async () => {
    // Viewer is a plain viewer (not operator/admin) and is NOT a party to the
    // DM between Anthony and Beatrice.
    requireRoleMock.mockReturnValue({
      user: {
        id: 9,
        username: 'carol',
        display_name: 'Carol',
        role: 'viewer',
        workspace_id: 1,
        tenant_id: 1,
      },
    })

    const { GET } = await import('@/app/api/chat/messages/route')
    const request = new NextRequest('http://localhost/api/chat/messages')
    const response = await GET(request)
    expect(response.status).toBe(200)

    // The membership predicate must mirror the SSE ACL: restrict to rows where the
    // viewer is a party to a real DM (from_agent/to_agent = viewerName), BUT still
    // include broadcasts (to_agent IS NULL) which are workspace-wide. Uses display_name.
    expect(preparedQueries.some((sql) => sql.includes('(from_agent = ? OR to_agent = ? OR to_agent IS NULL)'))).toBe(true)
    expect(preparedStmt.all).toHaveBeenCalledWith(
      expect.any(Number), // workspaceId
      'Carol', // viewerName — from_agent
      'Carol', // viewerName — to_agent
      expect.any(Number), // limit
      expect.any(Number), // offset
    )
  })

  it('does NOT apply the membership restriction for an operator', async () => {
    requireRoleMock.mockReturnValue({
      user: {
        id: 7,
        username: 'anthony',
        display_name: 'Anthony',
        role: 'operator',
        workspace_id: 1,
        tenant_id: 1,
      },
    })

    const { GET } = await import('@/app/api/chat/messages/route')
    const request = new NextRequest('http://localhost/api/chat/messages')
    const response = await GET(request)
    expect(response.status).toBe(200)

    // Operator sees all workspace messages — no membership predicate.
    expect(preparedQueries.some((sql) => sql.includes('(from_agent = ? OR to_agent = ?)'))).toBe(false)
  })

  it('does NOT apply the membership restriction for an admin', async () => {
    requireRoleMock.mockReturnValue({
      user: {
        id: 1,
        username: 'root',
        display_name: 'Root',
        role: 'admin',
        workspace_id: 1,
        tenant_id: 1,
      },
    })

    const { GET } = await import('@/app/api/chat/messages/route')
    const request = new NextRequest('http://localhost/api/chat/messages')
    const response = await GET(request)
    expect(response.status).toBe(200)

    expect(preparedQueries.some((sql) => sql.includes('(from_agent = ? OR to_agent = ?)'))).toBe(false)
  })
})
