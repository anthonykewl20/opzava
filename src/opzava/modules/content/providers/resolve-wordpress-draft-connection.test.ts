import { describe, it, expect } from 'vitest'
import {
  resolveWordpressDraftConnection,
  WORDPRESS_APP_PASSWORD_SECRET_REFERENCE,
} from './resolve-wordpress-draft-connection'
import { createEnvSecretResolver } from '@/opzava/platform/providers/env-secret-resolver'

function settingsReader(values: Record<string, string>) {
  const asked: string[] = []
  const read = (key: string): string | undefined => {
    asked.push(key)
    return values[key]
  }
  return { read, asked }
}

const envWithSecret = createEnvSecretResolver({
  readEnv: (name) =>
    name === WORDPRESS_APP_PASSWORD_SECRET_REFERENCE.id ? 'wp_app_secret' : undefined,
})
const envWithoutSecret = createEnvSecretResolver({ readEnv: () => undefined })

describe('resolveWordpressDraftConnection', () => {
  it('builds a connection from non-secret settings + the env-resolved app password', async () => {
    const { read } = settingsReader({
      wordpress_site_url: 'https://blog.example.com',
      wordpress_default_author: 'Opzava',
    })
    const result = await resolveWordpressDraftConnection({ readSetting: read, resolver: envWithSecret })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.connection).toEqual({
        siteUrl: 'https://blog.example.com',
        defaultAuthor: 'Opzava',
        appPassword: 'wp_app_secret',
      })
    }
  })

  it('omits defaultAuthor when not set', async () => {
    const { read } = settingsReader({ wordpress_site_url: 'https://blog.example.com' })
    const result = await resolveWordpressDraftConnection({ readSetting: read, resolver: envWithSecret })
    expect(result.ok && 'defaultAuthor' in result.connection).toBe(false)
  })

  it('NEVER reads the app password from settings (no cleartext secret at rest)', async () => {
    const { read, asked } = settingsReader({ wordpress_site_url: 'https://blog.example.com' })
    await resolveWordpressDraftConnection({ readSetting: read, resolver: envWithSecret })
    expect(asked).not.toContain('wordpress_app_password')
  })

  it('fails closed when the app password secret is unavailable', async () => {
    const { read } = settingsReader({ wordpress_site_url: 'https://blog.example.com' })
    const result = await resolveWordpressDraftConnection({ readSetting: read, resolver: envWithoutSecret })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('secret-unavailable')
  })

  it('reports site-url-missing when the site URL is absent or not http(s)', async () => {
    const missing = await resolveWordpressDraftConnection({
      readSetting: settingsReader({}).read,
      resolver: envWithSecret,
    })
    expect(missing.ok === false && missing.reason).toBe('site-url-missing')

    const invalid = await resolveWordpressDraftConnection({
      readSetting: settingsReader({ wordpress_site_url: 'not-a-url' }).read,
      resolver: envWithSecret,
    })
    expect(invalid.ok === false && invalid.reason).toBe('site-url-missing')
  })
})
