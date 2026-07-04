# Rung-3 patch ledger (ADR-016 customization ladder)

Every change to Mainframe lands on the LOWEST rung that can express it:

- **Rung 0** — config (gateway config, env, flags). No source change.
- **Rung 1** — official extension points (extensions/skills/hooks).
- **Rung 2** — first-party additive modules in our namespace (`extensions/opzava-*`); upstream files untouched.
- **Rung 3** — source patches to UPSTREAM files. Each one MUST be logged here and is re-reviewed at every
  upstream bump (`UPSTREAM.md`). Expected near-empty. Opzava product features are NEVER rung-3 patches —
  they live in the Opzava app and use the gateway via the broker.

| # | Files touched | What / why | Upstream status |
| --- | --- | --- | --- |
| — | (none yet) | | |
