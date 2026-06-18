# 0151: Agent Last Active

## Problem
The Team Dashboard displays agent output counts but lacks recency context. Stakeholders cannot distinguish between an agent that produced 10 artifacts last week versus one that produced 10 artifacts six months ago. A "last active" signal is needed to complement the existing `artifactCount`.

## Approach
Reuse the existing `artifactType`-based attribution logic that maps artifact types to agent-owned steps. Switch the summarization source from `listArtifacts` (which requires parsing every `record_json`) to `listArtifactSummaries` (which carries a pre-exposed `createdAt`). For each agent, compute `lastActiveAt` as the newest `createdAt` among artifacts whose type maps to one of the agent's owned steps. The `artifactCount` derivation remains unchanged.

## Contract
```typescript
interface AgentActivity {
  agentId: string;
  artifactCount: number;
  lastActiveAt: string | null; // ISO 8601 timestamp or null when no artifacts exist
}
```
`summarizeAgentActivity(artifactSummaries, roster)` returns one `AgentActivity` per roster entry. The function is pure and deterministic.

## Validation
- **Real DB tests**: In-memory `better-sqlite3` database seeded with the default roster and sample artifacts.
- **Happy path**: A copywriter agent with two artifacts receives `lastActiveAt` equal to the later `createdAt` timestamp.
- **Empty agent**: An agent whose steps produced zero artifacts yields `artifactCount: 0` and `lastActiveAt: null`.
- **Regression**: Existing one-entry-per-role and count assertions remain green.
- **Route stability**: The team route, which reads only `artifactCount`, stays green because `lastActiveAt` is additive.
- **Tooling**: `tsc` and `eslint` pass with zero warnings.

## Security & Audit
No secret values, private credentials, tokens are read for last-active — it derives from artifact type and timestamp columns only, never content. It is a tally and a time, not authority.

## Next Case Study Thread
Surface `lastActiveAt` on the team agents route and render **"last active \<date\>"** on each dashboard agent card, giving operators at-a-glance recency alongside output volume.
