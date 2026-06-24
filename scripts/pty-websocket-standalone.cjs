const { execFileSync } = require('child_process')
const { WebSocketServer, WebSocket } = require('ws')

const SUPPORTED_KINDS = new Set(['claude-code', 'codex-cli'])
const SESSION_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/
const ROLE_RANK = { viewer: 1, operator: 2, admin: 3 }
const MAX_BUFFERED_BYTES = 1024 * 1024
const MAX_INPUT_BYTES = 64 * 1024
const HEARTBEAT_MS = 30_000

let wss = null

// Live PTYs owned by this process, keyed by the node-pty instance with the
// metadata GET /api/pty/attach promises. A Map (not a Set) so each entry can
// carry its sessionId/kind/mode/createdAt without leaking state onto the pty.
const activePtys = new Map()

function validatePtyUpgradeRequest(url) {
  const sessionId = (url.searchParams.get('session') || '').trim()
  const kind = (url.searchParams.get('kind') || '').trim()
  const mode = (url.searchParams.get('mode') || 'readonly').trim()

  if (!sessionId) return { ok: false, status: 400, message: 'session query param is required' }
  if (!SESSION_ID_RE.test(sessionId)) return { ok: false, status: 400, message: 'invalid session id' }
  if (!kind || !SUPPORTED_KINDS.has(kind)) return { ok: false, status: 400, message: `unsupported kind: ${kind || 'missing'}` }
  if (mode !== 'readonly' && mode !== 'interactive') return { ok: false, status: 400, message: 'mode must be "readonly" or "interactive"' }

  return { ok: true, sessionId, kind, mode }
}

function roleSatisfies(actual, required) {
  return (ROLE_RANK[actual] || 0) >= (ROLE_RANK[required] || 0)
}

function writeWsHttpError(socket, status, message) {
  const statusText = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Bad Request'
  const body = JSON.stringify({ error: message })
  const response = [
    `HTTP/1.1 ${status} ${statusText}`,
    'Content-Type: application/json; charset=utf-8',
    `Content-Length: ${Buffer.byteLength(body)}`,
    'Connection: close',
    '',
    body,
  ].join('\r\n')

  try { socket.write(response) } catch {}
  try { socket.destroy() } catch {}
}

function copyAuthHeaders(req) {
  const headers = {}
  for (const key of ['cookie', 'authorization', 'x-api-key', 'x-forwarded-proto', 'x-forwarded-host']) {
    const value = req.headers?.[key]
    if (Array.isArray(value)) headers[key] = value.join(', ')
    else if (typeof value === 'string') headers[key] = value
  }
  return headers
}

async function defaultAuthorizeUpgrade(req, requiredRole, options = {}) {
  const port = options.port || process.env.PORT || '3000'
  const url = `http://127.0.0.1:${port}/api/auth/me`
  let response
  try {
    response = await fetch(url, { headers: copyAuthHeaders(req) })
  } catch {
    return { ok: false, status: 503, message: 'Authentication service unavailable' }
  }

  if (!response.ok) {
    let message = 'Authentication required'
    try {
      const body = await response.json()
      if (typeof body?.error === 'string') message = body.error
    } catch {}
    return { ok: false, status: response.status || 401, message }
  }

  let body
  try {
    body = await response.json()
  } catch {
    return { ok: false, status: 401, message: 'Invalid authentication response' }
  }

  const role = body?.user?.role
  if (!roleSatisfies(role, requiredRole)) {
    return { ok: false, status: 403, message: `Requires ${requiredRole} role or higher` }
  }

  return { ok: true, user: body.user }
}

function isTmuxAvailable() {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function tmuxSessionExists(sessionId) {
  try {
    execFileSync('tmux', ['has-session', '-t', sessionId], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function buildAttachArgs(kind, sessionId, mode) {
  if (!SUPPORTED_KINDS.has(kind)) throw new Error(`unsupported kind: ${kind}`)
  const args = ['tmux', 'attach-session', '-t', sessionId]
  if (mode === 'readonly') args.push('-r')
  return args
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return false
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
    ws.close(1013, 'client backpressure')
    return false
  }
  ws.send(JSON.stringify(payload))
  return true
}

function attachPty(ws, parsed) {
  if (!isTmuxAvailable()) throw new Error('tmux is not installed in the runtime image')
  if (!tmuxSessionExists(parsed.sessionId)) throw new Error(`tmux session "${parsed.sessionId}" not found`)

  const nodePty = require('node-pty')
  const spawn = nodePty.spawn || nodePty.default?.spawn
  if (!spawn) throw new Error('node-pty spawn function not found')

  const args = buildAttachArgs(parsed.kind, parsed.sessionId, parsed.mode)
  const pty = spawn(args[0], args.slice(1), {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: process.env.HOME || '/',
    env: { ...process.env, TERM: 'xterm-256color' },
  })
  activePtys.set(pty, {
    sessionId: parsed.sessionId,
    kind: parsed.kind,
    mode: parsed.mode,
    createdAt: Date.now(),
  })

  pty.onData((data) => {
    sendJson(ws, { type: 'output', data })
  })

  pty.onExit(({ exitCode }) => {
    activePtys.delete(pty)
    sendJson(ws, { type: 'exit', code: exitCode })
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'pty exited')
  })

  return pty
}

/** Snapshot of live PTY sessions owned by this process. */
function listActivePtySessions() {
  return Array.from(activePtys.values()).map((meta) => ({ ...meta }))
}

function initPtyWebSocket() {
  if (wss) return wss

  wss = new WebSocketServer({ noServer: true })
  wss.on('connection', (ws, req, parsed) => {
    let pty = null
    let alive = true
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate()
        return
      }
      alive = false
      try { ws.ping() } catch {}
    }, HEARTBEAT_MS)

    ws.on('pong', () => {
      alive = true
    })

    ws.on('message', (raw) => {
      const rawLength = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.length
      if (rawLength > MAX_INPUT_BYTES) {
        ws.close(1009, 'message too large')
        return
      }

      let msg
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'))
      } catch {
        return
      }
      if (!pty || !msg || typeof msg !== 'object') return

      if (msg.type === 'input' && parsed.mode === 'interactive' && typeof msg.data === 'string') {
        pty.write(msg.data.slice(0, MAX_INPUT_BYTES))
      } else if (msg.type === 'resize') {
        const cols = Number.isSafeInteger(msg.cols) ? Math.max(1, Math.min(msg.cols, 300)) : null
        const rows = Number.isSafeInteger(msg.rows) ? Math.max(1, Math.min(msg.rows, 120)) : null
        if (cols && rows) {
          try { pty.resize(cols, rows) } catch {}
        }
      }
    })

    ws.on('close', () => {
      clearInterval(heartbeat)
      if (pty) {
        activePtys.delete(pty)
        try { pty.kill() } catch {}
      }
    })

    ws.on('error', () => {})

    try {
      pty = attachPty(ws, parsed)
      sendJson(ws, {
        type: 'ready',
        sessionId: parsed.sessionId,
        kind: parsed.kind,
        mode: parsed.mode,
      })
    } catch (err) {
      sendJson(ws, {
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create PTY session',
      })
      ws.close(1011, 'pty unavailable')
    }
  })

  return wss
}

async function handlePtyUpgrade(req, socket, head, options = {}) {
  const url = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`)
  if (url.pathname !== '/ws/pty') return false

  const parsed = validatePtyUpgradeRequest(url)
  if (!parsed.ok) {
    writeWsHttpError(socket, parsed.status, parsed.message)
    return true
  }

  const authorizeUpgrade = options.authorizeUpgrade || defaultAuthorizeUpgrade
  const auth = await authorizeUpgrade(req, 'operator', options)
  if (!auth.ok) {
    writeWsHttpError(socket, auth.status || 401, auth.message || 'Authentication required')
    return true
  }

  initPtyWebSocket().handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, parsed)
  })
  return true
}

function installPtyUpgradeHandler(server, options = {}) {
  if (server.__opzavaPtyUpgradeInstalled) return server
  server.__opzavaPtyUpgradeInstalled = true

  const originalOn = server.on.bind(server)
  server.on = function patchedOn(event, listener) {
    if (event !== 'upgrade') return originalOn(event, listener)
    return originalOn(event, async function wrappedUpgrade(req, socket, head) {
      let handled = false
      try {
        handled = await (options.handlePtyUpgrade || handlePtyUpgrade)(req, socket, head, options)
      } catch {
        try { socket.destroy() } catch {}
        return
      }
      if (handled) return
      return listener.call(this, req, socket, head)
    })
  }

  return server
}

function disposeAllPtySessions() {
  for (const pty of activePtys.keys()) {
    try { pty.kill() } catch {}
  }
  activePtys.clear()
  if (wss) {
    try { wss.close() } catch {}
    wss = null
  }
}

module.exports = {
  MAX_BUFFERED_BYTES,
  MAX_INPUT_BYTES,
  defaultAuthorizeUpgrade,
  disposeAllPtySessions,
  handlePtyUpgrade,
  initPtyWebSocket,
  installPtyUpgradeHandler,
  listActivePtySessions,
  roleSatisfies,
  validatePtyUpgradeRequest,
}
