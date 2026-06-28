---
name: e2e
description: Run/write Opzava E2E + visual-regression tests. The ONE place for Playwright — the enforced E2E Contract (base config + governance). Use before adding or running any e2e or VR test.
---

# E2E + Visual Regression

Opzava has **one** enforced Playwright setup — the `E2E Contract` (ARD 0030). It lives behind `playwright.base.config.ts` + a governance test (`test/e2e-contract.test.mjs`). Do **not** create a parallel setup — the governance test fails CI on divergence.

## THE commands

- `pnpm test:e2e` — the main E2E suite (API + flow specs in `tests/`).
- `pnpm test:e2e:visual` — the visual-regression suite (`tests/visual/`).
- `pnpm vr:update` — regenerate VR baselines (`--update-snapshots`). The **only** sanctioned way to re-baseline.

On supported distros (incl. CI's ubuntu-latest) and macOS, use the **bundled chromium** (no flag). Only on distros where the bundled browser can't install (e.g. Ubuntu 26.04) do you prefix **both** `vr:update` and `test:e2e:visual` with `E2E_USE_CHROME=1` (system Google Chrome) — and it must be both, so update and verify use the same browser.

## Where things live

- E2E specs: `tests/*.spec.ts`. VR specs: `tests/visual/*.visual.spec.ts`. Shared helpers: `tests/helpers.ts`, `tests/visual/fixtures.ts`.
- Config: `playwright.base.config.ts` exports the factories `createE2EConfig` / `createVisualRegressionConfig` / `buildVisualMatrix` + the consts `E2E_SEED_ENV` / `E2E_DETERMINISM` / `E2E_VISUAL_AXES`. Every consuming config (`playwright.config.ts`, `playwright.visual.config.ts`, …) extends it.
- Governance: `test/e2e-contract.test.mjs` — 8 invariants, runs in `pnpm test:governance`.

## NEVER (the governance test fails CI on these)

- No `npx playwright`, and no `playwright install <browser>` outside CI (`.github/workflows`). Chromium comes from `playwright install --with-deps chromium` in CI.
- No second browser/channel — chromium only. System Chrome via `E2E_USE_CHROME=1` is the single allowed exception (unsupported distros).
- No new `playwright.*.config.ts` — extend the base via the factories.
- No VR specs outside `tests/visual/`; use `toHaveScreenshot`, never `toMatchSnapshot`.

## Add a visual-regression check

1. Pick a **deterministic Tier-1 surface**. Live regions (SSE panels like activity-feed/system-monitor, xterm terminals, reagraph/recharts canvases) are NOT Tier-1 — exclude them.
2. `import { test, expect } from './fixtures'`. Use `vrPage` (anonymous) or `authPage` (logged in as the seeded `testadmin`, restored via storageState — no per-test login).
3. `await expect(page).toHaveScreenshot('name.png', { mask: [page.locator('[role="alert"]'), …] })` — mask anything non-seed-deterministic (status banners, live regions, timestamps).
4. Generate the baseline: `pnpm vr:update`, then confirm with `pnpm test:e2e:visual` (same browser both times). On an unsupported distro, prefix **both** with `E2E_USE_CHROME=1`.
5. Commit the baseline PNG under `tests/visual/<spec>.visual.spec.ts-snapshots/`.

## Determinism — don't fight flake, fix it

- The theme is forced via **localStorage** (`opzava-ds-theme` for the shell, `theme` for next-themes) because next-themes has `enableSystem:false` — Playwright's `colorScheme` is only a carrier the fixture reads. The fixture handles this; do not rely on `colorScheme` affecting the app.
- Onboarding is dismissed in `authPage` so the shell renders cleanly (the fresh admin would otherwise trigger the onboarding overlay).
- Mask `[role="alert"]` banners + live regions; they vary run-to-run.

## OS-specific baselines

Baselines are pixel-specific to the OS (font hinting/antialiasing). Generate and maintain them in **CI (Linux)**; local `vr:update` is for iteration and may need re-baselining in CI. (Playwright already qualifies filenames by platform, so macOS/CI baselines don't collide.)

Refs: ARD 0030, `docs/architecture/e2e-vr/module-design.md`, `docs/architecture/e2e-vr/PRD.md`.
