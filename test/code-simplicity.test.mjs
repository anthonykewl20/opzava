import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('code simplicity gate defines utter simplicity for generated code', async () => {
  const simplicity = await readFile(new URL('../docs/architecture/code-simplicity.md', import.meta.url), 'utf8');
  const plan = await readFile(new URL('../docs/plans/opzava-start-plan.md', import.meta.url), 'utf8');
  const principles = await readFile(new URL('../docs/golden-principles.md', import.meta.url), 'utf8');

  assert.match(simplicity, /^# Opzava Code Simplicity Gate/m);
  assert.match(simplicity, /Generated code must have utter simplicity/);
  assert.match(simplicity, /Smallest Correct Design/);
  assert.match(simplicity, /Singular Purpose/);
  assert.match(simplicity, /No Premature Abstraction/);
  assert.match(simplicity, /Readability Over Cleverness/);
  assert.match(simplicity, /Simplicity Review Checklist/);
  assert.match(plan, /Code-simplicity layer/);
  assert.match(principles, /Generated code must have utter simplicity/);
});
