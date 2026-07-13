# E2E validation area

Every script that drives the **real** local stack lives here. Nothing in this area mocks, stubs, or
mints a session: they log in through the real form, against real seeded data, and screenshot what
they see. That is the point — slices were once reported working while the live stack was broken,
because acceptance had bypassed the login (SeniorQA directive, 2026-07-04).

**Run everything from the repo root.** The gate and the probes shell out to `docker compose`, which
needs the compose file in the working directory, and artifacts are written to
`real-validate-artifacts/` relative to it.

```bash
docker compose up -d --build          # the stack must be up and healthy first
pnpm gate                             # the Done bar: loops until 2 consecutive clean passes
pnpm e2e:connections                  # one flow
node tests/e2e/drives/connections.mjs # or call any script directly, with an optional [outDir]
```

## Layout

| Path | What it is |
| --- | --- |
| `gate/real-world-validate.mjs` | **The gate.** Discovers routes from the live nav, sweeps them, and loops until it gets `REAL_CLEAN_STREAK` consecutive clean passes. Exit 0 = Done-eligible; anything else = NOT Done. The exit code is the verdict, not the narrative. Procedure: `docs/runbooks/senior-qa-gate.md`. |
| `drives/*.mjs` | One flow each, exercising real interactions and asserting real outcomes. A UI slice ships or extends a drive here. |
| `probes/senior-qa-probe.mjs` | Exploratory QA harness (`docs/runbooks/senior-qa-probe.md`). Files findings; it never replaces the gate. Also a library — `drives/senior-qa-gateway.mjs` imports it. |
| `probes/setup-token-url.mjs` | Narrow one-shot probe kept for the flow it inspects (#127). |
| `lib/session.mjs` | The live stack's URL, the seeded credentials, the one real login, and the artifact-dir helper. Change them here, nowhere else. |

## Conventions

- **Never mint a session or inject a cookie.** `realLogin` is the only way in; if it fails, the run fails.
- **A drive must be able to fail.** Assert on outcomes, and make sure a clean result cannot be vacuous — where a drive proves the *absence* of something (e.g. `connections-apikey-argv` proves a credential never reaches the container's process list), it must also assert it *observed the window* in which that thing would have appeared.
- **Artifacts** (screenshots + `*-report.json`) go to `real-validate-artifacts/<prefix>-<timestamp>/`, which is gitignored. Pass `[outDir]` to pin one.
- Env overrides: `REAL_BASE`, `REAL_EMAIL`, `REAL_PASSWORD` (and the gate's `REAL_MAX_PASSES`, `REAL_CLEAN_STREAK`, `REAL_STORM_THRESHOLD`; the probe's `SENIORQA_*`).

These scripts used to sit loose in the repo root as `*.local.mjs`. Docs frozen before 2026-07-14
(`docs/plan/consensus/`, `docs/plan/audits/`) still cite those old paths; the mapping is
`<name>.local.mjs` → this directory.
