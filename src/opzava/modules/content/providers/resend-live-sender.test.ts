import { describe, expect, it } from 'vitest'
import {
  sendResendEmail,
  type ResendHttpClient
} from './resend-live-sender'

const connection = {
  fromAddress: 'news@example.com',
  fromName: 'Opzava',
  apiKey: 're_1'
}

const message = {
  to: 'reader@example.com',
  subject: 'Hi',
  html: '<p>Hi</p>'
}

it('sends an email and returns the message id', async () => {
  const cap: { body?: string } = {}
  const http: ResendHttpClient = async (_u, init) => {
    cap.body = init.body
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg_123' })
    }
  }
  const r = await sendResendEmail({ connection, message, http })
  expect(r.ok).toBe(true)
  expect(r.messageId).toBe('msg_123')
  expect(cap.body).toContain('Opzava <news@example.com>')
})

it('reports a rejected api key', async () => {
  const http: ResendHttpClient = async () => ({
    ok: false,
    status: 401,
    json: async () => ({})
  })
  const r = await sendResendEmail({ connection, message, http })
  expect(r.ok).toBe(false)
  expect(r.message).toMatch(/rejected/i)
})

it('handles an error status', async () => {
  const http: ResendHttpClient = async () => ({
    ok: false,
    status: 500,
    json: async () => ({})
  })
  const r = await sendResendEmail({ connection, message, http })
  expect(r.ok).toBe(false)
})

it('handles network failure', async () => {
  const http: ResendHttpClient = async () => {
    throw new Error('net')
  }
  const r = await sendResendEmail({ connection, message, http })
  expect(r.messageId).toBeNull()
})

describe('resend-live-sender', () => {
  it('compiles', () => {
    expect(typeof sendResendEmail).toBe('function')
  })
})
