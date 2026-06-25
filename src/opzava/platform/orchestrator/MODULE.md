# platform/orchestrator — fleet coordination (control-plane half)

**Purpose.** Where the `MainOrchestrator`'s proposals are gated + executed by the control plane (ARD 0026). The orchestrator *proposes*; this layer *confirms (deterministically) and executes* — the orchestrator never mutates state directly. Engine B; composes `core/orchestration-policy` (the gate) + `platform/task-state` (the spine + `CardDecomposition`) + `core/workflow-engine`.

**Public surface:**
- `proposeDecomposition(input, deps) → ProposeOutcome` (`propose-decomposition.ts`) — the orchestrator's *brain*: a **frontier model** emits a candidate `WorkflowGraph`. Enforces the **frontier-lock at the proposal site** (refuses a non-frontier model before any call, via `core/model-tier`), then parses + schema-validates the emission. Returns `proposed{graph}` | `rejected{not-frontier|malformed-emission|invalid-graph}`.
- `executeDecompose(input, deps) → DecomposeOutcome` (`decompose-service.ts`) — the confirm→persist flow: runs the **gate** (binding `isDecompositionDuplicate` to `CardDecomposition.isDecomposed` — one idempotency source of truth), and only on a pass **persists** the graph. Returns `decomposed` | `already-decomposed` | `rejected{denials}`.
- `runDecomposition(input, deps) → RunDecompositionOutcome` (`run-decomposition.ts`) — the **full orchestrator flow**: `propose → gate → persist`, surfacing the two distinct rejection layers separately (`proposal-rejected` vs `gate-rejected`). Idempotent end-to-end.

**Invariants:** the orchestrator proposes, this layer gates+executes (CONTEXT.md line 17). A gate rejection persists nothing. Idempotency is enforced once (the gate check and the persist check read the same `(task_id) WHERE status='active'` index). No external effect happens here — an external-effecting Step mints an `Approval` when it *runs* (later, in execution), not at decompose time.

**Editor guardrails:** Engine B only (no `src/lib` import). Compose `core/` modules; never reach past their interfaces. The interface is the test surface — test with a real `:memory:` db for persistence + in-memory gate deps.

**Status:** `executeDecompose` (4) + `proposeDecomposition` (6) + `runDecomposition` (4) built + tested — the orchestrator decomposes a card end-to-end (frontier proposal → gate → persist). Pending: **assign-to-worker** (strength-matched Step→agent via `claimNext` capacity), and the **leader-gating** that runs the orchestrator tick on the elected leader (the lock primitive exists in `src/lib/leader-lock.ts`; the scheduler-gating is the deferred 2-replica-validation integration).
