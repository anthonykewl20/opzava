import { describe, it, expect } from 'vitest'
import {
  resolveResendCampaignConnection,
  RESEND_API_KEY_SECRET_REFERENCE,
} from './resolve-resend-campaign-connection'
import { createEnvSecretResolver } from '@/opzava/platform/providers/env-secret-resolver'

function settingsReader(values: Record<string, string>) {
  const asked: string[] = []
  const read = (key: string): string | undefined => {
    asked.push(key)
    return values[key]
  }
  return { read, asked }
}

const envWithKey = createEnvSecretResolver({
  readEnv: (name) => (name === RESEND_API_KEY_SECRET_REFERENCE.id ? 're_live_secret' : undefined),
})
const envWithoutKey = createEnvSecretResolver({ readEnv: () => undefined })

describe('RESEND_API_KEY_SECRET_REFERENCE', () => {
  it('names the RESEND_API_KEY env var as a provider credential', () => {
    expect(RESEND_API_KEY_SECRET_REFERENCE.id).toBe('RESEND_API_KEY')
    expect(RESEND_API_KEY_SECRET_REFERENCE.scope).toBe('provider-credential')
    expect(RESEND_API_KEY_SECRET_REFERENCE.purpose).toBe('Resend API key for campaign sends')
  })
})

describe('resolveResendCampaignConnection', () => {
  it('trims surrounding whitespace from the from-address and from-name', async () => {
    const { read } = settingsReader({
      resend_from_address: '  team@opzava.dev  ',
      resend_from_name: '  Opzava  ',
    })
    const result = await resolveResendCampaignConnection({ readSetting: read, resolver: envWithKey })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.connection.fromAddress).toBe('team@opzava.dev')
      expect(result.connection).toMatchObject({ fromName: 'Opzava' })
    }
  })

  it('rejects an address whose junk is anchored outside the email (start/end anchors)', async () => {
    // `@a@b.co` only matches if the `^` anchor is dropped; `a@b.co@x` only matches if `$` is dropped.
    for (const bad of ['@a@b.co', 'a@b.co@x']) {
      const result = await resolveResendCampaignConnection({
        readSetting: settingsReader({ resend_from_address: bad }).read,
        resolver: envWithKey,
      })
      expect(result.ok === false && result.reason).toBe('from-address-missing')
    }
  })

  it('builds a connection from non-secret settings + the env-resolved API key', async () => {
    const { read } = settingsReader({
      resend_from_address: 'team@opzava.dev',
      resend_from_name: 'Opzava',
    })
    const result = await resolveResendCampaignConnection({ readSetting: read, resolver: envWithKey })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.connection).toEqual({
        fromAddress: 'team@opzava.dev',
        fromName: 'Opzava',
        apiKey: 're_live_secret',
      })
    }
  })

  it('omits fromName when not set', async () => {
    const { read } = settingsReader({ resend_from_address: 'team@opzava.dev' })
    const result = await resolveResendCampaignConnection({ readSetting: read, resolver: envWithKey })
    expect(result.ok && 'fromName' in result.connection).toBe(false)
  })

  it('NEVER reads the API key from settings (no cleartext secret at rest)', async () => {
    const { read, asked } = settingsReader({ resend_from_address: 'team@opzava.dev' })
    await resolveResendCampaignConnection({ readSetting: read, resolver: envWithKey })
    expect(asked).not.toContain('resend_api_key')
  })

  it('fails closed when the API key secret is unavailable', async () => {
    const { read } = settingsReader({ resend_from_address: 'team@opzava.dev' })
    const result = await resolveResendCampaignConnection({ readSetting: read, resolver: envWithoutKey })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('secret-unavailable')
  })

  it('reports from-address-missing when the from address is absent or invalid', async () => {
    const missing = await resolveResendCampaignConnection({
      readSetting: settingsReader({}).read,
      resolver: envWithKey,
    })
    expect(missing.ok === false && missing.reason).toBe('from-address-missing')

    const invalid = await resolveResendCampaignConnection({
      readSetting: settingsReader({ resend_from_address: 'not-an-email' }).read,
      resolver: envWithKey,
    })
    expect(invalid.ok === false && invalid.reason).toBe('from-address-missing')
  })
})
