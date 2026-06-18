import type { WordpressLiveConnection, ResendLiveConnection } from './connection-settings-resolver'

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> }
) => Promise<{ ok: boolean; status: number }>

export type ConnectionVerifyResult = Readonly<{ ok: boolean; message: string }>

export async function verifyWordpressConnection(
  conn: WordpressLiveConnection,
  fetchImpl: FetchLike
): Promise<ConnectionVerifyResult> {
  const url = `${conn.siteUrl.replace(/\/$/, '')}/wp-json/`
  try {
    const res = await fetchImpl(url, { method: 'GET' })
    if (res.ok) {
      return Object.freeze({ ok: true, message: 'WordPress REST API reachable' })
    }
    if (res.status === 401 || res.status === 403) {
      return Object.freeze({
        ok: false,
        message: 'WordPress reachable but credentials were rejected'
      })
    }
    return Object.freeze({
      ok: false,
      message: `WordPress returned status ${res.status}`
    })
  } catch {
    return Object.freeze({ ok: false, message: 'Could not reach the WordPress site' })
  }
}

export async function verifyResendConnection(
  conn: ResendLiveConnection,
  fetchImpl: FetchLike
): Promise<ConnectionVerifyResult> {
  try {
    const res = await fetchImpl('https://api.resend.com/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${conn.apiKey}` }
    })
    if (res.ok) {
      return Object.freeze({ ok: true, message: 'Resend API key is valid' })
    }
    if (res.status === 401 || res.status === 403) {
      return Object.freeze({ ok: false, message: 'Resend API key was rejected' })
    }
    return Object.freeze({
      ok: false,
      message: `Resend returned status ${res.status}`
    })
  } catch {
    return Object.freeze({ ok: false, message: 'Could not reach Resend' })
  }
}
