# E2E Contract + Visual Regression — Module Design

Deep-module design for the system ratified in [ARD 0030](../../ard/0030-centralized-e2e-and-visual-regression-contract.md) and the [`E2E Contract` / `Visual Regression` glossary in CONTEXT.md](../../../CONTEXT.md). Output of `/codebase-design` (design-it-twice, 2026-06-28). Build slices live in ARD 0030 §Consequences; this doc is the interface the slices implement.

---

## The deep module: `playwright.base.config.ts`

The single source of truth behind Opzava's `E2E Contract`. Every Playwright config (main, `openclaw.local`, `openclaw.gateway`, `dokploy`, and the new `visual`) is an **adapter** at this seam. Four+ real adapters → the seam is justified (not hypothetical).

**What is deep (hidden behind the interface):** chromium-only browser · `workers:1` / `fullyParallel:false` · `expect`/`timeout` defaults · the determinism recipe (locale `en`, `prefers-reduced-motion`, `document.fonts.ready`, gateway-off) · the seeded webServer env block · the VR theme×viewport matrix.
**What is shallow (caller-provided):** test selection (`testMatch`/`testIgnore`) · `baseURL` · webServer mode.

### Design-it-twice outcome

Three candidate interfaces were designed in parallel under different constraints:

| | A — Minimal | B — Composable Parts | C — Common-caller |
|---|---|---|---|
| Distinctive move | tight overrides slot + defensive throws | 5 deep parts + `createOpzavaConfig` aggregate | zero-arg defaults; `'none'` webServer literal |
| Depth (common case) | high (2 fields) | high per part, but **7 exports** | **highest** (zero-arg) |
| Agent-proofing | strong | **weakest** — flexibility is the divergence door; governance cannot prove parts were used | **strongest** — default unbeatably simple, `'none'` is a review flag |
| Locality | good | best for *future* axes | good |

All three **independently converged on two factories** (E2E + VR) — VR is structurally different (matrix + `globalSetup` + `snapshotDir`) and folding it into one factory bloats the overrides slot.

**Chosen: hybrid C-primary + A-teeth; reject B.** B's composability is the divergence surface the `E2E Contract` exists to eliminate, and no static check can prove its parts were actually used. C's zero-arg defaults make the correct path the path of least resistance (the stated north star); A's throws and single-source seeded-env give the contract its teeth.

### Chosen interface

```ts
// playwright.base.config.ts — the deep module behind the E2E Contract
import { defineConfig, devices, type PlaywrightTestConfig, type Project } from '@playwright/test'

/** The substrate every Tier-1 Surface run inherits. Single source — the VR fixture imports
 *  AUTH_USER/PASS/API_KEY from here, so creds can never drift from what the server is seeded with. */
export const E2E_SEED_ENV = {
  MISSION_CONTROL_TEST_MODE: '1',
  MC_DISABLE_RATE_LIMIT: '1',
  MC_WORKLOAD_QUEUE_DEPTH_THROTTLE: '1000',
  MC_WORKLOAD_QUEUE_DEPTH_SHED: '2000',
  MC_WORKLOAD_ERROR_RATE_THROTTLE: '1',
  MC_WORKLOAD_ERROR_RATE_SHED: '1',
  API_KEY: 'test-api-key-e2e-12345',
  AUTH_USER: 'testadmin',
  AUTH_PASS: 'testpass1234!',
  NEXT_PUBLIC_GATEWAY_OPTIONAL: 'true', // gateway-off for determinism
} as const

/** Determinism recipe — applied inside every project's `use`. Hides locale/timezone/motion. */
export const E2E_DETERMINISM = { locale: 'en', timezoneId: 'UTC', reducedMotion: 'reduce' } as const

/** Canonical VR axes — exported so governance + power-users reference the blessed set. */
export const E2E_VISUAL_AXES = {
  themes: ['dark', 'light'] as const,
  viewports: [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'mobile', width: 375, height: 812 },
  ],
} as const

/** Tier-1 E2E config. Zero-arg → a correct, hardened config. */
export interface E2EConfigOverrides {
  testMatch?: PlaywrightTestConfig['testMatch']
  testIgnore?: PlaywrightTestConfig['testIgnore']
  baseURL?: string
  /** Default 'local'. 'none' = dokploy parity (external stack, no managed server). */
  webServer?: 'local' | 'gateway' | 'none'
}
export function createE2EConfig(o: E2EConfigOverrides = {}): PlaywrightTestConfig

/** Visual Regression config. Zero-arg → full 2×2 matrix + seed + snapshotDir. */
export interface VisualRegressionOptions {
  testMatch?: PlaywrightTestConfig['testMatch']
  snapshotDir?: string
  globalSetup?: string
  themes?: readonly ('dark' | 'light')[]
  viewports?: readonly { name: string; width: number; height: number }[]
  baseURL?: string
  webServer?: 'local' | 'gateway' | 'none'
}
export function createVisualRegressionConfig(o: VisualRegressionOptions = {}): PlaywrightTestConfig

/** Pure matrix builder — exported for governance tests (assert the default matrix without
 *  spinning Playwright) and power-users. The internal seam VR composes over. */
export function buildVisualMatrix(o?: { themes?: readonly string[]; viewports?: readonly { name: string; width: number; height: number }[] }): Project[]
```

```ts
// playwright.config.ts (main)
import { createE2EConfig } from './playwright.base.config'
export default createE2EConfig({ testIgnore: /openclaw-harness\.spec\.ts/ })

// playwright.visual.config.ts (VR) — one-liner
import { createVisualRegressionConfig } from './playwright.base.config'
export default createVisualRegressionConfig({ globalSetup: 'tests/visual/global-setup.ts' })

// playwright.dokploy.config.ts — the rare caller pays one visible, named cost
import { createE2EConfig } from './playwright.base.config'
export default createE2EConfig({
  webServer: 'none',
  baseURL: `http://${process.env.DOKPLOY_LOCAL_DOMAIN || 'opzava.localhost'}:${process.env.DOKPLOY_HTTP_PORT || '3080'}`,
  testIgnore: /openclaw-harness\.spec\.ts/,
})
```

### Locked invariants (enforced, not conventions)

- chromium-only; `workers:1`; `fullyParallel:false` — **not overridable through either factory** (determinism is a `Blocking Gate`, not a caller preference).
- The VR default matrix is `{dark, light} × {desktop 1280×720, mobile 375×812}` — overridable via params, but the default *is* the contract (a `Baseline` means the same thing across the suite).
- `createE2EConfig` throws if no test selection is implied; throws if `webServer:'none'` without a `baseURL` and without `E2E_BASE_URL` (the dokploy footgun).
- Escape hatch = spread the result (`defineConfig({ ...createE2EConfig() })`); the governance test scopes its locked-field assertions to **adapter files** so the base factory itself stays internally composable.

---

## Dependent modules (designed against the chosen shape)

### `tests/visual/fixtures.ts` — `vrPage`

Exports `test` / `expect` with a `vrPage` fixture: logs in with `E2E_SEED_ENV` creds, applies `E2E_DETERMINISM` (reduced-motion via init script), locks theme via next-themes' localStorage key, and awaits `document.fonts.ready`. **Theme×viewport is selected by the project** — `createVisualRegressionConfig` sets each project's `use.colorScheme` + `use.viewport` + a `name` like `chromium-desktop-dark` — so the fixture is theme-agnostic. A spec just does:

```ts
import { test, expect } from './fixtures'
test('shell renders', async ({ vrPage }) => {
  await vrPage.goto('/')
  await expect(vrPage).toHaveScreenshot('shell.png')
})
```

### `tests/visual/global-setup.ts` — `seedVisualWorld`

Creates **fixed-name** entities (a `VR Seed Project`, fixed tasks/agents) via API with the `E2E_SEED_ENV.API_KEY` header. The DB is wiped each run (`start-e2e-server.mjs`), so no upsert is needed — the world is byte-identical every run → deterministic lists/counts in every `Baseline`.

### `test/e2e-contract.test.mjs` — governance (folded into `test:all`)

1. The root set of `playwright.*.config.ts` equals the blessed whitelist (stray config = fail).
2. Each blessed config imports `playwright.base.config` and calls `createE2EConfig` / `createVisualRegressionConfig`.
3. No `firefox` / `webkit` string in any config (no second browser channel).
4. Adapter files do not redeclare `workers` / `fullyParallel` (assertion scoped to adapters, not the base).
5. `@playwright/test` imported only under `tests/`.
6. `toHaveScreenshot` used only under `tests/visual/`.
7. No `npx playwright` / `playwright install <browser>` outside `.github/workflows` + blessed scripts.

Plus: add `playwright.base.config.ts` and `playwright.visual.config.ts` to `test/folder-structure.test.mjs`'s top-level allowlist.

### `.claude/skills/e2e/SKILL.md` (symlinked to `.agents/skills/e2e/`)

When-to-use · THE commands (`pnpm test:e2e`, `pnpm test:e2e:visual`, `pnpm vr:update`) · where tests live (`tests/`, VR in `tests/visual/`) · explicit NEVERs (no `npx playwright`, no second browser, no new config, no VR outside `tests/visual/`) · "add a VR check" recipe (use `vrPage` + `toHaveScreenshot`; re-baseline via `vr:update`; **don't fight flake — fix determinism**) · the OS-baseline note (baselines generated in CI; local `vr:update` is iteration-only).

---

## Depth verdict

The common case is one line; VR is one line; the dokploy edge is one named literal. **Deletion test passes** — remove `playwright.base.config.ts` and ~30 lines of env/hardening/chromium/matrix scatter across five adapter files, and the seeded-env block drifts from the fixture's login creds. The interface is the test surface: a governance test exercises the contract through the same `createE2EConfig` / `createVisualRegressionConfig` seam every adapter uses.
