import { describe, expect, it } from 'vitest'
import { createSecretReference } from './contracts'
import {
  parseWordpressConnectionConfig,
  redactWordpressConnectionConfigForAudit,
  WORDPRESS_CONNECTION_SCHEMA_VERSION
} from './wordpress-connection'

function credential() {
  return createSecretReference({
    id: 'secret_wp_app_password_001',
    scope: 'provider-credential',
    purpose: 'WordPress application password'
  })
}

function validConfig() {
  return {
    schemaVersion: WORDPRESS_CONNECTION_SCHEMA_VERSION,
    siteUrl: 'https://blog.example.com',
    defaultAuthor: 'editor',
    defaultStatus: 'draft',
    credentialRef: credential()
  }
}

describe('wordpressConnectionConfig', () => {
  it('parses a valid wordpress connection config', () => {
    const config = parseWordpressConnectionConfig(validConfig())
    expect(config.siteUrl).toBe('https://blog.example.com')
    expect(config.defaultStatus).toBe('draft')
    expect(config.credentialRef.id).toBe('secret_wp_app_password_001')
  })

  it('rejects a non-url site', () => {
    expect(() => parseWordpressConnectionConfig({ ...validConfig(), siteUrl: 'not-a-url' })).toThrow()
  })

  it('rejects a non-draft default status', () => {
    expect(() => parseWordpressConnectionConfig({ ...validConfig(), defaultStatus: 'publish' })).toThrow()
  })

  it('rejects a credential with the wrong scope', () => {
    const wrongScope = createSecretReference({ id: 'secret_x', scope: 'webhook-secret', purpose: 'x' })
    expect(() => parseWordpressConnectionConfig({ ...validConfig(), credentialRef: wrongScope })).toThrow()
  })

  it('redacts the credential for audit so the secret id never appears', () => {
    const config = parseWordpressConnectionConfig(validConfig())
    const safe = redactWordpressConnectionConfigForAudit(config)
    expect(safe.credentialRef).toBe('[secret-reference:provider-credential]')
    expect(JSON.stringify(safe)).not.toContain('secret_wp_app_password_001')
    expect(safe.siteUrl).toBe('https://blog.example.com')
  })
})
