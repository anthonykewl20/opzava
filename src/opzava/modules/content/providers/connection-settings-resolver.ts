export type SettingsReader = (key: string) => string | undefined

export type WordpressLiveConnection = Readonly<{
  siteUrl: string
  defaultAuthor?: string
  appPassword: string
}>

export type ResendLiveConnection = Readonly<{
  fromAddress: string
  fromName?: string
  apiKey: string
}>

function readTrimmed(read: SettingsReader, key: string): string {
  const v = read(key)
  return v === undefined ? '' : v.trim()
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function resolveWordpressLiveConnection(
  read: SettingsReader
): WordpressLiveConnection | null {
  const siteUrl = readTrimmed(read, 'wordpress_site_url')
  const appPassword = readTrimmed(read, 'wordpress_app_password')
  const defaultAuthor = readTrimmed(read, 'wordpress_default_author')

  if (!siteUrl || !appPassword) return null
  if (!isValidHttpUrl(siteUrl)) return null

  const base = { siteUrl, appPassword }
  return Object.freeze(
    defaultAuthor
      ? { ...base, defaultAuthor }
      : base
  )
}

export function resolveResendLiveConnection(
  read: SettingsReader
): ResendLiveConnection | null {
  const fromAddress = readTrimmed(read, 'resend_from_address')
  const fromName = readTrimmed(read, 'resend_from_name')
  const apiKey = readTrimmed(read, 'resend_api_key')

  if (!fromAddress || !apiKey) return null
  if (!EMAIL_RE.test(fromAddress)) return null

  const base = { fromAddress, apiKey }
  return Object.freeze(
    fromName
      ? { ...base, fromName }
      : base
  )
}

export function isWordpressConfigured(read: SettingsReader): boolean {
  return resolveWordpressLiveConnection(read) !== null
}

export function isResendConfigured(read: SettingsReader): boolean {
  return resolveResendLiveConnection(read) !== null
}
