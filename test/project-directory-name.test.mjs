import test from 'node:test';
import assert from 'node:assert/strict';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// CONTEXT.md sanctions two root names: the local clone directory (`anito-opzava`)
// and the machine slug (`opzava`). CI checks out the `opzava` repo into a dir of
// that name, so both must pass — anything else signals an unexpected rename.
const SANCTIONED_ROOT_NAMES = ['anito-opzava', 'opzava'];

test('project directory uses a sanctioned root name', () => {
  assert.ok(
    SANCTIONED_ROOT_NAMES.includes(basename(root)),
    `root directory "${basename(root)}" is not one of ${SANCTIONED_ROOT_NAMES.join(', ')} (see CONTEXT.md)`,
  );
});
