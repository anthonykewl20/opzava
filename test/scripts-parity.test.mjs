import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Local/PR quality gates must reproduce CI exactly. The CI workflow
// (.github/workflows/quality-gate.yml) runs `pnpm api:parity` as a dedicated
// step; the local aggregate scripts must include the same check so a green
// local run implies a green CI run. Dokploy parity stays opt-in
// (test:e2e:dokploy / test:docker:dokploy) and is intentionally excluded.

async function loadScripts() {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  return JSON.parse(raw).scripts;
}

test('test:all includes api:parity so local gates match CI', async () => {
  const scripts = await loadScripts();

  assert.ok(
    /\bapi:parity\b/.test(scripts['test:all']),
    'test:all must include api:parity so a local run reproduces the CI gate exactly',
  );
});

test('quality:gate delegates to test:all (single source of gate truth)', async () => {
  const scripts = await loadScripts();

  // quality:gate must stay a thin alias of test:all so the parity invariant
  // above transitively covers it; otherwise CI and the documented local gate
  // could drift again.
  assert.equal(scripts['quality:gate'], 'pnpm test:all');
});
