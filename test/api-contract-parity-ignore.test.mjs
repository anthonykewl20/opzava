import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SCR-3: the api-contract-parity baseline ignore list must keep shrinking and
// never carry permanent operation entries with stale TODOs. The 11 operations
// added by PR #487 / #550 / #552 without OpenAPI specs now have specs, so the
// ignore file must be header-only and every one of those operations must be
// present in openapi.json paths. This guards against regressions where a route
// is re-added without a spec and silently ignored forever.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PREVIOUSLY_IGNORED = [
  'GET /api/v1/evals/leaderboard',
  'GET /api/v1/runs',
  'GET /api/v1/runs/stream',
  'GET /api/v1/runs/{run_id}',
  'GET /api/v1/runs/{run_id}/provenance',
  'PATCH /api/v1/runs/{run_id}',
  'POST /api/v1/runs',
  'PUT /api/v1/runs/{run_id}/eval',
  'GET /api/gateways/control',
  'POST /api/gateways/control',
  'GET /api/mcp-audit/verify',
  'POST /api/hermes/events',
];

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

async function readIgnoreEntries() {
  const raw = await readFile(path.join(ROOT, 'scripts', 'api-contract-parity.ignore'), 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

async function readOpenApi() {
  const raw = await readFile(path.join(ROOT, 'openapi.json'), 'utf8');
  return JSON.parse(raw);
}

test('api-contract-parity ignore file is header-only (no permanent operation entries)', async () => {
  const entries = await readIgnoreEntries();
  assert.deepEqual(
    entries,
    [],
    'scripts/api-contract-parity.ignore must not carry permanent operation entries; add OpenAPI specs and remove the entries instead',
  );
});

test('every previously-ignored operation has an OpenAPI spec', async () => {
  const openapi = await readOpenApi();
  const paths = openapi.paths ?? {};
  const missing = [];
  for (const op of PREVIOUSLY_IGNORED) {
    const [method, ...pathParts] = op.split(' ');
    const apiPath = pathParts.join(' ').trim();
    const pathItem = paths[apiPath];
    const hasMethod = !!pathItem && typeof pathItem === 'object' && HTTP_METHODS.has(method.toLowerCase());
    if (!hasMethod) missing.push(op);
  }
  assert.deepEqual(
    missing,
    [],
    `operations still missing OpenAPI specs: ${missing.join(', ')}`,
  );
});
