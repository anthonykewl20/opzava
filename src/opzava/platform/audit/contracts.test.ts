import { describe, expect, it } from 'vitest'

import { createSecretReference } from '../admin-config/contracts'
import { parseAuditEvent } from './contracts'

describe('Opzava audit event contracts', () => {
  it('accepts state-change audit events with correlation IDs and redacted summaries', () => {
    const event = parseAuditEvent({
      schemaVersion: 1,
      auditEventId: 'audit_event_001',
      actorId: 'admin:1',
      action: 'approval.approved',
      target: {
        kind: 'approval',
        id: 'approval_wordpress_draft_001',
      },
      beforeSummary: {
        status: 'requested',
      },
      afterSummary: {
        status: 'approved',
      },
      correlationId: 'corr_run_001',
      occurredAt: '2026-06-15T00:00:00.000Z',
    })

    expect(event.action).toBe('approval.approved')
    expect(event.correlationId).toBe('corr_run_001')
  })

  it('rejects audit summaries containing secret references', () => {
    expect(() =>
      parseAuditEvent({
        schemaVersion: 1,
        auditEventId: 'audit_event_bad_secret_001',
        actorId: 'admin:1',
        action: 'provider.configured',
        target: {
          kind: 'provider-profile',
          id: 'live-llm',
        },
        beforeSummary: null,
        afterSummary: {
          credential: createSecretReference({
            id: 'secret_live_provider_key',
            scope: 'provider-credential',
            purpose: 'llm-provider-api-key',
          }),
        },
        correlationId: 'corr_settings_001',
        occurredAt: '2026-06-15T00:00:00.000Z',
      }),
    ).toThrow(/secret/i)
  })
})
