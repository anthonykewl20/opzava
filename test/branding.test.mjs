import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const upstreamBrandPattern = /Mission Control|mission-control\.local|OpenClaw Mission Control/;

async function collectFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(entryPath);
    }
  }

  return files;
}

test('branding contract requires Opzava product branding', async () => {
  const branding = await readFile(new URL('../docs/architecture/branding.md', import.meta.url), 'utf8');
  const plan = await readFile(new URL('../docs/plans/opzava-start-plan.md', import.meta.url), 'utf8');
  const context = await readFile(new URL('../CONTEXT.md', import.meta.url), 'utf8');
  const principles = await readFile(new URL('../docs/golden-principles.md', import.meta.url), 'utf8');

  assert.match(branding, /^# Opzava Branding Gate/m);
  assert.match(branding, /Full brand name: `Opzava`/);
  assert.match(branding, /Product-facing surfaces must not contain `Mission Control`/);
  assert.match(branding, /Allowed Historical References/);
  assert.match(branding, /Brand Removal Checklist/);
  assert.match(plan, /Full brand name: `Opzava`/);
  assert.match(plan, /Branding layer/);
  assert.match(context, /Full brand name: `Opzava`/);
  assert.match(principles, /Product-facing surfaces use `Opzava`, never `Mission Control`/);
});

test('package metadata is branded as Opzava', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(packageJson.name, 'opzava');
  assert.match(packageJson.description, /^Opzava/);
  assert.doesNotMatch(packageJson.description, /Mission Control|OpenClaw/);
  assert.equal(packageJson.repository.url, 'https://github.com/anthonykewl20/opzava.git');
  assert.ok(packageJson.keywords.includes('opzava'));
});

test('primary product-facing app surfaces use Opzava branding', async () => {
  const productSurfaceFiles = [
    '../src/app/layout.tsx',
    '../src/app/login/page.tsx',
    '../src/app/setup/page.tsx',
    '../src/app/docs/page.tsx',
    '../src/app/api/settings/route.ts',
    '../src/components/layout/nav-rail.tsx',
    '../src/components/onboarding/onboarding-wizard.tsx',
    '../src/components/ui/loader.tsx',
    '../public/llms.txt',
    '../public/robots.txt',
  ];

  for (const file of productSurfaceFiles) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /Opzava/, `${file} should contain Opzava branding`);
    assert.doesNotMatch(source, upstreamBrandPattern, `${file} should not expose upstream branding`);
  }

  const scannedProductFiles = [
    ...await collectFiles(join(repoRoot, 'src/app'), '.tsx'),
    ...await collectFiles(join(repoRoot, 'src/app/api'), '.ts'),
    ...await collectFiles(join(repoRoot, 'src/components'), '.tsx'),
  ];

  for (const file of scannedProductFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, upstreamBrandPattern, `${relative(repoRoot, file)} should not expose upstream branding`);
  }

  const messagesDirectory = new URL('../messages/', import.meta.url);
  const messageFiles = (await readdir(messagesDirectory)).filter((file) => file.endsWith('.json'));

  for (const file of messageFiles) {
    const source = await readFile(new URL(file, messagesDirectory), 'utf8');
    assert.match(source, /Opzava/, `messages/${file} should contain Opzava branding`);
    assert.doesNotMatch(source, upstreamBrandPattern, `messages/${file} should not expose upstream branding`);
  }
});
