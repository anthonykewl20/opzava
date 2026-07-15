# wf212 — Ask Admin v1 tool inventory + tool-policy diff

**Ticket:** [#212 Inventory OpenClaw tools and cut the Ask Admin v1 shortlist](https://github.com/anthonykewl20/opzava/issues/212) · map [#210](https://github.com/anthonykewl20/opzava/issues/210).
**Status:** frozen planning evidence. Produces the v1 tool shortlist + a concrete tool-policy diff proposal; **applies nothing**. Consumed by [#219](https://github.com/anthonykewl20/opzava/issues/219) (skills — hard dependency), [#216](https://github.com/anthonykewl20/opzava/issues/216) (delegation), and [#220](https://github.com/anthonykewl20/opzava/issues/220) (v1 spec assembly).
**Method:** dual-model per the map directive — a Claude background scout + a Codex `gpt-5.6-sol` (high, read-only) scout, run independently, then a Codex `gpt-5.6-sol` consensus review of this memo. Both scouts **corrected** the host's first-draft mechanic (see below); every load-bearing claim was re-verified against fork source by the host.

---

## TL;DR — the decision

1. **The additive key is `alsoAllow`, not `allow` — this was the dual-model correction.** The policy pipeline is a sequential AND-filter where the **profile runs first** and a non-empty `allow` is *keep-only*, applied at a **later** stage. So a tool absent from the active profile — **core (`read`, `memory_*`, `web_*`) *or* plugin/MCP (`opzava_tasks_*`)** — is filtered out at the profile stage and **cannot be re-admitted by `tools.allow`**. The only additive mechanisms are (a) **widen the profile** (`minimal → coding`) and/or (b) **`tools.alsoAllow`**, which is merged into the profile-stage policy *before* filtering. Plugin/MCP tools are **not** exempt (the host's first draft was wrong here; both scouts independently refuted it and the fork's own `bundle-mcp`-in-`coding`-only design + `tools-effective-inventory` notice prove it).

2. **The current `minimal` + `allow:[opzava_tasks_*]` config is already a broken (empty) intersection.** By the mechanic, the profile drops the product tools *and* the non-empty agent `allow` drops even `session_status` (it isn't in `[opzava_tasks_*]`), so the effective set is **empty regardless of projection** — the slice2e review's "functionally tool-empty." It has not caused visible failure only because `opzava_tasks_*` aren't yet exercised as model-visible tools (they're the execution layer only; slice2e: "intentionally not registered yet"). Projection does not *cause* the emptiness — the keep-only intersection does. v1 **must** replace this whole block.

3. **v1 core shortlist (12):** `read`, `web_search`, `web_fetch`, `memory_search`, `memory_get`, `session_status`, and the delegation set `sessions_spawn`, `sessions_yield`, `subagents`, `sessions_list`, `sessions_history`, `sessions_send`. All but `session_status` are `coding`-profile tools absent from `minimal` → the profile must be `coding`.

4. **The card tools the skills need mostly do not exist on the agent surface.** The agent sees only 3 task tools (`opzava_tasks_{list,create,update}`, the execution layer in `runtime-control`); the richer surface (`opzava_tasks_get`, `opzava_tasks_comments_add`, `opzava_tasks_steps_*`, …) lives only in the standalone `apps/mcp-server` under a **different auth principal** and **must be ported onto the runtime-control agent surface**. "GitHub issue/PR state" and "connections/health" read tools are **net-new**. This is the binding constraint the wf221 consensus flagged (§B6), now enumerated.

5. **The hard gate cannot be enforced by tool policy.** Tool policy is per-tool, not per-argument; `opzava_tasks_update` *and* `opzava_tasks_create` accept `status:"done"`. "Autonomous never Done/approve-merge" must be enforced **server-side, argument- and principal-aware** in `runtime-control`/`project-management`, wired through the existing `operator.approvals` scope, and audited. Answers #219 Q3: yes.

6. **`coding` admits `bundle-mcp` (ALL configured MCP-server tools), so the surface must be pinned by an exact `allow`, not deny-only.** A deny-only shape under `coding` would leak unrelated bundled MCP tools; the enforceable control is an **exact narrowing `allow`** = the full intended surface (every IN core tool + the product tools under their *projected* model-facing names), or isolating the Opzava tools on a dedicated allowlisted server. The projection mechanism — bundle-mcp (→ prefixed `<server>__opzava_tasks_*` names) vs native/core (→ bare names) — must be **pinned at #220**. This is a real ADR-005 deny-surface widening; prove it with a live `tools.effective` probe (the probe *verifies*; the exact allow is what *enforces*).

---

## Part A — The tool-policy mechanic (why the diff has this shape)

### A1. Profiles, groups, and the per-layer matcher

- Built-in profiles and each tool's profile membership are in `mainframe/src/agents/tool-catalog.ts` (`CORE_TOOL_DEFINITIONS` `.profiles`; `CORE_TOOL_PROFILES` `:363-376`), cross-checked against `docs/openclaw/gateway/config-tools.md:23-28`.
  - `minimal` → `{ allow: ["session_status"] }` **only** (`tool-catalog.ts:200-206,364-366`).
  - `coding` → every `profiles:["coding"]` tool **plus `bundle-mcp`** (`tool-catalog.ts:367-369`).
  - `messaging` → its session/message set **plus `bundle-mcp`**; `full` → `{ allow: ["*"] }`.
- Single-layer matcher `isToolAllowedByPolicyName` (`tool-policy-match.ts:9-44`): **deny wins**; empty `allow` → allow all non-denied; non-empty `allow` → **keep-only** (must match, exact glob for non-wildcard names — `glob-pattern.ts:25-26,51-52`).

### A2. The pipeline is an AND across ordered layers, profile FIRST

- `applyToolPolicyPipeline` (`tool-policy-pipeline.ts:127-215`) starts from the full tool list and, per layer, does `filtered = filterToolsByPolicy(before, expanded)` (`:204-205`; `filterToolsByPolicy` `agent-tools.policy.ts:141-146`). Layer order (`buildDefaultToolPolicyPipelineSteps :69-123`): **`tools.profile` → provider profile → `tools.allow` → agent `tools.allow` → group → sender**. Effect = intersection; a later layer can only remove, never re-add.
- **`alsoAllow` is the escape hatch, and it works by merging into the profile stage *before* the filter.** `resolveEffectiveToolPolicy` resolves `profileAlsoAllow` and the code comments it: "alsoAllow is applied at the profile stage to avoid early filtering" (`agent-tools.policy.ts:315-317,393-394,429-441`). The merge is literal union: `mergeAlsoAllowPolicy → { ...policy, allow: uniqueStrings([...policy.allow, ...alsoAllow]) }` (`tool-policy.ts`), applied as `profilePolicyWithAlsoAllow` in the embedded runner (`embedded-agent-runner/effective-tool-policy.ts:70,87`) and the gateway (`gateway/tool-resolution.ts:90-93`). Config type: `alsoAllow` = "Additional allowlist entries merged into allow and/or profile allowlist" (`config/types.tools.ts:398-404`).

### A3. The three consequences that build the diff

1. **A tool absent from the profile cannot be re-admitted by `tools.allow`** — it is filtered at the first (profile) layer; a later `allow` is keep-only and only narrows the survivors. The fork ships this exact rule as a user-facing notice for the core case: a profile-filtered `browser` "cannot be added back after profile filtering" via `tools.allow`; use `tools.alsoAllow` or change the profile (`tools-effective-inventory.ts:83-90`; asserted in `tools-effective-inventory.test.ts:906-930`).
2. **Plugin/MCP tools are NOT exempt from the profile filter.** Decisive evidence, three ways: (a) the pipeline applies the profile policy to the *whole* current tool array — `analyzeAllowlistByToolType` classifies plugin entries but returns the policy unchanged (`tool-policy.ts:243-292`); (b) `coding`/`messaging` explicitly append `bundle-mcp` to their allow set while `minimal` does not (`tool-catalog.ts:367-372`) — pointless unless MCP tools are subject to the profile allowlist; (c) the "preserves plugin-only allowlists" test only shows a plugin survives when the *single active allow layer names it*, not when an earlier profile layer already dropped it (`tool-policy-pipeline.test.ts:61-77`). **Correction to the host's first draft:** there is no "plugin tools ride through core allowlists" exemption. The additive path for `opzava_tasks_*` is `alsoAllow` (or the `coding` profile's `bundle-mcp`, once their projection is decided).
3. **`coding` is the only usable base profile.** `messaging` lacks `read`/`memory`/`web`; `full` is unrestricted. Only `coding` carries the read/memory/web core tools v1 needs → **`profile: coding` + `alsoAllow` (product tools) + surgical `deny`** is the shape (not a stylistic choice).

### A4. The current config is already an empty intersection (not a "works-until-projection" trap)

Trace it: `minimal` → profile-stage keep-only `{allow:[session_status]}`, then the agent layer keep-only `{allow:[opzava_tasks_list,create,update]}`. The profile drops the product tools (they are not `session_status`); the agent `allow` then drops `session_status` (it is not one of the three). **The intersection is empty right now**, independent of whether `opzava_tasks_*` are projected (`ask-admin-agent.ts:43-47,273-276`; `tool-catalog.ts:200-206,364-366`; matcher `tool-policy-match.ts:18-35`). Projection does not *cause* the emptiness — the keep-only intersection does.

`opzava_tasks_*` are the **execution layer only** — defined in `packages/runtime-control` and named in the ask-admin allow list, but **not yet projected as model-visible OpenClaw tools** (grep of `mainframe/src`/`apps/gateway-broker` outside the fake gateway returns nothing; the fake gateway hard-codes them into `tools.effective`, `apps/gateway-broker/src/acl/openclaw/fake-gateway.ts:210-224`). The slice2e agent-config consensus flags the same brokenness — "`opzava_tasks_*` are intentionally not registered yet"; the strict allowlist "can become functionally tool-empty," recommending it be emptied or limited to truly-registered tools until projection is live (`docs/plan/consensus/slice2e-agent-config-review.codex.md:67-70,78-83`). The config has simply not caused visible failure because these tools aren't yet exercised as model-visible. **So the #212 diff is not a tweak of a working config — it replaces an already-broken block and must land together with the projection of these tools.**

---

## Part B — The two tool surfaces

| Surface | File | Tools | Auth principal / consumer |
|---|---|---|---|
| **OpenClaw core catalog** | `mainframe/src/agents/tool-catalog.ts` | 37 built-ins (§C) | governed by `tools.profile`/`alsoAllow`/`allow`/`deny` |
| **Opzava agent-facing product tools** (runtime-control) | `packages/runtime-control/src/application/task-tools.ts:30-58` | **3**: `opzava_tasks_{list,create,update}` | session principal (`ToolExecutionContext`); Ask Admin via broker ACL → runtime-control |
| **Opzava standalone MCP server** (NOT the agent surface) | `apps/mcp-server/src/tools.ts:27-39` | **12** (2 read + 10 write): adds `opzava_tasks_get`, `opzava_tasks_comments_add`, `opzava_tasks_steps_{create,toggle,reorder}`, `opzava_tasks_quality_checks_add`, `opzava_tasks_due_set`, `opzava_tasks_watchers_set`, `opzava_tasks_comments_mark_read` beyond the 3 | **`LinkTokenPrincipal`** (`viaClient:"claude-code"`) — a different auth path, for external MCP clients |

Porting the richer tools onto the agent surface must **re-home execution under the session-principal runtime-control path and consolidate to one agent-facing registry**, not duplicate two surfaces with two auth models.

---

## Part C — Full core-tool inventory (37 rows)

Profiles column uses **source** (`tool-catalog.ts`), authoritative over the docs summary. "DENY" = must be explicitly denied because `coding` would otherwise grant it. "IN(deleg)" = delegation set, wiring per §E3.

| # | tool | section | profiles (source) | verdict | job / reason |
|---|---|---|---|---|---|
| 1 | `read` | fs | coding | **IN** | Skills demand-load `SKILL.md` via `read` (wf221 §A1). Confine with `fs.workspaceOnly`. Softest IN — drop if skills prove fully context-injected. |
| 2 | `write` | fs | coding | **DENY** | File mutation; SOUL boundary (`ask-admin-agent.ts:174-176`). |
| 3 | `edit` | fs | coding | **DENY** | File mutation. |
| 4 | `apply_patch` | fs | coding | **DENY** | File mutation (deny separately from `write`, `config-tools.md:120`). |
| 5 | `exec` | runtime | coding | **DENY** | Shell exec; hard-forbidden. |
| 6 | `process` | runtime | coding | **DENY** | Process control; runtime. |
| 7 | `code_execution` | runtime | coding | **DENY** | Remote sandbox code; not a v1 job. |
| 8 | `web_search` | web | coding | **IN** | Job 5 (outside facts). |
| 9 | `web_fetch` | web | coding | **IN** | Job 5 (fetch a found URL). |
| 10 | `x_search` | web | coding | **DENY** | X/social search out of platform-ops scope. |
| 11 | `memory_search` | memory | coding | **IN** | Job 4 (recall own memory) [#217]. Read-only. |
| 12 | `memory_get` | memory | coding | **IN** | Job 4 (read a memory file) [#217]. Read-only. |
| 13 | `sessions_list` | sessions | coding,messaging | **IN(deleg)** | See spawned subagent sessions. |
| 14 | `sessions_history` | sessions | coding,messaging | **IN(deleg)** | Read a subagent's result. |
| 15 | `sessions_send` | sessions | coding,messaging | **IN(deleg)** | Steer/coordinate visible spawned sessions. Both scouts favour IN; bounded by `visibility:"tree"` + subagent deny-always. #216 confirms. |
| 16 | `sessions_spawn` | sessions | coding | **IN(deleg)** | Spawn subagents (Q17 dispatch). |
| 17 | `sessions_yield` | sessions | coding | **IN(deleg)** | Yield to receive subagent results (push, not poll). |
| 18 | `subagents` | sessions | coding | **IN(deleg)** | Manage subagents. |
| 19 | `session_status` | sessions | minimal,coding,messaging | **IN** | Current-run status; the only `minimal` tool. |
| 20 | `browser` | ui | — | **OUT** | Not in `coding`; heavy; governed-agent risk. Deny defensively. |
| 21 | `canvas` | ui | — | **OUT** | Not in `coding`; not a v1 job. |
| 22 | `message` | messaging | messaging | **OUT** | Replies ride the web-chat transport, not `message`; could DM arbitrary channels. Deny defensively. |
| 23 | `heartbeat_respond` | automation | — | **OUT** | Automation; not a v1 job. |
| 24 | `cron` | automation | coding | **DENY (v1)** | Autonomous scheduling → autonomy + hard-gate risk. **v2 candidate** (scheduled reports) behind a gate. |
| 25 | `gateway` | automation | — | **DENY** | Gateway admin; forbidden. Deny defensively. |
| 26 | `nodes` | nodes | — | **DENY** | Node/device mgmt; forbidden. Deny defensively. |
| 27 | `agents_list` | agents | — | **DENY** | Reveals platform agents; delegation uses configured `allowAgents`, not discovery. Deny defensively. |
| 28 | `get_goal` | agents | coding | **DENY (v1)** | Thread-goal machinery duplicates Dev Board state. |
| 29 | `create_goal` | agents | coding | **DENY (v1)** | As above. |
| 30 | `update_goal` | agents | coding | **DENY (v1)** | As above. |
| 31 | `update_plan` | agents | coding | **DENY (v1)** | Multi-step plan tool (experimental — needs `tools.experimental.planTool` or a strict-agentic GPT-5 run to even exist, `config-tools.md:431-449`). Safe **optional add** if PM/delegation wants visible plans; default OUT for a predictable minimal surface. Deny **individually**, never via `group:agents` (that would also foreclose re-enabling it). |
| 32 | `skill_workshop` | agents | coding | **DENY (hard)** | Agent self-authoring/altering its own skills. Governed agent must not (wf221 §A2/§A5). |
| 33 | `image` | media | coding | **DENY (v1)** | Image understanding needs pasted images; v1 UI has **no attachments** (#214) → no input. **Revisit when attachments land.** |
| 34 | `image_generate` | media | coding | **DENY** | Media generation; not a v1 job. |
| 35 | `music_generate` | media | coding | **DENY** | Not a v1 job (source-only; docs `coding` summary omits it — doc drift). |
| 36 | `video_generate` | media | coding | **DENY** | Not a v1 job. |
| 37 | `tts` | media | — | **OUT** | TTS; not a v1 job. Deny defensively. |

**Core IN (12):** `read`, `web_search`, `web_fetch`, `memory_search`, `memory_get`, `session_status`, `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `sessions_yield`, `subagents`. **All but `session_status` are absent from the `minimal` profile** (`sessions_list/history/send` are in `coding`+`messaging`, the rest `coding`-only) → **profile must be `coding`.**

**Doc/source drift (trust source):** `config-tools.md:26` under-lists the `coding` profile (source also includes `code_execution`, `x_search`, `sessions_yield`, `subagents`, `get_goal`, `create_goal`, `update_goal`, `update_plan`, `music_generate`), and `config-tools.md:43` under-lists `group:agents` (source `group:agents` = `agents_list, get_goal, create_goal, update_goal, update_plan, skill_workshop`, `tool-catalog.ts:378-393`). **Consequence: never `deny:["group:agents"]`** — it would also kill `update_plan`. Author denies from source group semantics.

---

## Part D — Opzava product-tool shortlist (the binding constraint)

Job 2 (full card lifecycle + GH-action parity) and the skills (`opzava-card-authoring`, `opzava-reporting`; wf221 §B6) need card tools that **mostly do not exist on the agent surface**.

| Opzava tool | v1? | status | job / need |
|---|---|---|---|
| `opzava_tasks_list` | IN | **EXISTS (agent)** | Q&A + card lifecycle read. |
| `opzava_tasks_create` | IN | **EXISTS (agent); HARDEN** | Create — **reject autonomous `status:done` server-side (§F).** |
| `opzava_tasks_update` | IN | **EXISTS (agent); HARDEN** | Update — **Done gate server-side (§F).** |
| `opzava_tasks_get` (detailed card read) | IN | **PORT** (mcp-server only) | Card-authoring needs full card detail; reporting. |
| `opzava_tasks_comments_add` | IN | **PORT; HARDEN attribution** | Card comment (wf221 §B6). Agent comments must not masquerade as human-authored. |
| `opzava_tasks_steps_create` / `_toggle` / `_reorder` | IN | **PORT** | Full card lifecycle (checklist/steps). |
| `opzava_tasks_quality_checks_add` | IN | **PORT; HARDEN provenance** | Review-lane quality checks. A quality-check `pass` is **not** approval — approval is a separate op that requires all checks to pass + a human approver (`packages/project-management/src/application/tasks.ts:2958-2974`); *that* approval/merge op carries the Done-style human-command gate (§F). The quality-check tool itself needs a **provenance gate**: the agent's checks must be labeled AI (`ai_precheck`), never forge `kind:"human"`/a human pass. |
| `opzava_tasks_due_set` | IN | **PORT** | Due dates. |
| `opzava_tasks_watchers_set` | IN | **PORT** | Watchers. |
| `opzava_tasks_comments_mark_read` | **OUT (v1)** | defer | Inbox hygiene only; not needed for the v1 jobs. Omitted from the v1 policy; add post-v1 if a use appears. |
| **GitHub issue/PR state read** | IN | **NET-NEW** | Platform Q&A + reporting + GH-action parity. **Gated on the Dev Board capture #215** (owns the GH-action surface) — do not design here. NB: the current GitHub adapter deliberately skips PRs (`packages/adapters/src/github/issues.ts:104-107`), so PR-state read is genuinely new work. |
| **connections / health read** | IN | **NET-NEW** | Platform Q&A + reporting. A server snapshot path exists (`apps/web/lib/connections.ts`) but no agent tool. |
| `opzava_crm_*` | **OUT** | — | CRM removed (map #200); only stale `dist/**` remains. Bin. |

**Delivery order for #220:** port the card tools + build the platform-read tools on `runtime-control` (session-principal, one registry) **before or with** the skills slice, else the skills are inert.

---

## Part E — The concrete tool-policy diff

Against `apps/workers/src/provisioning/ask-admin-agent.ts` (`ASK_ADMIN_TOOL_POLICY_ALLOW/DENY`, the agent `tools` block, `:29-53,86-90,261-281`).

### E1. Before

```jsonc
// agents.list[ask-admin-opzava].tools
{ profile: "minimal",
  allow: ["opzava_tasks_list","opzava_tasks_create","opzava_tasks_update"],
  deny:  ["group:runtime","write","edit","apply_patch","group:fs"] }   // group:fs also denies read
```

### E2. Pin the projection first — it fixes the model-facing names

`coding` grants a broad base that includes **`bundle-mcp`** (`tool-catalog.ts:363-369`), which expands to **every tool of every configured MCP server** (plugin-id expansion, `tool-policy.ts:130-180`; request-boundary test: a plain `coding` profile exposes all tools of a configured MCP server, `agent-bundle-mcp-tools.request-boundary.test.ts:98-115`). Two consequences:

1. **A deny-only shape leaks.** Under `coding`, unless the product tools are the *only* thing `bundle-mcp` carries, a deny-only policy admits unrelated bundled MCP tools too — the effective set is **not** policy-guaranteed to equal the shortlist. A live probe *detects* a leak but does not *prevent* it.
2. **Model-facing names are projection-dependent.** If the Opzava tools are projected as bundle-MCP tools they are model-named `<safe-server>__<tool>` (`agent-bundle-mcp-names.ts:51-74`, `buildSafeToolName`), so a raw `opzava_tasks_get` in an allowlist **will not select them**. If projected as native/core tools, they keep bare names.

**Therefore #220 must pin the projection mechanism** (bundle-mcp from a dedicated Opzava MCP server, vs a native plugin, vs core-catalog registration), because it decides both the enforceable control and the exact names. The recommended shape is an **exact narrowing `allow`** (below), which makes the surface enforceable by policy rather than probe-only.

### E3. After (proposed — land WITH tool projection; exact-allow enforced; gate on a live probe)

```jsonc
// agents.list[ask-admin-opzava].tools
{
  profile: "coding",              // was "minimal": the ONLY profile carrying read/memory/web core tools
  // EXACT keep-only allow = the FULL intended surface. Required (not optional) because coding's
  // bundle-mcp would otherwise leak all configured MCP tools. Must list EVERY intended tool; a
  // forgotten core name drops it. Product names below assume BARE projection; if projected via
  // bundle-mcp, replace each opzava_tasks_* with its "<server>__opzava_tasks_*" model-facing name.
  allow: [
    // core (12):
    "read", "web_search", "web_fetch", "memory_search", "memory_get", "session_status",
    "sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "sessions_yield", "subagents",
    // product card tools (built on runtime-control, §D):
    "opzava_tasks_list", "opzava_tasks_get", "opzava_tasks_create", "opzava_tasks_update",
    "opzava_tasks_comments_add", "opzava_tasks_steps_create", "opzava_tasks_steps_toggle",
    "opzava_tasks_steps_reorder", "opzava_tasks_quality_checks_add", "opzava_tasks_due_set", "opzava_tasks_watchers_set",
    // net-new platform reads (§D), once built:
    "opzava_github_state_read", "opzava_connections_health_read"
  ],
  // defense-in-depth on top of the keep-only allow (deny-wins; guards allow typos/wildcards + future drift):
  deny: [
    "write", "edit", "apply_patch",      // keep read → deny mutations individually, NOT group:fs
    "group:runtime",                     // exec, process, code_execution
    "x_search", "cron", "skill_workshop",
    "get_goal", "create_goal", "update_goal", "update_plan",   // individually, NOT group:agents
    "image", "image_generate", "music_generate", "video_generate",
    "gateway", "nodes", "browser", "canvas", "message", "heartbeat_respond", "tts", "agents_list"
  ],
  fs: { workspaceOnly: true }          // confine read/apply_patch to ASK_ADMIN_AGENT_WORKSPACE
}
```

```jsonc
// TOP-LEVEL gateway tools config (NOT inside agents.list[].tools — it is not an AgentToolsConfig field):
tools: { sessions: { visibility: "tree" } }   // orchestrator sees only its own spawned subtree; never "agent"/"all". Default is already "tree"; pin it.
```

**Key changes:** (1) `profile: minimal → coding`. (2) an **exact keep-only `allow`** enumerating the full surface — the required control against the `bundle-mcp` leak (the Codex scout's shape; the deny-only form the Claude scout preferred was refuted by the consensus review). (3) product-tool names are **projection-dependent** (bare vs `<server>__` prefixed) — pin per §E2. (4) deny drops wholesale `group:fs` (would kill `read`) for the explicit mutation tools, and stays individual to avoid `group:agents` (would kill the `update_plan` opt-in) — now defense-in-depth atop the exact allow. (5) `fs.workspaceOnly` + pinned top-level `sessions.visibility:"tree"`. `mode:"deny-wins"` unchanged. `alsoAllow` is unnecessary once the exact `allow` names every tool (both are profile-stage-safe here because the surface is fully enumerated), but if the product tools are projected such that they'd be filtered before the allow stage, add them to `alsoAllow` too.

### E4. The delegation wiring is BROKEN by the profile switch (flag to #216 / #220)

Today `buildAskAdminAgentEntry` **appends** `ASK_ADMIN_DELEGATION_TOOL_ALLOW = [sessions_spawn, subagents, group:sessions]` to `allow` when delegation is on (`ask-admin-agent.ts:49-53,302-326`). That was written for `minimal` (where `allow` was empty). **It is harmful with any non-trivial base allow:** appending a delegation subset to a keep-only `allow` makes the surface collapse to *just* those session tools, dropping `read`/`web`/`memory`/`opzava_tasks_*` (confirmed by the consensus review: keep-only intersection, `tool-policy-match.ts:23-35`; `tool-policy-pipeline.ts:99-103,200-205`). **Fix owned by #216/#220:** `buildAskAdminAgentEntry` must **construct the complete intended `allow`** (the full §E3 surface, which already includes `sessions_spawn`/`subagents`/`sessions_list`/`sessions_history`/`sessions_send`/`sessions_yield`), not append a delegation subset to it. Subagent containment is unaffected (`buildSubagentAgentEntry` keeps subagents on `minimal`+empty-allow; `SUBAGENT_TOOL_DENY_ALWAYS` strips `gateway, agents_list, session_status, cron, sessions_send`, `agent-tools.policy.ts:50-74`).

---

## Part F — Hard-gate enforcement (not tool policy)

"Autonomous actions never Done / never approve-merge; human-commanded ones may, audited." **Tool policy cannot express this** — it matches on tool *name*, not arguments or command provenance (`tool-policy-match.ts:18-35`). Both `opzava_tasks_update` (`task-tools.ts:261-276` → `moveTask(status:done)` `:717-731`) **and** `opzava_tasks_create` (`:48-52`) accept `status:"done"` with no guard. Therefore:

- Enforcement lives **server-side in `runtime-control`/`project-management`**, argument- and principal-aware: reject `status:"done"` (and the separate **approve/merge** op) unless the request carries an explicit **human-command attestation** — derived from authenticated product-UI/API event provenance, **never** from model text or tool args, and bound to actor + originating turn + exact target + exact action + expiry + idempotency key. Route it through the hot path's existing `operator.approvals` scope (`ask-admin-agent.ts:20`) so a human confirms; the confirm step is #218's Dev Board flow, audited "admin X via Ask Admin" (#222).
- Two viable shapes: (a) an arg-level guard in the shared task command that fails Done/merge for autonomous turns and admits it only with an approval id; or (b) a separate confirm-gated tool (e.g. `opzava_tasks_request_done`) so plain `opzava_tasks_update` *structurally* cannot set Done. Prefer (b) for a clean structural boundary.
- **Do not guard only `update`** — `create(status:done)` is an equal Done bypass (`task-tools.ts:48-52`). Put the invariant in the shared command used by both runtime-control and any MCP path, so no adapter bypasses it.
- **Quality checks are a distinct case (provenance, not the Done gate).** A quality-check `pass` is **not** approval — *approval* is a separate op that requires all checks to pass **and** records a human approver (`packages/project-management/src/application/tasks.ts:2958-2974`); that approval/merge op is what carries the human-command gate above. The `quality_checks_add` tool instead needs a **provenance gate**: the agent's checks must be labeled AI (`ai_precheck`) and it must not be able to forge `kind:"human"`/a human pass (the MCP schema currently lets the caller pick `kind`/`state`, `apps/mcp-server/src/tools.ts:186-196`). So: gate Done/create/approve with human-command attestation; gate the quality-check with trustworthy AI labeling.
- **Q17 subagents are autonomous for this gate** — never copy a parent's human-command capability into subagent inheritance.
- The current trusted tool context has no human-command/autonomous provenance field (`assistant-conversation-lifecycle.ts:49-62`); the outcome audit records tool/target/result but not provenance (`assistant-conversation-outcomes.ts:29-93`). **Extend the trusted context + audit** with the attestation and decision. This answers **#219 Q3: yes — server-side, principal-aware, argument-level.**

---

## Part G — Downstream flags

- **→ #219 (skills):** the skills' read tools are (a) **core** — enabled only by `profile: coding` (`read`, `memory_*`, `web_*`), never by an `allow`/`alsoAllow` entry alone for the core ones (profile carries them); and (b) **product** — `opzava_tasks_get`/`comments_add` etc. that **must be ported** (§D). Sequence the tool build ahead of the skills slice. `skill_workshop` stays denied. Add `agents.defaults.skills: []` fail-closed (wf221 §A5).
- **→ #216 (delegation):** owns the §E4 fix (`buildAskAdminAgentEntry` must build the complete `allow`, not append a delegation subset) and the final session-tool set (`sessions_send` in?).
- **→ #220 (assembly):** carries (1) profile-switch ADR-005 widening + the **exact-`allow` control** against the `bundle-mcp` leak + a pinned **projection mechanism/model-facing names** (§E2) + **mandatory live `tools.effective` proof**; (2) the runtime-control card-tool port + platform-read build (§D), consolidated to the session-principal registry; (3) the server-side Done/create gate + attestation contract, and the separate quality-check provenance gate (§F); (4) the §E4 delegation rework; (5) **release ordering** — the broker performs an exact effective-inventory check (`apps/gateway-broker/src/acl/openclaw/operator-client.ts:449-489`): unknown allow entries warn and unavailable tools fail the check, so **build/project the tools first, then install the policy + update the broker's expected inventory atomically**.
- **Live-proof gate (named):** the effective set for `ask-admin-opzava` must equal {`read`, `web_search`, `web_fetch`, `memory_search`, `memory_get`, `session_status`, the delegation subtree, the allowlisted `opzava_tasks_*` + net-new reads} with nothing denied leaking in — verified on a real gateway before the slice is Done.

---

## Part H — Open questions / risks

1. **The current `minimal`+`allow` block is already an empty intersection (CRITICAL).** Not a trap that springs at projection — the profile drops products and the agent `allow` drops `session_status` today (§A4). v1 must replace the whole block with the §E3 shape **as part of** projecting the tools.
2. **Projection mechanism undecided and it changes the names (CRITICAL for the diff).** bundle-mcp (→ `<server>__opzava_tasks_*` prefixed model names, and a leak surface requiring the exact `allow`) vs native plugin vs core-catalog registration (→ bare names). `gatewayRequestedTools` merge at the profile stage (`tool-resolution.ts:90-93`) is a per-turn path, not the standing surface. **Pin this at #220 before building the policy** (§E2); the §E3 `allow` names assume bare projection and must be rewritten to the projected names otherwise.
3. **`read` inclusion is soft** — depends on the skill demand-load mechanic (wf221 §A1). If skills prove fully context-injected, drop `read` and close FS entirely.
4. **`update_plan`/`image` judgment calls** — OUT for v1 (update_plan also needs `planTool`/strict-agentic to exist; image blocked by "no attachments" #214). Both are cheap re-adds later; deny individually to keep the door open.
5. **Two divergent task-tool surfaces with different principals** (runtime-control session-principal vs mcp-server link-token) — porting must consolidate, not duplicate.
6. **`read` is only as safe as the workspace** — `workspaceOnly` guards paths, not secrets; curate `ASK_ADMIN_AGENT_WORKSPACE` to product docs + this agent's memory, no credentials. Confirm what corpus is mounted there.
7. **Memory scope** — keep session-transcript indexing off unless required; if on, retain `visibility:"tree"` (`docs/openclaw/concepts/memory-search.md:142-153`).
8. **`sessions.visibility:"tree"` is top-level** — if another gateway tenant needs `agent`/`all`, isolate Ask Admin on a gateway/config boundary rather than weakening its scope.
9. **Clarify "GitHub-action parity"** at #215 — issue+PR *state read* for v1 vs additional human-commanded GitHub actions; keep approve-merge absent until its attested command/audit path exists.

---

## Dual-model corroboration & Codex consensus

**Method.** Two independent read-only scouts (Claude background agent; Codex `gpt-5.6-sol` high) ran on the same brief without sight of each other, then a Codex `gpt-5.6-sol` consensus review audited this synthesized memo.

**The correction that mattered.** The host's first draft claimed plugin/MCP tools (`opzava_tasks_*`) are exempt from core allowlists and addable via `tools.allow`. **Both scouts independently refuted this** with the same source evidence (profile filters plugin tools too; `bundle-mcp` is appended to `coding`/`messaging` but not `minimal`; the `tools-effective-inventory` "use alsoAllow, not allow" notice) and both identified `tools.alsoAllow` as the correct additive key. The host re-verified from source (`agent-tools.policy.ts:440`, `mergeAlsoAllowPolicy`, `types.tools.ts:398-404`) and adopted the correction — it reshaped §A and the §E diff. No tiebreaker was needed: the two scouts converged.

**Points both scouts independently confirmed:** `minimal → coding` is required; the 12-core shortlist; the card-tool port + 2 net-new reads; the hard gate is server-side not tool-policy; `sessions.visibility:"tree"` + `fs.workspaceOnly:true`; do **not** deny `group:fs` or `group:agents`; live `tools.effective` proof required.

**Minor differences the host adjudicated:** `sessions_send` → IN (both scouts favoured it; #216 confirms); `update_plan`/`image` → OUT for v1 (2 of 3, backed by the `planTool` gate and the "no attachments" #214 lock).

### Consensus review (Codex `gpt-5.6-sol`, high, read-only) — verdict: **BLOCKED → resolved**

The review confirmed the central mechanic (AND-filter, profile-first, keep-only `allow`, plugin tools not exempt, `alsoAllow` additive at the profile stage — with an extra cite, `agent-bundle-mcp-tools.request-boundary.test.ts:135-150`) and the core inventory, but blocked the freeze on the concrete diff. Each finding was verified against source and applied:

1. **Trap framing (correction).** The current config is *already* an empty intersection (profile drops products; the non-empty agent `allow` drops `session_status`), not "works until projection." → **Fixed** in TL;DR §2 and §A4.
2. **BLOCKING diff error — `bundle-mcp` leak.** `coding` admits `bundle-mcp` = every configured MCP-server tool, so a deny-only shape can't guarantee "effective == shortlist"; an **exact narrowing `allow`** (or server isolation) is a *required* control, and bundled tools are model-named `<server>__<tool>` so raw names may not select them. → **Fixed**: §E rewritten to an exact `allow` + a new §E2 that pins the projection/naming; the earlier "deny-only is cleaner" recommendation was reversed (the Codex scout's exact-`allow` shape is now the default, not an option).
3. **Quality-pass nuance.** A quality-check `pass` ≠ approval (approval is a separate all-pass + human-approver op, `tasks.ts:2958-2974`); the quality tool needs a provenance gate, not the Done gate. → **Fixed** in §D and §F.
4. **Minor.** MCP surface is 12 not 11 (§B fixed); `comments_mark_read` settled **OUT** for v1 (§D/§E fixed); the "coding-only" summary corrected to "absent from `minimal`" (§C fixed).

The mechanic and core shortlist carried forward unchanged, as the review directed. No re-review was run; the fixes are mechanical corrections to specific, source-cited findings, each re-verified by the host against the cited lines.
