# platform/orchestrator — fleet coordination (control-plane half)

**Purpose.** Where the `MainOrchestrator`'s proposals are gated + executed by the control plane (ARD 0026). The orchestrator *proposes*; this layer *confirms (deterministically) and executes* — the orchestrator never mutates state directly. Engine B; composes `core/orchestration-policy` (the gate) + `platform/task-state` (the spine + `CardDecomposition`) + `core/workflow-engine`.

**Public surface (so far):**
- `executeDecompose(input, deps) → DecomposeOutcome` (`decompose-service.ts`) — the `decompose` action's confirm→persist flow: builds the `OrchestrationPlanAction`, runs the **gate** (binding `isDecompositionDuplicate` to `CardDecomposition.isDecomposed` — one idempotency source of truth), and only on a pass **persists** the graph (itself idempotent). Returns `decomposed` | `already-decomposed` | `rejected{denials}`. The gate audits every decision.

**Invariants:** the orchestrator proposes, this layer gates+executes (CONTEXT.md line 17). A gate rejection persists nothing. Idempotency is enforced once (the gate check and the persist check read the same `(task_id) WHERE status='active'` index). No external effect happens here — an external-effecting Step mints an `Approval` when it *runs* (later, in execution), not at decompose time.

**Editor guardrails:** Engine B only (no `src/lib` import). Compose `core/` modules; never reach past their interfaces. The interface is the test surface — test with a real `:memory:` db for persistence + in-memory gate deps.

**Status:** `executeDecompose` built + tested (4 behaviors). Pending: the orchestrator's *proposal* logic (`M0`/`M2` — strength-matched graph emission), which is leader-gated (the leader-lock primitive exists in `src/lib/leader-lock.ts`; the scheduler-gating that runs the orchestrator tick on the elected leader is the deferred 2-replica-validation integration).
