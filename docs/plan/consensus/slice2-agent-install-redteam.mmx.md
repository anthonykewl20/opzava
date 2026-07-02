# Slice 2 agent-install red-team (mmx MiniMax-M3) + adjudication

Adversarial review of the applied `ask-admin-opzava` agent config on the live platform Gateway
(OpenClaw 2026.6.11). Paired review: `slice2e-agent-config-review.codex.md` (grounded in vendored
docs + the live config schema). **Adjudicated verdict: SOUND-WITH-FIXES — fixes applied 2026-07-03.**

## Adjudication summary (Claude, grounded against docs/schema + live gateway)

mmx raised 31 findings. Cross-checked against `docs/openclaw/gateway/config-tools.md`, the live
`config schema` dump, and `concepts/agent-runtimes.md`:

**REFUTED (fabricated/mismatched internals — kept here as a caution about ungrounded LLM review):**
- Findings 1-9 ("minimal profile implicitly grants web/messaging/memory/cron/sessions tools"):
  FALSE. `config-tools.md` defines `minimal` = `session_status` ONLY; `tools.allow` is an absolute
  allowlist (additive extension is a separate `alsoAllow` key). The deny list is redundant
  defense-in-depth, not a leaky filter.
- "on_session_start" contextInjection value: does not exist. Real enum: `always |
  continuation-skip | never` (live schema).
- `maxTurns`, `maxParallelToolCalls`, `dailyBudgetUSD` agent keys, `ToolPolicy.fuzzyMatch`,
  `PolicyGuard.eval`, legacy `ToolRegistry.dispatch`, cited 2025.x CVEs: none exist in the schema
  or vendored docs. Unverifiable internals asserted as fact.

**ACCEPTED (evidence-backed, actioned):**
1. `contextInjection: always` re-injects bootstrap every turn — needless subscription-quota burn
   and enlarged injection surface. FIXED: switched to `continuation-skip` (real enum), applied live
   and in the provisioning source.
2. Unregistered `opzava_tasks_*` allow entries -> possibly empty effective toolset / unverified
   unknown-name handling. MITIGATED: broker already fail-closes on `tools.effective` drift
   (red-team #4b); empirical probe is part of the real-agent acceptance run; MCP projection lands
   in Slice 2.5.
3. OAuth profile colocated with the gateway the broker reaches: real posture note. RECORDED:
   agent has no fs/web/runtime tools (allowlist-only, empty base profile) so no in-band exfil
   path; broker token lacks `talk.secrets`; separation to a dedicated account/gateway is the Q16
   tripwire (pre-external-users). Documented in the platform-gateway runbook.
4. `default: true` catch-all on a single-agent gateway: MINOR accepted (single agent IS the only
   routing target; revisit at multi-agent P1).

## Raw mmx findings

Preserved verbatim in the session transcript (2026-07-03); summarized above. Key structural
lesson recorded for the method: mmx red-teams MUST be adjudicated against the vendored docs +
live schema before any finding is actioned — several findings cited plausible but nonexistent
config keys and internal code paths.
