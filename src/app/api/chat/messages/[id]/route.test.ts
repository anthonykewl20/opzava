import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * CHAT-5: PATCH /api/chat/messages/[id] read-state must (a) apply the same DM
 * membership predicate as the GET list — caller must be from_agent/to_agent or
 * operator/admin — and 403 otherwise; (b) broadcast a chat.message.read event
 * carrying the message id + workspace_id so other clients reconcile read_at.
 *
 * The mock DB returns a fixed B<->C DM (Beatrice <-> Carol) so we can assert
 * authz purely from identity: operator "Anthony" (no party) -> 403, participant
 * "Beatrice" -> succeeds.
 */

// A real DM between Beatrice and Carol. to_agent is set, so it is a private DM.
const dmMessage = {
  id: 42,
  workspace_id: 1,
  conversation_id: 'conv_bc',
  from_agent: 'Beatrice',
  to_agent: 'Carol',
  content: 'hi',
  message_type: 'text',
  metadata: null,
  read_at: null as number | null,
  created_at: 1700000000,
}

const {
  requireRoleMock,
  broadcastMock,
  getMessage,
  readRunCount,
} = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  broadcastMock: vi.fn(),
  // Mutable per-test row returned by SELECT * FROM messages WHERE id = ?
  getMessage: vi.fn(() => ({ ...dmMessage })),
  // Counts UPDATE messages SET read_at runs so the authz test can assert a 403
  // path writes nothing.
  readRunCount: { n: 0 },
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({
    prepare: (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim()
      if (/UPDATE messages SET read_at/i.test(normalized)) {
        return {
          run: vi.fn(() => {
            readRunCount.n += 1
            return { changes: 1 }
          }),
          get: vi.fn(),
          all: vi.fn(() => []),
        }
      }
      // SELECT * FROM messages WHERE id = ? — return the per-test fixture, then
      // reflect a set read_at on the re-fetch so the success response carries it.
      if (/SELECT \* FROM messages WHERE id = /i.test(normalized)) {
        return {
          get: vi.fn(() => getMessage()),
          run: vi.fn(),
          all: vi.fn(() => []),
        }
      }
      return {
        get: vi.fn(() => getMessage()),
        run: vi.fn(),
        all: vi.fn(() => []),
      }
    },
    exec: vi.fn(),
  }),
}))

vi.mock('@/lib/auth', () => ({ requireRole: requireRoleMock }))
vi.mock('@/lib/event-bus', () => ({
  // broadcast(type, data) — record the call so the realtime test asserts it
  // fires with chat.message.read carrying id + workspace_id.
  eventBus: { broadcast: broadcastMock, emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

function patchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/chat/messages/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/chat/messages/[id] — DM membership authz (CHAT-5)', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
    broadcastMock.mockClear()
    getMessage.mockReset()
    getMessage.mockReturnValue({ ...dmMessage })
    readRunCount.n = 0
  })

  it('403s when an operator is NOT a party to the DM (B<->C, caller is A)', async () => {
    // Operator Anthony is privileged by role but is neither from_agent nor to_agent.
    requireRoleMock.mockReturnValue({
      user: {
        id: 1,
        username: 'anthony',
        display_name: 'Anthony',
        role: 'operator',
        workspace_id: 1,
        tenant_id: 1,
      },
    })

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const response = await PATCH(patchRequest('42', { read: true }), {
      params: Promise.resolve({ id: '42' }),
    })

    expect(response.status).toBe(403)
    // A rejected PATCH writes nothing and broadcasts nothing.
    expect(readRunCount.n).toBe(0)
    expect(broadcastMock).not.toHaveBeenCalled()
  })

  it('succeeds when the caller is from_agent on the DM (operator B)', async () => {
    requireRoleMock.mockReturnValue({
      user: {
        id: 2,
        username: 'beatrice',
        display_name: 'Beatrice',
        role: 'operator',
        workspace_id: 1,
        tenant_id: 1,
      },
    })
    // Re-fetch reflects the applied read_at.
    getMessage.mockReturnValue({ ...dmMessage, read_at: 1700000100 })

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const response = await PATCH(patchRequest('42', { read: true }), {
      params: Promise.resolve({ id: '42' }),
    })

    expect(response.status).toBe(200)
    expect(readRunCount.n).toBe(1)
  })

  it('succeeds when the caller is to_agent on the DM (viewer C)', async () => {
    // A viewer party to the DM is still allowed to mark their own read state —
    // membership, not role, is the gate.
    requireRoleMock.mockReturnValue({
      user: {
        id: 3,
        username: 'carol',
        display_name: 'Carol',
        role: 'viewer',
        workspace_id: 1,
        tenant_id: 1,
      },
    })
    getMessage.mockReturnValue({ ...dmMessage, read_at: 1700000200 })

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const response = await PATCH(patchRequest('42', { read: true }), {
      params: Promise.resolve({ id: '42' }),
    })

    expect(response.status).toBe(200)
    expect(readRunCount.n).toBe(1)
  })

  it('403s when an admin is NOT a party to the DM (party gate applies to all roles)', async () => {
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

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const response = await PATCH(patchRequest('42', { read: true }), {
      params: Promise.resolve({ id: '42' }),
    })

    expect(response.status).toBe(403)
    expect(readRunCount.n).toBe(0)
  })

  it('membership match is case-insensitive (display_name differs in casing)', async () => {
    // Stored from_agent is "Beatrice"; caller identity is "BEATRICE". Must match.
    requireRoleMock.mockReturnValue({
      user: {
        id: 2,
        username: 'beatrice',
        display_name: 'BEATRICE',
        role: 'operator',
        workspace_id: 1,
        tenant_id: 1,
      },
    })
    getMessage.mockReturnValue({ ...dmMessage, read_at: 1700000400 })

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const response = await PATCH(patchRequest('42', { read: true }), {
      params: Promise.resolve({ id: '42' }),
    })

    expect(response.status).toBe(200)
  })
})

describe('PATCH /api/chat/messages/[id] — broadcasts chat.message.read (CHAT-5)', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
    broadcastMock.mockClear()
    getMessage.mockReset()
    getMessage.mockReturnValue({ ...dmMessage })
    readRunCount.n = 0
  })

  it('fires eventBus.broadcast("chat.message.read", {id, workspace_id}) after a successful PATCH', async () => {
    requireRoleMock.mockReturnValue({
      user: {
        id: 2,
        username: 'beatrice',
        display_name: 'Beatrice',
        role: 'operator',
        workspace_id: 1,
        tenant_id: 1,
      },
    })
    getMessage.mockReturnValue({ ...dmMessage, read_at: 1700000500 })

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const response = await PATCH(patchRequest('42', { read: true }), {
      params: Promise.resolve({ id: '42' }),
    })
    expect(response.status).toBe(200)

    expect(broadcastMock).toHaveBeenCalledTimes(1)
    const [type, payload] = broadcastMock.mock.calls[0]
    expect(type).toBe('chat.message.read')
    expect(payload).toMatchObject({ id: 42, workspace_id: 1 })
  })

  it('does not broadcast when the membership check rejects (403)', async () => {
    requireRoleMock.mockReturnValue({
      user: {
        id: 1,
        username: 'anthony',
        display_name: 'Anthony',
        role: 'operator',
        workspace_id: 1,
        tenant_id: 1,
      },
    })

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    await PATCH(patchRequest('42', { read: true }), {
      params: Promise.resolve({ id: '42' }),
    })

    expect(broadcastMock).not.toHaveBeenCalled()
  })
})
