import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Governance gate for DOC-2 (anonymous health-probe contract).
 *
 * The Docker HEALTHCHECK (`Dockerfile`) hits
 *   GET /api/status?action=health
 * with no credentials and treats HTTP 200 as healthy. The route
 * (`src/app/api/status/route.ts`) only serves that request anonymously when the
 * matching entry in `STATUS_ACTIONS` (`src/lib/status-actions.ts`) declares
 * `requiresAuth: false`. That dependency was implicit: flipping the health
 * action to `requiresAuth: true` would silently make every container
 * permanently unhealthy.
 *
 * This gate makes the contract explicit and enforced. It reads the registry's
 * source (the single declaration site) and asserts the `health` action (a) is
 * registered and (b) declares `requiresAuth: false`. A flip to `true` (or the
 * action's removal) fails the gate — surfacing the breaking change in the
 * governance run (`node --test test/*.test.mjs`) instead of in production as a
 * dead container.
 *
 * The vitest contract suite (`src/lib/__tests__/status-actions.test.ts`) pins
 * the live registry value for the unit-test gate; this is the matching
 * governance-level assertion that runs in `test:governance` / `test:all`
 * without a TypeScript loader.
 */

const REGISTRY_PATH = '../src/lib/status-actions.ts'

/**
 * Read the `STATUS_ACTIONS` object literal and extract each top-level entry's
 * `requiresAuth` value. Returns a Map of action name -> raw requiresAuth token.
 *
 * The registry is a flat object literal whose entries each fit on one line:
 *   name: { requiresAuth: <bool>, run: ... },
 * The match is anchored to `requiresAuth:` inside the entry braces, so a stray
 * `false` elsewhere in the file cannot satisfy it.
 */
async function readRegistryAuthDeclarations() {
  const source = await readFile(new URL(REGISTRY_PATH, import.meta.url), 'utf8')

  // Slice from the `export const STATUS_ACTIONS` table to the end of its block.
  const tableStart = source.indexOf('export const STATUS_ACTIONS')
  assert.notEqual(tableStart, -1, 'STATUS_ACTIONS registry not found in source')
  const tableEnd = source.indexOf('\n}\n', tableStart)
  const tableBlock = source.slice(tableStart, tableEnd === -1 ? undefined : tableEnd)

  // Match each `name: { ... requiresAuth: <token> ... }` entry.
  const entryPattern = /(\w+)\s*:\s*\{\s*requiresAuth\s*:\s*(true|false)\s*,/g
  const declarations = new Map()
  let match
  while ((match = entryPattern.exec(tableBlock)) !== null) {
    declarations.set(match[1], match[2])
  }
  return declarations
}

test('DOC-2: the health status action is registered in STATUS_ACTIONS', async () => {
  const declarations = await readRegistryAuthDeclarations()
  assert.ok(
    declarations.has('health'),
    'the STATUS_ACTIONS registry must declare a `health` action — ' +
      'the Docker HEALTHCHECK (Dockerfile) depends on GET /api/status?action=health',
  )
})

test('DOC-2: the health status action is anonymous (requiresAuth: false)', async () => {
  const declarations = await readRegistryAuthDeclarations()
  const actual = declarations.get('health')
  assert.equal(
    actual,
    'false',
    'STATUS_ACTIONS.health.requiresAuth must be false. The Docker HEALTHCHECK ' +
      'probes GET /api/status?action=health without credentials; setting ' +
      'requiresAuth: true makes the route reject the probe and marks the ' +
      'container permanently unhealthy. If you intentionally gate the health ' +
      'probe behind auth, update the Dockerfile HEALTHCHECK accordingly.',
  )
})
