# 0129: Agent Status Transition

## Problem
Opzava's virtual company model requires operators to pause and re-activate AI agents. Currently, `AgentRole` status is static (`active|planned|paused`). We need a validated state machine to enforce legal transitions, ensuring `active` agents always own at least one step and `planned` agents cannot be toggled.

## Approach
Implement a pure, test-driven state machine. Define a transition map, a guard function, and a transition function that returns a new, frozen, re-validated `AgentRole`. The original object remains immutable.

## Contract
- `AGENT_STATUS_TRANSITIONS`: `{ active: ['paused'], paused: ['active'], planned: [] }`
- `canTransitionAgentStatus(from, to)`: Returns `true` if `to` is in `AGENT_STATUS_TRANSITIONS[from]`.
- `transitionAgentStatus(role, to)`: Throws on illegal move. Otherwise, returns a new frozen `AgentRole` with updated status, re-validated via `parseAgentRole`.

## Validation
Six core tests ensure correctness:
1. **Truth Table**: `active<->paused` is valid; `active->active`, `paused->paused`, `planned->*` are invalid.
2. **Active to Paused**: Returns a `paused` role; original `active` role is unchanged (steps preserved).
3. **Paused to Active**: Returns an `active` role.
4. **Illegal Move**: Throws an error.
5. **Planned Toggle**: Throws an error.
6. **Result Integrity**: Output is a frozen, valid `AgentRole`.

## Security & Audit
No secret values, private credentials, tokens are touched by a status change — only the status field moves, through a validated state machine. Pausing an agent changes a label, not authority. The system still owns every workflow gate regardless of an agent's status.

## Next Case Study Thread
The next slice: a `PATCH /api/team/agents/[id]` route that loads an agent, applies `transitionAgentStatus` (returning 404 for missing, 409 for illegal), and saves it. Followed by a Pause/Activate button on the dashboard agent cards.
