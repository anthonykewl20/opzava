import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// scripts/security-audit.sh ships with a blocklist of known insecure AUTH_PASS
// defaults. The actual default baked into compose/e2e fixtures is
// `testpass1234!` (trailing `!`), which is 13 chars and so also slips past the
// minimum-length check. The audit MUST flag the full literal default.

const scriptPath = resolve(__dirname, '../../../scripts/security-audit.sh')

function runAudit(authPass: string): string {
  // `set -euo pipefail` in the script forces exit 1 on any failed check; we
  // only care about stdout/stderr content, so swallow the non-zero exit.
  try {
    return execFileSync('bash', [scriptPath, '/nonexistent-env'], {
      env: { ...process.env, AUTH_PASS: authPass },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    return `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
}

describe('security-audit.sh insecure-default blocklist', () => {
  it.each([
    ['testpass1234!', 'compose/e2e default with trailing bang'],
    ['testpass1234', 'legacy short default'],
    ['changeme', 'generic placeholder'],
  ])('flags %s (%s) as an insecure default', (authPass) => {
    const output = runAudit(authPass)

    expect(output.toLowerCase()).toMatch(/insecure default/)
  })

  it('does not flag a strong bespoke password', () => {
    const output = runAudit('a-strong-bespoke-pw-7f3c9a')

    expect(output.toLowerCase()).not.toMatch(/insecure default/)
  })
})
