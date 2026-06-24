// Strongest practical check for the graceful SSE drain on shutdown (impl:graceful-drain).
//
// The .cjs signal handler is process-global (process.exit, SIGTERM, setTimeout),
// so a fully hermetic test would require spawning a built standalone + real SIGTERM.
// Per the task's allowance for .cjs entrypoints, we pin the pure drain helper that
// the signal handler delegates to, using dependency injection (timers/exit).
import { test } from 'node:test'
import assert from 'node:assert/strict'

// mc-server.cjs guards its bootstrap behind require.main === module, so importing
// it here runs ONLY the module definitions (no process.chdir, no standalone load).
const mcServer = await import('../scripts/mc-server.cjs')
const { performGracefulDrain } = mcServer

test('performGracefulDrain stops new connections, then disposes PTYs and exits after the bounded window', async () => {
  const calls = []
  const fakeServer = { close(cb) { calls.push('server.close'); cb && cb() } }

  await new Promise((resolve) => {
    performGracefulDrain(fakeServer, () => calls.push('pty.dispose'), {
      drainMs: 50,
      exit: (code) => { calls.push(['exit', code]); resolve() },
      timers: { setTimeout, clearTimeout },
    })
  })

  assert.equal(calls[0], 'server.close', 'server.close must be called first to stop new connections')
  assert.ok(calls.indexOf('pty.dispose') < calls.findIndex((c) => Array.isArray(c) && c[0] === 'exit'),
    'PTY sessions must be disposed before exit')
})

test('performGracefulDrain does not dispose or exit synchronously; both wait for the timer', async () => {
  const calls = []
  performGracefulDrain({ close() {} }, () => calls.push('pty.dispose'), {
    drainMs: 30,
    exit: () => calls.push('exit'),
    timers: {
      setTimeout: (fn) => ({ cancelled: false }), // never auto-fires
      clearTimeout: () => {},
    },
  })

  // Yield to the microtask/macrotask queue; nothing should have happened yet.
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(calls, [], 'dispose/exit must not run before the drain timer fires')
})

test('performGracefulDrain still exits on the bounded timer when server.close never calls back', async () => {
  let exited = false

  await new Promise((resolve) => {
    performGracefulDrain({ close() { /* hangs */ } }, () => {}, {
      drainMs: 30,
      exit: () => { exited = true; resolve() },
      timers: { setTimeout, clearTimeout },
    })
  })

  assert.equal(exited, true, 'must still exit on the bounded timer when close hangs')
})
