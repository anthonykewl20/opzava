# Slice 2e — ask-admin-opzava (LIVE OpenClaw) — Independent Adversarial Review

## Evidence anchors used
- `docs/openclaw/gateway/config-tools.md`
- `docs/openclaw/gateway/sandbox-vs-tool-policy-vs-elevated.md`
- `docs/openclaw/gateway/config-agents.md`
- `docs/openclaw/concepts/agent-runtimes.md`
- `docs/openclaw/concepts/models.md`
- `/tmp/claude-1000/-home-anthony-devtony-opzava/b2d57111-96d7-4ba3-a1ac-fe8d79281c5f/scratchpad/openclaw-schema.json`

## Applied config being reviewed
`agents.list[ask-admin-opzava]`: `default:true, model:'openai/gpt-5.5', contextInjection:'always', bootstrapMaxChars:20000, tools:{profile:'minimal', allow:['opzava_tasks_list','opzava_tasks_create','opzava_tasks_update'], deny:['group:runtime','write','edit','apply_patch','group:fs']}, isolated workspace+agentDir, skills:[]`.

## a) Does `tools.profile:'minimal'` implicitly include web/messaging/memory/sessions_spawn/cron?
- **Verdict:** **No. Reject (as stated in docs).**
- **Evidence:** `config-tools.md` defines the `minimal` profile as a narrow allow set and explicitly enumerates `session_status` as its canonical tool; it does not add `web`, `messaging`, `memory`, `sessions_spawn`, or `cron` families. `agent-runtimes.md` does not contradict tool-profile expansion.
- **Risk level:** NONE.

## b) deny-list completeness with allow+deny set on this version
- **Verdict:** **DENY still applies; allowlist semantics are effectively explicit, and profile baseline is not an additive source once allow is set.**
- **Evidence:**
  - `config-tools.md`: `tools.allow` is described as explicit allow-listing (absolute list), while `tools.alsoAllow` exists when additive extension is needed.
  - Same source + `sandbox-vs-tool-policy-vs-elevated.md`: a non-empty allowlist narrows tool surface to specified items; `deny` entries override anything allowed.
- **Implication for this config:** `deny:[group:runtime, write, edit, apply_patch, group:fs]` is largely redundant if `allow` is treated as allowlist-only. It does not recover any tool families beyond what `allow` explicitly grants.
- **Risk level:** MAJOR only if this `allow` list resolves to empty at runtime (because tools are not yet registered on gateway).

## c) Do allow-listed names with no registered handler do fuzzy-match / substring / fall-through?
- **Verdict:** **UNVERIFIED — must probe.**
- **Evidence:** `config-tools.md` and schema describe string names (case-insensitive/wildcard patterns are documented as accepted mechanics), but do **not** document fuzzy or substring matching behavior, and do not state what happens when an allowed identifier is absent from the tool registry.
- **Unverified probe command:**
  - `curl -sS -X GET "$OPENCLAW_GATEWAY_URL/admin/agents/ask-admin-opzava/tools/effective" -H "Authorization: Bearer $OPENCLAW_ADMIN_TOKEN" -H "Content-Type: application/json"`
- **Risk level:** MAJOR if gateway resolves missing names to a permissive fallback.

## d) `default:true` risk on a single-agent gateway
- **Verdict:** **SOUND in current scope, with expected blast-radius tradeoff.**
- **Evidence:** `config-agents.md` ties `default` to routing fallback semantics (“this agent is used when no explicit route/path matches”). On a single live agent, this effectively makes `ask-admin-opzava` the catch-all.
- **Risk level:** MINOR (operational routing control risk, not a direct policy bypass by itself).

## e) `contextInjection:'always'` with 20k bootstrap chars and `on_session_start` enum
- **Verdict:** **`on_session_start` is not in schema; enum is `always | continuation-skip | never`.**
- **Evidence:** schema (`.../openclaw-schema.json`) and `config-agents.md` both define `contextInjection` enum exactly as `always`, `continuation-skip`, `never`.
- **Implication:** The claim “on_session_start-like behavior” is not configurably distinct from `always`/`continuation-skip` by current schema.
- **Risk level:** MINOR; injection volume and prompt-control exposure are larger with `always`, but this is an explicit, documented enum state.

## f) Per-agent caps: actual keys vs requested/guessed keys
- **Verdict:** **Most requested mmx keys are not schema-valid for agent item.**
- **Schema-grounded present keys (agent item):** `id`, `name`, `default`, `description`, `identity`, `skills`, `contextLimits`, `contextTokens`, `bootstrapMaxChars`, `bootstrapTotalMaxChars`, `bootstrapPromptTruncationWarning`, `model`, `models`, `params`, `runRetries`, `heartbeat`, `sandbox`, `runtime`, `tools`, `workspace`, `agentDir` and related routing/control fields.
- **Schema-absent from agent item:** `maxTurns`, `maxParallelToolCalls`, `budgets`, and other ad-hoc budget fields mentioned by the findings set.
- **Evidence:** schema introspection of `/tmp/.../openclaw-schema.json` keys for `agents.properties.list.items` and nested key presence; additional search confirms `maxParallelToolCalls` is only present under web/code tools, not agent-level.
- **Risk level:** MAJOR only as a mismatch risk if mmx expectations were interpreted as live controls for this agent stanza.

## g) Codex embedded runtime vs gateway policy (tool-policy-first)
- **Verdict:** **Tool-policy controls gateway invocation; business/tenant enforcement remains outside gateway as described.**
- **Evidence:**
  - `agent-runtimes.md`: OpenAI model/tool calls for this stack are on the app-server (Codex) runtime path unless using alternate explicit runtimes.
  - `openai.md` + `concepts/models.md`: model routing is provider-runtime scoped and independent from tool-policy syntax.
  - `gateway/sandbox-vs-tool-policy-vs-elevated.md`: tool policy is an execution gate, not authorization replacement.
- **Risk level:** MINOR (supports user assertion that SOUL/AGENTS cross-tenant checks live at app-side AuthorizationPort + PG RLS).

## h) OAuth subscription profile colocation with broker/device token and docs guidance on blast radius
- **Verdict:** **UNVERIFIED — must probe.**
- **Evidence:** `openai.md` and `concepts/models.md` define provider auth order (`auth.order.openai`) and fallback semantics, but do not define blast-radius separation recommendations between subscription OAuth and broker tokens.
- **Unverified probe command:**
  - `rg -n "auth\.order\.openai|broker|device|OAuth|api[_-]?key|token" /tmp/claude-1000/-home-anthony-devtony-opzava/b2d57111-96d7-4ba3-a1ac-fe8d79281c5f/scratchpad/openclaw-schema.json /home/anthony/devtony/opzava/docs/openclaw -g'*.md' -g'*.json'`
- **Risk level:** MAJOR only if deployment co-locates tokens without secret partitioning at infra/security boundary (not evidenced in docs/schema).

## Issue ranking (evidence-backed)
- **Blocker:** none.
- **Major:**
  - b/c interaction can yield an effectively empty gateway toolset if allow list is strict and names are unregistered (`opzava_tasks_*` are intentionally not registered yet).
  - f: several “safety cap” knobs referenced by mmx are absent from schema at this level.
  - h: token-separation blast-radius claim cannot be validated from sources.
- **Minor:**
  - a: no hidden inclusion of web/messaging/memory/sessions tools under `minimal`.
  - d: catch-all routing from `default:true` on single-agent gateway.
  - e: `always` expands bootstrap context consistently with schema; no `on_session_start` option exists.

## Final adjudication
**SOUND-WITH-FIXES**

### Minimal fix set actually justified by evidence
1. **Gate and test effective tool surface explicitly before next slice**: temporarily remove `tools.allow` (or keep it to truly registered gateway tools) until MCP projection is live, because with an unregistered-only allowlist this agent can become functionally tool-empty.
2. **Reduce bootstrap injection blast radius if quota/injection is a concern**: switch `contextInjection` from `always` to `continuation-skip` when no startup-restore use case requires current behavior.
3. **Do not assume token-separation behavior exists from current docs**: add an explicit security-runbook/security controls decision outside OpenClaw tool-policy for OAuth/broker secret partitioning; no schema/docs proof currently available.
