# wf219 throwaway prototype

This prototype proves the throwaway wf219 "three v1 Ask Admin skills" policy contract.

## What it proves

- exactly 3 skills live in this prototype: `opzava-card-authoring`, `opzava-pm`, `opzava-reporting`.
- there are no v1 additions for `opzava-platform-status` (3-vs-4 locked to 3).
- the policy simulator is dependency-free, zero npm dependency, Node ESM.
- tool-policy simulation follows deny-wins, `keep-only` allow, and explicit `bundle-mcp` expansion.
- `agents.defaults.skills` is now proven through a derived child/subagent config and effective inheritance check (fail-closed empty list).
- effective-toolset proof includes:
  - `read`
  - `web_search`
  - `web_fetch`
  - `memory_search`
  - `memory_get`
  - `session_status`
  - `sessions_*` + `subagents`
  - `opzava_tasks_*`
  - net-new platform reads
- hardened admission/validation guarantees are asserted:
  1. frontmatter and body parsing catches malformed fields:
     - missing/invalid `name`
     - missing/invalid `description`
     - empty body
     - invalid `tool_dependencies`
     - duplicate skill names
     - non-false `user-invocable`
  2. unsafe authority language in bodies is rejected:
     - explicit claims like `may sign off`, `is authorized to accept`, `can approve/finalize/mark done`
     - safe negations like `must not` / `may not` are allowed
  3. dependency declaration vs body usage admission:
     - undeclared body tool usage is rejected
     - declaring denied tools (`write`) is rejected via effective-tool check
  4. allow-list closure is tested against a broader bundle inventory with dangerous `bundle-mcp` tools (e.g. `bundle-mcp__admin_rotate_token`, `bundle-mcp__opzava_tasks_archive`) and asserts none enter `effective` when not explicitly allowed.
  5. subagents inherit `skills: []` through `agents.defaults.skills` by deriving a child config from parent+defaults.

## Exact-allow recipe under test

`config/agent.coding-exact.jsonc` encodes:

- `agents.defaults.skills: []` (fail-closed inheritance sink),
- top-level `agents.list[0].tools.profile: "coding"`,
- exact keep-only `allow` list (fixed tool ids, no wildcard expansion),
- explicit deny list (deny-wins),
- `tools.fs.workspaceOnly: true`.

## Mapping to live implementation surfaces

- Policy shape maps to `apps/workers/src/provisioning/ask-admin-agent.ts` tool policy direction:
  - `tools.profile` migration from minimal to coding,
  - deny list and exact `allow` control,
  - `agents.defaults.skills: []`.
- Contract expectations map to the research sources:
  - wf212 tool inventory and policy sequence (`wf212`)
  - v1 skill membership and non-authority scope (`wf221`)

## Scope

This is a throwaway local prototype only. It is intentionally isolated in `prototypes/wf219-skills/`.

## Prototype limitations (throwaway)

- The no-authority and body-tool checks are lexical heuristics over `SKILL.md` text, not a semantic proof.
- The true fail-closed guard for tool control is the server-side tool policy (`profile: coding`, exact `allow`, explicit `deny`, and `fs.workspaceOnly`), which this harness only simulates.
- A frontmatter regression that drops a body-required tool is only detected for literal tool identifiers currently known to this harness.

Out of scope:

- live gateway proof,
- real skill install via shared volume / `skills.upload`,
- subagent runtime execution,
- network calls or dependency installs.

## Run

```sh
node prototypes/wf219-skills/demo.mjs
```

Expected output includes `SCENARIO_SUMMARY=PASS` and S1-S5 assertions with zero failures.
