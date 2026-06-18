import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('CONTEXT.md defines shared language and config vocabulary', async () => {
  const context = await readFile(new URL('../CONTEXT.md', import.meta.url), 'utf8');

  assert.match(context, /^# Opzava Context/m);
  assert.match(context, /Full brand name: `Opzava`/);
  assert.match(context, /Ubiquitous Language/);
  assert.match(context, /AdminConfig/);
  assert.match(context, /SecretReference/);
  assert.match(context, /AntiSlopReview/);
});
