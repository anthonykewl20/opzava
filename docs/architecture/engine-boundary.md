# Engine Boundary

Opzava runs **two orchestration engines** in one SQLite database and one Next.js process.
They share infrastructure but no orchestration code, status vocabulary, or agent model.
Per [ARD 0007](../ard/0007-engine-separation-and-surface-unification.md) (system-map
finding **F2**), the engines stay **separate** behind a **one-way bridge**. This is an
intentional design, not debt to be merged away. This doc defines the boundary and the rule
the governance gate enforces.

## The two engines

| | Engine A — inherited operator console | Engine B — opzava product engine |
|---|---|---|
| Spine | `tasks` Kanban + `agents` table | `WorkflowRun -> StepRun`, schema-validated `Artifact` |
| Code | `src/lib/**` (incl. `agent-*.ts`, `scheduler.ts`, `task-dispatch.ts`) | `src/opzava/modules/team/**` (and the wider opzava namespace) |
| Agents | `agents` (`offline\|idle\|busy\|error`) — runtime/gateway-coupled | `opzava_agent_roles` (`active\|planned\|paused`) — org-chart roles |
| Role | "agents are operators" — runtime/session state | "agents are workers" — canonical source of truth |

Engine B is the **canonical product engine**. Engine A is preserved as the operator/ops
console; it must not be promoted into the product's workflow or artifact model.

## The one-way bridge: role -> runtime

The two agent models are **bridged, not merged**. The only sanctioned integration is a
**one-way mapping** in a single direction:

```
opzava role (opzava_agent_roles)  -->  inherited runtime identity (agents)
        Engine B (who)                          Engine A (how it runs)
```

`opzava_agent_roles` is the product's view of *who* (org chart / role identity). The
inherited `agents` table is runtime operator/session state. A role may resolve to a runtime
identity; runtime state never flows back up to define a role. There is no schema merge and
no shared status vocabulary.

## What each side owns

- **Engine B (`src/opzava/modules/team/**`)** owns `opzava_agent_roles` and all role/org-chart
  logic. It must not import from `src/lib/**` and must not touch the inherited `agents` table.
- **Engine A (`src/lib/**`)** owns the `agents` table and the inherited scheduler/dispatch. It
  must not import `@/opzava/modules/team` and must not touch `opzava_agent_roles`. It stays
  *below* the bridge — unaware of the product engine.

## The rule the gate enforces

`test/engine-boundary.test.mjs` (run via `pnpm test:governance`) statically scans source text
and fails the build if the boundary erodes:

1. No file under `src/opzava/modules/team/**` imports from `src/lib/` (alias `@/lib` or a
   relative path into `lib/`) or references the inherited `agents` SQL table (a standalone
   `agents` token after `FROM`/`INTO`/`UPDATE`/`JOIN`, case-insensitive). It must use
   `opzava_agent_roles`.
2. No file under `src/lib/**` imports `@/opzava/modules/team` (or the relative equivalent) or
   references `opzava_agent_roles`.

The `agents`-table check is intentionally narrow (SQL clause position + word boundary) so the
common word "agents" and the substring inside `opzava_agent_roles` never produce false
positives.

## Deferred future work

ARD 0007 also calls for **unifying cross-cutting surfaces** by projecting Engine A's cost and
audit data into the opzava read models (one dashboard, one source of truth). That projection
work is **out of scope here and deferred** — this change only formalizes and guards the
boundary; it does not build the cost/audit read-model bridge.
