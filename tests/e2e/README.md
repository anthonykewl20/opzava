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

| Path                           | What it is                                                                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gate/real-world-validate.mjs` | **The gate.** Discovers routes from the live nav, sweeps them, and loops until it gets `REAL_CLEAN_STREAK` consecutive clean passes. Exit 0 = Done-eligible; anything else = NOT Done. The exit code is the verdict, not the narrative. Procedure: `docs/runbooks/senior-qa-gate.md`. |
| `drives/*.mjs`                 | One flow each, exercising real interactions and asserting real outcomes. A UI slice ships or extends a drive here.                                                                                                                                                                    |
| `probes/senior-qa-probe.mjs`   | Exploratory QA harness (`docs/runbooks/senior-qa-probe.md`). Files findings; it never replaces the gate. Also a library — `drives/senior-qa-gateway.mjs` imports it.                                                                                                                  |
| `probes/setup-token-url.mjs`   | Narrow one-shot probe kept for the flow it inspects (#127).                                                                                                                                                                                                                           |
| `lib/session.mjs`              | The live stack's URL, the seeded credentials, the one real login, and the artifact-dir helper. Change them here, nowhere else.                                                                                                                                                        |

## Conventions

- **Never mint a session or inject a cookie.** `realLogin` is the only way in; if it fails, the run
  fails.
- **A drive must be able to fail.** Assert on outcomes, and make sure a clean result cannot be
  vacuous — where a drive proves the _absence_ of something (e.g. `connections-apikey-argv` proves a
  credential never reaches the container's process list), it must also assert it _observed the
  window_ in which that thing would have appeared.
- **Artifacts** (screenshots + `*-report.json`) go to
  `real-validate-artifacts/<prefix>-<timestamp>/`, which is gitignored. Pass `[outDir]` to pin one.
- Env overrides: `REAL_BASE`, `REAL_EMAIL`, `REAL_PASSWORD` (and the gate's `REAL_MAX_PASSES`,
  `REAL_CLEAN_STREAK`, `REAL_STORM_THRESHOLD`; the probe's `SENIORQA_*`).

## Connections Overview real-state matrix

`drives/connections.mjs` never fabricates health or integration data and never mutates the shared
Gateway or GitHub integration to manufacture a scenario. Prepare the real stack in one state, then
declare that state explicitly. Missing declarations and observed-state mismatches fail the drive;
they are not skips. A degraded run also requires the exact positive attention count. The final gate
runs this drive inside every pass with inherited environment and writes its artifacts under
`<gate-out>/pN-connections-scenario`. A failed child blocks that pass and resets the clean streak,
so Done-eligible requires two consecutive complete scenario-drive passes against one prepared state.

Capture the non-secret navigation baseline against the agreed fixed point before validating the
candidate. Make this E2E-only harness available in a fixed-point worktree without bringing over app
changes, start its real stack, and run measurement mode. This mode performs the real login and three
timed `/connections` navigations, then exits before all candidate-only selectors and scenario
assertions. It requires no `REAL_CONNECTIONS_*` scenario or performance variables.

```bash
node tests/e2e/drives/connections.mjs --capture-baseline \
  real-validate-artifacts/connections-fixed-point-baseline
jq '.baselineCapture' \
  real-validate-artifacts/connections-fixed-point-baseline/connections-report.json
```

Use the measured fixed-point value and an explicitly approved regression budget; neither has a
default. The drive checks every observed `/connections` navigation against their sum.

```bash
export REAL_CONNECTIONS_BASELINE_LOAD_MS="$(jq -r '.baselineCapture.suggestedBaselineLoadMs' \
  real-validate-artifacts/connections-fixed-point-baseline/connections-report.json)"
export REAL_CONNECTIONS_MAX_REGRESSION_MS=REPLACE_WITH_APPROVED_BUDGET_MS
```

The current Mainframe contract can produce three honest real-stack health states: `partial-unknown`,
`degraded`, and `unreachable`. It reports agent schedule configuration, not an authoritative
per-agent liveness result, and always includes at least the implicit default agent. Consequently a
fully `healthy` live rollup is not currently realizable. Healthy classification and rendering remain
covered by the driver's `--self-test` and component tests for future Mainframe liveness support; do
not claim a live healthy run until that contract exists.

Integration state is an independent axis. Exercise each health state with the integration state
actually prepared in the stack. The empty state has been exercised live; a connected real
integration remains pending and must not be inferred from health coverage.

```bash
REAL_CONNECTIONS_HEALTH=degraded REAL_CONNECTIONS_ATTENTION=1 REAL_CONNECTIONS_INTEGRATIONS=empty \
  node tests/e2e/drives/connections.mjs real-validate-artifacts/connections-degraded-empty
REAL_CONNECTIONS_HEALTH=degraded REAL_CONNECTIONS_ATTENTION=1 REAL_CONNECTIONS_INTEGRATIONS=connected \
  node tests/e2e/drives/connections.mjs real-validate-artifacts/connections-degraded-connected
REAL_CONNECTIONS_HEALTH=partial-unknown REAL_CONNECTIONS_INTEGRATIONS=empty \
  node tests/e2e/drives/connections.mjs real-validate-artifacts/connections-partial-unknown-empty
REAL_CONNECTIONS_HEALTH=partial-unknown REAL_CONNECTIONS_INTEGRATIONS=connected \
  node tests/e2e/drives/connections.mjs real-validate-artifacts/connections-partial-unknown-connected
REAL_CONNECTIONS_HEALTH=unreachable REAL_CONNECTIONS_INTEGRATIONS=empty \
  node tests/e2e/drives/connections.mjs real-validate-artifacts/connections-unreachable-empty
REAL_CONNECTIONS_HEALTH=unreachable REAL_CONNECTIONS_INTEGRATIONS=connected \
  node tests/e2e/drives/connections.mjs real-validate-artifacts/connections-unreachable-connected
```

For `unreachable`, an unavailable provider catalog is the correct outcome. The provider page must
show the explicit Gateway outage/retry copy and expose no provider rows or actions; zero rows in
this state must never be interpreted as a valid zero-provider catalog.

The healthy commands remain available for the future contract or an environment that can provide
authoritative agent liveness:

```bash
REAL_CONNECTIONS_HEALTH=healthy REAL_CONNECTIONS_INTEGRATIONS=empty \
  node tests/e2e/drives/connections.mjs real-validate-artifacts/connections-healthy-empty
REAL_CONNECTIONS_HEALTH=healthy REAL_CONNECTIONS_INTEGRATIONS=connected \
  node tests/e2e/drives/connections.mjs real-validate-artifacts/connections-healthy-connected
```

Each successful validation run records numeric navigation timings and the numeric baseline contract,
and writes matched 1440x960 light/dark live and static-mockup screenshots plus
`connections-report.json` to its output directory. `partial-unknown` is the honest state for a
reachable Gateway whose configured agents have no authoritative liveness result; it is not an
unreachable Gateway. The three currently realizable health states require genuinely prepared real
environments or separate preparations; one ambient run does not cover the matrix. Healthy remains
automated future-compatible coverage, not a current live-matrix requirement.

These scripts used to sit loose in the repo root as `*.local.mjs`. Docs frozen before 2026-07-14
(`docs/plan/consensus/`, `docs/plan/audits/`) still cite those old paths; the mapping is
`<name>.local.mjs` → this directory.
