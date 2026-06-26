# core/routing — strength-based worker assignment

**Purpose.** The pure matcher that picks the best-fit agent for a unit of work (ARD 0026 M3 / Q2) — formalizing the inherited keyword-substring scoring (`scoreAgentForTask`/`ROLE_AFFINITY`, task-dispatch.ts) into a declared, testable Engine-B primitive. The orchestrator's hydration uses it to assign each dispatch Step to an agent (→ that agent's model).

**Public surface:**
- `assignWorker(text, agents) → Assignment | null` — highest-scoring agent wins; ties → first; `null` only for an empty fleet.
- `scoreAgent(agent, text) → number` — role-affinity keywords (+10) + declared-capability matches (+15).
- `AgentCapability` — `{ name, role, capabilities[], model }`.
- `availability/` (S3) — the **third routing dimension** (independent of specialization + capacity): `resolveAvailability(request, ladder, liveState, predicates?) → AvailabilityOutcome` walks an operator config-ladder over injected live state → `assigned{rung}` | `halt` (frontier exhausted — never downgrade) | `queue` (worker exhausted); `STANDARD_PREDICATES` (auth/gateway/headroom/notOutage; `degraded` passes); `validateLadderConfig` (config-save). Pure; supersedes the `model-config.ts *_FALLBACKS` chains as data.

**Invariants:**
1. **Pure `core/`** — no DB/platform; the interface is the test surface.
2. **Three independent, composed dimensions** (ARD 0026 §1 / GP3): **specialization** (`assignWorker` — which agent fits), **capacity** (`AccountCapacity` — which account has headroom), **availability** (`availability/` — which account is live + the fallback ladder). They compose at the call site; never fuse them. The frontier terminus (`halt`) and worker terminus (`queue`) are derived invariants, never operator-configurable.
3. A declared capability outscores a bare role keyword (the explicit signal wins).

**Editor guardrails:** `ROLE_AFFINITY` is data, not branching logic. Capacity/account resolution belongs to the spine + AccountRouting, never here.

**Status:** `assignWorker` (`assign-worker.test.ts`, 5) + `availability/resolveAvailability` + `validateLadderConfig` (`availability/resolve.test.ts`, 12, S3) built + tested. `assignWorker` is wired into `platform/orchestrator` hydration; the availability resolver's impure gatherer (`makeAvailabilityResolver` over `provider-subscriptions`/`sessions`/`AccountCapacity`) + the ladder-config seed are the follow-on composition (deferred, like the AdminConfig sources).
