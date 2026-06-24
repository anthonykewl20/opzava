import { describe, expect, it } from 'vitest'

import {
  SECRET_REFERENCE_KIND,
  createSecretReference,
  isSecretReference,
  secretReferenceSchema,
} from './contracts'

describe('Opzava secret-reference core contract', () => {
  it('builds a frozen SecretReference with the stable kind', () => {
    const ref = createSecretReference({
      id: 'secret_provider_key',
      scope: 'provider-credential',
      purpose: 'provider-api-key',
    })
    expect(ref.kind).toBe(SECRET_REFERENCE_KIND)
    expect(Object.isFrozen(ref)).toBe(true)
  })

  it('detects secret references when a value is checked', () => {
    const ref = createSecretReference({ id: 's1', scope: 'operator-secret', purpose: 'p' })
    expect(isSecretReference(ref)).toBe(true)
    // Missing the discriminator kind → not a secret reference.
    expect(isSecretReference({ id: 's1', scope: 'operator-secret', purpose: 'p' })).toBe(false)
    expect(isSecretReference('not-a-secret')).toBe(false)
    expect(isSecretReference(null)).toBe(false)
  })

  it('rejects empty ids/purposes and unknown scopes', () => {
    expect(() => createSecretReference({ id: '', scope: 'provider-credential', purpose: 'p' })).toThrow()
    expect(() => createSecretReference({ id: 's1', scope: 'provider-credential', purpose: '' })).toThrow()
    expect(() =>
      createSecretReference({ id: 's1', scope: 'nope', purpose: 'p' } as never),
    ).toThrow()
  })

  it('parses valid references and rejects unknown fields', () => {
    const valid = { kind: 'SecretReference', id: 's', scope: 'webhook-secret', purpose: 'p' }
    expect(secretReferenceSchema.safeParse(valid).success).toBe(true)
    expect(secretReferenceSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })
})
