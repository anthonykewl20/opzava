# core/orchestration-policy — the OrchestrationPolicyGate

**Purpose.** The deterministic gate that **confirms** a `MainOrchestrator` `OrchestrationPlanAction` (ARD 0026 H1) — replacing per-action human approval. It is the *authority* boundary that makes the orchestrator a lead worker, not the brain: the orchestrator may propose any plan, but it cannot cause any effect this gate (+ the unchanged external-action `Approval` boundary) would not allow any worker to cause.

**Public surface** (`gate.ts` + `contracts.ts`):
- `gate(action, policy, deps) → GateVerdict` — pure decision; the only side effect is the injected `auditAction` (called for every verdict). `GateVerdict = {passed:true, idempotent} | {passed:false, denials: GateDenial[]}` with machine-readable `GateDenialCode`s (the orchestrator, an LLM, re-proposes against codes, not prose).
- For `decompose`: idempotency-first, then graph validity (`validateGraph`), shape ∈ {linear, fan-out} (cycle-rejecting, provision 5), step-count cap, registered step-kind, projected-cost budget.

**Invariants (do not regress):**
1. **Pure `core/`** — no platform/modules/src-lib imports. Effects (idempotency lookup, audit) are injected ports, so the gate is fully testable with in-memory fakes (the interface IS the test surface).
2. **Default-safe denials** — every check appends a structured denial; a malformed graph short-circuits to `GRAPH_INVALID`.
3. **The `Approval` boundary is unchanged** — an external-effecting `Step` mints an `Approval` when it *runs*, never at gate time. This gate authorizes the *plan*, not the *external effect*.
4. Frontier-lock guards *competence*; this gate guards *authority* — two independent guarantees.

**Editor guardrails:** keep the checks internal (private), not exposed at the interface (one method, deep implementation). The shape classifier rejects cycles (Kahn's) — arbitrary DAGs wait on the graph core's cycle-detection becoming load-bearing.

**Status:** built + tested (`orchestration-policy.test.ts`, 8 behaviors). Wired into the live decompose flow by `platform/orchestrator/executeDecompose`.
