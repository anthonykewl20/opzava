import { NextRequest, NextResponse } from 'next/server'
import { existsSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { requireRole } from '@/lib/auth'
import { runCommand } from '@/lib/command'
import { config } from '@/lib/config'

/**
 * Allowed root prefixes for a local terminal cwd. macOS home/temp roots are
 * always permitted; on Linux the user home roots (/home, /root) plus the
 * configured MISSION_CONTROL_DATA_DIR are permitted so the documented platform
 * no longer hard-fails with a 400.
 */
const ALLOWED_ROOT_PREFIXES = [
  '/Users/',
  '/tmp/',
  '/var/folders/',
  '/home/',
  '/home',
  '/root/',
  '/root',
]

/** True if `candidate` is `path` itself or lives somewhere beneath it. */
function isWithinOrEqual(candidate: string, path: string): boolean {
  if (path === '') return false
  const c = candidate.endsWith('/') ? candidate : candidate + '/'
  const p = path.endsWith('/') ? path : path + '/'
  return c === p || c.startsWith(p)
}

export function isAllowedDirectory(input: string): boolean {
  const cwd = resolve(input)
  if (!cwd.startsWith('/')) return false

  const inPrefix = ALLOWED_ROOT_PREFIXES.some((prefix) => cwd.startsWith(prefix))
  // The configured data dir (and its parent, so project roots alongside it work).
  const dataDir = resolve(config.dataDir || '')
  const inDataDir = dataDir !== '/' && (isWithinOrEqual(cwd, dataDir) || isWithinOrEqual(cwd, dirname(dataDir)))
  if (!inPrefix && !inDataDir) return false

  if (!existsSync(cwd)) return false
  try {
    return statSync(cwd).isDirectory()
  } catch {
    return false
  }
}

/**
 * Resolve the platform-specific terminal launcher. macOS uses `open -a Terminal`;
 * Linux falls back through the common emulators. Returns null when no launcher
 * is available so the caller can surface a clear error instead of ENOENT noise.
 */
function resolveTerminalLauncher(): { command: string; args: (cwd: string) => string[] } | null {
  if (process.platform === 'darwin') {
    return { command: 'open', args: (cwd) => ['-a', 'Terminal', cwd] }
  }
  // Linux: prefer the freedesktop alias, then GNOME, then xterm as the universal fallback.
  const candidates = ['x-terminal-emulator', 'gnome-terminal', 'xterm']
  for (const command of candidates) {
    if (existsSync(`/usr/bin/${command}`) || existsSync(`/usr/local/bin/${command}`)) {
      // xterm/gnome-terminal open in the invoking cwd; for the freedesktop alias
      // --working-directory is the broadly-supported flag.
      return {
        command,
        args: (cwd) => (command === 'xterm' ? ['-e', 'cd', cwd] : ['--working-directory', cwd]),
      }
    }
  }
  return null
}

/**
 * POST /api/local/terminal
 * Body: { cwd: string }
 * Opens a new local Terminal window at the given working directory.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const cwd = typeof body?.cwd === 'string' ? body.cwd.trim() : ''
  if (!cwd) {
    return NextResponse.json({ error: 'cwd is required' }, { status: 400 })
  }
  if (!isAllowedDirectory(cwd)) {
    return NextResponse.json({ error: 'cwd must be an existing safe local directory' }, { status: 400 })
  }

  try {
    const launcher = resolveTerminalLauncher()
    if (!launcher) {
      return NextResponse.json(
        { error: 'No supported terminal emulator found on PATH' },
        { status: 500 }
      )
    }
    await runCommand(launcher.command, launcher.args(cwd), { timeoutMs: 10_000 })
    return NextResponse.json({ ok: true, message: `Opened Terminal at ${cwd}` })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to open Terminal' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
