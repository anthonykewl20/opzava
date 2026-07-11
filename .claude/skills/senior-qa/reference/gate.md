# GATE - deterministic Done validation

The GATE is the only Done gate. Keep the entrypoint stable and behavior-identical.

```bash
node real-world-validate.local.mjs [outDir]   # from repo root
# artifacts -> real-validate-artifacts/<timestamp>/
```

## Deterministic semantics (must not change)

- all compose services healthy before validation begins
- real login through the login form
- route sweep discovered from live nav plus seed routes
- per-route checks: console errors, page exceptions, HTTP 5xx, same-origin 404, auth bounce, visible error state, empty page
- a real write round-trip through the UI, persisted back to the UI
- `docker compose logs` as ground truth, including a connection-failure retry-storm check
- loop until two consecutive clean passes
- exit code is the verdict

## Exact procedure (from repo root)

```bash
# 1. Bring up the REAL stack
docker compose up -d --build

# 2. Run the gate (loops sweeps until 2 consecutive clean passes)
node real-world-validate.local.mjs            # artifacts -> real-validate-artifacts/<timestamp>/

# 3. Slice-specific real flows (every UI slice ships or extends one - see below)
node <slice>-drive.local.mjs <outDir>          # existing example: connections-drive.local.mjs

# 4. Eyeball the full-page screenshots for every screen the slice touched, against its mockup
```

## Coverage contract (see `real-world-validate.local.mjs`)

- **Preflight:** all compose services running (one-shot init containers may be exited 0).
- **Route sweep:** routes are discovered from the live nav (plus seeds), so new screens are swept automatically and gaps cannot hide.
- **Per route:** console errors, page exceptions, HTTP 5xx anywhere, same-origin 404s, visible error states (`[role="alert"]`), auth bounces, and empty-`<main>` dead pages - all findings.
- **Write round-trip:** creates a real task through the UI each pass and proves it persists across reload (UI -> server -> Postgres -> UI).
- **Log ground truth:** `docker compose logs` for the pass window; `unhandled|fatal|panic` block the pass, other error-ish lines land in the report as warnings to audit.
- **Connection-failure retry-storm:** connection-establishment failures (operator WS / device pairing, e.g. `closed before connect`) are counted per pass; a storm (>= `REAL_STORM_THRESHOLD`, default 5) BLOCKS the pass, a few transient blips only warn. Storm lines carry no `error|fatal` token, so a plain log filter misses them entirely - this dedicated check exists because a worker->gateway retry-storm can otherwise green a page-healthy sweep.

## Pass criteria for Done

ALL of: harness verdict DONE-ELIGIBLE (exit 0) - slice-specific drive proves the slice's own flows with real data - screenshots eyeballed against mockups - report warnings triaged (each explained or fixed) - artifacts path + verdict recorded in the `EXECUTION.md` worklog (and the Task card's Evidence when applicable).

## On failure

Fix the defect, re-run the FULL gate from step 1 (never resume mid-loop), repeat until clean. Out-of-scope findings become GitHub issues / Task cards - recorded, never silently dropped.

## Per-slice extension duty

Every slice that adds or changes a user-facing surface MUST ship (or extend) a `<slice>-drive.local.mjs` that exercises its REAL flows (create/edit/move through the actual UI) with real login only. Use `connections-drive.local.mjs` as the working example. Reuse `realLogin` (import it from `senior-qa-probe.local.mjs`); never the minted-cookie pattern.
