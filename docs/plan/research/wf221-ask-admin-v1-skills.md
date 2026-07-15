# Ask Admin Opzava — v1 skill set and OpenClaw skill mechanics

Date: 2026-07-15
Origin: wayfinder map #210, ticket #221; feeds #219.
Method: dual-model research — an independent Claude scout and an independent Codex `gpt-5.6-sol` (high-effort, read-only) scout, neither seeing the other's output, plus a final Codex `gpt-5.6-sol` consensus review of this synthesized memo (verdict recorded in the Consensus section).

## The question

What v1 skill set does the "Ask Admin Opzava" agent (`ask-admin-opzava`) need to do its locked jobs with high-quality output — and how do OpenClaw agent skills mechanically work, so the spec can provision them correctly?

Locked v1 jobs: platform Q&A (Dev Board cards, GitHub issue/PR state, connections, agent health), governed Dev Board writes (full card lifecycle; autonomous actions never Done/approve-merge), delegating cards to subagents, memory (own + cross-agent read via memory-core `extraPaths` — decided in `docs/plan/research/wf211-ask-admin-memory-backend.md`), web search, real PM reasoning, and development-progress/sprint/stage reports.

---

## Dual-model reconciliation (read this first)

Two independent scouts reached the **same load-bearing conclusion** and **two disagreements**. Where they agreed, the finding is high-confidence. Where they disagreed, the memo flags the choice for the #219 grilling rather than silently picking a side.

**Agreed (high confidence, both scouts + host-verified against fork source):**
- **The current agent cannot use skills at all.** `agents.list[ask-admin-opzava].skills: []` resolves to an empty allowlist (zero skills visible), and the deny-wins policy blocks the `read` tool via `group:fs` while `tools.profile: "minimal"` allows only `session_status`. Skills are injected as a metadata-only index and demand-loaded via `read`; with `read` denied, any provisioned skill is dead on arrival. (Host-verified: `ask-admin-agent.ts:29-35,43-47,82`; `mainframe/src/agents/tool-catalog.ts:62-86,200-204`; `mainframe/src/skills/loading/skill-contract.ts:38-43`; `mainframe/src/skills/discovery/agent-filter.ts:25-37`.)
- **Skills are prose and cannot grant tools** — enforcement is tool policy, not skill/SOUL claims. Governance invariants ("never Done / never approve-merge") must be enforced server-side, not in a skill.
- **Proprietary skills, not ClawHub** — community PM skills are generic, exec-gated, and untrusted code, wrong for a locked-down admin agent.
- **`opzava-pm` and `opzava-reporting` earn their place; card-authoring is a near-verbatim port of the existing repo skill.**

**Disagreement 1 — three skills vs four (the platform-status question).** The Claude scout puts platform-state *answering conventions* ("check live state, cite ids, snapshots-are-truth, WS events are hints") in **AGENTS.md**, arguing they apply on *every* turn any platform fact is stated (Q&A, PM reasoning, and reporting alike), and a skill only loads after a narrow trigger — the wrong lifetime for an always-on discipline. The Codex scout proposes a dedicated **`opzava-platform-status`** skill, treating the data-gathering procedure (which queries to run for which question) as isolatable task-craft. **This memo's position:** the *discipline* (every-turn) belongs in AGENTS.md per OpenClaw's own stated boundary rule (§A4/§B1); whether the *procedure* has enough depth to also warrant a thin skill is a real judgment call left open for #219. Recorded, not resolved.

**Disagreement 2 — Codex surfaced a gap the Claude pass understated: the tool allow-list, not skills, is the binding constraint.** Codex's closing warning: "the stated v1 capability set still requires exact tools for comments, detailed card reads, web, memory, GitHub/connections/health, and delegation; skills cannot supply those capabilities." Host-verified: today's `ASK_ADMIN_TOOL_POLICY_ALLOW` is **only** `opzava_tasks_{list,create,update}` (`ask-admin-agent.ts:43-47`) plus the delegation tools. So `opzava-reporting` cannot gather data, platform Q&A cannot read health/GitHub/connections, and there is no card-comment tool — regardless of how good the skills are. **This is the tool-inventory ticket's (#212) job, but it is a hard dependency of the skills slice:** each skill's "data-gathering checklist" is only executable if #212's shortlist allowlists the matching read tools. The memo now states this dependency explicitly (§B6). Not a disagreement about skills so much as a scope correction the Codex pass caught.

---

## Part A — Skill mechanics (ground truth)

### A1. What a skill is, and how it loads

**Format.** A skill is a directory containing a `SKILL.md` with YAML frontmatter + a markdown body. Required frontmatter: `name` (lowercase letters, digits, hyphens) and `description` (one line, under 160 chars — it is shown to the agent and in slash-command discovery) (`docs/openclaw/tools/skills.md:232-243`; `docs/openclaw/tools/creating-skills.md:55-60,97-103`). Optional keys: `user-invocable` (default `true` — exposes a slash command), `disable-model-invocation` (default `false` — keeps the skill out of the agent prompt), `command-dispatch: tool` + `command-tool` + `command-arg-mode` (route a slash command straight to a tool), `homepage` (`skills.md:252-282`). The frontmatter parser supports **single-line keys only**; `metadata` must be single-line JSON. `{baseDir}` in the body resolves to the skill folder (`skills.md:245-250`; `creating-skills.md:118-125`). The fork parses exactly these keys — `mainframe/src/skills/loading/frontmatter.ts:214-216`; the AgentSkills-spec `allowed-tools` key is **not parsed anywhere** in `mainframe/src` (grep: zero hits), i.e. it has no runtime effect in OpenClaw.

**Discovery paths and precedence** (highest → lowest): `<workspace>/skills` → `<workspace>/.agents/skills` → `~/.agents/skills` → `~/.openclaw/skills` (managed) → bundled (shipped in the install; the fork ships 53 at `mainframe/skills/`) → `skills.load.extraDirs` + plugin skills (`skills.md:32-44`; `skills-config.md:429-437`; verified in fork source `mainframe/src/skills/loading/workspace.ts:1149-1236`, including the precedence comment at line 1218). Grouped subfolders are organizational only — the skill's name, slash command, and allowlist key come from frontmatter `name` (`skills.md:46-56`). Same-named skill in a higher root wins.

**Per-agent enable/disable.** Two independent axes:
- *Visibility allowlist*: `agents.defaults.skills` (shared baseline) and `agents.list[].skills` (explicit **final** set — replaces defaults, does not merge; `[]` = no skills; omit = inherit defaults; omit defaults entirely = unrestricted) (`skills.md:77-108`; `skills-config.md:294-322`). Fork enforcement: `mainframe/src/skills/discovery/agent-filter.ts:25-37` — explicit per-agent `skills` wins; unknown agent ids fall back to defaults "so legacy/unresolved callers do not widen access".
- *Per-skill entries*: `skills.entries.<name>.{enabled, apiKey, env, config}` — `enabled: false` disables even a bundled/installed skill; `env`/`apiKey` inject into the **host** process for the agent turn only (`skills.md:414-469,471-498`). `skills.allowBundled` allowlists bundled skills only (`skills-config.md:260-266`).

**How a skill enters context (the critical mechanic).** Eligible skills are injected into the system prompt only as a compact XML `<available_skills>` index — name, description, file location, and a content-derived `<version>` marker. The prompt then instructs the model to **use the `read` tool** to load the SKILL.md at the listed location when the task matches, and to re-read when `<version>` changes (`docs/openclaw/concepts/system-prompt.md:255-292`). The fork's exact prompt text: "Use the read tool to load a skill's file when the task matches its description." (`mainframe/src/skills/loading/skill-contract.ts:38-43`). The version marker is `sha256:` + a 16-char content-hash prefix (`mainframe/src/skills/loading/skill-version.ts:5`). The skill **body is never in the base prompt** — this is a metadata-index + demand-load design.

**Token cost.** Deterministic: `total = 195 + Σ (97 + len(name) + len(description) + len(filepath))` chars; at ~4 chars/token, ~24 tokens per skill before field lengths (`skills.md:558-570`). Three skills ≈ 1.1k chars ≈ ~275 tokens per turn of standing overhead; the body costs tokens only on the turns that read it. The index budget is owned by `skills.limits.maxSkillsPromptChars` with per-agent override `agents.list[].skillsLimits.maxSkillsPromptChars` (`system-prompt.md:294-297`; fork `agent-filter.ts:39-52`; the fork also supports `maxSkillsInPrompt` and a compact-degradation format, `mainframe/src/skills/loading/compact-format.test.ts:44-56`).

**Gating.** `metadata.openclaw` (single-line JSON) filters at load time: `requires.bins` / `requires.anyBins` (PATH), `requires.env`, `requires.config` (truthy `openclaw.json` paths), `os`, `always: true` (skip all gates), `primaryEnv` (`skills.md:284-350`). A skill with no metadata block is always eligible unless explicitly disabled.

**Versioning / refresh.** Eligible skills are snapshotted **when a session starts** and reused for the session; the skills watcher (default `watch: true`, `watchDebounceMs: 250`) detects `SKILL.md` changes and the refreshed list is picked up on the next agent turn; allowlist changes also refresh the snapshot (`skills.md:504-553`; `skills-config.md:71-77`). So reconciled-at-startup skill writes propagate to live sessions without a restart.

### A2. Skills vs tool policy

- A skill is **prose**; it cannot grant, imply, or unlock tools. `allowed-tools` is inert in the fork (A1). The system prompt itself states the enforcement split: "Safety guardrails in the system prompt are advisory... Use tool policy, exec approvals, sandboxing, and channel allowlists for hard enforcement" (`system-prompt.md:107`). Policy beats skill claims — consistent with the Opzava non-negotiable "tool policy beats SOUL claims" (`CLAUDE.md` Non-Negotiables).
- The reverse dependency is the trap: **skills need the `read` tool to function**. Ask Admin's current policy denies `group:fs`, which expands to `{read, write, edit, apply_patch}` (`mainframe/src/agents/tool-catalog.ts:62-86` — all four have `sectionId: "fs"`; group map built at `tool-catalog.ts:376-396`), and its `tools.profile: "minimal"` allows only `session_status` (`tool-catalog.ts:200-204,363-366`; `docs/openclaw/gateway/config-tools.md:25`). Current allow list: only `opzava_tasks_*` (`apps/workers/src/provisioning/ask-admin-agent.ts:43-47`), and deny-wins includes `group:fs` (`ask-admin-agent.ts:29-35`). **Under today's policy, provisioned skills would appear in the prompt index but be unreadable.** Fix in A5.
- `tools.fs.workspaceOnly: true` restricts fs tools (read/write/edit/apply_patch) to the workspace directory (`mainframe/src/config/schema.help.ts:903-904`); enforcement resolves paths against the agent's workspace root and rejects escapes (`mainframe/src/agents/agent-tools.read.ts:1019-1060`). This is what makes allowing `read` safe.
- Skill-related tools: `skill_workshop` is a built-in tool in the `coding` profile; a stricter policy must list it in `tools.allow` explicitly (`docs/openclaw/tools/skill-workshop.md:174-182`). Ask Admin does **not** need it — its skills are repo-authored, not agent-drafted.

### A3. ClawHub

ClawHub (`https://clawhub.ai`) is the public registry for OpenClaw skills and plugins (`skills.md:140-158`; `docs/openclaw/clawhub/cli.md:10-54`). Install: `openclaw skills install @owner/slug` into the workspace `skills/` dir (or `--global` → `~/.openclaw/skills`); ClawHub installs record origin in `.clawhub/origin.json` and are the only ones `openclaw skills update` tracks (`skills.md:159-171`). The standalone `clawhub` CLI pins versions in `.clawhub/lock.json` (live https://docs.openclaw.ai/clawhub). Trust model: automated scans (VirusTotal, ClawScan, static analysis), a `clawhub.skill.verify.v1` trust envelope via `openclaw skills verify`, release-trust checks with `--acknowledge-clawhub-risk` for risky community releases (`skills.md:173-185`; `clawhub/cli.md:41-49`), plus an operator-owned `security.installPolicy` hook that fails closed (`skills-config.md:99-199`). Docs' own warning: "Treat third-party skills as **untrusted code**" (`skills.md:198-201`).

**Adopt vs author:** a live ClawHub search for project-management skills returns only generic community skills (solopreneur PM, ClickUp/Freedcamp/YouTrack/Trello integrations, WBS planner, "PM Assistant" with weekly reporting — live clawhub.ai search, 2026-07-15). None know Opzava's domain (`opzava_tasks_*` tools, card conventions, governance rules, tenant boundaries); most assume `exec`/bins that Ask Admin's policy denies. Verdict: **author proprietary skills; do not install from ClawHub** onto a locked-down ADMIN agent. ClawHub's install path also conflicts with local↔Dokploy parity (a mutable third-party dependency inside the tenant Gateway). The fork's bundled `gh-issues`/`github`/`trello`/`taskflow` skills are likewise exec/bin-gated (`mainframe/skills/gh-issues/SKILL.md:1-15`, `trello/SKILL.md:1-12`) and stay invisible under the allowlist anyway.

### A4. Official guidance on writing high-quality skills

From `creating-skills.md:242-251` (Best practices): "Be concise — instruct the model on *what* to do, not how to be an AI"; safety-first for exec-using skills; test locally; check ClawHub before building. Description ≤160 chars because it doubles as the load trigger and discovery line (`creating-skills.md:55-60`; hard 160-byte cap in Workshop, `skill-workshop.md:214,257`).

The fork's bundled `skill-creator` skill is the richest primary source (`mainframe/skills/skill-creator/SKILL.md`):
- The cost model in one line: "Metadata is always visible; body loads only after trigger; references/scripts/assets load only as needed" (line 8).
- "Keep `SKILL.md` lean"; "Put only trigger-critical facts in frontmatter `description`"; "Prefer noun-phrase descriptions; short generic trigger phrase, not full workflow" (lines 15-19).
- "Move long examples/docs to `references/`; scripts to `scripts/`; templates/media to `assets/`"; "No extra README/changelog/setup docs inside a skill" (lines 20-21).
- Edit workflow: "Remove generic advice the base model already knows. Keep brittle command syntax, auth caveats, safety rules, and validation" (lines 61-62).
- Standard shape: `skill-name/{SKILL.md, scripts/, references/, assets/}` (lines 25-33). Skill Workshop accepts support files only under `assets/ examples/ references/ scripts/ templates/` (`skill-workshop.md:147-153`).

Size discipline: Workshop caps a skill body at 40,000 bytes by default (`skills-config.md:348-351`) — treat that as a ceiling, not a target; the anti-pattern is a skill that restates persona or generic PM theory the model already knows.

Persona/workflow split (feeds Part B): "Keep `AGENTS.md` for operating rules. Keep `SOUL.md` for voice, stance, and style" (`docs/openclaw/concepts/soul.md:94-100`); SOUL is tone/opinions/boundaries, not "a security policy dump" (`soul.md:15-33`). The skills section exists so "tool plugins expose deeper operating guides without embedding all of that guidance directly in every tool description" (`system-prompt.md:277-279`) — i.e. tool descriptions carry mechanics, skills carry deep task workflows, and the index "keeps the base prompt small while still enabling targeted skill usage" (`system-prompt.md:292`).

> **§A5 correction (consensus review, Codex `gpt-5.6-sol`, verdict BLOCKED → corrected; host-verified against source).** The original §A5 had two load-bearing mechanics errors, both now fixed below and confirmed by direct source reading. See the Consensus section for the full verdict. The skill *selection* (Part B) was not blocked.

### A5. Concrete provisioning shape for Opzava

**Where skills can live (corrected).** Workspace placement (`/home/node/.openclaw/workspace/ask-admin-opzava/skills/<name>/SKILL.md`) is the recommended default (highest precedence, per-agent scope — `skills.md:69-75`), but it is **not forced by `workspaceOnly`** as the first draft claimed. Source: even with `tools.fs.workspaceOnly: true`, the read tool is constructed with `additionalRoots` = the active snapshot's per-skill directories (`skillReadRoots = resolveSkillReadRoots(options?.skillsSnapshot)`, `mainframe/src/agents/agent-tools.ts:719,767`; passed as `roots: [guardedRoot, ...additionalRoots]`, `agent-tools.read.ts:807-815`). So a skill in the bundled dir, the managed `~/.openclaw/skills`, or an `extraDirs` path is still readable — the read tool is granted *that skill's directory*, not the whole container, so the "read would roam to credentials" security objection is wrong (read stays scoped to the workspace root **plus the specific skill roots**). Note `skillReadRoots` is `undefined` under a per-run `sandboxRoot` (`agent-tools.ts:767`), i.e. the extra roots apply to the main agent turn, not sandboxed sub-runs. **Consequence:** placement is a delivery/ops choice, not a security constraint — which actually *widens* the delivery options below (baking skills into the `mainframe/` bundled dir as a rung-1 PATCHES customization becomes viable and is arguably simpler than volume-mounting). Recommend workspace placement anyway for per-agent scoping and live-refresh via the watcher, but on ops grounds, not the (incorrect) security grounds.

**Delivery — the current artifact RPC cannot carry skills.** The startup reconciler writes SOUL/IDENTITY/AGENTS via `agents.files.set` with exact-read verification (`apps/workers/src/provisioning/startup-reconciler.ts:139-183`), but the Gateway hard-caps that method to bootstrap files + MEMORY.md: "Gateway file mutations are intentionally capped to the workspace files the UI owns" — `ALLOWED_FILE_NAMES = BOOTSTRAP_FILE_NAMES + MEMORY.md` (`mainframe/src/gateway/server-methods/agents.ts:62-70,100-104,124-131`). `skills/opzava-pm/SKILL.md` is not an allowed name. Two viable channels:

1. **Shared-volume write (recommended for v1).** The workspace is the named volume `openclaw-platform-workspace` mounted at `/home/node/.openclaw/workspace` in the gateway (`docker-compose.yml:306-308`). Mount the same volume into the provisioning worker; the startup reconciler writes `skills/<name>/SKILL.md` (+ `references/`, `templates/`) directly, with the same `<!-- opzava:... body-sha256:... -->` version-marker + exact-re-read pattern already used for artifacts (`ask-admin-agent.ts:356-372`; `startup-reconciler.ts:139-183`). The skills watcher picks up changes and live sessions refresh on the next turn (`skills.md:504-517`) — no gateway restart. Caveat: volume sharing dies when Gateways go remote in multi-tenant; then migrate to (2).
2. **Gateway RPC upload-install (remote-proof).** `skills.upload.begin/chunk/commit` + `skills.install({source:"upload"})`, all `operator.admin` scope (`mainframe/src/gateway/methods/core-descriptors.ts:120-124`), gated by `skills.install.allowUploadedArchives: true` (`skills.md:187-193`; `skills-config.md:93-97`). The worker-admin device token already carries `operator.admin` (`ask-admin-agent.ts:21`). Verify with `skills.status` (`operator.read`, `core-descriptors.ts:114`). More moving parts (zip staging) but survives remote gateways.

Not viable: Skill Workshop proposals-over-RPC (hash-bound updates, no-clobber creates, approval lifecycle — built for human review, not idempotent reconciliation; `skill-workshop.md:23-49`).

**Config keys to reconcile (all rung-0, through `buildAskAdminAgentEntry` / the existing gateway-config-mutation path):**
- `agents.list[ask-admin-opzava].skills`: change from the current `[]` (`ask-admin-agent.ts:82,269` — which means **zero skills visible**, `skills-config.md:319-322`) to the exact v1 names: `["opzava-pm", "opzava-card-authoring", "opzava-reporting"]`. The list is final and non-merging, so nothing else can leak in.
- Tool policy (**corrected — the original recipe did not work**): the goal is "`read` available, all mutations denied." The first draft said "add `read` to `tools.allow`" while keeping `tools.profile: "minimal"` — that **fails**, because the policy pipeline applies steps sequentially and each step only *narrows* the survivors (deny-wins; a non-empty allow keeps a subset, never re-adds): `filtered = filterToolsByPolicy(before, expanded)` per step (`mainframe/src/agents/tool-policy-pipeline.ts:148-210`; matcher `tool-policy-match.ts:18-33`; `filterToolsByPolicy` `agent-tools.policy.ts:141-147`). The `minimal` profile runs *first* and strips `read` (a `coding`-profile core tool, `tool-catalog.ts:60-86,200-204`); a later `tools.allow:["read"]` cannot bring it back — and worse, an allow of only `["read", opzava_tasks_*]` applied after the profile step would also drop `session_status`. **Correct recipe (to lock with a live test in the #219 grilling / implementation slice):** change `tools.profile` from `minimal` to `coding` (which includes `read` + the fs tools), then use `deny: ["write", "edit", "apply_patch", "exec", "group:runtime", ...]` to remove every mutation/runtime tool, keeping `read`, `session_status`, `opzava_tasks_*`, memory/search, and whatever #212 allowlists; set `tools.fs.workspaceOnly: true` so `read`/`apply_patch` stay workspace-scoped. This is a deliberate widening of ADR-005's deny surface → must pass the #219 grilling (open question 1). **Do not ship the memo's exact key set without a live `/context`/tool-list verification on the gateway** — the profile-composition subtlety is exactly the class of error caught here.
- `agents.defaults.skills: []` — fail-closed hardening so orchestrator subagents (whose entries have no `skills` key, `ask-admin-agent.ts:336-346`) inherit an empty allowlist instead of "unrestricted" (`agent-filter.ts:33-37`); today that gap exposes all 53 bundled skills (bin-gates aside) to subagents, and the minimal sub-agent prompt does include Skills when supplied (`system-prompt.md:120-124`).
- No `skills.entries.*` needed for v1: the three skills are pure prose (no env, no apiKey, no bins), therefore ungated and always eligible once allowlisted.
- Versioning: skill content hash rides the receipt exactly like artifacts (`AskAdminProvisioningReceipt.artifacts` pattern, `ask-admin-agent.ts:96-125`); bump `ASK_ADMIN_AGENT_VERSION` on skill changes. The `<version>` marker in the prompt index (sha256 of content) gives the model automatic re-read on change (`system-prompt.md:258-262`; `skill-version.ts:5`).

---

## Part B — The v1 set (design analysis)

### B1. The boundary rule: skill vs SOUL/IDENTITY/AGENTS vs tool descriptions

OpenClaw's own division, stated across the docs:
- **SOUL.md** = voice, stance, tone, boundaries — injected every session; explicitly *not* "a security policy dump" (`soul.md:15-33`). **IDENTITY.md** = name/role/vibe (`agent-workspace.md:72-74`). Opzava additionally carries product-identity and hard refusal boundaries here (`ask-admin-agent.ts:146-211`) — fine, but remember enforcement is the tool policy, not the prose (`system-prompt.md:107`).
- **AGENTS.md** = operating instructions, "loaded at the start of every session. Good place for rules, priorities, and 'how to behave'" (`agent-workspace.md:63-65`).
- **Tool descriptions** = argument schemas and mechanics; skills exist precisely so deep operating guides don't get embedded in every tool description (`system-prompt.md:277-279`).
- **Skills** = task-triggered workflow knowledge, demand-loaded (`skill-creator` line 8: "body loads only after trigger").

**The line, explicitly:** *if the agent must obey it on every turn (identity, security boundary, governance invariant, answering discipline), it goes in an always-injected artifact — bootstrap files cost their full length every session (up to `bootstrapMaxChars` 20000/file, 60000 total, `system-prompt.md:210-215`) but are unconditionally present. If it is craft that applies only when a matching task shows up (how to write a card, how to run sprint math, how to assemble a report), it goes in a skill — ~24 prompt tokens standing cost, full cost only on trigger. If it is "what this tool's arguments mean", it goes in the tool description.* A skill that would need to be loaded every turn is a design smell — it belongs in AGENTS.md.

### B2. Evaluating the three seeds

**`opzava-card-authoring` — keep, strongest seed.** The repo skill `.claude/skills/opzava-task-authoring/SKILL.md` is already the right shape (36 lines: title/description/steps/comments/status-priority-labels/authority-honesty) and its description already names Ask Admin as an audience (line 3). Trigger is crisp (any card create/update/review). Adaptation: rewrite tool references to the `opzava_tasks_*` argument surface, drop admin-UI specifics, keep the "reads human, never like a log line" bar. Its "Authority and honesty" section (lines 34-36: never fabricate; ids come from session context) overlaps AGENTS.md's hard rules — keep the *hard rule* in AGENTS.md (`ask-admin-agent.ts:226-231` already has it) and keep the *craft framing* in the skill; the duplication is one sentence and both surfaces need it.

**`opzava-pm` — keep, but scope it hard.** This is the skill most at risk of becoming persona filler ("act like a senior PM" is exactly the "generic advice the base model already knows" that skill-creator says to delete). What earns its place: Opzava-specific PM operations — how to compute sprint progress from board truth (which statuses count, how `blocked` is weighted, what "done this week" means), the "should X be a sprint?" decision rubric, prioritization vocabulary aligned to the card-authoring priority ladder, when to recommend splitting/merging cards, decide-vs-escalate lines, and the **delegation playbook** (author the card first via card-authoring rules; spawn with a self-contained brief; track the card; report outcomes; never claim completion without tool confirmation). Delegation folds in here for v1 rather than being its own skill: its craft is mostly card-authoring plus a short spawn-and-track loop, its hard limits are tool policy (`ASK_ADMIN_DELEGATION_TOOL_ALLOW`, `ask-admin-agent.ts:49-53`; subagent containment `:336-346`) and the `delegationMode: "prefer"` prompt section (`system-prompt.md:96-101`), and a fourth skill would add trigger-description ambiguity for little depth. Split it out in v2 if the playbook outgrows a section.

**`opzava-reporting` — keep.** Reports are the clearest "big craft, rare trigger" case: report taxonomy (development-progress vs sprint vs stage), the data-gathering checklist per type (which `opzava_tasks_list` queries, which GitHub/connections/health lookups, which memory searches), structure templates, and honesty rules (every number traces to a tool result; absent data is reported absent, never interpolated). Put full report skeletons in `templates/` so SKILL.md stays lean (`skill-creator` lines 20-21; Workshop-standard support dirs, `skill-workshop.md:147-153`).

### B3. Candidate additions — and why they are rejected

- **Memory discipline** (what to store, when to search cross-agent memory, citation of memory hits): applies on *every* turn — Q&A, PM reasoning, and reporting all lean on it. Wrong lifetime for a skill → **AGENTS.md** section. The retrieval machinery is already tools (`memory_search`/`memory_get`) plus the wf211 `memorySearch.extraPaths` decision; the system prompt already carries memory-tool guidance natively (`system-prompt.md:186-207`).
- **Platform-state answering conventions** ("check mutable state live, never answer from stale memory; cite card ids; RPC snapshots are truth, WS events are hints"): platform Q&A is the agent's every-turn job, and the system prompt's Execution Bias already pushes "check mutable state live" (`system-prompt.md:49-52`) → **AGENTS.md**, a few lines.
- **Report formatting** as its own skill: it is `opzava-reporting`'s `templates/` directory, not a sibling skill.
- **Delegation playbook** as its own skill: folded into `opzava-pm` (B2); revisit at v2.
- **Web-search craft**: the web tools' descriptions plus one AGENTS.md line (when to search vs answer) suffice; no Opzava-specific depth exists to justify a skill.

Net: **three skills, deeper rather than wider** — matching the seed hypothesis, with delegation absorbed into `opzava-pm` and the two "missing skill?" candidates deliberately landed in AGENTS.md.

### B4. Final recommended v1 skill list

| Skill | One-line purpose | Load trigger (description phrasing) | Rough size | Seeds |
|---|---|---|---|---|
| `opzava-card-authoring` | Write and review Dev Board cards a tired human can scan — title, description, steps, comments, status/priority/labels. | "Use whenever creating, updating, or reviewing a Task/card via the opzava_tasks tools." | ~4 KB SKILL.md, no support files | `.claude/skills/opzava-task-authoring/SKILL.md` (near-verbatim, tool refs adapted) |
| `opzava-pm` | Opzava PM judgment: sprint-progress math from board truth, sprint/scope decisions, prioritization, and the delegate-a-card playbook. | "Use for sprint progress, planning, prioritization, scope ('should X be a sprint?'), and delegating cards to subagents." | ~5-6 KB SKILL.md (+ optional `references/` rubric) | New; priority ladder from opzava-task-authoring; delegation limits mirror `ask-admin-agent.ts:49-53,329-346` |
| `opzava-reporting` | Generate development-progress, sprint, and stage reports from live board/GitHub/health data with traceable numbers. | "Use when asked for a progress, sprint, stage, or status report." | ~4 KB SKILL.md + `templates/` (one skeleton per report type) | New; structure informed by `docs/plan/EXECUTION.md` worklog conventions |

Standing prompt cost: ~275 tokens for the index (A1 formula); bodies load only on trigger.

**Open at #219: a possible 4th skill, `opzava-platform-status`** (Codex scout's recommendation). It would hold the platform Q&A data-gathering procedure — which `opzava_tasks_list` filters, which GitHub/connections/health lookups, which memory searches answer which class of question. This memo keeps the *answering discipline* in AGENTS.md (every-turn lifetime, §B1/§B3) and does **not** adopt the 4th skill by default, because platform facts are cited across Q&A, PM reasoning, and reporting — broader than a single trigger. But if the procedure proves deep and Q&A-specific enough, promoting it to a skill (bodies load only on trigger, cheaper than always-on AGENTS.md text) is defensible. Decide during the grilling once #212 fixes which read tools actually exist to gather from.

### B5. Explicitly NOT a skill

- **Identity, product naming, model-identity rules** → SOUL.md/IDENTITY.md (already provisioned, `ask-admin-agent.ts:146-211`).
- **Security boundaries and refusals** (no secrets, no cross-tenant, ids-are-untrusted) → SOUL/AGENTS prose backed by **tool policy as the actual enforcement** (`system-prompt.md:107`; ADR-005 deny-wins).
- **Governance invariants** — "autonomous actions never set Done / never approve merges" → AGENTS.md hard rule **plus server-side validation** in the `opzava_tasks_update` handler; a skill is advisory and only present after a trigger, which is exactly wrong for an invariant.
- **Memory discipline** → AGENTS.md (every-turn lifetime; B3).
- **Platform-state answering conventions** → AGENTS.md (every-turn lifetime; B3).
- **Tool mechanics/argument semantics** → tool descriptions (`system-prompt.md:277-279`).
- **Web-search usage** → tool description + one AGENTS.md line.
- **Any ClawHub community skill** → rejected wholesale for this agent (A3).

### B6. Hard dependency: skills are inert without the supporting tool allow-list (Codex cross-check)

The Codex scout's load-bearing correction: skills are prose that *invoke* tools; they cannot supply capability. Today's allow-list is only `opzava_tasks_{list,create,update}` (`ask-admin-agent.ts:43-47`) + delegation tools. Each recommended skill therefore has an unmet tool dependency that the **tool-inventory ticket #212** must satisfy for the skill to function:

| Skill | Tools it assumes are allowlisted (owned by #212) |
|---|---|
| `opzava-card-authoring` | a card-**comment** tool + a detailed card-**read** (beyond `opzava_tasks_list`); write stays create/update. |
| `opzava-pm` | board read (`opzava_tasks_list`, present), plus `memory_search`/`memory_get` for prior decisions, plus the delegation tools (present); GitHub/CI read for "is this card really done" checks. |
| `opzava-reporting` | the widest surface — board read + GitHub issue/PR state + connections/health read + `memory_search`; **cannot produce a report without these**. |
| all three | `read` (for the SKILL.md bodies themselves — §A5) + web search where the job calls for outside facts. |

Consequence for sequencing: the skills slice is **downstream of #212's shortlist and the §A5 policy widening**. Authoring the three SKILL.md files can proceed in parallel, but they are non-functional until the tool policy is widened. The #220 spec must order these correctly.

---

## Vendored-vs-current drift notes (checked 2026-07-15)

- **No drift** on the load-bearing mechanics: loading order, frontmatter fields, allowlist semantics (final-set, non-merging, `[]` = none), gating keys, snapshot/watcher behavior, env-injection scope all match between vendored docs and live https://docs.openclaw.ai/tools/skills + /tools/skills-config + /tools/creating-skills.
- **Token formula presentation**: vendored `skills.md:561-563` gives the exact `total = 195 + Σ(97 + …)` formula; the live /tools/skills page keeps the ~97-chars/~24-tokens-per-skill numbers but replaces the fixed base with prose and **adds** a described degradation mode — when the index exceeds `skills.limits.maxSkillsPromptChars`, identities (name/location/version) are preserved and descriptions are shortened. The fork already implements this compact fallback (`mainframe/src/skills/loading/compact-format.test.ts`, `formatSkillsCompact` in `workspace.ts`), so the fork is ahead of the vendored page, aligned with live.
- **`skills.limits.maxSkillsPromptChars` / `agents.list[].skillsLimits`**: documented in vendored `system-prompt.md:294-297` and implemented in the fork (`agent-filter.ts:39-52`), but absent from the live /tools/skills-config page — a docs-placement gap upstream, not a behavior drift.
- **ClawHub pinning detail**: live /clawhub documents `.clawhub/lock.json` (standalone CLI) alongside `.clawhub/origin.json`; vendored `tools/clawhub.md` is a redirect stub and `clawhub/cli.md` covers install/verify without the lockfile detail. Immaterial for Opzava (no ClawHub adoption).

## Open questions for the #219 grilling

1. **Tool-policy widening**: enabling `read` (via the corrected recipe — `profile: "coding"` + mutation/runtime `deny` + `tools.fs.workspaceOnly: true`, §A5) is the price of skills. The workspace then contains SOUL/AGENTS/MEMORY/memory/ + skills — all already the agent's own context. Does ADR-005's consensus record accept this, and does anything sensitive ever land in the agent workspace volume that `read` shouldn't see?
2. **`workspaceOnly` + skill-roots boundary proof**: verify by test that with `tools.fs.workspaceOnly: true` the guarded read root is the *per-agent* workspace (`/home/node/.openclaw/workspace/ask-admin-opzava`), not the shared `/home/node/.openclaw/workspace` mount — **and** that the per-skill `additionalRoots` (§A5) only add the skill dirs, so raw `read` cannot reach sibling agents' workspaces and bypass the memory-mediated cross-agent read decision of wf211. The `additionalRoots` mechanism makes this proof more important, not less.
3. **Delivery channel decision**: shared-volume reconciler write (simple, local-parity) vs `skills.upload.*` + `skills.install` RPC (remote-proof, needs `allowUploadedArchives: true`). Which does the multi-tenant roadmap force, and is enabling the upload path an acceptable standing config?
4. **Where is "never Done / never approve-merge" enforced?** If only in prose, it fails the platform's own advisory-vs-enforcement rule (`system-prompt.md:107`). Should `opzava_tasks_update` reject `status: done` from the agent principal server-side?
5. **Subagent skill exposure**: confirm `agents.defaults.skills: []` lands with this slice so subagents fail closed (today they'd inherit "unrestricted").
6. **Slash-command surface**: skills default to `user-invocable: true` (`skills.md:259-261`). Through the broker chat surface, are `/opzava-pm`-style commands wanted, harmless, or should v1 ship `user-invocable: false`?
7. **AGENTS.md growth budget**: memory discipline + answering conventions + governance additions must stay well under `bootstrapMaxChars` 20000 (`ask-admin-agent.ts:83`); who owns the token audit when artifacts grow (`/context detail` is the diagnostic, `system-prompt.md:236`)?
8. **Delegation split trigger**: what concrete signal (playbook > ~2 KB? distinct trigger failures?) promotes the delegation section of `opzava-pm` into its own skill in v2?
9. **Profile-composition proof (new, from the consensus review)**: confirm on a live gateway that `tools.profile: "coding"` + a mutation/runtime `deny` yields exactly `{read, session_status, opzava_tasks_*, memory_*, …}` and no write/edit/apply_patch/exec — the memo's corrected recipe (§A5) is source-reasoned but unproven live. This is a gate condition for the implementation slice, not just a grilling question.

---

## Consensus (dual-model review record)

**Research passes:** independent Claude scout + independent Codex `gpt-5.6-sol` (high, read-only) scout. Both agreed on all load-bearing mechanics and on the "current agent can't use skills" conclusion. Disagreements (3-vs-4 skills; the tool-surface gap) are recorded in the Dual-model reconciliation section, above.

**Final review:** fresh Codex `gpt-5.6-sol` (high, read-only) reviewer thread over the synthesized memo. **Verdict: BLOCKED**, scoped entirely to §A5 provisioning mechanics — the skill *selection* (Part B) and the mechanics of Parts A1–A4 were not challenged. Two blocking findings, both **host-verified against source and corrected in this memo**:

1. *"Add `read` to `tools.allow`" is insufficient under `profile: "minimal"`.* The policy pipeline narrows sequentially; the minimal profile strips `read` before the allowlist runs, and nothing re-adds it (`tool-policy-pipeline.ts:148-210`, `tool-policy-match.ts:18-33`). **Corrected** in §A5: switch the profile to `coding` and deny the mutations. Marked as requiring a live tool-list proof (open question 9).
2. *The "skills must live in `<workspace>/skills` or `read` roams to credentials" security rationale is wrong.* The read tool receives per-skill `additionalRoots` from the snapshot even under `workspaceOnly` (`agent-tools.ts:719,767`; `agent-tools.read.ts:807-815`), so out-of-workspace skills are readable and `read` stays scoped to workspace + skill dirs. **Corrected** in §A5: placement is an ops choice, not a security constraint (and bundled-dir delivery becomes viable).

**Disposition:** because both findings are §A5-local, are corrected with source citations, and do not touch the skill-set recommendation, the research ticket resolves with the corrected memo rather than a second review round. The corrected policy recipe is explicitly gated on a live verification (open question 9) before any implementation slice ships it — the memo does not claim the recipe is proven, only source-reasoned. Verifier's own summary field truncated at finding 1 (Codex length cap); findings reconstructed from the reviewer's progress trail + independent host verification of both.
