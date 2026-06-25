# core/triage — decompose-vs-direct triage

**Purpose.** Decide whether a Card needs **decomposition** (→ the `MainOrchestrator` plans it as a graph) or flows through plain **direct dispatch** (ARD 0026 H3). This is the decision *upstream* of the orchestrator — so "halt-orchestration-only" degradation has a well-defined, **frontier-independent** set of simple cards (the unflagged ones keep flowing when the frontier model is down).

**Public surface:** `needsDecomposition(input) → boolean` (`triage.ts`). `input = { title, description?, estimatedHours?, override? }`.

**Invariants:**
1. **Pure `core/`** — deterministic; the interface is the test surface.
2. **Operator override wins.** An explicit `override` boolean is returned as-is.
3. **Never the frontier model.** The signal is the operator or this cheap heuristic — never the orchestrator's frontier model (that would be circular: needing the orchestrator to decide whether to invoke it). An economy-tier *model* classifier is a future enhancement, not v1.
4. **Conservative default: do NOT decompose.** Decomposition costs a frontier proposal + multi-step run; a simple card takes the cheaper direct path unless a multi-step signal (phrasing / big hours / long description) fires.

**Status:** built + tested (`triage.test.ts`, 5 behaviors). The consumer (route flagged cards to `runDecomposition`, unflagged to autoRoute) lands with the scheduler/dispatch integration.
