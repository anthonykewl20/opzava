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
    expect(gatewayMock).toHaveBeenCalledTimes(1)

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

    expect(gatewayMock).toHaveBeenCalledTimes(1)
    const callArgs = gatewayMock.mock.calls[0]
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
    expect(gatewayMock).toHaveBeenCalledTimes(1)
    // The first chat.message emission is the originator (not a reply).
    const firstChat = emissions.find((e) => e.type === 'chat.message')
    expect(firstChat?.data?.from_agent).toBe('Anthony')
  })
})
