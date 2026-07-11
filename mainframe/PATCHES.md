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
| 1 | `Dockerfile` | Optional `OPZAVA_CLAUDE_CODE_VERSION` build arg installs a pinned `@anthropic-ai/claude-code` in the runtime stage, so Anthropic setup-token / claude-cli auth flows can run inside the gateway container (in-browser Claude Max connect). Default empty = upstream-identical image. | Local only; candidate to upstream as a generic extra-globals build arg. |
