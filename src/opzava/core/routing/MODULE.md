# core/routing — strength-based worker assignment

**Purpose.** The pure matcher that picks the best-fit agent for a unit of work (ARD 0026 M3 / Q2) — formalizing the inherited keyword-substring scoring (`scoreAgentForTask`/`ROLE_AFFINITY`, task-dispatch.ts) into a declared, testable Engine-B primitive. The orchestrator's hydration uses it to assign each dispatch Step to an agent (→ that agent's model).

**Public surface:**
- `assignWorker(text, agents) → Assignment | null` — highest-scoring agent wins; ties → first; `null` only for an empty fleet.
- `scoreAgent(agent, text) → number` — role-affinity keywords (+10) + declared-capability matches (+15).
- `AgentCapability` — `{ name, role, capabilities[], model }`.

**Invariants:**
1. **Pure `core/`** — no DB/platform; the interface is the test surface.
2. **Specialization only.** This decides *which agent fits*; it never touches *capacity* (`AccountCapacity` — which account has headroom). Those are the two independent layers of ARD 0026 §1 — keep them apart.
3. A declared capability outscores a bare role keyword (the explicit signal wins).

**Editor guardrails:** `ROLE_AFFINITY` is data, not branching logic. Capacity/account resolution belongs to the spine + AccountRouting, never here.

**Status:** built + tested (`assign-worker.test.ts`, 5 behaviors); wired into `platform/orchestrator` hydration so dispatch steps run on their matched agent's model.
