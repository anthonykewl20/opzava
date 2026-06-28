# PRD — Centralized E2E Contract + Live-App Visual Regression

- **Status:** Design complete (`/grilling` → `/domain-modeling` → `/codebase-design`). Plan → Build.
- **Decides:** [ARD 0030](../../ard/0030-centralized-e2e-and-visual-regression-contract.md) · **Module interface:** [module-design.md](./module-design.md) · **Language:** [CONTEXT.md](../../../CONTEXT.md) `E2E Contract` / `Visual Regression`

## Problem

Opzava's E2E infra is already centralized (67 specs in `tests/`, one main config, chromium-only in CI), but nothing *enforces* that — an agent can trivially run `npx playwright`, add a second browser, or create a stray config. There is also no visual-regression layer. The motivating fear is agent-driven fragmentation ("agents will create new chromium or other things").

## Goals

1. **One enforced `E2E Contract`** — a shared base config + a governance test (hard CI failure on divergence) + an agent skill, so no agent/human can create a parallel Playwright/chromium setup.
2. **Live-app `Visual Regression`** on `Tier-1 Surface`s, committed `Baseline`s, one blessed update path.
3. **Agent-proof by default** — extending the base is the path of least resistance; divergence is a defect, not a style choice.

## Non-goals (v1)

- Static-mockup VR; component-isolation (Storybook-style); multi-browser (firefox/webkit).
- VR on live regions (SSE panels, xterm terminals, reagraph/recharts canvases) — deferred until deterministic event injection exists.
- A *blocking* CI gate (ships `Advisory`, promoted later).
- Migrating the 4 existing configs onto the base (separate low-risk commit, Slice 4).

## Scope (v1)

The contract (`playwright.base.config.ts` + `test/e2e-contract.test.mjs` + `.claude/skills/e2e/`) + VR on Tier-1 surfaces (`/login`, `/setup`, the authenticated shell + static panels), 2-theme × 2-viewport `Baseline` matrix, `Advisory` CI gate.

## Slices → GitHub Issues

| Slice | Scope | Definition of Done | Label | Depends |
|---|---|---|---|---|
| **0 — Walking skeleton** | `playwright.base.config.ts` (`createE2EConfig`/`createVisualRegressionConfig`/`buildVisualMatrix`); `playwright.visual.config.ts` at **1 project / 1 theme / 1 viewport**; `tests/visual/global-setup.ts` seed; **one** `/login` spec; `pnpm test:e2e:visual` + `pnpm vr:update` scripts; `test/e2e-contract.test.mjs`; add the two new files to `test/folder-structure.test.mjs` allowlist | `pnpm test:e2e:visual` runs green; one `Baseline` committed; governance test passes; allowlist updated | `ready-for-agent` | — |
| **1 — Logged-in fixture + shell + matrix** | `tests/visual/fixtures.ts` (`vrPage`: admin login via `E2E_SEED_ENV`, determinism, theme lock, `document.fonts.ready`); shell VR spec; expand `buildVisualMatrix` to the full `{dark,light}×{desktop,mobile}` | 4 shell `Baseline`s; matrix is the default and asserted by governance; clean re-run | `ready-for-agent` | 0 |
| **2 — Remaining Tier-1 + masking** | `/setup` + static panels; mask non-seed-deterministic regions (timestamps, avatars) | N Tier-1 `Baseline`s; masking in place; stable across re-runs | `ready-for-agent` | 1 |
| **3 — CI advisory + artifacts + skill + docs** | `.github/workflows/quality-gate.yml` VR step (`Advisory`, upload diff artifacts); `.claude/skills/e2e/SKILL.md`; `CLAUDE.md`/`AGENTS.md`/`CONTEXT.md` pointers; OS-baseline (CI-generated) note/workflow | CI runs VR non-blocking; skill discoverable via CLAUDE.md routing; diff images uploaded on failure | `ready-for-human` | 2 |
| **4 — Blocking + migrate (later)** | Promote gate to `Blocking` after N clean runs; migrate the 4 existing configs onto the base; governance asserts *all* configs extend base | Gate flips blocking; all 4 configs extend base; `test/e2e-contract.test.mjs` full assertion set green | `ready-for-human` (sign-off) | 3 + redesign stable |

## Acceptance criteria (feature DoD)

- Exactly one `E2E Contract`: the governance test fails CI on a stray config, a second browser, `@playwright/test` outside `tests/`, VR specs outside `tests/visual/`, or ad-hoc `npx playwright`/`playwright install`.
- VR runs against the live app on Tier-1 surfaces across the 2×2 matrix; `Baseline`s committed; one blessed update command (`pnpm vr:update`).
- `Advisory` in CI (non-blocking) with diff artifacts; OS-specific `Baseline`s generated/maintained in CI.
- The skill + doc pointers route agents to the contract; the forbidden-ambiguity rules in CONTEXT.md hold.

## Risks & mitigations

- **OS-specific `Baseline`s** (font hinting/AA): macOS baselines flake on Linux CI → generate/maintain in CI; local `vr:update` is iteration-only (Slice 3).
- **Matrix flake during active redesign churn**: kept `Advisory` (not blocking) until stable (Slice 4 promotion gate).
- **Standalone build dependency**: `start-e2e-server.mjs` builds `.next/standalone` if missing and copies static assets — VR reuses this; no new server.
- **Theme/viewport determinism**: next-themes localStorage lock + per-project `colorScheme`/`viewport`; `document.fonts.ready` awaited in the fixture.

## Out of scope (explicit)

Mockup/design-system VR · live-panel VR (SSE/terminal/canvas) · component-isolation · multi-browser · blocking gate in v1 · migrating the 4 existing configs before Slice 4.
