# 0123: Agent Role Repository

## Problem
The Team Dashboard and future operator-editing tools need a durable, queryable store for the AI-agent roster. The `AgentRole` contract and `DEFAULT_AGENT_ROLES` seed data exist, but there is no persistence layer. A repository is needed that can load, filter, and upsert agent roles while enforcing validation on every I/O boundary.

## Approach
A SQLite repository following the established factory-over-closure idiom used by campaign, approval, and artifact stores. `createAgentRoleRepository(db)` accepts a `better-sqlite3` Database instance, returns a frozen object of closures, and prepares statements only after `ensureSchema()` runs. A single `CREATE TABLE IF NOT EXISTS opzava_agent_roles` with a `record_json` column keeps the schema minimal. `seedDefaults()` loads the default roster on first run and is idempotent thereafter.

## Contract
`createAgentRoleRepository(db)` returns:

| Closure | Signature | Notes |
|---|---|---|
| `ensureSchema` | `() → void` | Creates table if absent. |
| `saveAgentRole` | `(role) → void` | Validates via `parseAgentRole`, then upserts by `agentId`. |
| `getAgentRoleById` | `(agentId) → AgentRole \| null` | Validates on read; returns `null` for unknown ids. |
| `listAgentRoles` | `({department?, status?}) → AgentRole[]` | Ordered by `department` then `agentId`; filters are optional. |
| `seedDefaults` | `() → number` | Inserts full default roster; returns count of rows inserted (0 if already seeded). |

## Validation
~7 tests against a real in-memory `better-sqlite3` database:

1. **Save + get round-trip** — persisted role is retrieved; unknown id returns `null`.
2. **Upsert by agentId** — second save with same id replaces the row.
3. **listAgentRoles ordering** — results sorted by `department`, then `agentId`.
4. **Department filter** — only matching roles returned.
5. **Status filter** — only matching roles returned.
6. **seedDefaults** — inserts the full default roster and returns its count.
7. **seedDefaults idempotency** — second call returns `0`; no row change.
8. *(bonus)* After seeding, `email-specialist` exists and owns `campaign-send`.

## Security & Audit
No secret values, private credentials, tokens live on agent-role rows — only ids, names, departments, status, owned step ids, and responsibilities. Validating on read as well as write means a tampered roster row fails closed. `seedDefaults` never overwrites an operator-edited roster, preserving manual overrides across restarts.

## Next Case Study Thread
A `GET /api/team/agents` route that calls `seedDefaults()` then returns the roster grouped by department as JSON. This powers an Opus Team Dashboard rendering department sections of agent cards — the first visible surface of the virtual company.
