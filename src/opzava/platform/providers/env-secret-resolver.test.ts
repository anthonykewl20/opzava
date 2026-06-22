import { describe, it, expect } from 'vitest'
import { createEnvSecretResolver } from './env-secret-resolver'
import { createSecretReference } from '../admin-config/contracts'

const ref = createSecretReference({
  id: 'RESEND_API_KEY',
  scope: 'provider-credential',
  purpose: 'Resend API key for campaign sends',
})

describe('createEnvSecretResolver', () => {
  it('resolves a present environment secret', async () => {
    const resolver = createEnvSecretResolver({
      readEnv: (name) => (name === 'RESEND_API_KEY' ? 're_live_abc' : undefined),
    })
    const result = await resolver.resolveSecret(ref)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.secretValue).toBe('re_live_abc')
      expect(result.value.reference).toEqual(ref)
    }
  })

  it('trims surrounding whitespace from the secret', async () => {
    const resolver = createEnvSecretResolver({ readEnv: () => '  re_live_abc\n' })
    const result = await resolver.resolveSecret(ref)
    expect(result.ok && result.value.secretValue).toBe('re_live_abc')
  })

  it('fails closed (not-found) when the env secret is absent', async () => {
    const resolver = createEnvSecretResolver({ readEnv: () => undefined })
    const result = await resolver.resolveSecret(ref)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('not-found')
      expect(result.error.reference).toEqual(ref)
      expect(result.error.message).toContain('RESEND_API_KEY')
    }
  })

  it('fails closed (not-found) when the env value is empty/whitespace', async () => {
    const resolver = createEnvSecretResolver({ readEnv: () => '   ' })
    const result = await resolver.resolveSecret(ref)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })

  it('reads only the env name named by the reference id', async () => {
    const seen: string[] = []
    const resolver = createEnvSecretResolver({
      readEnv: (name) => {
        seen.push(name)
        return 're_x'
      },
    })
    await resolver.resolveSecret(ref)
    expect(seen).toEqual(['RESEND_API_KEY'])
  })

  it('returns invalid-reference for a malformed reference (defensive)', async () => {
    const resolver = createEnvSecretResolver({ readEnv: () => 're_x' })
    // id must be a non-empty string per the contract
    const bad = { kind: 'SecretReference', id: '', scope: 'provider-credential', purpose: 'x' }
    const result = await resolver.resolveSecret(bad as never)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-reference')
      expect(result.error.message).toContain('valid SecretReference')
    }
  })
})
