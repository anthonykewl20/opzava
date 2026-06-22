import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const allowedTopLevelEntries = new Set([
  'CHANGELOG.md',
  'CLAUDE.md',
  'CODE_OF_CONDUCT.md',
  'CONTEXT.md',
  'CONTRIBUTING.md',
  'Dockerfile',
  'LICENSE',
  'README.md',
  'RELEASE.md',
  'SECURITY.md',
  'SKILL.md',
  'docker-compose.hardened.yml',
  'docker-compose.yml',
  'docker-entrypoint.sh',
  'docs',
  'eslint.config.mjs',
  'examples',
  'install.ps1',
  'install.sh',
  'messages',
  'next.config.js',
  'openapi.json',
  'openclaw_hardening_guide.md',
  'ops',
  'package.json',
  'playwright.config.ts',
  'playwright.openclaw.gateway.config.ts',
  'playwright.openclaw.local.config.ts',
  'pnpm-lock.yaml',
  'postcss.config.js',
  'public',
  'scripts',
  'skills',
  'src',
  'stryker.conf.json',
  'tailwind.config.js',
  'test',
  'tests',
  'tsconfig.json',
  'vitest.config.ts',
  'vitest.stryker.config.ts',
  'wiki',
]);

const ignoredGeneratedTopLevelEntries = new Set([
  'node_modules',
  '.next',
  '.data',
  'next-env.d.ts',
  'tsconfig.tsbuildinfo',
  'test-results',
  'playwright-report',
  'reports',
]);

test('folder-structure contract defines allowed roots and placement gates', async () => {
  const structure = await readFile(new URL('../docs/architecture/folder-structure.md', import.meta.url), 'utf8');
  const plan = await readFile(new URL('../docs/plans/opzava-start-plan.md', import.meta.url), 'utf8');
  const principles = await readFile(new URL('../docs/golden-principles.md', import.meta.url), 'utf8');

  assert.match(structure, /^# Opzava Folder Structure/m);
  assert.match(structure, /Allowed Roots/);
  assert.match(structure, /File Placement Gate/);
  assert.match(structure, /Feature Module Contract/);
  assert.match(structure, /src\/opzava\/modules\/<feature>\//);
  assert.match(structure, /Modules expose public APIs through `index\.ts`/);
  assert.match(structure, /Route and UI adapters stay thin/);
  assert.match(structure, /`src\/lib` is inherited Mission Control code only/);
  assert.match(structure, /Module Registry And Composition/);
  assert.match(structure, /Path Alias Policy/);
  assert.match(structure, /Do not create global helper dumping grounds/);
  assert.match(structure, /New top-level folders require an ARD/);
  assert.match(structure, /Do not create folders for vibes/);
  assert.match(plan, /Folder-structure layer/);
  assert.match(plan, /Feature-module layer/);
  assert.match(principles, /Do not create new top-level folders without updating the folder-structure contract/);
  assert.match(principles, /Feature modules own their contracts, application services, workflow steps, UI, tests, and fixtures/);
});

test('current repo only uses approved top-level entries', async () => {
  const entries = await readdir(new URL('..', import.meta.url), { withFileTypes: true });
  const unexpected = entries
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => !ignoredGeneratedTopLevelEntries.has(name))
    .filter((name) => !allowedTopLevelEntries.has(name));

  assert.deepEqual(unexpected, []);
});
