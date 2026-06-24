#!/usr/bin/env node

/**
 * Opzava standalone server wrapper.
 *
 * Next standalone owns the HTTP request handler. This wrapper patches the
 * HTTP(S) server that Next creates so production can serve /ws/pty upgrades.
 */

const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const { disposeAllPtySessions, installPtyUpgradeHandler } = require('./pty-websocket-standalone.cjs')

// Bounded SSE drain window (ms) on shutdown. Stops accepting new HTTP connections
// so in-flight SSE responses can be flushed by the durable-replay gap recovery
// rather than hard-dropped on every redeploy. Operator-tunable via MC_DRAIN_MS;
// falls back to 2000ms when unset or not a positive integer.
const DRAIN_MS = resolveDrainMs(process.env.MC_DRAIN_MS)

function resolveDrainMs(raw) {
  const DEFAULT_MS = 2000
  if (raw == null || raw === '') return DEFAULT_MS
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_MS
  return parsed
}

// Captured the first patched HTTP(S) server Next standalone creates, so SIGTERM
// can stop it from accepting new connections during the drain window.
let patchedServer = null

// C4.2 double-dispose: the graceful drain disposes PTY sessions and then calls
// process.exit(0), which fires the "exit" listener that ALSO disposes. Wrapping
// the dispose so it runs at most once makes the second invocation a harmless
// no-op. Pure factory so the guard is per-instance (no shared module latch that
// would leak across tests or hide a genuine second lifecycle event).
function createIdempotentDispose(dispose) {
  let disposed = false
  return function disposeOnce() {
    if (disposed) return
    disposed = true
    dispose()
  }
}

// Single idempotent dispose used by BOTH the drain timer and the process "exit"
// listener, so the two paths cannot double-kill PTY sessions.
const disposeAllPtySessionsOnce = createIdempotentDispose(disposeAllPtySessions)

function patchCreateServer(module) {
  const original = module.createServer
  module.createServer = function createServerWithPty(...args) {
    const server = original.apply(this, args)
    installPtyUpgradeHandler(server)
    if (!patchedServer) patchedServer = server
    return server
  }
}

patchCreateServer(http)
patchCreateServer(https)

// Pure, dependency-injected drain so the process-global signal handler is testable.
// Order: (1) server.close() to stop new connections, (1b) stop the three long-lived
// background timers (PROC-2) so a pending scheduler/realtime/maintenance cycle does
// not fire into a closing handle during the drain, (2) bounded wait via a single
// setTimeout(drainMs), (3) PTY dispose + exit. The bound fires regardless of whether
// server.close ever calls back, so a hanging close cannot stall shutdown. The
// background-timer stop is best-effort: a missing or throwing hook never blocks drain.
function performGracefulDrain(server, disposePtySessions, deps) {
  if (server && typeof server.close === 'function') {
    try {
      server.close()
    } catch {
      /* best effort; the bounded timer still proceeds */
    }
  }
  if (typeof deps.stopBackgroundTimers === 'function') {
    try {
      const result = deps.stopBackgroundTimers()
      if (result && typeof result.then === 'function') {
        // best-effort; do not await — the bounded timer governs exit regardless
        result.catch(() => {})
      }
    } catch {
      /* best effort; the bounded timer still proceeds */
    }
  }
  deps.timers.setTimeout(() => {
    disposePtySessions()
    deps.exit(0)
  }, deps.drainMs)
}

// PROC-2: cross-runtime hand-off. The compiled db module (loaded by Next standalone
// server.js) publishes its stopBackgroundTimers on globalThis under a well-known
// Symbol. We read it defensively here so the standalone wrapper drives the same
// coordinated stop path as the in-process SIGTERM handler — without a static require
// of compiled TypeScript (fragile across build outputs). Absent until the server.js
// has initialized the database; a missing hook is a no-op.
const STOP_BACKGROUND_TIMERS_KEY = Symbol.for('opzava.stopBackgroundTimers')
function resolveStopBackgroundTimers() {
  const hook = globalThis[STOP_BACKGROUND_TIMERS_KEY]
  return typeof hook === 'function' ? hook : undefined
}

function gracefulShutdown() {
  performGracefulDrain(patchedServer, disposeAllPtySessionsOnce, {
    drainMs: DRAIN_MS,
    exit: (code) => process.exit(code),
    timers: { setTimeout, clearTimeout },
    stopBackgroundTimers: resolveStopBackgroundTimers(),
  })
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)
process.on('exit', disposeAllPtySessionsOnce)

module.exports = {
  performGracefulDrain,
  patchCreateServer,
  createIdempotentDispose,
  // Exposes the resolved drain window so tests (and operators via logs) can read
  // the effective value without re-resolving env parsing. The constant is fixed at
  // module load; this is a pure read, not a setter.
  getDrainMs: () => DRAIN_MS,
  // PROC-2: resolves the coordinated background-timer stop hook published by the
  // compiled db module on globalThis. Exported so the cross-runtime hand-off is
  // observable without spawning a child process.
  resolveStopBackgroundTimers,
}

// Bootstrap only when invoked directly (not when imported for testing).
if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..')
  const candidateDirs = [
    process.env.NEXT_STANDALONE_DIR,
    process.cwd(),
    projectRoot,
    path.join(projectRoot, '.next', 'standalone'),
  ].filter(Boolean)

  const standaloneDir = candidateDirs.find((dir) => fs.existsSync(path.join(dir, 'server.js')))

  if (!standaloneDir) {
    console.error('[mc-server] Standalone server not found. Run `pnpm build` first.')
    process.exit(1)
  }

  process.chdir(standaloneDir)

  console.log(`[mc-server] Opzava standalone server: ${path.join(standaloneDir, 'server.js')}`)
  console.log('[mc-server] PTY WebSocket upgrade path: /ws/pty')
  console.log(`[mc-server] Graceful SSE drain window: ${DRAIN_MS}ms (MC_DRAIN_MS)`)

  require(path.join(standaloneDir, 'server.js'))
}
