import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('opzava ARD exists and records the Mission Control base decision', async () => {
  const ard = await readFile(new URL('../docs/ard/0001-use-mission-control-as-base.md', import.meta.url), 'utf8');

  assert.match(ard, /^# ARD 0001: Use Mission Control As The Opzava Base/m);
  assert.match(ard, /Status: Accepted/);
  assert.match(ard, /Project repository: `https:\/\/github.com\/anthonykewl20\/opzava`/);
  assert.match(ard, /`builderz-labs\/mission-control`/);
  assert.match(ard, /Full brand name: `Opzava`/);
  assert.match(ard, /Machine slug: `opzava`/);
  assert.match(ard, /heavily customized/);
});
