import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireCjs = createRequire(import.meta.url)
const {
  installPtyUpgradeHandler,
  roleSatisfies,
  validatePtyUpgradeRequest,
} = requireCjs('../../../scripts/pty-websocket-standalone.cjs') as {
  installPtyUpgradeHandler: (server: any, options?: Record<string, any>) => any
  roleSatisfies: (actual: string, required: string) => boolean
  validatePtyUpgradeRequest: (url: URL) => any
}

describe('standalone PTY WebSocket wrapper', () => {
  it('validates the supported PTY upgrade contract deterministically', () => {
    const valid = validatePtyUpgradeRequest(new URL('http://localhost/ws/pty?session=s1.2:3&kind=claude-code&mode=readonly'))

    expect(valid).toEqual({
      ok: true,
      sessionId: 's1.2:3',
      kind: 'claude-code',
      mode: 'readonly',
    })
    expect(validatePtyUpgradeRequest(new URL('http://localhost/ws/pty?kind=claude-code')).message).toBe('session query param is required')
    expect(validatePtyUpgradeRequest(new URL('http://localhost/ws/pty?session=../../bad&kind=claude-code')).message).toBe('invalid session id')
    expect(validatePtyUpgradeRequest(new URL('http://localhost/ws/pty?session=s1&kind=hermes')).message).toBe('unsupported kind: hermes')
    expect(validatePtyUpgradeRequest(new URL('http://localhost/ws/pty?session=s1&kind=codex-cli&mode=write')).message).toBe('mode must be "readonly" or "interactive"')
  })

  it('uses the operator/admin role hierarchy for PTY upgrades', () => {
    expect(roleSatisfies('viewer', 'operator')).toBe(false)
    expect(roleSatisfies('operator', 'operator')).toBe(true)
    expect(roleSatisfies('admin', 'operator')).toBe(true)
    expect(roleSatisfies('unknown', 'operator')).toBe(false)
  })

  it('intercepts handled PTY upgrades before the Next upgrade handler', async () => {
    const server = new EventEmitter()
    const handlePtyUpgrade = vi.fn(async () => true)
    const nextUpgrade = vi.fn()

    installPtyUpgradeHandler(server, { handlePtyUpgrade })
    server.on('upgrade', nextUpgrade)

    const wrappedUpgrade = server.listeners('upgrade')[0] as any
    await wrappedUpgrade({ url: '/ws/pty', headers: { host: 'localhost' } }, { destroy: vi.fn() }, Buffer.alloc(0))

    expect(handlePtyUpgrade).toHaveBeenCalledOnce()
    expect(nextUpgrade).not.toHaveBeenCalled()
  })

  it('delegates non-PTY upgrades to the Next upgrade handler', async () => {
    const server = new EventEmitter()
    const handlePtyUpgrade = vi.fn(async () => false)
    const nextUpgrade = vi.fn()

    installPtyUpgradeHandler(server, { handlePtyUpgrade })
    server.on('upgrade', nextUpgrade)

    const wrappedUpgrade = server.listeners('upgrade')[0] as any
    const req = { url: '/_next/webpack-hmr', headers: { host: 'localhost' } }
    const socket = { destroy: vi.fn() }
    const head = Buffer.alloc(0)
    await wrappedUpgrade(req, socket, head)

    expect(handlePtyUpgrade).toHaveBeenCalledOnce()
    expect(nextUpgrade).toHaveBeenCalledWith(req, socket, head)
  })

  it('destroys the socket instead of delegating when PTY handling throws', async () => {
    const server = new EventEmitter()
    const handlePtyUpgrade = vi.fn(async () => {
      throw new Error('boom')
    })
    const nextUpgrade = vi.fn()
    const socket = { destroy: vi.fn() }

    installPtyUpgradeHandler(server, { handlePtyUpgrade })
    server.on('upgrade', nextUpgrade)

    const wrappedUpgrade = server.listeners('upgrade')[0] as any
    await wrappedUpgrade({ url: '/ws/pty', headers: { host: 'localhost' } }, socket, Buffer.alloc(0))

    expect(socket.destroy).toHaveBeenCalledOnce()
    expect(nextUpgrade).not.toHaveBeenCalled()
  })
})

// Live PTY session enumeration — the .cjs standalone owns the real PTYs.
// GET /api/pty/attach must surface them, so the standalone must expose the
// live set with the metadata the route already promises (sessionId/kind/mode).
describe('standalone live PTY session enumeration', () => {
  // node-pty and child_process are required lazily inside the .cjs; install
  // fakes into the CJS require cache before importing a fresh module copy so
  // the connection handler attaches a controllable fake PTY.
  let mod: any
  let ptyHooks: { onData: (d: string) => void; onExit: (e: { exitCode: number }) => void }
  let connectionHandler: ((ws: any, req: any, parsed: any) => void) | null
  let plantedCacheKeys: string[] = []

  beforeEach(() => {
    vi.resetModules()
    ptyHooks = { onData: () => {}, onExit: () => {} }
    connectionHandler = null
    plantedCacheKeys = []

    const fakePty = {
      onData: vi.fn((cb: (d: string) => void) => {
        ptyHooks.onData = cb
      }),
      onExit: vi.fn((cb: (e: { exitCode: number }) => void) => {
        ptyHooks.onExit = cb
      }),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    }

    const fakeChildProcess = {
      execFileSync: vi.fn(() => 'tmux 3.4'), // isTmuxAvailable + tmuxSessionExists both pass
    }

    // Fake wss that captures the connection listener so the test can drive it.
    class FakeWss {
      handler: ((ws: any, req: any, parsed: any) => void) | null = null
      on(ev: string, fn: (ws: any, req: any, parsed: any) => void) {
        if (ev === 'connection') this.handler = fn
      }
      emit(ev: string, ws: any, req: any, parsed: any) {
        if (ev === 'connection') this.handler?.(ws, req, parsed)
      }
      close() {}
    }
    const fakeWsModule = { WebSocketServer: FakeWss, WebSocket: { OPEN: 1 } }

    // Inject fakes into Node's global module cache, resolving the bare
    // specifiers from the .cjs's own directory so the module's internal
    // require() picks them up. Cleared in afterEach.
    const requireFromCjs = createRequire(requireCjs.resolve('../../../scripts/pty-websocket-standalone.cjs'))
    const cache = requireFromCjs.cache
    // Clear any prior real copy of the module so the fakes take effect.
    delete requireCjs.cache[requireCjs.resolve('../../../scripts/pty-websocket-standalone.cjs')]
    function plant(spec: string, exports: unknown) {
      const filename = requireFromCjs.resolve(spec)
      cache[filename] = { id: filename, filename, loaded: true, exports } as any
      plantedCacheKeys.push(filename)
    }
    plant('node-pty', { spawn: () => fakePty })
    plant('child_process', fakeChildProcess)
    plant('ws', fakeWsModule)

    mod = requireCjs('../../../scripts/pty-websocket-standalone.cjs')
    plantedCacheKeys.push(requireCjs.resolve('../../../scripts/pty-websocket-standalone.cjs'))
    const wss = mod.initPtyWebSocket()
    connectionHandler = wss.handler
  })

  afterEach(() => {
    mod?.disposeAllPtySessions?.()
    for (const key of plantedCacheKeys) delete requireCjs.cache[key]
    plantedCacheKeys = []
  })

  afterEach(() => {
    mod?.disposeAllPtySessions?.()
  })

  function makeWebSocket() {
    return {
      readyState: 1,
      bufferedAmount: 0,
      send: vi.fn(),
      close: vi.fn(),
      ping: vi.fn(),
      terminate: vi.fn(),
      on: vi.fn(),
    }
  }

  function attach(parsed: { sessionId: string; kind: string; mode: string }) {
    const ws = makeWebSocket()
    connectionHandler!(ws, { url: '/ws/pty' }, parsed)
    return ws
  }

  it('lists a PTY after it is attached via the connection handler', () => {
    expect(mod.listActivePtySessions()).toEqual([])

    attach({ sessionId: 'agent-42', kind: 'claude-code', mode: 'readonly' })

    const sessions = mod.listActivePtySessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId: 'agent-42',
      kind: 'claude-code',
      mode: 'readonly',
    })
    expect(typeof sessions[0].createdAt).toBe('number')
  })

  it('removes the PTY from the live set when the underlying process exits', () => {
    attach({ sessionId: 's1', kind: 'codex-cli', mode: 'interactive' })
    expect(mod.listActivePtySessions()).toHaveLength(1)

    ptyHooks.onExit({ exitCode: 0 })

    expect(mod.listActivePtySessions()).toEqual([])
  })

  it('removes the PTY from the live set when the WebSocket closes', () => {
    const ws = attach({ sessionId: 's2', kind: 'claude-code', mode: 'readonly' })
    expect(mod.listActivePtySessions()).toHaveLength(1)

    const onCalls = (ws.on as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (...a: unknown[]) => void]>
    const closeHandler = onCalls.find(([ev]) => ev === 'close')?.[1]
    expect(closeHandler).toBeTruthy()
    closeHandler!()

    expect(mod.listActivePtySessions()).toEqual([])
  })
})
