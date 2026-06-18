# 0147: Agent Profiles

## Problem
Opzava's twelve AI agents had functional roles but no personal identity. The Team Dashboard displayed department and status, but agents were indistinguishable — no names, no avatars, no sense of purpose. Users couldn't form a mental model of who was on the team.

## Approach
Introduce `AgentProfile` as a lightweight identity layer atop existing `AgentRole` data. Each profile adds a human-readable display name, an avatar emoji, a short charter (the agent's mission or "soul"), and a preferred model. A `DEFAULT_AGENT_PROFILES` map pre-populates all twelve agents so the dashboard can render a staff directory immediately.

## Contract
```typescript
interface AgentProfile {
  schemaVersion: 1;
  agentId: string;
  displayName: string;
  avatarEmoji: string;
  charter: string;          // max 280 chars
  preferredModel: "opus" | "sonnet" | "haiku";
}

parseAgentProfile(input: unknown): AgentProfile;  // throws on invalid
getAgentProfile(agentId: string): AgentProfile | null;
```
`DEFAULT_AGENT_PROFILES` covers every `agentId` in `DEFAULT_AGENT_ROLES`.

## Validation
Six tests ensure correctness:

1. `parseAgentProfile` accepts a valid profile and returns a frozen object.
2. Rejects an empty `displayName`.
3. Rejects an invalid `preferredModel`.
4. Rejects a `charter` exceeding 280 characters.
5. Every default agent role has a corresponding profile; counts match exactly.
6. Every default profile validates and uses an allowed model.
7. `getAgentProfile("copywriter")` returns a profile with name, emoji, and charter.
8. `getAgentProfile("unknown")` returns `null`.

## Security & Audit
No secret values, private credentials, tokens live on an agent profile — only a display name, an emoji, a one-line charter, and a model label. The preferred model is a routing preference, not a credential; profiles add identity, not authority.

## Next Case Study Thread
Surface the profile on each Team Dashboard agent card via the team agents route — render avatar, display name, charter, and a model chip. Then layer per-agent KPIs: last-active timestamp and approval count.
