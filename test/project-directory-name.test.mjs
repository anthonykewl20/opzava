import test from 'node:test';
import assert from 'node:assert/strict';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('project directory is named anito-opzava', () => {
  assert.equal(basename(root), 'anito-opzava');
});
