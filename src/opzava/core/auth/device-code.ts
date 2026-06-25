import { randomBytes, randomInt } from 'node:crypto'
import { DEVICE_CODE_BYTES, USER_CODE_CHARSET, USER_CODE_LEN } from './contracts'

/**
 * RFC 8628 device-code issuance. The device_code is high-entropy (>=128 bits) and NEVER
 * displayed; the user_code is low-entropy but human-typed, drawn from a confusable-free
 * base-20 charset. The canonical (dash-stripped, uppercased) form is the DB key.
 */

export interface IssuedDeviceCode {
  deviceCode: string // >=128 bits, base64url, never displayed
  userCode: string // XXXX-XXXX (human-typed)
  userCodeCanonical: string // canonical DB key (no dash, upper)
}

export function issueDeviceCode(): IssuedDeviceCode {
  const deviceCode = randomBytes(DEVICE_CODE_BYTES).toString('base64url')
  const userCode = randomUserCode()
  return { deviceCode, userCode, userCodeCanonical: canonicalizeUserCode(userCode) }
}

/** A user_code formatted XXXX-XXXX from the base-20 charset. */
export function randomUserCode(): string {
  const chars = Array.from({ length: USER_CODE_LEN }, () => USER_CODE_CHARSET[randomInt(USER_CODE_CHARSET.length)])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

/** Canonical form for DB lookup: uppercase, non-alnum stripped (so 'abcd-efgh' == 'abcdefgh'). */
export function canonicalizeUserCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
