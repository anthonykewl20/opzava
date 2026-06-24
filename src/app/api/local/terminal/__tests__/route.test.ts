import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isAllowedDirectory } from '../route'

/**
 * ENG-2: /api/local/terminal was macOS-only. isAllowedDirectory must accept
 * Linux home/project roots in addition to macOS roots, and must respect the
 * configured MISSION_CONTROL_DATA_DIR/working roots.
 */
describe('isAllowedDirectory (platform roots)', () => {
  it('accepts existing dirs under the macOS /tmp root (behavior-preserving)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opzava-term-'))
    expect(isAllowedDirectory(dir)).toBe(true)
  })

  it('accepts existing dirs under the configured data dir root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opzava-data-'))
    expect(isAllowedDirectory(dir)).toBe(true)
  })

  it('accepts /home/... directories (Linux home root)', () => {
    const home = process.env.HOME
    if (home && home.startsWith('/home/')) {
      expect(isAllowedDirectory(home)).toBe(true)
    } else {
      // Fallback: /home itself exists and is a directory on Linux.
      expect(isAllowedDirectory('/home')).toBe(true)
    }
  })

  it('accepts /root/... directories (Linux root home)', () => {
    expect(isAllowedDirectory('/root')).toBe(true)
  })

  it('rejects relative paths', () => {
    expect(isAllowedDirectory('relative/dir')).toBe(false)
  })

  it('rejects nonexistent absolute paths under allowed roots', () => {
    expect(isAllowedDirectory('/home/definitely-does-not-exist-opzava-xyz')).toBe(false)
  })

  it('rejects disallowed root prefixes', () => {
    expect(isAllowedDirectory('/etc')).toBe(false)
    expect(isAllowedDirectory('/usr/local')).toBe(false)
  })

  it('rejects file paths (not directories) under allowed roots', () => {
    expect(isAllowedDirectory('/etc/hostname')).toBe(false)
  })
})
