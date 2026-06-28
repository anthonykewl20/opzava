import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const rootUrl = new URL('../', import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const readRoot = (f) => readFile(new URL('./' + f, rootUrl), 'utf8');

// The blessed set of Playwright configs at repo root (the E2E Contract — ARD 0030).
// Slice 0 scope: only playwright.visual.config.ts must extend the base; the four existing
// configs migrate in Slice 4 (see ARD 0030 §Consequences).
const BLESSED_CONFIGS = [
  'playwright.config.ts',
  'playwright.openclaw.local.config.ts',
  'playwright.openclaw.gateway.config.ts',
  'playwright.dokploy.config.ts',
  'playwright.visual.config.ts',
  'playwright.base.config.ts',
];

test('E2E Contract: exactly the blessed set of playwright configs exists at root', async () => {
  const entries = await readdir(rootUrl, { withFileTypes: true });
  const configs = entries
    .map((e) => e.name)
    .filter((n) => /^playwright.*\.config\.(ts|mts|cts|js|mjs|cjs)$/.test(n))
    .sort();
  assert.deepEqual(
    configs,
    [...BLESSED_CONFIGS].sort(),
    'stray playwright.*.config.ts at root — see ARD 0030 / the E2E Contract',
  );
});

test('E2E Contract: base module exports the contract factories + consts', async () => {
  const base = await readRoot('playwright.base.config.ts');
  for (const sym of [
    'createE2EConfig',
    'createVisualRegressionConfig',
    'buildVisualMatrix',
    'E2E_SEED_ENV',
    'E2E_DETERMINISM',
    'E2E_VISUAL_AXES',
  ]) {
    assert.match(
      base,
      new RegExp(`export (?:async )?(?:function|const) ${sym}\\b`),
      `playwright.base.config.ts must export ${sym}`,
    );
  }
});

test('E2E Contract: the visual config extends the base', async () => {
  const visual = await readRoot('playwright.visual.config.ts');
  assert.match(visual, /playwright\.base\.config/, 'playwright.visual.config.ts must import the base');
  assert.match(
    visual,
    /createVisualRegressionConfig/,
    'playwright.visual.config.ts must call createVisualRegressionConfig',
  );
});

test('E2E Contract: chromium-only — no second browser channel in any config', async () => {
  for (const f of BLESSED_CONFIGS) {
    const src = await readRoot(f);
    assert.doesNotMatch(
      src,
      /\b(firefox|webkit)\b/i,
      `${f} must not introduce a second browser (chromium-only — ARD 0030)`,
    );
  }
});

test('E2E Contract: the visual adapter does not override locked invariants', async () => {
  const visual = await readRoot('playwright.visual.config.ts');
  assert.doesNotMatch(visual, /\bworkers\s*:/, 'playwright.visual.config.ts must not set workers (base invariant)');
  assert.doesNotMatch(
    visual,
    /\bfullyParallel\s*:/,
    'playwright.visual.config.ts must not set fullyParallel (base invariant)',
  );
});

async function* walkTs(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* walkTs(p);
    else if (/\.tsx?$/.test(ent.name)) yield p;
  }
}

test('E2E Contract: visual regression (toHaveScreenshot) lives only under tests/visual/', async () => {
  const offenders = [];
  for await (const f of walkTs(join(rootPath, 'tests'))) {
    if (/toHaveScreenshot/.test(await readFile(f, 'utf8'))) {
      const rel = relative(join(rootPath, 'tests'), f);
      if (!rel.startsWith('visual/')) offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'toHaveScreenshot may only be used under tests/visual/ (the VR contract — ARD 0030)',
  );
});

test('E2E Contract: the Playwright test runtime does not leak into src/ (@playwright/test only under tests/)', async () => {
  const offenders = [];
  for await (const f of walkTs(join(rootPath, 'src'))) {
    if (/@playwright\/test/.test(await readFile(f, 'utf8'))) {
      offenders.push(relative(join(rootPath, 'src'), f));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "@playwright/test may not be imported under src/ (test runtime stays in tests/) — ARD 0030",
  );
});

test('E2E Contract: no ad-hoc browser installs (playwright install / npx playwright only in CI)', async () => {
  const pkg = JSON.parse(await readFile(new URL('./package.json', rootUrl), 'utf8'));
  const offenders = [];
  for (const [k, v] of Object.entries(pkg.scripts ?? {})) {
    if (/playwright\s+install|npx\s+playwright/.test(String(v))) {
      offenders.push(`package.json script "${k}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'playwright install / npx playwright may only run in CI (.github/workflows), never in package.json scripts — ARD 0030',
  );
});

test('E2E Contract: use toHaveScreenshot, never the legacy toMatchSnapshot API', async () => {
  const offenders = [];
  for await (const f of walkTs(join(rootPath, 'tests'))) {
    if (/toMatchSnapshot/.test(await readFile(f, 'utf8'))) {
      offenders.push(relative(join(rootPath, 'tests'), f));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'use expect(page).toHaveScreenshot, not toMatchSnapshot (the VR contract — ARD 0030)',
  );
});
