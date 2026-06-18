import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production-grade complexity gate forbids MVP-grade implementation shortcuts', async () => {
  const gate = await readFile(new URL('../docs/architecture/production-grade-complexity.md', import.meta.url), 'utf8');
  const simplicity = await readFile(new URL('../docs/architecture/code-simplicity.md', import.meta.url), 'utf8');
  const plan = await readFile(new URL('../docs/plans/opzava-start-plan.md', import.meta.url), 'utf8');
  const principles = await readFile(new URL('../docs/golden-principles.md', import.meta.url), 'utf8');
  const layers = await readFile(new URL('../docs/plans/opzava-implementation-layers.md', import.meta.url), 'utf8');

  assert.match(gate, /^# Opzava Production-Grade Complexity Gate/m);
  assert.match(gate, /No MVP-grade implementation/);
  assert.match(gate, /Production-grade slice/);
  assert.match(gate, /Automated Complexity Budgets/);
  assert.match(gate, /Context Guardrails/);
  assert.match(gate, /Dependency Whitelist/);
  assert.match(gate, /Reviewer Agent Loop/);
  assert.match(gate, /Static Analysis Gate/);
  assert.match(gate, /Tiered Change Model/);
  assert.match(gate, /Simple Change Track/);
  assert.match(gate, /Gate Applicability/);
  assert.match(simplicity, /Simple does not mean MVP-grade/);
  assert.match(plan, /Production-grade complexity layer/);
  assert.match(principles, /No MVP-grade implementation shortcuts/);
  assert.match(layers, /Production-grade complexity gate/);
});
