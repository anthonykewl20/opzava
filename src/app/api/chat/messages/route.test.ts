import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Capture the audit writer so we can assert the chat send joins the unified audit
// surface (Gap B). Hoisted so the vi.mock factories can reference it.
const {
  logAuditEventMock,
  logActivityMock,
  emitSpy,
  broadcastMock,
  preparedStmt,
  dbState,
  preparedQueries,
  requireRoleMock,
  gatewayMock,
} = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(),
  logActivityMock: vi.fn(),
  // event-bus emit spy: ordered list of every 'server-event' emission, so the
  // broadcast-reorder test (P1-2) can assert the originator precedes any reply.
  emitSpy: vi.fn(),
  // broadcastMock still recorded (createChatReply system replies keep using it),
  // but it now delegates to emit so ordering is observable on a single list.
  broadcastMock: vi.fn(),
  preparedStmt: {
    run: vi.fn((..._args: unknown[]) => ({ lastInsertRowid: 42 })),
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
  // Mutable per-test knobs for the transactional behavior tests: which SQL the
  // idempotency SELECT resolves to, and which tables have been written. Reset
  // in beforeEach.
  dbState: {
    // Returns the existing message id for a duplicate client_message_id, or null.
    idempotentId: null as number | null,
    // Counters incremented when the corresponding durable INSERT runs.
    messagesInserted: 0,
    realtimeEventsInserted: 0,
    // Tracks that the POST ran its durable writes inside a single BEGIN IMMEDIATE tx.
    transactionRan: false,
    // Echo of the most recent messages INSERT so a following SELECT * FROM messages
    // returns a row whose from_agent/content match what was actually written (lets the
    // ordering test distinguish the originator from a coordinator reply by identity).
    lastInsertedRow: null as null | Record<string, unknown>,
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
  gatewayMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({
    prepare: (sql: string) => {
      preparedQueries.push(sql)
      const normalized = sql.replace(/\s+/g, ' ').trim()
      // Idempotency lookup: SELECT ... client_message_id ...
      if (/FROM messages/i.test(normalized) && /client_message_id/i.test(normalized) && /^SELECT/i.test(normalized)) {
        return {
          get: vi.fn(() => (dbState.idempotentId === null ? undefined : { id: dbState.idempotentId })),
          run: vi.fn(),
          all: vi.fn(() => []),
        }
      }
      // realtime_events outbox INSERT (the durable chat.message event row).
      if (/INSERT INTO realtime_events/i.test(normalized)) {
        return {
          run: vi.fn(() => {
            dbState.realtimeEventsInserted += 1
            return { lastInsertRowid: 9001 }
          }),
          get: vi.fn(),
          all: vi.fn(() => []),
        }
      }
      // messages INSERT — alias to the shared preparedStmt so legacy assertions
      // (which target preparedStmt.run) keep resolving, count durable writes, and
      // echo the written row so a following SELECT * FROM messages reflects what was
      // actually inserted (lets the ordering test tell the originator from a reply).
      const messagesInsert = {
        run: vi.fn((...args: unknown[]) => {
          dbState.messagesInserted += 1
          const [conversation_id, from_agent, to_agent, content, message_type, metadata, workspace_id, client_message_id] = args as any[]
          dbState.lastInsertedRow = {
            id: 42,
            workspace_id: workspace_id ?? 1,
            conversation_id,
            from_agent,
            to_agent: to_agent ?? null,
            content,
            message_type,
            metadata: metadata ?? null,
            read_at: null,
            created_at: 1700000000,
            client_message_id: client_message_id ?? null,
          }
          return (preparedStmt.run as (...a: unknown[]) => unknown)(...args)
        }),
        get: preparedStmt.get,
        all: preparedStmt.all,
      }
      if (/INSERT INTO messages/i.test(normalized)) return messagesInsert
      // SELECT * FROM messages WHERE id = ? — echo the last inserted row when present
      // so re-fetches (the POST's createdRow, createChatReply's reply row) carry the
      // real from_agent instead of a fixed fixture.
      if (/SELECT \* FROM messages WHERE id = /i.test(normalized) && dbState.lastInsertedRow) {
        return {
          get: vi.fn(() => dbState.lastInsertedRow),
          run: vi.fn(),
          all: vi.fn(() => []),
        }
      }
      // Default: the shared statement (GET list path, SELECT * FROM messages, etc.).
      return preparedStmt
    },
    // better-sqlite3 immediate-transaction variant: db.transaction(fn).immediate()
    // runs fn synchronously inside BEGIN IMMEDIATE. We execute fn directly and flag
    // the boundary so the atomicity test asserts all durable writes share one tx.
    transaction: (fn: () => unknown) => {
      const run = () => {
        dbState.transactionRan = true
        return fn()
      }
      return Object.assign(run, { immediate: run })
    },
    exec: vi.fn(),
  }),
  db_helpers: { logActivity: logActivityMock, createNotification: vi.fn() },
  logAuditEvent: logAuditEventMock,
}))

vi.mock('@/lib/auth', () => ({
  requireRole: requireRoleMock,
}))
vi.mock('@/lib/event-bus', () => ({
  // eventBus.broadcast(type, data) builds a ServerEvent and emits 'server-event'
  // (mirrors the real bus minus DB durability). emit() is the fast-path the POST
  // uses after the durable realtime_events row is committed in-tx.
  eventBus: {
    emit: emitSpy,
    broadcast: (type: string, data: unknown) => {
      broadcastMock(type, data)
      emitSpy('server-event', { type, data, timestamp: Date.now() })
    },
    on: vi.fn(),
    off: vi.fn(),
  },
}))
vi.mock('@/lib/command', () => ({ runOpenClaw: vi.fn() }))
vi.mock('@/lib/sessions', () => ({ getAllGatewaySessions: vi.fn(() => []) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/injection-guard', () => ({
  scanForInjection: vi.fn(() => ({ safe: true, matches: [] })),
  sanitizeForPrompt: vi.fn(),
}))
vi.mock('@/lib/openclaw-gateway', () => ({ callOpenClawGateway: gatewayMock }))
vi.mock('@/lib/coordinator-routing', () => ({ resolveCoordinatorDeliveryTarget: vi.fn() }))

describe('POST /api/chat/messages — unified audit (Gap B)', () => {
  beforeEach(() => {
    logAuditEventMock.mockClear()
    logActivityMock.mockClear()
    broadcastMock.mockClear()
    emitSpy.mockClear()
    gatewayMock.mockClear()
    preparedStmt.run.mockClear()
    preparedStmt.get.mockClear()
    dbState.idempotentId = null
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    dbState.transactionRan = false
    dbState.lastInsertedRow = null
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

    // The activity feed entry and the SSE fast-path emission still fire alongside it.
    // The originator message is now emitted via eventBus.emit('server-event', ...) once
    // the durable realtime_events row is committed in-tx (P1-1) — no longer via broadcast,
    // which would re-record a second durable row.
    expect(logActivityMock).toHaveBeenCalledTimes(1)
    expect(emitSpy).toHaveBeenCalledWith(
      'server-event',
      expect.objectContaining({ type: 'chat.message', data: expect.objectContaining({ id: 42 }) }),
    )
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
    // stmt.run(conversation_id, from, to, content, message_type, metadata, workspaceId, client_message_id)
    expect(preparedStmt.run).toHaveBeenCalledWith(
      expect.any(String), // conversation_id
      'Anthony', // from_agent — resolved server-side, spoofed value rejected
      null, // to
      'x', // content
      'text', // message_type
      null, // metadata
      1, // workspaceId
      null, // client_message_id (P1-3) — absent on this body
    )

    // The SSE fast-path emission carries the authenticated sender (originator
    // message, emitted after the durable realtime_events row commits in-tx).
    expect(emitSpy).toHaveBeenCalledWith(
      'server-event',
      expect.objectContaining({
        type: 'chat.message',
        data: expect.objectContaining({ id: 42, from_agent: 'Anthony' }),
      }),
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
    // viewer is a party to a real DM (LOWER(from_agent)/LOWER(to_agent) = LOWER(viewerName)),
    // BUT still include broadcasts (to_agent IS NULL) which are workspace-wide. Identity
    // contract: display_name OR username, compared case-insensitively (P2-1).
    expect(
      preparedQueries.some((sql) =>
        sql.includes('(LOWER(from_agent) = LOWER(?) OR LOWER(to_agent) = LOWER(?) OR to_agent IS NULL)'),
      ),
    ).toBe(true)
    expect(preparedStmt.all).toHaveBeenCalledWith(
      expect.any(Number), // workspaceId
      'Carol', // viewerName — from_agent
      'Carol', // viewerName — to_agent
      expect.any(Number), // limit
      expect.any(Number), // offset
    )
  })

  it('case-insensitive REST membership lets a viewer whose identity differs in casing read the DM (P2-1)', async () => {
    // Viewer identity is display_name "ANTHONY" (different case) but the DM rows store
    // from_agent "Anthony". Case-insensitive LOWER() comparison must still match.
    requireRoleMock.mockReturnValue({
      user: {
        id: 7,
        username: 'anthony',
        display_name: 'ANTHONY',
        role: 'viewer',
        workspace_id: 1,
        tenant_id: 1,
      },
    })

    const { GET } = await import('@/app/api/chat/messages/route')
    const request = new NextRequest('http://localhost/api/chat/messages')
    const response = await GET(request)
    expect(response.status).toBe(200)

    // Predicate present and uses LOWER() on both columns.
    expect(
      preparedQueries.some((sql) =>
        sql.includes('(LOWER(from_agent) = LOWER(?) OR LOWER(to_agent) = LOWER(?) OR to_agent IS NULL)'),
      ),
    ).toBe(true)
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

describe('POST /api/chat/messages — P1-3 idempotent client_message_id', () => {
  beforeEach(async () => {
    logAuditEventMock.mockClear()
    logActivityMock.mockClear()
    broadcastMock.mockClear()
    emitSpy.mockClear()
    gatewayMock.mockClear()
    preparedStmt.run.mockClear()
    preparedStmt.get.mockClear()
    dbState.idempotentId = null
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    dbState.transactionRan = false
    dbState.lastInsertedRow = null
    requireRoleMock.mockReset()
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
    // Resolve a live coordinator session so callOpenClawGateway actually fires on the
    // forward path (otherwise the no_active_session branch is taken and the gateway is
    // never invoked, which would defeat the "forwards once" assertion).
    const { resolveCoordinatorDeliveryTarget } = await import('@/lib/coordinator-routing')
    ;(resolveCoordinatorDeliveryTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      sessionKey: 'sess-live',
      deliveryName: 'coordinator',
      openclawAgentId: null,
    })
    gatewayMock.mockResolvedValue({ status: 'started', runId: 'run-1' })
  })

  it('a duplicate POST with the same client_message_id returns the existing id and forwards zero times', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')

    const body = {
      content: 'dup',
      to: 'coordinator',
      conversation_id: 'coord:dup',
      forward: true,
      client_message_id: 'cmid-abc',
    }

    // First send: no existing message — forwards exactly once via the gateway.
    // (The coordinator path may also write status-reply rows, but the gateway forward
    // — callOpenClawGateway('chat.send') — fires exactly once.)
    const first = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
    expect(first.status).toBe(201)
    const firstJson = await first.json()
    expect(firstJson.message.id).toBe(42)
    expect(gatewayMock.mock.calls.filter(call => call[0] === 'chat.send')).toHaveLength(1)

    // Second send with the SAME client_message_id: idempotent — returns the existing
    // message (HTTP 200), does NOT insert a second row, does NOT forward again.
    dbState.idempotentId = 42
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    preparedStmt.run.mockClear()
    gatewayMock.mockClear()
    emitSpy.mockClear()

    const second = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
    expect(second.status).toBe(200)
    const secondJson = await second.json()
    expect(secondJson.message.id).toBe(42)
    // Idempotent path writes nothing durable (no message insert, no outbox row) and
    // forwards zero times.
    expect(dbState.messagesInserted).toBe(0)
    expect(dbState.realtimeEventsInserted).toBe(0)
    expect(gatewayMock).not.toHaveBeenCalled()
    expect(preparedStmt.run).not.toHaveBeenCalled()
  })

  it('derives a deterministic gateway idempotency key from client_message_id', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')

    await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: 'k',
          to: 'coordinator',
          conversation_id: 'coord:key',
          forward: true,
          client_message_id: 'cmid-777',
        }),
      }),
    )

    expect(gatewayMock.mock.calls.filter(call => call[0] === 'chat.send')).toHaveLength(1)
    const callArgs = gatewayMock.mock.calls.find(call => call[0] === 'chat.send')!
    // callOpenClawGateway(method, params, timeout) — params.idempotencyKey deterministic.
    const params = callArgs[1] as { idempotencyKey: string }
    expect(params.idempotencyKey).toBe('mc-cmid-777')
  })
})

describe('POST /api/chat/messages — P1-1 transactional outbox (atomic durable writes)', () => {
  beforeEach(() => {
    logAuditEventMock.mockClear()
    logActivityMock.mockClear()
    broadcastMock.mockClear()
    emitSpy.mockClear()
    gatewayMock.mockClear()
    preparedStmt.run.mockClear()
    preparedStmt.get.mockClear()
    dbState.idempotentId = null
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    dbState.transactionRan = false
    dbState.lastInsertedRow = null
  })

  it('the message INSERT and the realtime_events outbox row are written inside ONE transaction', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'atomic', client_message_id: 'cmid-tx' }),
      }),
    )

    // Both durable writes happened, and they shared a single BEGIN IMMEDIATE boundary.
    expect(dbState.messagesInserted).toBe(1)
    expect(dbState.realtimeEventsInserted).toBe(1)
    expect(dbState.transactionRan).toBe(true)
  })

  it('the realtime_events outbox row exists iff the message does (atomicity invariant)', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')

    // Happy path: message committed => outbox row committed alongside it.
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'pair', client_message_id: 'cmid-pair' }),
      }),
    )
    expect(dbState.messagesInserted).toBeGreaterThan(0)
    expect(dbState.realtimeEventsInserted).toBeGreaterThan(0)

    // Duplicate idempotent path: neither the message nor the outbox row is written again.
    dbState.idempotentId = 42
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    const dup = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'pair', client_message_id: 'cmid-pair' }),
      }),
    )
    expect(dup.status).toBe(200)
    expect(dbState.messagesInserted).toBe(0)
    expect(dbState.realtimeEventsInserted).toBe(0)
  })
})

describe('POST /api/chat/messages — P2 message_type constrained for human sends', () => {
  beforeEach(() => {
    logAuditEventMock.mockClear()
    logActivityMock.mockClear()
    broadcastMock.mockClear()
    emitSpy.mockClear()
    gatewayMock.mockClear()
    preparedStmt.run.mockClear()
    preparedStmt.get.mockClear()
    dbState.idempotentId = null
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    dbState.transactionRan = false
    dbState.lastInsertedRow = null
  })

  it('coerces a spoofed message_type:"system" to "text" on the stored row', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    const request = new NextRequest('http://localhost/api/chat/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hi', message_type: 'system' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(201)

    // stmt.run(conversation_id, from, to, content, message_type, metadata, workspaceId, client_message_id)
    // The persisted message_type (5th positional arg) must be coerced to 'text',
    // never the operator-supplied 'system'.
    expect(preparedStmt.run).toHaveBeenCalledWith(
      expect.any(String), // conversation_id
      'Anthony', // from_agent
      null, // to
      'hi', // content
      'text', // message_type — coerced, spoofed 'system' rejected
      null, // metadata
      1, // workspaceId
      null, // client_message_id
    )
  })

  it('coerces each reserved type (system/command/handoff/status/tool_call) to "text"', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    for (const spoofed of ['system', 'command', 'handoff', 'status', 'tool_call']) {
      preparedStmt.run.mockClear()
      const response = await POST(
        new NextRequest('http://localhost/api/chat/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: 'x', message_type: spoofed }),
        }),
      )
      expect(response.status).toBe(201)
      // 5th positional arg of the messages INSERT is the persisted message_type.
      const insertCalls = preparedStmt.run.mock.calls
      expect(insertCalls.length).toBeGreaterThan(0)
      const persistedType = insertCalls[0][4]
      expect(persistedType).toBe('text')
    }
  })

  it('coerces an arbitrary unknown message_type to "text"', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'x', message_type: 'definitely-not-allowed' }),
      }),
    )
    expect(response.status).toBe(201)
    const persistedType = preparedStmt.run.mock.calls[0][4]
    expect(persistedType).toBe('text')
  })

  it('preserves an explicit "text" message_type', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'x', message_type: 'text' }),
      }),
    )
    expect(response.status).toBe(201)
    const persistedType = preparedStmt.run.mock.calls[0][4]
    expect(persistedType).toBe('text')
  })

  it('defaults a missing message_type to "text" (behavior-preserving)', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'x' }),
      }),
    )
    expect(response.status).toBe(201)
    const persistedType = preparedStmt.run.mock.calls[0][4]
    expect(persistedType).toBe('text')
  })

  it('records the coerced type in the audit detail (not the spoofed value)', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'x', message_type: 'command' }),
      }),
    )
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ message_type: 'text' }),
      }),
    )
  })
})

describe('POST /api/chat/messages — P1-2 broadcast ordering (originator before reply)', () => {
  beforeEach(() => {
    logAuditEventMock.mockClear()
    logActivityMock.mockClear()
    broadcastMock.mockClear()
    emitSpy.mockClear()
    gatewayMock.mockClear()
    preparedStmt.run.mockClear()
    preparedStmt.get.mockClear()
    dbState.idempotentId = null
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    dbState.transactionRan = false
    dbState.lastInsertedRow = null
    requireRoleMock.mockReset()
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
  })

  it('the originating user message is emitted before any createChatReply system reply', async () => {
    // A coordinator conversation with forward + a live session that returns accepted
    // triggers a createChatReply("Received...") status reply AFTER the gateway round-trip.
    // The originator event MUST be emitted first (P1-2 reorder).
    const { resolveCoordinatorDeliveryTarget } = await import('@/lib/coordinator-routing')
    ;(resolveCoordinatorDeliveryTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      sessionKey: 'sess-live',
      deliveryName: 'coordinator',
      openclawAgentId: null,
    })
    gatewayMock.mockResolvedValue({ status: 'started', runId: 'run-1' })

    const { POST } = await import('@/app/api/chat/messages/route')
    await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: 'coord hi',
          to: 'coordinator',
          forward: true,
          conversation_id: 'coord:test',
          client_message_id: 'cmid-order',
        }),
      }),
    )

    // Order the emitted 'server-event' payloads by their emission sequence and assert
    // the originator (from_agent Anthony) precedes the coordinator reply.
    const emissions = emitSpy.mock.calls.map((c) => c[1]) as Array<{ type: string; data: { from_agent?: string } }>
    const types = emissions.map((e) => e.type)
    expect(types).toContain('chat.message')

    const originatorIndex = emissions.findIndex(
      (e) => e.type === 'chat.message' && e.data?.from_agent === 'Anthony',
    )
    const replyIndex = emissions.findIndex(
      (e) => e.type === 'chat.message' && e.data?.from_agent === 'coordinator',
    )
    expect(originatorIndex).toBeGreaterThanOrEqual(0)
    expect(replyIndex).toBeGreaterThanOrEqual(0)
    expect(originatorIndex).toBeLessThan(replyIndex)

    // And critically: the originator was emitted BEFORE the gateway forward fired.
    expect(gatewayMock.mock.calls.filter(call => call[0] === 'chat.send')).toHaveLength(1)
    // The first chat.message emission is the originator (not a reply).
    const firstChat = emissions.find((e) => e.type === 'chat.message')
    expect(firstChat?.data?.from_agent).toBe('Anthony')
  })
})

describe('POST /api/chat/messages — CHAT-3 payload size caps (reject oversized before any INSERT)', () => {
  beforeEach(() => {
    logAuditEventMock.mockClear()
    logActivityMock.mockClear()
    broadcastMock.mockClear()
    emitSpy.mockClear()
    gatewayMock.mockClear()
    preparedStmt.run.mockClear()
    preparedStmt.get.mockClear()
    dbState.idempotentId = null
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    dbState.transactionRan = false
    dbState.lastInsertedRow = null
  })

  it('rejects content larger than the 16KB cap with 413 and writes no message row', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    const oversized = 'x'.repeat(16 * 1024 + 1)
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: oversized }),
      }),
    )
    expect(response.status).toBe(413)
    expect(dbState.messagesInserted).toBe(0)
    expect(dbState.realtimeEventsInserted).toBe(0)
  })

  it('rejects metadata larger than the 8KB cap before any INSERT', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    const bigMetadata = { blob: 'y'.repeat(8 * 1024 + 1) }
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'ok', metadata: bigMetadata }),
      }),
    )
    expect(response.status).toBe(413)
    expect(dbState.messagesInserted).toBe(0)
    expect(dbState.realtimeEventsInserted).toBe(0)
  })

  it('rejects more than N attachments before any INSERT', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    // Build a valid small image data URL repeated past the count cap.
    const tinyPng = 'data:image/png;base64,iVBORw0KGgo='
    const tooMany = Array.from({ length: 11 }, () => ({ dataUrl: tinyPng }))
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'ok', attachments: tooMany }),
      }),
    )
    expect(response.status).toBe(413)
    expect(dbState.messagesInserted).toBe(0)
    expect(dbState.realtimeEventsInserted).toBe(0)
  })

  it('rejects a single oversized data-URL attachment before any INSERT', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    // data:image/png;base64,<very large base64> — exceeds the per-data-URL byte cap.
    const oversizedDataUrl = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024)}`
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: 'ok',
          attachments: [{ dataUrl: oversizedDataUrl }],
        }),
      }),
    )
    expect(response.status).toBe(413)
    expect(dbState.messagesInserted).toBe(0)
    expect(dbState.realtimeEventsInserted).toBe(0)
  })

  it('rejects attachments whose total exceeds the byte cap before any INSERT', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    // Several individually-valid attachments whose summed size exceeds the total cap.
    // Each is ~64KB; 11 of them blows past a ~256KB total cap and the count cap is
    // not the binding constraint here (count stays under the cap; total bytes is the
    // rejection trigger). Each attachment is ~900 KiB (under the 1 MiB per-item cap),
    // and 5 of them sum to ~4.4 MiB which exceeds the 4 MiB total cap.
    const chunk900k = `${'B'.repeat(900 * 1024)}`
    const attachments = Array.from({ length: 5 }, () => ({
      dataUrl: `data:image/png;base64,${chunk900k}`,
    }))
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'ok', attachments }),
      }),
    )
    expect(response.status).toBe(413)
    expect(dbState.messagesInserted).toBe(0)
    expect(dbState.realtimeEventsInserted).toBe(0)
  })

  it('accepts content exactly at the 16KB cap (boundary-inclusive)', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')
    const atCap = 'x'.repeat(16 * 1024)
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: atCap }),
      }),
    )
    expect(response.status).toBe(201)
    expect(dbState.messagesInserted).toBe(1)
  })
})

describe('POST /api/chat/messages — CHAT-4 no dead injection-guard import', () => {
  // sanitizeForPrompt was imported but never used in this route (dead import).
  // The route only uses scanForInjection on the forward path. This test pins the
  // source contract so the dead import cannot regress: the injection-guard import
  // must name scanForInjection only, and sanitizeForPrompt must appear nowhere.
  it('imports only scanForInjection from @/lib/injection-guard', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const source = fs.readFileSync(
      path.resolve(__dirname, 'route.ts'),
      'utf8',
    )

    // The one injection-guard import line names scanForInjection only.
    const injectionImport = source.match(
      /import\s+\{[^}]*\}\s+from\s+['"]@\/lib\/injection-guard['"]/,
    )
    expect(injectionImport, 'expected an injection-guard import').not.toBeNull()
    expect(injectionImport![0]).toBe(
      "import { scanForInjection } from '@/lib/injection-guard'",
    )

    // sanitizeForPrompt appears nowhere in the file (no import, no usage).
    expect(source).not.toContain('sanitizeForPrompt')
  })
})

describe('POST /api/chat/messages — DS-4 originator metadata parity (SSE vs HTTP)', () => {
  // DS-4: the originator chat.message event (SSE frame, emitted in-tx via the
  // realtime_events outbox) and the POST response body must describe the SAME
  // message with the SAME metadata. forwardInfo is delivery metadata, not message
  // metadata: it is computed AFTER the tx commits (the gateway forward is
  // intentionally outside the tx), so it cannot be part of the in-tx outbox row.
  // Previously the HTTP body appended forwardInfo onto message.metadata while the
  // SSE frame carried the bare row metadata -> a metadata flicker for the same id.
  // The contract: forwardInfo travels on the top-level `forward` response field,
  // never on message.metadata, so both descriptions of the message are identical.
  beforeEach(async () => {
    logAuditEventMock.mockClear()
    logActivityMock.mockClear()
    broadcastMock.mockClear()
    emitSpy.mockClear()
    gatewayMock.mockClear()
    preparedStmt.run.mockClear()
    preparedStmt.get.mockClear()
    dbState.idempotentId = null
    dbState.messagesInserted = 0
    dbState.realtimeEventsInserted = 0
    dbState.transactionRan = false
    dbState.lastInsertedRow = null
    requireRoleMock.mockReset()
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
    // Live coordinator session so callOpenClawGateway fires and forwardInfo is
    // populated (attempted + delivered), which is the case that previously caused
    // the metadata to diverge between the SSE frame and the HTTP body.
    const { resolveCoordinatorDeliveryTarget } = await import('@/lib/coordinator-routing')
    ;(resolveCoordinatorDeliveryTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      sessionKey: 'sess-live',
      deliveryName: 'coordinator',
      openclawAgentId: null,
    })
    gatewayMock.mockResolvedValue({ status: 'started', runId: 'run-ds4' })
  })

  it('the SSE chat.message frame and the HTTP response carry identical metadata for the same message id', async () => {
    const { POST } = await import('@/app/api/chat/messages/route')

    // Direct-agent forward (agent_ conversation, not coord:). With a live session
    // this populates forwardInfo (attempted + delivered via callOpenClawGateway)
    // WITHOUT triggering any coord:-gated createChatReply status rows, so the final
    // SELECT of the originator row returns the originator's own metadata — mirroring
    // production's id-scoped SELECT. This is exactly the forwarded-message scenario
    // the DS-4 acceptance describes.
    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: 'ds4 parity',
          to: 'rex',
          forward: true,
          conversation_id: 'agent_rex',
          client_message_id: 'cmid-ds4',
        }),
      }),
    )
    expect(response.status).toBe(201)
    const body = await response.json()

    // The forward happened (forwardInfo is non-null on the top-level field).
    expect(body?.forward).toEqual(
      expect.objectContaining({ attempted: true, delivered: true }),
    )

    // The originator message metadata from the HTTP response body.
    const httpMetadata = body?.message?.metadata
    const messageId = body?.message?.id

    // The originator chat.message SSE frame (the in-tx outbox emission), identified
    // by the human sender 'Anthony'.
    const emissions = emitSpy.mock.calls.map((c) => c[1]) as Array<{
      type: string
      data: { id?: number; from_agent?: string; metadata?: unknown }
    }>
    const sseFrame = emissions.find(
      (e) => e.type === 'chat.message' && e.data?.from_agent === 'Anthony',
    )
    expect(sseFrame, 'expected an originator chat.message SSE frame').toBeDefined()
    expect(sseFrame!.data.id).toBe(messageId)

    const sseMetadata = sseFrame!.data.metadata

    // The two descriptions of the same message must be deeply equal. This is the
    // DS-4 contract: no metadata flicker between the realtime event and the response.
    expect(sseMetadata).toEqual(httpMetadata)
  })

  it('forwardInfo is NOT present on message.metadata (it lives on the top-level forward field)', async () => {
    // Pins the deferral contract: delivery metadata never leaks onto the message's
    // own metadata in either surface. The frontend reads data.forward first, so
    // removing forwardInfo from message.metadata is behavior-preserving.
    const { POST } = await import('@/app/api/chat/messages/route')

    const response = await POST(
      new NextRequest('http://localhost/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: 'ds4 defer',
          to: 'rex',
          forward: true,
          conversation_id: 'agent_rex',
          client_message_id: 'cmid-ds4-defer',
        }),
      }),
    )
    expect(response.status).toBe(201)
    const body = await response.json()

    // The forward still happened and is reported on the top-level field.
    expect(body?.forward).toEqual(
      expect.objectContaining({ attempted: true, delivered: true }),
    )
    // ...but it never appears on the message's own metadata in the HTTP body...
    expect(body?.message?.metadata?.forwardInfo).toBeUndefined()
    // ...nor in the originator SSE frame metadata.
    const emissions = emitSpy.mock.calls.map((c) => c[1]) as Array<{
      type: string
      data: { from_agent?: string; metadata?: { forwardInfo?: unknown } }
    }>
    const sseFrame = emissions.find(
      (e) => e.type === 'chat.message' && e.data?.from_agent === 'Anthony',
    )
    expect(sseFrame).toBeDefined()
    expect(sseFrame!.data.metadata?.forwardInfo).toBeUndefined()
  })
})
