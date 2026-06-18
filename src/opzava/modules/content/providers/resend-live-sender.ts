import type { ResendLiveConnection } from './connection-settings-resolver'

export type ResendHttpResponseLike = Readonly<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export type ResendHttpClient = (
  url: string,
  init: Readonly<{
    method: string
    headers: Record<string, string>
    body: string
  }>
) => Promise<ResendHttpResponseLike>

export type ResendEmailMessage = Readonly<{
  to: string
  subject: string
  html?: string
  text?: string
}>

export type ResendSendResult = Readonly<{
  ok: boolean
  messageId: string | null
  message: string
}>

export async function sendResendEmail(
  input: Readonly<{
    connection: ResendLiveConnection
    message: ResendEmailMessage
    http: ResendHttpClient
  }>
): Promise<ResendSendResult> {
  const from = input.connection.fromName
    ? `${input.connection.fromName} <${input.connection.fromAddress}>`
    : input.connection.fromAddress

  const payload = JSON.stringify({
    from,
    to: input.message.to,
    subject: input.message.subject,
    ...(input.message.html ? { html: input.message.html } : {}),
    ...(input.message.text ? { text: input.message.text } : {})
  })

  try {
    const res = await input.http('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.connection.apiKey}`
      },
      body: payload
    })

    if (res.status === 401 || res.status === 403) {
      return Object.freeze({
        ok: false,
        messageId: null,
        message: 'Resend rejected the API key'
      })
    }

    if (!res.ok) {
      return Object.freeze({
        ok: false,
        messageId: null,
        message: `Resend returned status ${res.status}`
      })
    }

    const data = await res.json().catch(() => null)
    const id =
      data && typeof data === 'object' && 'id' in data
        ? String((data as { id: unknown }).id)
        : null

    return Object.freeze({
      ok: true,
      messageId: id,
      message: 'Email sent via Resend'
    })
  } catch {
    return Object.freeze({
      ok: false,
      messageId: null,
      message: 'Could not reach Resend'
    })
  }
}
