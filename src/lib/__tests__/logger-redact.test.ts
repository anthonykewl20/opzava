/**
 * SEC-4: the centralized pino logger must redact secret-bearing fields so raw
 * credentials are never written to stdout or shipped to the aggregator.
 *
 * We build a logger with the same redact configuration the app uses and capture
 * its serialized output, then assert that a logged object carrying a bearer
 * token, an API key, and a high-entropy password is emitted masked — not raw.
 */
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import pino, { type Logger } from 'pino'

/**
 * The redact paths must live in one place and be imported by the test so the
 * assertion tracks the production config (no drift). Exported by logger.ts.
 */
import { REDACT_PATHS } from '@/lib/logger'

function captureLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      lines.push(chunk.toString())
      callback()
    },
  })
  const logger = pino(
    { level: 'info', redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' } },
    stream,
  )
  return { logger, lines }
}

describe('SEC-4: logger redaction', () => {
  it('exposes a non-empty redact paths list', () => {
    expect(Array.isArray(REDACT_PATHS)).toBe(true)
    expect(REDACT_PATHS.length).toBeGreaterThan(0)
  })

  it('covers the canonical secret-bearing fields', () => {
    const joined = REDACT_PATHS.join(' ')
    expect(joined).toContain('authorization')
    expect(joined).toContain('token')
    expect(joined).toContain('apiKey')
    expect(joined).toContain('secret')
    expect(joined).toContain('password')
  })

  it('masks a bearer token in req.headers.authorization', () => {
    const { logger, lines } = captureLogger()
    const bearer = 'Bearer ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    logger.info({ req: { headers: { authorization: bearer } } }, 'inbound request')
    expect(lines.length).toBeGreaterThan(0)
    const out = lines.join('\n')
    expect(out).not.toContain(bearer)
    expect(out).toContain('[REDACTED]')
  })

  it('masks high-entropy apiKey / password / secret fields', () => {
    const { logger, lines } = captureLogger()
    const apiKey = 'sk-ant-api03-' + 'b'.repeat(80)
    const password = 'S3cr3t-' + Math.random().toString(36).slice(2)
    const secret = 'gho_' + 'c'.repeat(36)
    logger.info(
      {
        apiKey,
        user: { password, token: secret, secret: 'azure-conn-key' },
      },
      'provider call',
    )
    const out = lines.join('\n')
    expect(out).not.toContain(apiKey)
    expect(out).not.toContain(password)
    expect(out).not.toContain(secret)
  })
})
