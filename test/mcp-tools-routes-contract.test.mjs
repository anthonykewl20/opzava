import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

// E2: MCP-tools-vs-routes contract test. Every `api(METHOD, '/api/...')` call in
// mc-mcp-server.cjs must resolve to a live route file under src/app/api/. Catches route
// renames that silently break MCP tools.

function normalizeRoute(raw) {
  return raw
    // Strip query-append template variables (${qs}, ${query}, etc.)
    .replace(/\$\{qs\}/g, '')
    .replace(/\$\{query[^}]*\}/g, '')
    // Replace URL-encoded function-call interpolations with [varName]
    // args.run_id -> [run_id], run_id -> [run_id], id -> [id]
    .replace(/\$\{encodeURIComponent\(([^)]*)\)\}/g, (_, expr) => {
      const parts = expr.split('.')
      return `[${parts[parts.length - 1]}]`
    })
    // Replace simple variable interpolations ${var} with [var]
    .replace(/\$\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g, '[$1]')
    // Strip query params
    .replace(/\?.*$/, '')
    // Strip /api/ prefix
    .replace(/^\/api\//, '')
    // Strip trailing slashes
    .replace(/\/+$/, '')
}

test('E2: every MCP tool api() target resolves to a live route file', async () => {
  const source = await readFile(join(repoRoot, 'scripts', 'mc-mcp-server.cjs'), 'utf8')

  // Extract api('METHOD', routeString) calls — handles backtick template literals AND
  // regular strings. Captures the full route content (including ${...} interpolations).
  const re = /api\s*\(\s*['"](\w+)['"]\s*,\s*([`'"])([\s\S]*?)\2/g
  const targets = []
  let m
  while ((m = re.exec(source)) !== null) {
    targets.push({ method: m[1], route: m[3] })
  }

  assert.ok(targets.length > 10, `expected >10 api() targets; found ${targets.length}`)

  const missing = []
  for (const { method, route } of targets) {
    const cleanPath = normalizeRoute(route)
    if (!cleanPath) continue // skip empty (e.g. pure query-append that became empty)
    const routeFile = join(repoRoot, 'src', 'app', 'api', cleanPath, 'route.ts')
    if (!existsSync(routeFile)) {
      missing.push(`${method} ${route} -> src/app/api/${cleanPath}/route.ts`)
    }
  }

  assert.deepEqual(
    missing,
    [],
    `MCP tool api() targets with NO matching route file:\n${missing.join('\n')}`,
  )
})
