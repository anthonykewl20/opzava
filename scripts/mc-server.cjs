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
// rather than hard-dropped on every redeploy. Single hard-coded value; no config.
const DRAIN_MS = 2000

// Captured the first patched HTTP(S) server Next standalone creates, so SIGTERM
// can stop it from accepting new connections during the drain window.
let patchedServer = null

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
// Order: (1) server.close() to stop new connections, (2) bounded wait via a single
// setTimeout(drainMs), (3) PTY dispose + exit. The bound fires regardless of whether
// server.close ever calls back, so a hanging close cannot stall shutdown.
function performGracefulDrain(server, disposePtySessions, deps) {
  if (server && typeof server.close === 'function') {
    try {
      server.close()
    } catch {
      /* best effort; the bounded timer still proceeds */
    }
  }
  deps.timers.setTimeout(() => {
    disposePtySessions()
    deps.exit(0)
  }, deps.drainMs)
}

function gracefulShutdown() {
  performGracefulDrain(patchedServer, disposeAllPtySessions, {
    drainMs: DRAIN_MS,
    exit: (code) => process.exit(code),
    timers: { setTimeout, clearTimeout },
  })
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)
process.on('exit', disposeAllPtySessions)

module.exports = { performGracefulDrain, patchCreateServer }

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

  require(path.join(standaloneDir, 'server.js'))
}
