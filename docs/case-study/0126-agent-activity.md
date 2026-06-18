# 0126: Agent Activity

## Problem
Opzava's Team Dashboard needs to show each agent's output. We must attribute persisted content artifacts to the agent that produced them, based on the workflow steps each role owns.

## Approach
A read-only scout confirmed the reliable join is `artifactType`. Owned step IDs equal the produced `artifactType` for every producing step **except** `fact-check` (artifact type `fact-check-report`). Steps `idea-intake`, `human-approval`, `wordpress-draft`, and `campaign-send` produce no content artifact. The slice maps each step to its `artifactType` — identity plus one real remap — rather than fabricating an unreliable step→event join.

## Contract

```ts
stepToArtifactType(stepId: string): string
// Identity map; remaps "fact-check" → "fact-check-report"

summarizeAgentActivity(db: Database, roles: AgentRole[]): AgentActivity[]
// Returns [{ agentId, artifactCount }]
// Lists persisted artifacts once, then for each role counts those
// whose artifactType is in the set produced by its owned steps.
```

## Validation
~6 tests against a real in-memory `better-sqlite3` DB + `DEFAULT_AGENT_ROLES`:

1. `stepToArtifactType` remaps `fact-check` → `fact-check-report` and is identity otherwise.
2. One activity entry per role.
3. **Copywriter** counts `outline` + `article-draft` artifacts (not `seo-brief`).
4. **Fact-checker** counts via the `fact-check-report` remap.
5. Agents whose steps produce no artifact (**email-specialist**, **managing-editor**, **general-va**) return `0`.
6. **Seo-specialist** counts `keyword-research` + `seo-brief`.

## Security & Audit
No secret values, private credentials, tokens are read by this attribution — it counts artifact rows by type only and never inspects content; it adds no authority, only a tally of who produced what.

## Next Case Study Thread
Surface per-agent activity on the Team Dashboard agent cards (via the agents route + a codex-spark card update reviewed by Opus), then department project views and agent enable/pause.
