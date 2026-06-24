import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Migration ids are declared once each as `id: '...'` object properties across two
// arrays: the main `migrations` array (src/lib/migrations.ts) and the opzava-runner
// migrations (src/opzava/platform/runner/migrations.ts, registered into
// extraMigrations at runtime). runMigrations dedupes via the schema_migrations PK,
// so a duplicate id SILENTLY no-ops the second migration's up() — schema changes
// drop with zero signal. This test pins every id across both files to be globally
// unique. Guards MASTER-PLAN A1(055)/B2(056)/A4(057)/A4b(060)/D1(058) in the main
// array and C3(opzava_runner_004) in the runner array.

const MIGRATION_FILES = [
  '../src/lib/migrations.ts',
  '../src/opzava/platform/runner/migrations.ts',
]

async function extractIds(file) {
  const src = await readFile(new URL(file, import.meta.url), 'utf8')
  // Match object-property migration ids only (`id: '...'`), not SQL column defs
  // (`id TEXT`) or type annotations (`id: string`). Fresh regex per file (no
  // lastIndex reuse across matchAll).
  const re = /^\s*id:\s*'([^']+)'/gm
  return [...src.matchAll(re)].map((m) => m[1])
}

test('every migration id is globally unique across both arrays', async () => {
  const all = []
  for (const f of MIGRATION_FILES) all.push(...(await extractIds(f)))
  assert.ok(all.length > 0, 'no migration ids found — the source paths may have moved')
  const seen = new Map()
  const dupes = []
  for (const id of all) {
    if (seen.has(id)) dupes.push({ id, duplicateOf: seen.get(id) })
    else seen.set(id, id)
  }
  assert.deepEqual(dupes, [], `duplicate migration ids: ${JSON.stringify(dupes)}`)
})

test('the A1 counters/lease/idempotency migration is present', async () => {
  const ids = []
  for (const f of MIGRATION_FILES) ids.push(...(await extractIds(f)))
  assert.ok(
    ids.includes('055_task_counters_lease_idempotency'),
    '055_task_counters_lease_idempotency missing from migrations'
  )
})
