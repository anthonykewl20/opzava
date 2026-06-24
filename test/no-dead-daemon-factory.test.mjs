import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * DS-5 governance gate: no dead daemon-runtime factory seams.
 *
 * `createRuntimeRunnerDaemon` (src/opzava/platform/runner/daemon-runtime.ts) and
 * `runCampaignDaemon` (src/opzava/modules/content/workflow/campaign-daemon-runtime.ts)
 * were factory seams with no production caller — only barrel re-exports in
 * `src/opzava/modules/content/index.ts`. They wrapped the real, used seams
 * (`createRunnerDaemon`, `createCampaignWorkerDaemon`) but nothing ever invoked
 * them, so they were dead code (structural entropy, the kind CLAUDE.md rejects).
 *
 * Acceptance: either wired as the production background drain, OR deleted along
 * with their barrel re-exports. The deletion path was taken. This gate prevents
 * regressions in BOTH directions: re-adding the dead seam, or re-introducing it
 * as a bare export with no caller.
 *
 * It scans `src/` and `scripts/` (ts + cjs), excluding `.test.` files, and
 * asserts zero hits for either symbol. A production wiring (a real call site in
 * src/app or a script) would also satisfy this gate, so it does not lock in the
 * deletion choice — it only locks out the dead state.
 */

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

function nonTestReferences(symbol) {
  // grep -rn <symbol> src/ scripts/ --include '*.ts' '*.cjs', drop .test. lines.
  // grep exits non-zero when nothing matches — that is the success case here,
  // so swallow the exit code and treat empty stdout as zero references.
  let out = '';
  try {
    out = execFileSync(
      'grep',
      [
        '-rn',
        '--include=*.ts',
        '--include=*.cjs',
        symbol,
        'src/',
        'scripts/',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
  } catch (err) {
    // Re-throw genuine failures (missing cwd, etc.) but accept grep's "no match"
    // exit codes (1) and signal kills as "no references found".
    if (err.status !== 1 && err.signal === null && err.status !== null) {
      throw err;
    }
    out = err.stdout ?? '';
  }
  return out
    .split('\n')
    .filter((line) => line.length > 0 && !line.includes('.test.'));
}

for (const symbol of ['createRuntimeRunnerDaemon', 'runCampaignDaemon']) {
  test(`DS-5: ${symbol} has a production caller or is absent (no dead factory seam)`, () => {
    const hits = nonTestReferences(symbol);

    // Classify each remaining hit. The only acceptable non-test references are a
    // REAL call site (an invocation, `symbol(`) — not a definition
    // (`export ... function symbol`) and not a bare barrel re-export
    // (`symbol,` / `symbol,` inside an `export { }` block).
    const offenders = [];
    for (const line of hits) {
      const isDef = /\bfunction\s+createRuntimeRunnerDaemon\b|\bfunction\s+runCampaignDaemon\b/.test(line);
      const isBareReexport = /,\s*$/.test(line) || /^.*:\s*(createRuntimeRunnerDaemon|runCampaignDaemon)\s*,?\s*$/.test(line);
      const isInvocation = new RegExp(`\\b${symbol}\\s*\\(`).test(line);
      if (isInvocation && !isDef) {
        // A real call site — this is the "wired as production drain" branch.
        continue;
      }
      if (isDef || isBareReexport) {
        offenders.push(`  dead seam: ${line}`);
      } else {
        offenders.push(`  unresolved: ${line}`);
      }
    }

    assert.equal(
      offenders.length,
      0,
      `${symbol} is a dead factory seam: definition or barrel re-export present ` +
        `with no production call site (DS-5). Either wire it as the production ` +
        `background drain or delete it along with its barrel re-exports.\n` +
        offenders.join('\n'),
    );
  });
}
