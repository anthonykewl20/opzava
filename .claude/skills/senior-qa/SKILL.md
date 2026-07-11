---
name: senior-qa
description: Use before marking any Opzava slice, issue, or PR Done, and whenever an agent needs bounded black-box QA - functional-adversarial checks, NNG-style usability task scenarios, or action-to-log/output signature analysis. MANDATORY two-mode QA against the REAL local docker stack (web.opzava.localhost:18088) with real login, real seeded data, and real screenshots: a deterministic GATE (the only Done gate) and an exploratory PROBE. No mocks, no fixtures, no minted sessions.
---

# SeniorQA

Two modes, one principle: **only the real composed stack can green a slice.**

- **GATE** - deterministic final validation; the only Done gate. See [reference/gate.md](reference/gate.md).
- **PROBE** - exploratory black-box QA; files findings, never flakes the gate. See [reference/probe.md](reference/probe.md).

Target the real Opzava stack at `http://web.opzava.localhost:18088`. TDD, mocks, fixtures, and synthetic sessions can support development, but they never green a slice.

## Hard rules (invariants, not judgment calls)

1. **Real stack.** The gate runs against the full `docker-compose.yml` (`docker compose up -d --build`). Any missing or unhealthy service FAILS the gate (exit 2). Fix the stack; never shrink it.
2. **Real login.** Log in through the form with the `owner@opzava.localhost` dev credentials. Minting `auth_sessions` rows or injecting `opzava.session_token` cookies is BANNED (the harness ignores `PARITY_COOKIE` by design). Broken login = broken slice.
3. **Real data.** Only what the seeded org and the slice's real flows created. No DB-injected fixtures, no mocked gateway/broker/API responses.
4. **Visual evidence.** Full-page screenshots per route per pass, eyeballed against the mockup before claiming Done.
5. **Convergence.** The harness loops full sweeps until 2 consecutive clean passes (max 5, then hard NOT-DONE). One lucky pass proves nothing.
6. **Exit code is the verdict.** `0` = DONE-eligible; anything else = NOT Done. No narrative overrides a non-zero exit. Never pipe the command without `set -o pipefail` - a pipe returns the last stage's exit code and silently turns NOT-DONE into a false green. Run it bare; read the tail from the artifacts dir.

## Entry points

Run every command **from the repo root** (the script paths are repo-root relative and shell out to `docker compose`):

```bash
node real-world-validate.local.mjs [outDir]   # GATE  - see reference/gate.md
node senior-qa-probe.local.mjs --help          # PROBE - see reference/probe.md
```

## Reference (load when needed)

- [reference/gate.md](reference/gate.md) - gate procedure, coverage contract, pass criteria, per-slice duty.
- [reference/probe.md](reference/probe.md) - probe helpers, driver loop, the three lenses, `CONFIG`. Read when running or adapting PROBE.
- [reference/findings.md](reference/findings.md) - the exact findings schema and routing. Read before writing findings.
- [reference/evals.md](reference/evals.md) - how to eval this skill; test cases in [evals/evals.json](evals/evals.json).
