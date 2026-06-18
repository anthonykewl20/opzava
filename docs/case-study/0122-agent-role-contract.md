# 0122: Agent Role Contract

## Problem

Opzava orchestrates AI agents across content and email workflows, but there is no formal contract defining *who* owns *which* step. Without a typed roster, the system cannot surface agent responsibilities on the Team Dashboard, enforce one-agent-per-step ownership, or seed a departmental org chart. A plain "Team Dashboard" was planned, but that framing undersells the need: Opzava is a virtual company, and it needs a staff roster domain model.

## Approach

We introduce `AgentRole` as a first-class Opzava domain, deliberately separate from the base product's generic `Agent` model. This separation lets the **system** own the authoritative role→step mapping rather than leaking orchestration concerns into a shared abstraction. The contract is validated by `parseAgentRole`, and a `DEFAULT_AGENT_ROLES` seed roster maps every real workflow step to a named persona. `groupAgentRolesByDepartment` prepares the roster for dashboard rendering.

## Contract

```ts
interface AgentRole {
  schemaVersion: 1;
  agentId: string;          // kebab-case, e.g. "copywriter"
  name: string;             // display name, e.g. "Copywriter"
  department: string;       // e.g. "Content Marketing"
  status: "active" | "planned" | "paused";
  ownedStepIds: string[];   // workflow step ids this agent executes
  responsibilities: string; // human-readable summary
}
```

`DEFAULT_AGENT_ROLES` maps real steps to personas:

| Persona | Department | Owned Step IDs |
|---|---|---|
| Content Strategist | Content Marketing | `idea-intake` |
| SEO Specialist | Content Marketing | `keyword-research`, `seo-brief` |
| Researcher | Content Marketing | `source-capture` |
| Copywriter | Content Marketing | `outline`, `article-draft` |
| Fact-Checker | Content Marketing | `fact-check` |
| Brand Editor | Content Marketing | `brand-review`, `anti-slop` |
| Managing Editor | Content Marketing | `human-approval` |
| Publisher | Content Marketing | `wordpress-draft` |
| Email Specialist | Email Marketing | `campaign-send` |
| Social Media Manager | Social Media | *(planned — no steps yet)* |
| General VA | General VA | *(planned — no steps yet)* |

## Validation

Eight focused tests cover the contract and seed roster:

1. `parseAgentRole` accepts a valid active agent (snapshot frozen).
2. Rejects an active agent with **no** owned step ids.
3. Accepts a planned agent with zero owned step ids.
4. Rejects a malformed `agentId` (non-kebab).
5. Rejects duplicate entries in `ownedStepIds`.
6. Every entry in `DEFAULT_AGENT_ROLES` passes `parseAgentRole`; spot-checks: Copywriter owns `article-draft`, Email Specialist owns `campaign-send`.
7. `social-media-manager` and `general-va` are `planned` with empty `ownedStepIds`; every `active` agent owns ≥ 1 step.
8. `groupAgentRolesByDepartment` buckets the roster into Content Marketing, Email Marketing, Social Media, and General VA.

## Security & Audit

No secret values, private credentials, tokens live on an agent role — only ids, names, departments, owned step ids, and responsibilities. The roster names **who** owns each step but changes **no** authority: agents remain dumb workers and every gate (sequence, validation, approval, exactly-once, cost, audit) stays system-enforced.

## Next Case Study Thread

An agent-role SQLite repository seeded from `DEFAULT_AGENT_ROLES`, a `GET /api/team/agents` route returning the department-grouped roster, and an Opus Team Dashboard rendering agent cards per department.
