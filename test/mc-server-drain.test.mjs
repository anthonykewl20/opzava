// Strongest practical check for the graceful SSE drain on shutdown (impl:graceful-drain).
//
// The .cjs signal handler is process-global (process.exit, SIGTERM, setTimeout),
// so a fully hermetic test would require spawning a built standalone + real SIGTERM.
// Per the task's allowance for .cjs entrypoints, we pin the pure drain helper that
// the signal handler delegates to, using dependency injection (timers/exit).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'child_process'

// mc-server.cjs guards its bootstrap behind require.main === module, so importing
// it here runs ONLY the module definitions (no process.chdir, no standalone load).
const mcServer = await import('../scripts/mc-server.cjs')
const { performGracefulDrain, createIdempotentDispose } = mcServer

test('startup log surfaces the resolved drain window so operators can see the effective value', async () => {
  const lines = await resolveStartupLinesInChild({ MC_DRAIN_MS: '3500' })
  assert.ok(
    lines.some((l) => /^\[mc-server\] Graceful SSE drain window: 3500ms \(MC_DRAIN_MS\)$/.test(l)),
    `expected a drain-window log line for 3500ms; got:\n${lines.join('\n')}`,
  )
})

// SCR-7: DRAIN_MS must be env-overridable via MC_DRAIN_MS (default 2000 preserved).
// The resolved value is read once at module load, so we spawn a fresh child process
// per env case (deleting MC_DRAIN_MS for the "unset" case) to avoid this test
// process's own environment bleeding across cases.
test('DRAIN_MS defaults to 2000 when MC_DRAIN_MS is unset', async () => {
  const drainMs = await resolveDrainMsInChild({ MC_DRAIN_MS: undefined })
  assert.equal(drainMs, 2000, 'default drain window must be 2000ms when env is unset')
})

test('DRAIN_MS reads MC_DRAIN_MS when set to a positive integer', async () => {
  const drainMs = await resolveDrainMsInChild({ MC_DRAIN_MS: '5000' })
  assert.equal(drainMs, 5000, 'MC_DRAIN_MS=5000 must override the default')
})

test('DRAIN_MS falls back to 2000 when MC_DRAIN_MS is not a positive integer', async () => {
  const drainMs = await resolveDrainMsInChild({ MC_DRAIN_MS: 'not-a-number' })
  assert.equal(drainMs, 2000, 'non-numeric MC_DRAIN_MS must fall back to the default')
})

// Captures the mc-server startup log lines in a fresh child process with the given
// env delta. To run the real bootstrap (guarded by require.main === module) without
// starting the actual Next server, NEXT_STANDALONE_DIR points at a temp dir holding
// a stub server.js that exits 0 immediately after the config log lines print.
async function resolveStartupLinesInChild(envDelta) {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const stubDir = mkdtempSync(join(tmpdir(), 'mc-server-stub-'))
  // Stub server.js: exits cleanly so the child terminates right after logging.
  writeFileSync(join(stubDir, 'server.js'), "process.exit(0)\n")

  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, NEXT_STANDALONE_DIR: stubDir }
    if (envDelta.MC_DRAIN_MS === undefined) delete childEnv.MC_DRAIN_MS
    else childEnv.MC_DRAIN_MS = envDelta.MC_DRAIN_MS

    const child = spawn(process.execPath, ['scripts/mc-server.cjs'], {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('close', (code) => {
      // code 0 is the stub's clean exit; tolerate either since logging precedes require.
      const lines = out.split('\n').filter(Boolean)
      if (lines.length === 0) return reject(new Error(`no startup log; exit ${code}, stderr: ${err}`))
      resolve(lines)
    })
  })
}

// Resolves the DRAIN_MS constant in a fresh child process with the given env delta.
// A value of `undefined` deletes the key entirely (true "unset").
function resolveDrainMsInChild(envDelta) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env }
    if (envDelta.MC_DRAIN_MS === undefined) delete childEnv.MC_DRAIN_MS
    else childEnv.MC_DRAIN_MS = envDelta.MC_DRAIN_MS

    const child = spawn(process.execPath, ['-e', `
      const m = require('./scripts/mc-server.cjs')
      process.stdout.write(String(m.getDrainMs()))
    `], {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`child exited ${code}: ${err}`))
      resolve(Number(out))
    })
  })
}

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

// PROC-2: the standalone wrapper's graceful shutdown must also stop the three
// long-lived background timers (scheduler, realtime pruner, runner-maintenance
// daemon) before the bounded drain exits the process, so a redeploy does not
// leave the next tick firing into a closing handle. The stop hook is injected
// (best-effort) so a missing hook never breaks the drain.
test('performGracefulDrain invokes deps.stopBackgroundTimers before disposing PTYs', async () => {
  const calls = []
  const fakeServer = { close(cb) { calls.push('server.close'); cb && cb() } }

  await new Promise((resolve) => {
    performGracefulDrain(fakeServer, () => calls.push('pty.dispose'), {
      drainMs: 50,
      exit: (code) => { calls.push(['exit', code]); resolve() },
      timers: { setTimeout, clearTimeout },
      stopBackgroundTimers: () => calls.push('background.stop'),
    })
  })

  const stopIdx = calls.indexOf('background.stop')
  assert.ok(stopIdx > 0, 'stopBackgroundTimers must be invoked during the drain')
  assert.equal(calls[stopIdx - 1], 'server.close',
    'background timers must stop AFTER server.close (no new connections) and before the bounded wait')
})

test('performGracefulDrain proceeds normally when no stopBackgroundTimers hook is provided', async () => {
  const calls = []
  await new Promise((resolve) => {
    performGracefulDrain({ close(cb) { cb && cb() } }, () => calls.push('pty.dispose'), {
      drainMs: 30,
      exit: (code) => { calls.push(['exit', code]); resolve() },
      timers: { setTimeout, clearTimeout },
      // stopBackgroundTimers intentionally omitted
    })
  })
  assert.ok(calls.findIndex((c) => Array.isArray(c) && c[0] === 'exit') >= 0,
    'drain must still complete without the hook')
})

test('performGracefulDrain tolerates a throwing stopBackgroundTimers (best-effort, never blocks drain)', async () => {
  let exited = false
  await new Promise((resolve) => {
    performGracefulDrain({ close(cb) { cb && cb() } }, () => {}, {
      drainMs: 30,
      exit: () => { exited = true; resolve() },
      timers: { setTimeout, clearTimeout },
      stopBackgroundTimers: () => { throw new Error('boom') },
    })
  })
  assert.equal(exited, true, 'a failing stop hook must not prevent the bounded drain from exiting')
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

// C4.2 double-dispose: process "exit" calls disposeAllPtySessions, AND the drain
// timer calls it before process.exit(0). The production dispose must be idempotent
// so PTYs are killed exactly once on every graceful shutdown.
test('createIdempotentDispose runs the underlying dispose exactly once across repeated calls', () => {
  const underlying = []
  const once = createIdempotentDispose(() => underlying.push('kill'))

  once()
  once()
  once()

  assert.deepEqual(underlying, ['kill'], 'underlying dispose must run exactly once')
})

test('createIdempotentDispose instances are independent (no shared module-level latch between cases)', () => {
  const a = []
  const b = []
  const onceA = createIdempotentDispose(() => a.push('a'))
  const onceB = createIdempotentDispose(() => b.push('b'))

  onceA()
  onceB()

  assert.deepEqual(a, ['a'])
  assert.deepEqual(b, ['b'])
})
