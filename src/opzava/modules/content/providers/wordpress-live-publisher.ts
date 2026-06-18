import type { WordpressLiveConnection } from './connection-settings-resolver'
import type { WordpressDraftRequest } from '../contracts/wordpress-draft-request'

export type HttpResponseLike = Readonly<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export type HttpClient = (
  url: string,
  init: Readonly<{
    method: string
    headers: Record<string, string>
    body: string
  }>
) => Promise<HttpResponseLike>

export type WordpressDraftCreateResult = Readonly<{
  ok: boolean
  status: 'draft'
  externalPostId: string | null
  message: string
}>

export async function createWordpressDraft(
  input: Readonly<{
    connection: WordpressLiveConnection
    request: WordpressDraftRequest
    http: HttpClient
    username?: string
  }>
): Promise<WordpressDraftCreateResult> {
  const base = input.connection.siteUrl.replace(/\/$/, '')
  const url = `${base}/wp-json/wp/v2/posts`
  const user = input.username ?? input.connection.defaultAuthor ?? 'admin'
  const token = Buffer.from(`${user}:${input.connection.appPassword}`).toString('base64')
  const payload = JSON.stringify({
    title: input.request.title,
    content: input.request.bodyMarkdown,
    status: 'draft'
  })

  try {
    const res = await input.http(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${token}`
      },
      body: payload
    })

    if (res.status === 401 || res.status === 403) {
      return Object.freeze({
        ok: false,
        status: 'draft',
        externalPostId: null,
        message: 'WordPress rejected the credentials'
      })
    }

    if (!res.ok) {
      return Object.freeze({
        ok: false,
        status: 'draft',
        externalPostId: null,
        message: `WordPress returned status ${res.status}`
      })
    }

    const data = await res.json().catch(() => null)
    const id =
      data && typeof data === 'object' && 'id' in data
        ? String((data as { id: unknown }).id)
        : null

    return Object.freeze({
      ok: true,
      status: 'draft',
      externalPostId: id,
      message: 'Draft created in WordPress'
    })
  } catch {
    return Object.freeze({
      ok: false,
      status: 'draft',
      externalPostId: null,
      message: 'Could not reach WordPress'
    })
  }
}
