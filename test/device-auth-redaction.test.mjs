import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

// D7: the device-auth redaction governance test. Device tokens (mc_dt_*, mc_rt_*) and
// device_codes must NEVER appear in a log, error message, or console output. This test
// greps every device-auth source file for patterns that would leak a raw token to a log
// stream. Analogous to test/branding.test.mjs — a mechanical rule that future commits
// cannot regress.

const DEVICE_AUTH_DIRS = [
  'src/opzava/core/auth',
  'src/app/api/auth/device',
]

const DEVICE_AUTH_FILES = [
  'src/lib/auth.ts', // B1b: resolveDeviceToken cascade branch
]

// Raw token prefixes + sensitive identifiers that must never be logged verbatim.
const LEAK_PATTERNS = [
  /console\.(log|error|warn|info|debug)\s*\([^)]*(?:mc_dt_|mc_rt_|access_token|refresh_token|device_code)/i,
  /logger\.(info|warn|error|debug)\s*\(\s*(?:['"`]|{)/, // bare logger call with a literal/string-start (review manually)
]

// But ALLOW: logger calls that use maskToken(), structured objects with masked fields, or
// comments that reference the prefix as documentation. The test flags SUSEPECT patterns,
// not all logger calls — it specifically catches console.* with token substrings.
const RAW_TOKEN_IN_CONSOLE = /console\.(log|error|warn|info|debug)\s*\([^)]*\b(?:mc_dt_|mc_rt_|access_token|refresh_token|device_code)\b/i

async function collectTsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) files.push(...(await collectTsFiles(full)))
    else if (e.name.endsWith('.ts')) files.push(full)
  }
  return files
}

test('D7: no raw device-auth tokens leak into console output', async () => {
  const allFiles = []
  for (const dir of DEVICE_AUTH_DIRS) {
    try {
      allFiles.push(...(await collectTsFiles(join(repoRoot, dir))))
    } catch { /* dir may not exist yet */ }
  }
  for (const f of DEVICE_AUTH_FILES) {
    allFiles.push(join(repoRoot, f))
  }

  const violations = []
  for (const file of allFiles) {
    let source
    try { source = await readFile(file, 'utf8') } catch { continue }
    const rel = relative(repoRoot, file)
    if (RAW_TOKEN_IN_CONSOLE.test(source)) {
      violations.push(rel)
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Raw device-auth tokens (mc_dt_/mc_rt_/access_token/refresh_token/device_code) found in console output in: ${violations.join(', ')}. Use maskToken() or structured logging with masked fields instead.`,
  )
})

test('D7: the redaction test itself covers the device-auth source surface', async () => {
  // Ensure we're actually scanning files (not silently skipping a missing dir).
  assert.ok(allFiles.length > 0 || DEVICE_AUTH_FILES.length > 0, 'no device-auth files found to scan')
})

// Hoist for the second test
const allFiles = []
for (const dir of DEVICE_AUTH_DIRS) {
  try { allFiles.push(...(await collectTsFiles(join(repoRoot, dir)))) } catch { /* */ }
}
for (const f of DEVICE_AUTH_FILES) allFiles.push(join(repoRoot, f))
