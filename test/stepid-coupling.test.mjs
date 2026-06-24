import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const url = (p) => new URL(p, import.meta.url);

/**
 * Extract the single-quoted string elements of `export const <name> = [ ... ] as const` from TS
 * source. Used to compare team's department-pipeline orders against each module's declared step
 * surface without a TS import (node:test runs plain ESM).
 */
async function readConstStringArray(file, name) {
  const src = await readFile(url(file), 'utf8');
  const m = src.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`));
  assert.ok(m, `${name} not found in ${file}`);
  const ids = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.ok(ids.length > 0, `${name} in ${file} had no string elements`);
  return ids;
}

// team's department-pipeline step-id orders are a STRING coupling to the other three modules — they
// are not imports, so the architecture graph cannot catch a drift. These tests make that coupling
// machine-checkable: every pipeline step-id must exist in the owning module's declared step surface.

test('CONTENT_PIPELINE_ORDER step-ids exist in the content workflow definition', async () => {
  const order = await readConstStringArray('../src/opzava/modules/team/department-pipeline.ts', 'CONTENT_PIPELINE_ORDER');
  const wfSrc = await readFile(url('../src/opzava/modules/content/workflow/content-workflow.ts'), 'utf8');
  const contentStepIds = new Set([...wfSrc.matchAll(/stepId:\s*'([^']+)'/g)].map((x) => x[1]));
  for (const id of order) {
    assert.ok(contentStepIds.has(id), `content pipeline step "${id}" is not a stepId in content-workflow.ts`);
  }
});

test('SOCIAL_PIPELINE_ORDER step-ids are declared in SOCIAL_STEP_IDS', async () => {
  const order = await readConstStringArray('../src/opzava/modules/team/department-pipeline.ts', 'SOCIAL_PIPELINE_ORDER');
  const declared = await readConstStringArray('../src/opzava/modules/social/workflow/social-steps.ts', 'SOCIAL_STEP_IDS');
  const set = new Set(declared);
  for (const id of order) {
    assert.ok(set.has(id), `social pipeline step "${id}" is not declared in SOCIAL_STEP_IDS`);
  }
});

test('GENERAL_VA_PIPELINE_ORDER step-ids are declared in GENERAL_VA_STEP_IDS', async () => {
  const order = await readConstStringArray('../src/opzava/modules/team/department-pipeline.ts', 'GENERAL_VA_PIPELINE_ORDER');
  const declared = await readConstStringArray('../src/opzava/modules/general-va/workflow/general-va-steps.ts', 'GENERAL_VA_STEP_IDS');
  const set = new Set(declared);
  for (const id of order) {
    assert.ok(set.has(id), `general-va pipeline step "${id}" is not declared in GENERAL_VA_STEP_IDS`);
  }
});

test('EMAIL_PIPELINE_ORDER is the single campaign-send job kind (a job kind, not a workflow step)', async () => {
  const order = await readConstStringArray('../src/opzava/modules/team/department-pipeline.ts', 'EMAIL_PIPELINE_ORDER');
  assert.deepEqual(order, ['campaign-send']);
});
