# ARD 0030 — Centralized E2E Contract + Live-App Visual Regression

- **Status:** Proposed (design ratified via `/grilling` 2026-06-28 — all seven branches resolved, no open sign-off; implementation pending Slice 0 walking skeleton)
- **Date:** 2026-06-28
- **Relates-to:** [CONTEXT.md](../../CONTEXT.md) (`E2E Contract`, `Visual Regression`, `Baseline`, `Tier-1 Surface`, `Advisory Gate` / `Blocking Gate`), [CLAUDE.md](../../CLAUDE.md) (Commands / Conventions / governance tests), [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (the panels VR will eventually cover), governance tests in `test/*.test.mjs`, `scripts/e2e-openclaw/start-e2e-server.mjs`, [module design](../architecture/e2e-vr/module-design.md) (deep-module interface, design-it-twice outcome)

## Context

Opzava's end-to-end setup is *already* fairly centralized: 67 specs in `tests/`, one main `playwright.config.ts`, chromium-only in CI (one `playwright install --with-deps chromium`, cached `~/.cache/ms-playwright`), and `scripts/e2e-openclaw/start-e2e-server.mjs` already provides a deterministic substrate (`AUTH_USER=admin` / `AUTH_PASS=admin`, `MISSION_CONTROL_TEST_MODE=1`, `MC_DISABLE_RATE_LIMIT=1`, fresh data dir per run). What is **missing** is (a) an *enforced contract* — nothing tells an agent "this is THE setup; don't reinvent it," so an agent could trivially run `npx playwright`, add a second browser, or create a stray config — and (b) a **visual-regression** layer (none exists today: no `toHaveScreenshot` / `toHaveSnapshot`). The motivating fear is agent-driven fragmentation ("agents will create new chromium or other things"). A `/grilling` pass resolved seven branches; this ARD records the outcome.

## Decision

Adopt a single, **enforced** `E2E Contract` plus a live-app `Visual Regression` harness built on the same contract:

1. **Enforcement = base config + governance test + skill.** A shared `playwright.base.config.ts` (the single source of browser/viewport/hardening truth) that the VR config extends; a governance test `test/e2e-contract.test.mjs` folded into `test:all` that **hard-fails** CI on a stray `playwright.*.config.ts`, `@playwright/test` imported outside `tests/`, VR specs outside `tests/visual/`, `npx playwright` / `playwright install <browser>` outside CI + blessed scripts, or a second browser channel (system-chrome via `E2E_USE_CHROME` stays allowed); and an agent skill (`.claude/skills/e2e/`) + `CLAUDE.md` / `AGENTS.md` / `CONTEXT.md` pointers documenting the sanctioned run/update path.
2. **VR target = live app** (the running standalone server), not static mockups — to catch real rendering regressions, accepting the determinism work it costs.
3. **Coverage v1 = `Tier-1 Surface`s only** (`/login`, `/setup`, the authenticated shell + static panels). Live regions (SSE panels `activity-feed` / `system-monitor`, xterm terminals, reagraph / recharts canvases) are masked/excluded until deterministic event injection exists.
4. **Baseline matrix = both themes × multiple viewports** (desktop 1280×720 + mobile 375×812).
5. **Determinism recipe:** chromium-only · locale `en` · animations off (`prefers-reduced-motion` + style kill) · fonts locked (`document.fonts.ready`) · gateway-off · mask non-seed regions; a **fixed-name seed** via Playwright `globalSetup` against the fresh-per-run DB (no upsert needed — the DB is wiped each run).
6. **CI gate = `Advisory` now → `Blocking` later.** VR runs in CI and uploads diff artifacts but does not fail the gate; promoted to `Blocking` once the active UX redesign stabilizes and the run is clean. A flaky blocking gate during churn is itself the fragmentation the contract exists to prevent.
7. **Config unification = VR extends the base now; the 4 existing configs migrate later.** The base is created and VR uses it immediately; the existing passing configs (`playwright.config.ts`, `.openclaw.local`, `.openclaw.gateway`, `.dokploy`) migrate to extend the base in a separate low-risk commit so the VR build does not destabilize the suite.

## Consequences

- **Baselines are OS-specific** (font hinting / antialiasing): a macOS-generated baseline flakes on Linux CI. Baselines are therefore generated/maintained in CI; local `vr:update` runs are iteration-only. This must be stated in the skill.
- **Higher baseline count** (2 themes × N viewports) raises update burden; the `Advisory` gate keeps intended visual changes from blocking during the redesign.
- **The governance test can only assert "the VR config extends base"** until the 4 existing configs migrate; full "all configs extend base" enforcement lands in that follow-up commit.
- **Slicing:** 0 = walking skeleton (base + visual config at 1 project / 1 theme / 1 viewport, seed, one `/login` spec, blessed scripts, governance test) → 1 = logged-in fixture + shell + full matrix → 2 = remaining Tier-1 + masking → 3 = CI advisory + diff artifacts + skill + doc pointers → 4 (later) = promote to `Blocking` + migrate the 4 existing configs onto the base.
