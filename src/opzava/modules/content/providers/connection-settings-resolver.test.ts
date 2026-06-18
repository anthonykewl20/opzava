import { describe, expect, it } from 'vitest'
import {
  resolveWordpressLiveConnection,
  resolveResendLiveConnection,
  isWordpressConfigured,
  isResendConfigured,
  type SettingsReader
} from './connection-settings-resolver'

function reader(map: Record<string, string>): SettingsReader {
  return (k) => map[k]
}

describe('resolveWordpressLiveConnection', () => {
  it('resolves a configured wordpress connection', () => {
    const c = resolveWordpressLiveConnection(
      reader({
        wordpress_site_url: 'https://blog.example.com',
        wordpress_app_password: 'app-pass-123'
      })
    )
    expect(c).not.toBeNull()
    expect(c!.siteUrl).toBe('https://blog.example.com')
    expect(c!.appPassword).toBe('app-pass-123')
  })

  it('returns null when the wordpress secret is missing', () => {
    expect(
      resolveWordpressLiveConnection(
        reader({ wordpress_site_url: 'https://blog.example.com' })
      )
    ).toBeNull()
    expect(
      isWordpressConfigured(
        reader({ wordpress_site_url: 'https://blog.example.com' })
      )
    ).toBe(false)
  })

  it('returns null for an invalid wordpress site url', () => {
    expect(
      resolveWordpressLiveConnection(
        reader({ wordpress_site_url: 'not-a-url', wordpress_app_password: 'x' })
      )
    ).toBeNull()
  })
})

describe('resolveResendLiveConnection', () => {
  it('resolves a configured resend connection', () => {
    const c = resolveResendLiveConnection(
      reader({
        resend_from_address: 'news@example.com',
        resend_from_name: 'Opzava',
        resend_api_key: 're_123'
      })
    )
    expect(c).not.toBeNull()
    expect(c!.fromAddress).toBe('news@example.com')
    expect(c!.fromName).toBe('Opzava')
    expect(c!.apiKey).toBe('re_123')
    expect(
      isResendConfigured(
        reader({ resend_from_address: 'news@example.com', resend_api_key: 're_123' })
      )
    ).toBe(true)
  })

  it('returns null when the resend api key is missing or from-address invalid', () => {
    expect(
      resolveResendLiveConnection(
        reader({ resend_from_address: 'news@example.com' })
      )
    ).toBeNull()
    expect(
      resolveResendLiveConnection(
        reader({ resend_from_address: 'bad', resend_api_key: 're_1' })
      )
    ).toBeNull()
  })
})
