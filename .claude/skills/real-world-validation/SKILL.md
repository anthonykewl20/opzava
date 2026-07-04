---
name: real-world-validation
description: MANDATORY final gate for every Opzava slice/issue - automated user-level validation on the REAL local docker stack (real login, real data, real visuals, iterative loop-until-clean). Use BEFORE marking any slice/issue Done, after tdd + verify-deep. Mocks, synthetic data, and minted sessions are BANNED at this gate.
---

# Real-world final validation (user directive 2026-07-04)

**Why this exists:** slices 1-3 were reported "complete, working, deployed" while the live stack was
broken - acceptance had passed via mocks and minted sessions. That class of false positive is now a
process bug. TDD (unit / mock / mutation tests) gates *development*; it can NEVER green a slice.
The FINAL gate is a human-like automated drive of the real stack with real data and real visuals.

## Hard rules (zero ambiguity - these are not judgment calls)

1. The gate runs against the REAL composed stack at `http://web.opzava.localhost:18088` -
   every service in `docker-compose.yml` up (`docker compose up -d --build`). If any service is
   missing or unhealthy the gate FAILS (exit 2); fix the stack, do not shrink the stack.
2. REAL login through the login form (`owner@opzava.localhost` dev credentials). Minting
   `auth_sessions` rows or injecting `opzava.session_token` cookies is BANNED at this gate
   (the harness ignores `PARITY_COOKIE` by design). If login is broken, the slice is broken.
3. REAL data only: whatever the seeded org + the slice's real flows created. NO fixtures pushed
   straight into the DB to make a screen look alive, NO mocked gateway/broker/API responses.
4. VISUAL evidence: full-page screenshots are captured per route per pass and MUST be eyeballed
   (or diffed against the mockup with `parity-shots.local.mjs`) before claiming Done.
5. ITERATIVE: the harness loops full sweeps until **2 consecutive clean passes**
   (max 5, then hard NOT-DONE). One lucky pass proves nothing; convergence does.
6. Exit code is the verdict: `0` = DONE-eligible, anything else = NOT Done. No narrative
   ("it looks fine") overrides a non-zero exit. NEVER pipe the command (`| tail`, `| tee`)
   without `set -o pipefail` — a pipe returns the LAST command's exit code and silently
   converts NOT-DONE into a false green. Run it bare; read the tail from the artifacts dir.

## Exact procedure (any agent, any model, same result)

```bash
# 1. Bring up the REAL stack (from repo root)
docker compose up -d --build

# 2. Run the gate (loops sweeps until 2 consecutive clean passes)
node real-world-validate.local.mjs            # artifacts -> real-validate-artifacts/<timestamp>/

# 3. Slice-specific real flows (every UI slice ships or extends one - see below)
node <slice-drive-script>.local.mjs <outDir>  # e.g. e2e-drive.local.mjs, acceptance-drive.local.mjs

# 4. Visual parity vs mockups for every screen the slice touched
node parity-shots.local.mjs <outDir> /route:mockup.html [...]
```

What the harness itself covers (see `real-world-validate.local.mjs`):
- **Preflight:** all compose services running (one-shot init containers may be exited 0).
- **Route sweep:** routes are DISCOVERED from the live nav (plus seeds) - not hand-picked, so new
  screens are swept automatically and gaps cannot hide.
- **Per route:** console errors, page exceptions, HTTP 5xx anywhere, same-origin 404s, visible
  error states (`[role="alert"]`), auth bounces, and empty-`<main>` dead pages - all findings.
- **Write round-trip:** creates a real task through the UI each pass and proves it persists
  across reload (UI -> server -> Postgres -> UI).
- **Log ground truth:** `docker compose logs` for the pass window; `unhandled|fatal|panic`
  block the pass, other error-ish lines land in the report as warnings to audit.

## Pass criteria for "Done"

ALL of: harness verdict `DONE-ELIGIBLE` (exit 0) · slice-specific drive proves the slice's own
flows with real data · screenshots eyeballed / parity-shot against mockups · report warnings
triaged (each one either explained or fixed) · artifacts path + verdict recorded in the
`EXECUTION.md` worklog entry (and the Task card's Evidence when applicable).

## On failure

Fix the defect, re-run the FULL gate from step 1 (never resume mid-loop), repeat until clean.
Findings discovered here that are out of the slice's scope become GitHub issues / Task cards -
they are recorded, never silently dropped.

## Per-slice extension duty

Every slice that adds or changes a user-facing surface MUST ship (or extend) a
`*-drive.local.mjs` script exercising its REAL flows (create/edit/move through the actual UI),
following the patterns in `e2e-drive.local.mjs` and `acceptance-drive.local.mjs` - real login
only (copy the harness's `realLogin`, not the minted-cookie pattern in the older scripts).
