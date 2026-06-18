import { describe, expect, it } from 'vitest'
import { createWordpressDraft, type HttpClient } from './wordpress-live-publisher'

const connection = {
  siteUrl: 'https://blog.example.com',
  appPassword: 'pw',
  defaultAuthor: 'editor'
}

const request = {
  schemaVersion: 1,
  requestId: 'r1',
  ideaId: 'i',
  draftId: 'd',
  approvalId: 'a',
  title: 'Hello',
  bodyMarkdown: '# Hi',
  status: 'draft',
  gateArtifacts: {
    sourceCaptureId: 's',
    factCheckReportId: 'f',
    brandReviewId: 'b',
    antiSlopReviewId: 'as'
  },
  createdAt: 't'
} as unknown as import('../contracts/wordpress-draft-request').WordpressDraftRequest
function http(resp: { ok: boolean; status: number; body?: unknown }): HttpClient {
  return async () => ({
    ok: resp.ok,
    status: resp.status,
    json: async () => resp.body ?? {}
  })
}

describe('createWordpressDraft', () => {
  it('creates a draft and returns the external post id', async () => {
    const captured: { body?: string } = {}
    const client: HttpClient = async (_u, init) => {
      captured.body = init.body
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 4567 })
      }
    }
    const r = await createWordpressDraft({ connection, request, http: client })
    expect(r.ok).toBe(true)
    expect(r.status).toBe('draft')
    expect(r.externalPostId).toBe('4567')
    expect(captured.body).toContain('"status":"draft"')
  })

  it('reports rejected credentials', async () => {
    const r = await createWordpressDraft({
      connection,
      request,
      http: http({ ok: false, status: 401 })
    })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/credential/i)
  })

  it('handles an error status', async () => {
    const r = await createWordpressDraft({
      connection,
      request,
      http: http({ ok: false, status: 500 })
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe('draft')
  })

  it('handles network failure', async () => {
    const client: HttpClient = async () => {
      throw new Error('net')
    }
    const r = await createWordpressDraft({ connection, request, http: client })
    expect(r.ok).toBe(false)
    expect(r.externalPostId).toBeNull()
  })
})
