# E2E validation area

Every script that drives the **real** local stack lives here. Nothing in this area mocks, stubs, or
mints a session: they log in through the real form, against real seeded data, and screenshot what
they see. That is the point — slices were once reported working while the live stack was broken,
because acceptance had bypassed the login (2026-07-04 directive). These drives are the tooling the
default verify posture leans on (the `/verify` skill + the real drives); there is no mandatory gate.

**Run everything from the repo root.** The drives and probes shell out to `docker compose`, which
needs the compose file in the working directory, and artifacts are written to
`real-validate-artifacts/` relative to it.

```bash
docker compose up -d --build          # the stack must be up and healthy first
pnpm e2e:connections                  # one flow
node tests/e2e/drives/connections.mjs # or call any script directly, with an optional [outDir]
```

## Layout

| Path              | What it is                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drives/*.mjs`    | One flow each, exercising real interactions and asserting real outcomes. A UI slice ships or extends a drive here.                                        |
| `probes/*.mjs`    | Narrow one-shot or exploratory probes kept for the flows they inspect (e.g. `setup-token-url` #127, `elect-orchestrator-model`, `repro-disconnect-flip`). |
| `lib/session.mjs` | The live stack's URL, the seeded credentials, the one real login, and the artifact-dir helper. Change them here, nowhere else.                            |

## Conventions

- **Never mint a session or inject a cookie.** `realLogin` is the only way in; if it fails, the run
  fails.
- **A drive must be able to fail.** Assert on outcomes, and make sure a clean result cannot be
  vacuous — where a drive proves the _absence_ of something (e.g. `connections-apikey-argv` proves a
  credential never reaches the container's process list), it must also assert it _observed the
  window_ in which that thing would have appeared.
- **Exit codes.** A drive exits `0` only when it exercised the flow and it passed; `1` when it
  exercised the flow and the product is broken; `2` when it could not exercise the flow at all
  (precondition failed — the provider/env the flow needs is absent on this stack). A run that
  exercised nothing must never exit `0`: that is a vacuous pass, so the drive prints a loud
  precondition message and exits `2` instead. `connections-models` and
  `connections-disconnect-orphan` set the precedent for the exit-`2` shape.
- **Provider-card selectors come from `lib/selectors.mjs`.** Do not hand-roll
  `article[data-provider-id]` or `[data-provider-tier]` in a drive: #181's table→card port silently
  rotted two drives that did. Resolve the provider id at the call site (the catalog id, not the
  display label) and build the selector with `providerCard(id)` / `providerTier(tier)`, so a future
  port breaks in one place instead of passing green against nothing.
- **Artifacts** (screenshots + `*-report.json`) go to
  `real-validate-artifacts/<prefix>-<timestamp>/`, which is gitignored. Pass `[outDir]` to pin one.
- Env overrides: `REAL_BASE`, `REAL_EMAIL`, `REAL_PASSWORD`.

## Connections Overview real-state matrix

`drives/connections.mjs` never fabricates health or integration data and never mutates the shared
Gateway or GitHub integration to manufacture a scenario. Prepare the real stack in one state, then
declare that state explicitly. Missing declarations and observed-state mismatches fail the drive;
they are not skips. A degraded run also requires the exact positive attention count. Run this drive
directly against one prepared state and confirm a complete scenario-drive pass; a failed child means
the scenario is not proven.

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
