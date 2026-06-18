import { describe, expect, it } from 'vitest'

import {
  createSecretReference,
  parseSecretResolutionFailure,
  parseAdminConfigRecord,
  redactAdminConfigRecordForAudit,
  redactSecretResolutionFailureForAudit,
} from './contracts'

describe('Opzava admin config contracts', () => {
  it('accepts a versioned secret config record with validation and audit metadata', () => {
    const secretRef = createSecretReference({
      id: 'secret_provider_anthropic_api_key',
      scope: 'provider-credential',
      purpose: 'llm-provider-api-key',
    })

    const record = parseAdminConfigRecord({
      schemaVersion: 1,
      key: 'providers.anthropic.apiKey',
      owner: 'platform.providers',
      sensitivity: 'secret',
      value: secretRef,
      validation: {
        status: 'valid',
        checkedAt: '2026-06-15T00:00:00.000Z',
      },
      audit: {
        actorId: 'admin:1',
        reason: 'Enable Anthropic provider after credential approval',
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
    })

    expect(record.value).toEqual(secretRef)
    expect(record.validation.status).toBe('valid')
    expect(record.audit.actorId).toBe('admin:1')
  })

  it('rejects cleartext values for secret config records', () => {
    expect(() =>
      parseAdminConfigRecord({
        schemaVersion: 1,
        key: 'providers.openai.apiKey',
        owner: 'platform.providers',
        sensitivity: 'secret',
        value: 'sk-live-do-not-store-cleartext',
        validation: {
          status: 'pending',
          checkedAt: '2026-06-15T00:00:00.000Z',
        },
        audit: {
          actorId: 'admin:1',
          reason: 'Attempt cleartext provider credential',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      }),
    ).toThrow(/SecretReference/)
  })

  it('redacts secret references before records are written to audit logs', () => {
    const record = parseAdminConfigRecord({
      schemaVersion: 1,
      key: 'providers.wordpress.password',
      owner: 'platform.providers',
      sensitivity: 'secret',
      value: createSecretReference({
        id: 'secret_wordpress_password_value',
        scope: 'provider-credential',
        purpose: 'wordpress-publishing-password',
      }),
      validation: {
        status: 'valid',
        checkedAt: '2026-06-15T00:00:00.000Z',
      },
      audit: {
        actorId: 'admin:1',
        reason: 'Configure WordPress publishing credential',
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
    })

    const auditRecord = redactAdminConfigRecordForAudit(record)
    const serialized = JSON.stringify(auditRecord)

    expect(auditRecord.value).toEqual('[secret-reference:provider-credential]')
    expect(serialized).not.toContain('secret_wordpress_password_value')
    expect(serialized).not.toContain('wordpress-publishing-password')
  })

  it('models secret resolution failures without leaking the unresolved secret reference', () => {
    const failure = parseSecretResolutionFailure({
      kind: 'SecretResolutionFailure',
      code: 'not-found',
      reference: createSecretReference({
        id: 'secret_missing_provider_key',
        scope: 'provider-credential',
        purpose: 'missing-provider-key',
      }),
      message: 'Configured provider credential could not be resolved',
    })

    const auditFailure = redactSecretResolutionFailureForAudit(failure)
    const serialized = JSON.stringify(auditFailure)

    expect(auditFailure.reference).toBe('[secret-reference:provider-credential]')
    expect(serialized).not.toContain('secret_missing_provider_key')
    expect(serialized).not.toContain('missing-provider-key')
  })
})
