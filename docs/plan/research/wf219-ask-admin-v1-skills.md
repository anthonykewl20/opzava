# WF-219 — Spec the three v1 skills (opzava-pm, opzava-card-authoring, opzava-reporting)

**Ticket:** [#219](https://github.com/anthonykewl20/opzava/issues/219) (map [#210](https://github.com/anthonykewl20/opzava/issues/210), Ask Admin Opzava v1 — Lead Orchestrator spec).
**Role of this memo:** landing-ready research input for the #219 grilling. It resolves every question the ticket
names and consumes the closed cross-map boundary ticket #243. It writes no product code and changes no
PRD/ADR/`CONTEXT.md`. All load-bearing mechanics were re-verified against Mainframe fork source by the GLM
worker on 2026-07-18; citations are `file:line` or issue-link.
**Dual-provider research (GLM + Codex-spark), converged; grilling decisions carried to #220.** The GLM pass
supplied the full content/policy/sequencing base; an independent Codex-spark governance pass cross-checked the
authority boundaries, the tool-policy precedence, and the "do skills carry authority?" question. The two
providers agree on every settled point and on every default; the only genuine open call is the 3-vs-4 skill
count (§3, O1). Where the Codex pass framed an already-settled item as "open," that convergence is recorded in
§2 and folded back into the resolution table rather than re-opened.
**Method note:** read-only, single-pass. Source claims below (pipeline precedence, deny-wins matcher,
`coding`/`minimal` profile composition, skills agent-filter, broker fail-closed inventory) were each read
directly from `mainframe/src` / `apps/gateway-broker`, not transcribed from prior memos.

---

## 0. The one-line resolution

**The v1 skill set is three proprietary, repo-versioned `SKILL.md` skills — `opzava-card-authoring`,
`opzava-pm` (with delegation folded in), `opzava-reporting` — whose only job is to carry Opzava-specific
task craft. Everything enforceable (the hard gate, fail-closed, deny-wins, the read/mutation boundary,
platform-state and memory discipline) lives in **AGENTS.md + tool policy + server-side validation, never in
skill prose.** The skills are inert today and stay inert until the #212 tool allow-list + the
`minimal→coding` profile switch land; the #219 grilling owns only **content** and one open 3-vs-4 judgment.
Authority/placement is settled externally by #243 and is consumed, not re-litigated, here.

---

## 1. RESOLVED BY EXISTING DECISIONS

Each row is settled by a closed ticket or accepted ADR. #219 must inherit it, not decide it.

| # | Decision | Settled by | Evidence |
|---|---|---|---|
| R1 | **Three proprietary skills, deeper not wider; delegation folds into `opzava-pm`.** No ClawHub/community skill. | #221 (closed) §B3–B4 | `wf221-ask-admin-v1-skills.md:129,135-141`; ClawHub rejection `:60-62`; `#219` body seed set |
| R2 | **A skill is prose and can NEVER grant, imply, or unlock a tool.** `allowed-tools` frontmatter is inert in the fork (zero parse hits). | #221 §A1/§A2; #243 locked decision "Can a skill grant a tool named in its prose? Never." | `wf221:35,53`; `wf243-admin-skills-runtime-mcp.md:82`; `docs/openclaw/concepts/system-prompt.md:107` (advisory vs enforcement) |
| R3 | **Discipline that applies every turn is NOT a skill — it goes in AGENTS.md.** Platform-state answering conventions + memory discipline are every-turn, so AGENTS.md owns them. | #221 §B1/§B3/§B5 | `wf221:106-111,123-125,144-152` |
| R4 | **The hard gate ("autonomous never Done / never approve-merge") is enforced server-side, argument- and principal-aware — NOT by tool policy and NOT by skill prose.** Tool policy matches tool *name* only. Both `opzava_tasks_update` and `opzava_tasks_create` accept `status:"done"`. | #212 §F; answers #219 Q3 "yes" | `wf212-ask-admin-tool-inventory.md:19,211-218`; `packages/runtime-control/.../task-tools.ts` (create `:48-52`, update→`moveTask(status:done)`); matcher `mainframe/src/agents/tool-policy-match.ts:30-44` (name-only) |
| R5 | **The tool-policy recipe is locked: `profile: minimal → coding` + an EXACT positive keep-only `allow` + surgical `deny` + `tools.fs.workspaceOnly: true`.** This is the only profile that carries `read`/`memory_*`/`web_*`; `minimal` carries only `session_status`. | #212 §E2–E3 (consensus-corrected); #221 §A5; #243 locks the exact-allow mechanism | `wf212:162-201`; `wf243:564-581`; fork `mainframe/src/agents/tool-catalog.ts:364-376` (`minimal`=session_status only; `coding`=coding tools **+ `bundle-mcp`**) |
| R6 | **`alsoAllow` (not `allow`) is the additive key; `allow` is keep-only and cannot re-admit a profile-filtered tool.** Plugin/MCP tools are NOT profile-exempt. | #212 §A2–A3 (dual-model correction) | `wf212:11,37-44`; fork `mainframe/src/agents/agent-tools.policy.ts` ("alsoAllow is applied at the profile stage to avoid early filtering"; `resolveExplicitProfileAlsoAllow` + `mergeAlsoAllowPolicy`) |
| R7 | **`coding` admits `bundle-mcp` (every configured MCP-server tool), so a deny-only shape LEAKS; the surface MUST be pinned by an exact `allow` of every model-facing name.** Bare `opzava_tasks_get` will not select a bundle-MCP-projected `<server>__opzava_tasks_get`. Projection must be pinned at #220. | #212 §E2; #243 "Exact Ask Admin tool-projection safety mechanism" | `wf212:155-160,260`; `wf243:562-581`; `tool-catalog.ts:367-369` (`coding` appends `bundle-mcp`) |
| R8 | **Current baseline is non-functional by design, not by defect.** `skills: []` = zero skills visible; `profile:"minimal"` = `session_status` only; `deny:["group:fs"]` also denies `read`. The `minimal`+`allow:[opzava_tasks_*]` block is already an empty intersection (profile drops the product tools; the agent `allow` then drops `session_status`). Skills provisioned today appear in the prompt index but are unreadable. | #221 §A2; #212 §A4; #243 current-state | `apps/workers/src/provisioning/ask-admin-agent.ts:29-35,43-47,82,86-90,269-281`; `wf221:20,54`; `wf212:13,46-50`; `wf243:100,533-536`; `docs/openclaw/gateway/config-tools.md:25,35` (`group:fs`=`{read,write,edit,apply_patch}`) |
| R9 | **Each skill needs the `read` tool to demand-load its `SKILL.md` body** (the skill enters context only as a compact `<available_skills>` index; the model is instructed to `read` the file on trigger). `read` is granted the per-skill directory roots even under `workspaceOnly`, so out-of-workspace skills stay readable and read stays scoped to workspace + skill dirs. | #221 §A1/§A2/§A5 | `wf221:43,54-55,83`; `docs/openclaw/tools/skills.md:504-517`; fork `mainframe/src/agents/agent-tools.ts:719,767` + `agent-tools.read.ts:807-815` (skill `additionalRoots`) |
| R10 | **`agents.defaults.skills: []` is required so orchestrator subagents fail closed** (today a subagent with no `skills` key inherits "unrestricted" → all 53 bundled skills). Every permitted descendant must also carry an explicit `skills: []` or exact approved list; omission/inheritance is invalid. | #221 §A5 open-Q5; #243 "Delegated descendant containment" | `wf221:95`; `wf243:584-598`; fork `mainframe/src/skills/discovery/agent-filter.ts:25-37` (explicit wins; unknown→defaults; no defaults→unrestricted) |
| R11 | **The skill vocabulary must follow DevTicket/Card/Proposal, not legacy Task or Q17.** Card = the DevTicket projection; skills must not recreate the legacy generic Task workflow. | #219 comment (PRD #226 / ADR #227) | `#219` comment `2026-07-15T16:55:11Z`; commit `2b80949b`; `CONTEXT.md` |
| R12 | **The card-authoring skill is a near-verbatim port of the repo's `.claude/skills/opzava-task-authoring/SKILL.md`**, with tool references rewritten to the `opzava_tasks_*` argument surface and admin-UI specifics dropped. Its hard "Authority and honesty" rule is duplicated one-sentence in AGENTS.md (both surfaces need it), but enforcement is tool policy + server-side. | #221 §B2 | `wf221:115`; `.claude/skills/opzava-task-authoring/SKILL.md:1-37` |
| R13 | **#243 owns authority/placement; #219 owns content.** The Ask Admin skill subset is target policy, not a page; the one canonical edit location is *AI Runtime → Agents → Ask Admin Opzava → Skill policy*; the chat cannot self-escalate skills/tools. "Skills describe procedure; MCP servers expose tools; neither grants authority." | #243 (closed) | `wf243:25-33,37-39,80-82,600-614,1059-1062` |
| R14 | **ADR-005 is the enforcement spine: deny-wins, policy beats SOUL/persona claims, no per-project sandbox, standard agents deny runtime + fs mutation.** "SOUL can lie; tool policy cannot." | ADR-005 (Accepted) | `docs/adr/ADR-005-tool-policy-security.md` (Decision: deny is the authority; governance enforced at policy rows + tool invocation, not persona text) |
| R15 | **Skill delivery cannot use the artifact RPC** (`agents.files.set` is hard-capped to bootstrap files + MEMORY.md); v1 uses the shared-volume reconciler write (same `<!-- opzava:... body-sha256 -->` + exact-re-read pattern as SOUL/IDENTITY/AGENTS), with `skills.upload.*`+`skills.install` as the remote-proof alternative. | #221 §A5 | `wf221:85-88`; `mainframe/src/gateway/server-methods/agents.ts:62-70,100-104` (`ALLOWED_FILE_NAMES = BOOTSTRAP_FILE_NAMES + MEMORY.md`) |
| R16 | **Hard sequencing: the skills slice is downstream of #212's tool shortlist + projection AND the profile switch.** Authoring the three `SKILL.md` files can proceed in parallel, but they are non-functional until the policy widens and the read/card/platform-read tools are allowlisted. | #221 §B6; #212 §G; #243 | `wf221:154-165`; `wf212:224-227`; `wf243:559-560` |

---

## 2. CONVERGENCE TENSIONS (GLM ↔ Codex-spark)

The independent governance pass surfaced three decision tensions. Both providers reached the same conclusion
on each; they are recorded here so the grilling sees the load-bearing pressures explicitly rather than only
in the resolution table.

1. **`#219 ↔ #243` boundary collision (skill content vs authority placement).** #219 decides *what skills
   exist and what their bodies say*; #243 decides *where the Ask Admin skill subset sits in the
   authority/runtime architecture and who can edit it*. Both tickets use the word "boundary" for different
   meanings, so independent edits can drift (#243 owner note in `#219` comment, 2026-07-16).
   **Resolved by R13** — #219 owns content, #243 owns placement, and #219 consumes #243 rather than
   re-litigating it. **Recommendation carried to synthesis #220 (not an owner-lock):** synthesis must cite
   both tickets together and must not let #219 hardcode a placement/authority decision that #243 owns.

2. **Tool-policy precedence (`profile` → `allow`/`alsoAllow`).** `profile` runs before `allow`; under
   `minimal`, `read`/`web_*`/`memory_*` are dropped before any later allowlist could re-add them, and `allow`
   is keep-only so it cannot recover them — only `alsoAllow`, merged at the profile stage, can
   (`wf212` Part A2/A4; pipeline `mainframe/src/agents/tool-policy-pipeline.ts:178-210`). **Consequence:** the
   provisional "allow `read`" patch in the current baseline is insufficient on its own; the profile must widen
   to `coding` (R5/R6). **Resolved by R5 + R6.** **Recommendation carried to synthesis #220 (not an
   owner-lock):** the slice ships `profile: coding` + exact keep-only `allow` + surgical `deny` + `workspaceOnly`
   as one atomic recipe, not an `allow:[read]` patch.

3. **Whether skills carry authority.** The full source chain (wf221 Part A2, wf212 Part F, #219 comments)
   is unanimous: skills only add prompt behavior and can load extra guidance via `read`; they cannot define
   policy authority. Any attempt to treat skill prose as authority would bypass ADR-005 and break enforcement
   semantics. **Resolved by R2 + R14.** **Recommendation carried to synthesis #220 (not an owner-lock):** keep
   "never Done / never approve-merge" and all refusal/cross-tenant rules in AGENTS.md prose *backed by* tool
   policy + server-side validation, never in `SKILL.md` bodies.

---

## 3. Open decisions (grilling)

Each is a real decision still owned by the #219 grilling, with a recommended default. The marker on every
default means: **recommendation carried to synthesis #220 (not an owner-lock)** — the owner may override any of
them at the grilling; absent an override, the default is what #220 builds. Two items the Codex pass listed as
"open" (enforcement locus of the hard gate, and the subagent `skills` baseline) are in fact settled by R4 and
R10 and are recorded in §3.9 only to document the convergence, not to re-open them.

### O1 — 3 vs 4 skills: does `opzava-platform-status` earn a thin skill?
**The split.** The *answering discipline* ("check mutable state live; cite card ids; RPC snapshots are truth,
WS events are hints") is every-turn → AGENTS.md (settled, R3). The open question is whether the
*data-gathering procedure* (which `opzava_tasks_list` filters answer which question; which GitHub /
connections / health / memory lookups) has enough depth and a narrow-enough trigger to earn a 4th skill.
- **Decision needed:** ship 3 (discipline in AGENTS.md only) or 4 (add `opzava-platform-status` for the procedure).
- **Default:** **3 skills.** The procedure is shallow until the #212 net-new platform-read tools
  (`opzava_github_state_read`, `opzava_connections_health_read`) actually exist; promote to a skill in v2 once
  the procedure has measurable depth and a trigger distinct from Q&A/PM/reporting.
  **recommendation carried to synthesis #220 (not an owner-lock)**
- **Cites:** `wf221:25,141`; `#219` comment `2026-07-15T10:56:04Z` Q1; `wf243:556-560` ("`opzava-platform-status` remains unresolved").

### O2 — Accept the ADR-005 deny-surface widening (`minimal → coding`)?
Switching to `coding` admits a far broader base than `minimal`; the exact `allow` + surgical `deny` +
`workspaceOnly` re-narrow it (R5). This is a deliberate widening of ADR-005's deny surface and the wf221
consensus gated it on a live proof. (Codex-pass framing: "`profile: coding` with explicit exact `allow` plus a
defensive `deny`," because `coding` includes `bundle-mcp` and a deny-only shape leaks — `wf212` §E3.)
- **Decision needed:** accept the widening (the only viable path to `read`) or block.
- **Default:** **Accept.** There is no alternative path to `read`/`memory_*`/`web_*` — `minimal` cannot carry
  them and `allow` cannot re-admit them (R5/R6). The widening is safe precisely because the exact keep-only
  `allow` (not deny-only) is the control (R7), and the broker fails the session closed if the effective set
  drifts (R8/§5). Gated on the live `tools.effective` proof in O3.
  **recommendation carried to synthesis #220 (not an owner-lock)**
- **Cites:** `wf221:176-178,186`; `wf212:162-201`; ADR-005.

### O3 — Pin `workspaceOnly` + skill-roots boundary, and the exact `tools.effective` set, on a live gateway.
The corrected recipe is source-reasoned and modeled by the throwaway prototype (§6), but it is unproven on a
live gateway. Two proofs are required before any slice ships it: (a) with `tools.fs.workspaceOnly: true`, the
guarded read root is the **per-agent** workspace (`/home/node/.openclaw/workspace/ask-admin-opzava`), not the
shared mount, and the per-skill `additionalRoots` add only the skill dirs (so raw `read` cannot reach sibling
agents' memory — protects the wf211 cross-agent-read decision); (b) the effective set equals exactly
`{read, web_search, web_fetch, memory_search, memory_get, session_status, sessions_*, subagents,
opzava_tasks_* (+net-new reads)}` with nothing denied leaking in.
- **Decision needed:** confirm the live proof shape and the projection model (bare vs `<server>__` names).
- **Default:** **Require the live proof as a gate condition** (not just a grilling question); pin bundle-MCP
  projection names at #220. The broker's `getEffectiveTools` is the verifier (`operator-client.ts:460-501`).
  The prototype in §6 already proves the *simulated* shape; the live run is what finalizes it.
  **recommendation carried to synthesis #220 (not an owner-lock)**
- **Cites:** `wf221:179,186`; `wf212:226-227`; `mainframe/src/agents/agent-tools.ts:719,767`.

### O4 — Delivery channel for the `SKILL.md` files.
Shared-volume reconciler write (simple, local↔Dokploy parity, live-refresh via watcher) vs
`skills.upload.*`+`skills.install` RPC (remote-proof, needs `allowUploadedArchives: true`) vs (newly viable)
bundled-dir bake as a `mainframe/PATCHES.md` rung-1 customization.
- **Decision needed:** which channel does the multi-tenant roadmap force, and is enabling the upload path an
  acceptable standing config?
- **Default:** **Shared-volume write for v1** (parity with today's artifact reconciler; no extra standing
  config; watcher gives live refresh). Migrate to the upload RPC when Gateways go remote in multi-tenant. The
  bundled-dir bake is viable (R9 makes placement an ops choice, not a security constraint) but couples skill
  releases to fork bumps — defer unless ops wants it.
  **recommendation carried to synthesis #220 (not an owner-lock)**
- **Cites:** `wf221:85-88,180`; `#219` comment `2026-07-15T10:56:04Z` Q4; `docs/openclaw/tools/skills.md:187-193`.

### O5 — Slash-command surface: `user-invocable: true` (default) or `false`?
Skills default to `user-invocable: true`, exposing `/opzava-pm`-style slash commands. Through the broker chat
surface, are admin-typed slash commands wanted, harmless, or unwanted?
- **Decision needed:** ship `user-invocable: true` or `false` for the three skills.
- **Default:** **`false` for v1.** Ask Admin is a governed Lead Orchestrator surface, not a slash-command
  console; the skills are model-invoked craft, not user commands. Setting `false` keeps them out of
  slash-command discovery while still loadable by the model. Revisit if an admin power-user workflow wants
  explicit `/report`-style triggers.
  **recommendation carried to synthesis #220 (not an owner-lock)**
- **Cites:** `wf221:183`; `docs/openclaw/tools/skills.md:259-267` (`user-invocable` default `true`).

### O6 — AGENTS.md growth budget (token audit ownership).
Memory discipline + platform-state conventions + governance additions all land in AGENTS.md (R3) and must stay
well under `bootstrapMaxChars` 20000 (`ask-admin-agent.ts:83`; 60000 total across bootstrap files).
- **Decision needed:** who owns the token audit when artifacts grow, and what is the per-section ceiling?
- **Default:** **The skills-slice owner owns the audit** using `/context detail` (`system-prompt.md:236`); cap
  the combined AGENTS.md additions at ~3–4 KB (the three new sections are short by design — R3). The skills'
  index cost is already bounded (~275 tokens/turn for three, `wf221:139`).
  **recommendation carried to synthesis #220 (not an owner-lock)**
- **Cites:** `wf221:184`; `ask-admin-agent.ts:83`.

### O7 — Delegation-split trigger (v2).
`opzava-pm`'s delegation playbook is folded in for v1 (R1). What concrete signal promotes it to its own skill
in v2?
- **Decision needed:** the split threshold.
- **Default:** **Split when the delegation section exceeds ~2 KB OR when distinct trigger failures appear** (a
  delegation task failing to load `opzava-pm`'s PM content, or vice-versa). Pure-size threshold; revisit after
  v1 telemetry. **recommendation carried to synthesis #220 (not an owner-lock)**
- **Cites:** `wf221:117,185`.

### O8 — Skill-content reconciliation with the landed DevTicket/Runner planning flow.
#243 requires #219 to "reconcile [the proposal] with the later user-approved planning flow" (DevTicket command
model, Runner control protocol, fenced receipts). The skill bodies must reference the canonical
DevTicket/Card/Proposal/Sprint/Incident vocabulary (R11), not the legacy Task state machine, and must frame
delegation through the captured model.
- **Decision needed:** confirm the skill bodies cite the current DevTicket vocabulary and the #216 delegation
  contract (still in resolution as of 2026-07-17).
- **Default:** **Block the skills-slice freeze on #216's delegation memo** for the `opzava-pm` delegation
  section; the other two skills can freeze independently. `opzava-card-authoring` already matches the landed
  Card projection; `opzava-reporting` cites the four-ledger model + GitHub native facts.
  **recommendation carried to synthesis #220 (not an owner-lock)**
- **Cites:** `wf243:559-560`; `#219` comment `2026-07-15T16:55:11Z`; `#210` comment (DevTicket canonical, PRD #226 / ADR #227); `#210` comment `2026-07-17T04:32:34Z` (#216 in flight).

### O9 — Convergence-only (settled, not re-open): enforcement locus + subagent baseline.
Recorded because the Codex governance pass listed both as open; both are already locked. **(a) Hard-gate
enforcement locus** — server-side validation in `runtime-control`/`project-management`, not skill prose and not
tool policy (R4; `wf212` Part F). **(b) Subagent `agents.defaults.skills` baseline** — explicit fail-closed
`agents.defaults.skills: []`, never inherited/default (R10; `wf221` §A5.5; `ask-admin-agent.ts:269-276`).
**recommendation carried to synthesis #220 (not an owner-lock)** for both, in the form already fixed by R4/R10.

---

## 4. The exact v1 SKILL.md set + governance placement

### 4.1 What each skill IS (executable content target)

| Skill | Purpose (one line) | Load trigger (frontmatter `description`) | Body it must carry | Size ceiling |
|---|---|---|---|---|
| `opzava-card-authoring` | Write/review Dev Board **Cards** a tired human can scan. | "Use whenever creating, updating, or reviewing a Card via the opzava_tasks tools." | Near-verbatim port of `.claude/skills/opzava-task-authoring/SKILL.md` — Title / Description (context-impact-evidence) / Steps (verifiable+owner) / Comments (status-forward) / Status-priority-labels / Authority-and-honesty. Rewrite tool refs to `opzava_tasks_*`; drop admin-UI specifics; use **Card/DevTicket/Proposal** terms (R11). | ~4 KB, no support files |
| `opzava-pm` | Opzava PM judgment: sprint-progress math from board truth, "should X be a Sprint?" rubric, prioritization, and the delegate-a-Card playbook. | "Use for sprint progress, planning, prioritization, scope decisions, and delegating Cards to subagents." | Sprint-progress computation (which statuses count, how `blocked` weights, "done this week"), the should-this-be-a-Sprint decision rubric, prioritization aligned to the card ladder, split/merge guidance, decide-vs-escalate lines, and the delegation playbook (author the Card first; spawn with a self-contained brief; track; report; never claim completion without tool confirmation). Delegation *limits* are tool policy + the `delegationMode:"prefer"` prompt, NOT skill prose. | ~5–6 KB (+ optional `references/` rubric) |
| `opzava-reporting` | Generate development-progress / Sprint / stage reports from live board + GitHub + health data with traceable numbers. | "Use when asked for a progress, sprint, stage, or status report." | Report taxonomy, a per-type data-gathering checklist (which `opzava_tasks_list` queries, which GitHub/connections/health lookups, which memory searches), structure templates in `templates/`, and honesty rules (every number traces to a tool result; absent data reported absent, never interpolated). | ~4 KB + `templates/` |

**Standing prompt cost:** ~275 tokens/turn for the three-skill index (`total = 195 + Σ(97 + len(name) + len(description) + len(filepath))`, `skills.md:561-563`); bodies cost tokens only on the turn that `read`s them.

### 4.2 What each skill NEEDS to be executable (hard dependency on #212)

Skills are prose that *invoke* tools; they cannot supply capability (R2). Each skill's data-gathering
checklist is dead until #212 allowlists the matching read tools (R16):

| Skill | Tools it assumes (owned by #212 + projection @ #220) |
|---|---|
| `opzava-card-authoring` | a Card-**comment** tool + a detailed Card-**read** (`opzava_tasks_get`, beyond `opzava_tasks_list`); write stays create/update. |
| `opzava-pm` | board read (`opzava_tasks_list`, present) + `memory_search`/`memory_get` for prior decisions + delegation tools (present) + GitHub/CI read for "is this really done" checks. |
| `opzava-reporting` | the widest surface — board read + GitHub issue/PR state + connections/health read + `memory_search`; **cannot produce a report without these.** |
| all three | `read` (for the `SKILL.md` bodies themselves, R9) + `web_search` where the job calls for outside facts. |

Most of these tools **do not exist on the agent surface today**: the agent sees only
`opzava_tasks_{list,create,update}`; the richer surface (`opzava_tasks_get`, `opzava_tasks_comments_add`,
`opzava_tasks_steps_*`, …) lives only in the standalone `apps/mcp-server` under a *different auth principal*
and **must be ported** onto the session-principal `runtime-control` registry; GitHub-state and
connections/health reads are **net-new** (`wf212:116-136`).

### 4.3 Governance placement (discipline via AGENTS.md + tool policy, NOT skills)

| Concern | Placement | Why |
|---|---|---|
| Identity / product naming / model-identity rules | SOUL.md / IDENTITY.md (already provisioned) | every-turn, voice/stance |
| Security boundaries & refusals (no secrets, no cross-tenant, ids-are-untrusted) | SOUL/AGENTS prose **backed by tool policy as enforcement** | every-turn + ADR-005 "SOUL can lie; tool policy cannot" |
| **"Autonomous never Done / never approve-merge"** | AGENTS.md hard rule **PLUS server-side validation** in the `opzava_tasks_update`/`_create` handler — argument- and principal-aware, through `operator.approvals` | skill is advisory and present only after a trigger — exactly wrong for an invariant (R4) |
| Memory discipline (what to store, when to search, citation) | AGENTS.md | every-turn (Q&A, PM, reporting all lean on it) |
| Platform-state answering conventions | AGENTS.md | every-turn (R3); the *procedure* is O1 |
| Tool mechanics / argument semantics | tool descriptions | skills exist precisely so deep guides aren't embedded in every tool description |
| Web-search usage | tool description + one AGENTS.md line | no Opzava-specific depth |
| Any ClawHub community skill | **rejected wholesale** | untrusted code on a locked-down admin agent |

---

## 5. The fail-closed guarantees (what makes the widening safe)

Three independent mechanisms enforce that widening the profile to `coding` cannot leak authority. Each is
verified in fork source and modeled by the throwaway prototype (§6).

1. **Pipeline precedence — profile runs FIRST, every later layer only narrows.**
   `applyToolPolicyPipeline` iterates ordered steps `profilePolicy → providerProfile → globalPolicy(tools.allow)
   → globalProviderPolicy → agentPolicy(agents.list[].tools.allow) → agentProviderPolicy → groupPolicy →
   senderPolicy`, and per step does `filtered = filterToolsByPolicy(before, expanded)` — an intersection
   that can only remove (`mainframe/src/agents/tool-policy-pipeline.ts:69-123,178-210`). So a tool absent
   from the `coding` profile's survivors cannot be re-admitted by a later `allow`.
2. **The single-layer matcher is deny-wins + keep-only.** Deny patterns always win; an empty `allow` means
   "allow everything not denied"; a non-empty `allow` is keep-only (must match) (`mainframe/src/agents/
   tool-policy-match.ts:9-44`). `alsoAllow` is the only additive escape and it merges at the profile stage
   *before* filtering (`agent-tools.policy.ts` "alsoAllow is applied at the profile stage to avoid early
   filtering").
3. **The broker fails the session closed on any effective-set drift.** `getEffectiveTools` computes both
   `unknownToolNames` (actual ∉ expected — a **leak**) and `missingToolNames` (expected ∉ actual — an
   **unavailable tool**), and if either is non-empty returns `gatewayBroker.toolInventoryMismatch`
   (`apps/gateway-broker/src/acl/openclaw/operator-client.ts:460-501`). This is the exact "missing tools fail
   closed AND unavailable tools do not bypass policy" guarantee the live proof must reproduce.

Plus the profile composition facts that make the recipe deterministic: `minimal` = `{session_status}` only;
`coding` = all `profiles:["coding"]` tools **plus `bundle-mcp`** (`tool-catalog.ts:363-376`); `group:fs` =
`{read, write, edit, apply_patch}` (`config-tools.md:35`), so the current `deny:["group:fs"]` is what kills
`read` today.

---

## 6. PROTOTYPE OUTCOME (throwaway evidence — not production code)

A throwaway demonstrator at `prototypes/wf219-skills/` proves the skill set is well-formed and that the
fail-closed recipe holds. It was built and hardened over two Codex-sol review cycles — each returned
**BLOCKED**: the first on vacuous fail-closed checks (a real bad-skill fixture, subagent-inheritance
derivation, explicit tool IDs), the second caught a **failure-masking test-harness bug** plus the
lexical limits below — all fixed; the harness now genuinely gates, independently confirmed by fault
injection (a corrupted expected value exits non-zero). It now passes (`SCENARIO_SUMMARY=PASS`, exit
`0`). **Documented limitations (throwaway):** the no-authority and body-tool checks are *lexical
heuristics* over SKILL.md text, not a semantic proof — the real fail-closed guarantee is the
server-side tool policy this harness simulates (`profile:coding` + exact `allow` + deny +
`workspaceOnly`). It is **a dependency-free Node ESM policy simulator, not product code and not a
live gateway run** — it models the fork's policy-pipeline semantics in-process so the contract can be
exercised without a running broker. Per repo hygiene it lives in one cleanable scratch folder and is deleted
after the grilling consumes it.

### 6.1 What it proves (scenarios)

Run with `node prototypes/wf219-skills/demo.mjs`; observed exit `0`, `SCENARIO_SUMMARY=PASS`, zero failures
(`prototypes/wf219-skills/RESULTS.md`):

- **S0 — policy profile + fs scope.** `profile` migrates `minimal → coding`; `tools.fs.workspaceOnly` is
  `true`. Asserts the recipe shape that R5/R8 require.
- **S1 — effective toolset equals the exact v1 intended set.** The effective set is exactly the 25 names
  `{read, web_search, web_fetch, memory_search, memory_get, session_status, sessions_list, sessions_history,
  sessions_send, sessions_spawn, sessions_yield, subagents, opzava_tasks_list, opzava_tasks_get,
  opzava_tasks_create, opzava_tasks_update, opzava_tasks_comments_add, opzava_tasks_steps_create,
  opzava_tasks_steps_toggle, opzava_tasks_steps_reorder, opzava_tasks_quality_checks_add,
  opzava_tasks_due_set, opzava_tasks_watchers_set, opzava_github_state_read,
  opzava_connections_health_read}` — expected == actual, byte for byte.
- **S2 — keep-only: bundle namespace expansion is denied unless explicitly allowed.** Dangerous `bundle-mcp`
  tools (e.g. `bundle-mcp__admin_rotate_token`, `bundle-mcp__opzava_tasks_archive`) never enter `effective`
  when not in the exact `allow`. Proves R7 — deny-only leaks, exact-allow does not.
- **S3 — dependency declaration vs body usage admission (per skill).** Each skill's declared
  `tool_dependencies` are present in the effective set; undeclared tool usage in a body is rejected; declaring
  a denied tool (e.g. `write`) is rejected via the effective-tool check.
- **S4 — subagents inherit `skills: []` through `agents.defaults.skills`.** A child/subagent config is
  derived from parent + defaults and its effective skills resolve to the empty list (fail-closed). Proves R10.
- **S5 — all three `SKILL.md` parse and admit.** For each of `opzava-card-authoring`, `opzava-pm`,
  `opzava-reporting`: frontmatter `name` present, `description` present and ≤160 chars, non-empty body,
  `user-invocable: false` (O5 default), unique name, declared dependency list present, no authority-claim
  language, and the skill is admitted by policy. Negative fixtures are rejected: malformed frontmatter,
  duplicate name, `user-invocable` violation, declared-denied-tool, undeclared body tool, and authority-claim
  language; safe authority negations (`must not` / `may not`) are admitted.

### 6.2 The exact-allow recipe under test

`prototypes/wf219-skills/config/agent.coding-exact.jsonc` encodes `agents.defaults.skills: []` (fail-closed
inheritance sink), `agents.list[0].tools.profile: "coding"`, an exact keep-only `allow` of the 25 fixed tool
ids above (no wildcard expansion), an explicit deny list (deny-wins), and `tools.fs.workspaceOnly: true`.

### 6.3 Mapping to real code (where the simulated semantics live in the fork)

- **Policy shape** → `apps/workers/src/provisioning/ask-admin-agent.ts:29-53,82-90,269-281` (the live
  provisioning direction: `profile` minimal→coding, deny + exact `allow`, `agents.defaults.skills: []`).
- **Pipeline precedence + keep-only matcher** → `mainframe/src/agents/tool-policy-pipeline.ts:69-123,178-210`
  and `mainframe/src/agents/tool-policy-match.ts:9-44`; `alsoAllow` profile-stage merge in
  `mainframe/src/agents/agent-tools.policy.ts`.
- **Profile composition (`minimal`/`coding`/`bundle-mcp`)** → `mainframe/src/agents/tool-catalog.ts:363-376`.
- **Effective-set fail-closed verifier** → `apps/gateway-broker/src/acl/openclaw/operator-client.ts:449-501`
  (`getEffectiveTools`, `unknownToolNames`/`missingToolNames` mismatch).
- **Skills agent-filter (explicit wins; no defaults → unrestricted)** →
  `mainframe/src/skills/discovery/agent-filter.ts:25-37`.
- **Card-authoring port source** → `.claude/skills/opzava-task-authoring/SKILL.md:1-37`.

### 6.4 What it does NOT prove (honesty)

The demonstrator is a simulator, not a live run. Out of scope, and still owed by O3 before any slice ships:
live gateway proof, real skill install via shared-volume write or `skills.upload`, subagent runtime execution,
and any network call. It proves the *contract* (the recipe narrows correctly and fails closed); the *live*
`tools.effective` proof on a real broker remains the gate.

---

## 7. Risks

- **`#219 ↔ #243` resolution drift.** #219 may hardcode subset/placement semantics that clash with #243's
  authority-placement decision unless explicitly coordinated (`#219` comment #3; mitigated by R13 + §2.1).
- **Tool projection ambiguity.** Product tool names differ if exposed via `bundle-mcp`; mismatched allowlist
  names create either silent outages or leaked tools (`wf212` §E2/E3; pinned at #220 per O3/R7).
- **Premature skill decisions blocked by runtime dependencies.** Skills are not executable without the #212
  tool shortlist and the live policy widening (`wf221` Part B6; `wf212` Part D/E; R16).
- **Governance under-enforced if #219 accepts skill-only controls.** Done/approve-merge remains bypassable
  without the server-side gate (`wf212` Part F; R4; O9a).
- **Workspace read exposure.** Adding `read` under `coding` increases workspace read radius unless
  `workspaceOnly` and the mounted corpus are intentionally constrained (`wf212` Part E3; `#219` comments; O3).

---

## 8. Inputs the #219 grilling must hand to synthesis (#220)

- The locked three-skill set (R1) + the resolved vocabulary (R11), with O1 as the only membership open call.
- The accepted tool-policy recipe (R5) + the O3 live-proof obligation as a gate condition.
- The fail-closed guarantees (§5) as acceptance criteria, with the §6 prototype as the simulated proof and the
  live gateway run still owed.
- The AGENTS.md governance additions (§4.3) with the O6 budget.
- Sequencing: skills-slice freezes **after** #212 shortlist + projection AND the profile switch, with
  `opzava-pm`'s delegation section additionally gated on #216 (O8).

---

## Evidence inspected (this pass, GLM worker + Codex-spark governance cross-check, 2026-07-18)

- `apps/workers/src/provisioning/ask-admin-agent.ts:29-53,82-90,261-326` (current policy + entry builder)
- `mainframe/src/agents/tool-policy-pipeline.ts:69-123,178-210` (layer order, profile-first, keep-only)
- `mainframe/src/agents/tool-policy-match.ts:9-44` (deny-wins, keep-only matcher)
- `mainframe/src/agents/agent-tools.policy.ts:130-160,310-445` (`filterToolsByPolicy`, `alsoAllow` profile-stage merge)
- `mainframe/src/agents/tool-catalog.ts:195-376` (`minimal`=session_status only; `coding`=coding tools + `bundle-mcp`)
- `mainframe/src/skills/discovery/agent-filter.ts:25-37` (skills fail-closed: explicit wins; no defaults→unrestricted)
- `apps/gateway-broker/src/acl/openclaw/operator-client.ts:449-501` (`getEffectiveTools` mismatch fail-closed)
- `docs/openclaw/tools/skills.md` (skill format, allowlists, snapshots, gating, token cost)
- `docs/openclaw/gateway/config-tools.md:23-46` (profiles + groups, `group:fs`)
- `docs/adr/ADR-005-tool-policy-security.md` (deny-wins, policy-beats-SOUL)
- `.claude/skills/opzava-task-authoring/SKILL.md:1-37` (card-authoring port source)
- Throwaway demonstrator: `prototypes/wf219-skills/` (`README.md`, `RESULTS.md`, `demo.mjs`,
  `config/agent.coding-exact.jsonc`, three `skills/*/SKILL.md` + `references/` + `templates/`)
- Prior resolved memos: `wf221-ask-admin-v1-skills.md`, `wf212-ask-admin-tool-inventory.md`, `wf243-admin-skills-runtime-mcp.md`
- Issues: `#219` (body + comments), `#210` (body + comments), `#221`/`#212`/`#243` (closed, via map #210 ledger)

No product code, PRD, ADR, `CONTEXT.md`, or tracker state changed. The throwaway prototype under
`prototypes/wf219-skills/` is evidence only and is deleted after the grilling.
