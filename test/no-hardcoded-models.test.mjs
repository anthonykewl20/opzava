import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Governance gate for finding F7 (bounded scope).
 *
 * The four core dispatch/pricing sites below previously inlined Claude model-id
 * literals (and, for token-pricing, the pricing table keyed by those ids). Those
 * literals were centralized into `src/lib/model-config.ts` as the single source
 * of truth. This gate proves the move stuck: it scans ONLY this explicit
 * allowlist (NOT all of src/**) and fails if any Claude model-id literal remains
 * in the executable code of these files.
 *
 * `src/lib/model-config.ts` is the SoT and is intentionally NOT scanned.
 *
 * The remaining inherited sites that still inline model ids/pricing are tracked
 * as debt in `docs/architecture/system-map/90-parity-findings.md` (finding F14);
 * they are deliberately out of scope for this bounded gate.
 */

// Explicit file allowlist — relative to the repo root. NOT a glob over src/**.
const ALLOWLIST = [
  '../src/lib/agent-templates.ts',
  '../src/lib/task-dispatch.ts',
  '../src/lib/token-pricing.ts',
  '../src/lib/agent-runtimes.ts',
];

// Claude model-id literal pattern, e.g. `claude-opus-4-6`,
// `anthropic/claude-sonnet-4-20250514`, `claude-haiku-4-5-20251001`.
const MODEL_ID_PATTERN = /(anthropic\/)?claude-(opus|sonnet|haiku|fable)-[0-9][\w.-]*/;

/**
 * Strip line (`//`) and block (slash-star) comments so prose references to model
 * ids (illustrative comments, docstrings) don't trip the gate — only executable
 * code is scanned. Naive but sufficient: these source files contain no regex or
 * string literals that embed comment delimiters.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

for (const relativePath of ALLOWLIST) {
  test(`${relativePath} contains no hardcoded Claude model ids (F7)`, async () => {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    const code = stripComments(source);
    const lines = code.split('\n');
    const offenders = [];

    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(MODEL_ID_PATTERN);
      if (match) {
        offenders.push(`  line ${i + 1}: ${match[0]} -> ${lines[i].trim()}`);
      }
    }

    assert.equal(
      offenders.length,
      0,
      `${relativePath} still inlines Claude model ids — move them to ` +
        `src/lib/model-config.ts:\n${offenders.join('\n')}`,
    );
  });
}
