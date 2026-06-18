import { describe, expect, it } from 'vitest'
import { createSecretReference } from './contracts'
import {
  parseResendConnectionConfig,
  redactResendConnectionConfigForAudit,
  RESEND_CONNECTION_SCHEMA_VERSION
} from './resend-connection'

function apiKey() {
  return createSecretReference({
    id: 'secret_resend_api_key_001',
    scope: 'provider-credential',
    purpose: 'Resend API key'
  })
}

function validConfig() {
  return {
    schemaVersion: RESEND_CONNECTION_SCHEMA_VERSION,
    defaultFromAddress: 'news@example.com',
    defaultFromName: 'Opzava News',
    apiKeyRef: apiKey()
  }
}

describe('resend connection config', () => {
  it('parses a valid resend connection config', () => {
    const c = parseResendConnectionConfig(validConfig())
    expect(c.defaultFromAddress).toBe('news@example.com')
    expect(c.apiKeyRef.id).toBe('secret_resend_api_key_001')
  })

  it('rejects a non-email from-address', () => {
    expect(() => parseResendConnectionConfig({ ...validConfig(), defaultFromAddress: 'not-an-email' })).toThrow()
  })

  it('rejects an api key with the wrong scope', () => {
    const wrong = createSecretReference({ id: 'secret_x', scope: 'webhook-secret', purpose: 'x' })
    expect(() => parseResendConnectionConfig({ ...validConfig(), apiKeyRef: wrong })).toThrow()
  })

  it('redacts the api key for audit so the secret id never appears', () => {
    const c = parseResendConnectionConfig(validConfig())
    const safe = redactResendConnectionConfigForAudit(c)
    expect(safe.apiKeyRef).toBe('[secret-reference:provider-credential]')
    expect(JSON.stringify(safe)).not.toContain('secret_resend_api_key_001')
    expect(safe.defaultFromAddress).toBe('news@example.com')
  })
})
