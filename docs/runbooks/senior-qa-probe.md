# PROBE - exploratory black-box QA

Use PROBE for bounded exploratory QA after or alongside implementation. It files findings and never changes the gate verdict. The probe harness is a thin helper module, not a hard-coded test plan; the host or Codex drives it at runtime from one objective and a bounded surface set.

```bash
node tests/e2e/probes/senior-qa-probe.mjs --help          # from repo root
node tests/e2e/probes/senior-qa-probe.mjs --selftest /tasks
```

`--selftest [surface]` dogfoods the primitives: preflight, real form login, DOM recon, screenshot, log slice, one demo finding; exits 0 when the stack and helpers work.

## Exported helpers (ESM)

`preflight`, `realLogin`, `reconDom`, `logSlice`, `screenshot`, `writeFinding`, `setupArtifacts`, `writeReport`, `CONFIG`, `SEVERITY`.

## Probe rule

Do not test everything at once. Each run takes one clear high-level objective plus a bounded surface set (the operator supplies both). The script must NOT own fixed payload variants, fixed persona loops, fixed selector generation, or fixed action sequencing - those belong to the driver's runtime QA judgment.

## Minimum driver loop

1. Run `preflight()`; stop on exit 2 or throw.
2. Create a Playwright browser context and call `realLogin(context)`.
3. Navigate to a bounded surface; call `reconDom(page)` after it settles.
4. Choose actions, payloads, persona framing, and sequencing from the objective plus the live DOM inventory.
5. Gather evidence: `screenshot(page, name)`, driver-collected response slices, `logSlice(sinceIso, patterns)`.
6. Call `writeFinding(finding)` for every verified issue (schema: [senior-qa-findings.md](senior-qa-findings.md)).

## The three lenses

**A - Functional adversarial.** Choose probes that fit the objective and live surface: sad paths, empty/oversized/unicode/injection-shaped/malformed inputs, boundary values, double-submit, back-button, concurrent edits, replay-safe writes, authorization boundaries, tenant-drift rejection, two-token boundaries. Do not bake these into the harness as a fixed sequence.

**B - Usability / task scenario.** Give a high-level goal, not click steps ("subscribe to the premium plan", not "click subscribe then tier 2"). Find the path like a real user, derive actions from the live DOM, emit a think-aloud transcript. Score task success, steps, time-on-task, wrong turns, dead ends. Keep usability findings distinct from functional bugs, with severity. Multiple persona passes are runtime judgment, not harness code.

**C - Log / output signature.** For each action window, assert the expected log or emitted-output signature, not just the absence of `fatal|panic`. A 200 with the wrong output or log signature is a finding. Use `logSlice(sinceIso, patterns)` and report matched vs unmatched patterns. Correlate action, log slice, expected output, and actual output in the finding.

## CONFIG (backend-agnostic; read when changing project defaults or adapting to a non-docker backend)

The methodology is backend agnostic; only `CONFIG` changes per project. Opzava values are defaults, not assumptions.

- `SENIORQA_BASE_URL` -> `http://web.opzava.localhost:18088`
- `SENIORQA_LOGIN_PATH` -> `/login`
- `SENIORQA_LOGIN_EMAIL` -> `owner@opzava.localhost`
- `SENIORQA_LOGIN_PASSWORD` -> `OpzavaLocalDev!2026`
- `SENIORQA_HEALTH_CMD` -> `docker compose ps -a --format json`
- `SENIORQA_LOG_CMD` -> `docker compose logs --since {sinceIso} --no-color`
- `SENIORQA_ARTIFACT_DIR` -> `real-validate-artifacts/senior-qa-probe-<timestamp>`
- `SENIORQA_ALLOW_EXITED` -> `minio-bucket-init` (one-shot compose services)

For non-docker / non-Opzava backends, import `CONFIG` and replace `healthCheck`, `logFetcher`, login selectors, credentials, or command strings. Recon, findings, severity, artifact, and log-signature logic stay the same.
