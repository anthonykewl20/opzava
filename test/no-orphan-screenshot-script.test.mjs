import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * SCR-6 governance gate: `scripts/take-screenshots.ts` must not be dead tooling.
 *
 * The acceptance criterion is `grep -rn 'take-screenshots' package.json Makefile
 * .github test/` → a real invocation or 0 hits. Concretely: the script is either
 * wired into the documented tooling surface (a `package.json` script entry that
 * actually invokes it) or it does not exist. The previous state — file present
 * with zero invocations, hardcoded creds (`mc-screenshots-2026`) and upstream
 * `mission-control-*` panel names — was dead tooling and a brand/secret leak.
 *
 * This gate prevents regressions on both directions: re-adding the orphan, or
 * re-introducing it without wiring it into the tooling surface.
 */

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const scriptPath = new URL('../scripts/take-screenshots.ts', import.meta.url);

async function scriptExists() {
  try {
    await stat(scriptPath);
    return true;
  } catch {
    return false;
  }
}

test('SCR-6: take-screenshots is wired into package.json or absent (no dead tooling)', async () => {
  const exists = await scriptExists();
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const scripts = pkg.scripts ?? {};
  const wired = Object.values(scripts).some((cmd) => /take-screenshots/.test(String(cmd)));

  if (exists) {
    assert.ok(
      wired,
      'scripts/take-screenshots.ts exists but is not invoked by any package.json script — dead tooling (SCR-6). ' +
        'Either wire it into a documented pnpm script or delete the file.',
    );
  } else {
    assert.ok(
      !wired,
      'package.json references take-screenshots but scripts/take-screenshots.ts is gone — dangling wiring (SCR-6).',
    );
  }
});
