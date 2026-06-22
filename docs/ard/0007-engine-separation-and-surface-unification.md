# ARD 0007: Engine Separation With Surface Unification

Status: Accepted
Date: 2026-06-21

## Context

Opzava contains **two orchestration engines** that share one SQLite database and one Next.js
process but no orchestration code, status vocabulary, or agent model. This was confirmed by the
code-verified SYSTEM-MAP (`docs/architecture/system-map/`) and is its #1 architectural-parity finding.

| | Engine A — inherited task board | Engine B — opzava workflow engine |
|---|---|---|
| Spine | `tasks` Kanban (status strings), `agents` table | `WorkflowRun → StepRun`, schema-validated `Artifact` |
| Driver | 60s scheduler tick: autoRoute → dispatch → reconcile → Aegis review | durable runner: Job → Attempt → lease → DeadLetter, approval gates |
| Agents | `agents` (`offline\|idle\|busy\|error`), runtime/gateway-coupled | `opzava_agent_roles` (`active\|planned\|paused`), owns workflow step ids |
| Doctrine role | "agents are operators" | "agents are workers" |

The system-map records these as findings **F2** (two unreconciled agent models, no bridge), **F5**
(opzava durable-runner daemon never booted), and **F6** (opzava admin settings unwired). Open question
**Q1** asked whether the engines are meant to converge — which determines whether the duplication is
debt to remove or intentional separation to formalize.

The project doctrine (`docs/plans/opzava-start-plan.md`) constrains the answer two ways at once:
- "Keep **one dashboard, one source of truth, one workflow model, one audit trail**, and one deployment path."
- "The generic upstream Mission Control task model **must not become** the Opzava artifact model."
- "Agents are workers, not the brain… **structured database artifacts are the source of truth**."

These reconcile only if "one workflow model" means *the opzava one*, while the inherited task model is
explicitly kept out of the product's source-of-truth path.

## Decision

**Do not converge the engines. Converge the surfaces.**

1. **The opzava workflow/artifact engine (Engine B) is the canonical product engine and the single
   source of truth.** Workflows, steps, artifacts, approvals, costs, and audit events are authoritative
   in the opzava namespace.

2. **The inherited task board (Engine A) is preserved as an operator / ops console — not a second
   product workflow engine.** It tracks human/operator tasks and agent-session operations. It must not
   be promoted into, or treated as, the product's workflow or artifact model.

3. **Cross-cutting *surfaces* are unified onto the opzava side**, not merged at the engine level:
   - **One audit trail / one cost surface:** Engine A's audit and cost data are projected into the
     opzava read models (one dashboard reads one source). No new parallel source of truth is added.
   - **One dashboard:** the operator UI presents both, but reads workflow/artifact/cost/audit truth
     from the opzava read models.

4. **The two agent models are bridged, not merged.** `opzava_agent_roles` is the org-chart / role
   identity (the product's view of "who"); inherited `agents` is runtime operator/session state. A
   defined **one-way mapping** (role → runtime identity) is the integration point. There is no schema
   merge and no shared status vocabulary.

This is "separate engines, unified surfaces."

## Rationale

- **Honours the doctrine on both axes:** keeps "one workflow model / one source of truth / one audit
  trail" (the opzava engine and its read models) while respecting "the generic task model must not
  become the artifact model" (no merge).
- **Minimises entropy risk** — the project explicitly treats complexity and entropy as product risks. A
  full merge is a large, cross-cutting migration with high regression surface; surface-unification is
  incremental and reversible.
- **Preserves the inherited base** as CLAUDE.md intends ("the inherited dashboard/operators layer is
  preserved"), without letting it dictate the product's core model.

## Consequences (remediation scoping)

This decision sets the scope of the related findings in
[`91-remediation-plan.md`](../architecture/system-map/91-remediation-plan.md):

- **F2 (two agent models):** scope is **"define the boundary + a one-way role→runtime mapping"**, *not*
  a schema migration to a single agents table. The duplication is now **intentional**, documented here.
- **F5 (runner daemon never booted):** proceed — boot the **opzava** durable-runner daemon as a
  background loop. It runs beside, not merged with, the inherited 60s scheduler. The two timers coexist.
- **F6 (admin settings unwired):** proceed — wire **opzava** admin settings + runtime loader and enforce
  provider rate/cost limits. This is opzava-side config; it does not reach into Engine A.
- **Cost/audit unification** becomes a tracked follow-up: project Engine A cost/audit into the opzava
  read models so the dashboard has one source. (New work item, not one of F1–F12; record when scheduled.)

## Alternatives considered

- **Full convergence (one engine).** Rejected: contradicts "the generic task model must not become the
  artifact model," and the migration's entropy/regression cost is exactly the risk the project guards
  against.
- **Stay fully independent, no integration.** Rejected: leaves two cost surfaces and two audit trails,
  violating "one source of truth / one audit trail / one dashboard."

## References

- SYSTEM-MAP findings F2, F5, F6 and open question Q1:
  `docs/architecture/system-map/90-parity-findings.md`, `…/99-verification-register.md`.
- Doctrine: `docs/plans/opzava-start-plan.md`, `docs/golden-principles.md`, `CLAUDE.md`, `CONTEXT.md`.
- Remediation sequencing: `docs/architecture/system-map/91-remediation-plan.md` (Phase 3).
