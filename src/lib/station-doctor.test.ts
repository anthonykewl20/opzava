import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * SCR-1: station-doctor.sh --port flag parsing.
 *
 * Regression guard for the bug where a pre-loop `MC_PORT="${1:-3000}"` ran
 * before the argument-parsing loop, so `station-doctor.sh --port 4999` first
 * assigned the literal token `--port` to MC_PORT. The fix: drop that
 * pre-assignment and let a single `while [[ $# -gt 0 ]]` loop own all parsing
 * (mirroring notification-daemon.sh's parse_args), so MC_PORT is never the
 * literal `--port`.
 *
 * The parse contract is tested deterministically by extracting the script's
 * argument-parsing region and executing it under bash, then reading back
 * MC_PORT. This avoids Docker / DB / network dependencies in the unit test.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const scriptPath = join(repoRoot, 'scripts', 'station-doctor.sh')

/** Source text of the script under test. */
const scriptSource = readFileSync(scriptPath, 'utf8')

/**
 * Resolve MC_PORT for a given argv by running ONLY the script's real
 * argument-parsing lines under bash. Behaviour is sourced from the file under
 * test, not re-implemented here.
 */
function resolvePortForArgv(argv: string[]): string {
  const startMarker = '# Parse args'
  const startIdx = scriptSource.indexOf(startMarker)
  expect(startIdx, 'station-doctor.sh must contain a "# Parse args" section').toBeGreaterThan(-1)

  const afterStart = scriptSource.slice(startIdx)
  const doneRel = afterStart.indexOf('done')
  expect(doneRel, 'station-doctor.sh parse loop must close with `done`').toBeGreaterThan(-1)
  const parseBlock = afterStart.slice(0, doneRel + 'done'.length)

  // Seed the same default the real script relies on, then run the real parse
  // block. The fixed script must not carry a pre-loop clobber; the harness
  // supplies the default so the parse block runs standalone.
  const harness = `set -uo pipefail
MC_PORT=3000
${parseBlock}
printf '%s' "$MC_PORT"`

  return execFileSync('bash', ['-c', harness, 'station-doctor', ...argv], {
    encoding: 'utf8',
  }).trim()
}

describe('station-doctor.sh --port parsing (SCR-1)', () => {
  it('honours --port <port> instead of leaving MC_PORT as the literal "--port"', () => {
    expect(resolvePortForArgv(['--port', '4999'])).toBe('4999')
  })

  it('defaults to 3000 when no --port is given', () => {
    expect(resolvePortForArgv([])).toBe('3000')
  })

  it('accepts --port in the only supported position', () => {
    expect(resolvePortForArgv(['--port', '8123'])).toBe('8123')
  })

  it('never assigns the literal "--port" to MC_PORT', () => {
    expect(resolvePortForArgv(['--port', '7000'])).not.toBe('--port')
  })

  it('does not contain the pre-loop MC_PORT="${1:-3000}" clobber', () => {
    // Static guard: the acceptance criterion. After the fix, line 9 must be
    // gone so MC_PORT is owned solely by the parse loop.
    expect(scriptSource).not.toContain('MC_PORT="${1:-3000}"')
  })

  it('parses with a while-over-$# loop, not a fragile for-over-"$@" with inner shift', () => {
    // The robust pattern (matching notification-daemon.sh): `while [[ $# -gt 0 ]]`.
    expect(scriptSource).toMatch(/while\s+\[\[\s*\$#\s+-gt\s+0\s*\]\]/)
  })
})
