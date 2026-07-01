---
name: opzava-conventions
description: The load-bearing Opzava invariants EVERY implementation slice must honor — tenant RLS withTenant wrapper, two-token boundary, projections-are-a-cache, tool-policy-first, agnostic ports, and local↔Dokploy parity. Use on ALL Opzava build work.
---

# opzava-conventions

Read `CLAUDE.md` + `docs/plan/EXECUTION.md` + `ARCHITECTURE.md` first. These are the non-negotiable invariants distilled from the
15 ADRs — violating one is a **bug even if tests pass**.

## Tenant isolation (ADR-007)
- Every tenant-table access goes through a single **`withTenant(org, fn)` transaction** wrapper that issues `SET LOCAL app.current_org`. **Postgres RLS** is the fail-closed backstop. **PgBouncer in transaction pooling mode** (session pooling breaks `SET LOCAL`).
- An authz denial is a **hard 403**, NEVER a silent 200-with-empty. Integration tests assert 403.

## OpenClaw boundary (ADR-003)
- The **gateway-broker is the ONLY ACL** to OpenClaw; no OpenClaw type leaks into the core domain. **Two-token:** hot-path broker (`operator.write`+`operator.approvals`) vs JIT admin provisioning (`operator.admin`, worker-only). Broker never provisions; worker never on the hot path.

## Data (ADR-004)
- **Postgres is the source of truth.** Projections are a **rebuildable cache** — RPC snapshots are truth, WS events are hints. Command path is **write-through**. Transactional **outbox → LISTEN/NOTIFY → Redis → WS**; projectors idempotent (natural key + stateVersion).
- `pm.Card` (Opzava) vs OpenClaw Workboard card are **separate aggregates** bridged by `AgentDispatch` with **opaque refs — never a foreign key**.

## Security & agents (ADR-005, ADR-008)
- **Tool-policy-first:** governance is enforced at tool policy + approval rows, not persona files — *"SOUL can lie; tool policy cannot."* Standard agents run `sandbox.mode: off` + deny `group:runtime` + FS-mutating; allow chat/memory/wiki/web(egress-allowlisted)/messaging/sessions. **No per-project sandbox.** `web_fetch` egress allowlist + sanitize RAG/web input.
- Autonomy tiers: `T1_DRAFT` (Finance/CRM), `T2_SEND_ON_BEHALF` (Marketing/Support), `T3_PROACTIVE` (non-mutating only). Agents act **on behalf of**, never impersonate.

## Knowledge (ADR-010) & ports (ADR-001)
- Knowledge scoping: **employee=workspace, project=shared-corpus, org=corpus**; Opzava owns the KB source, OpenClaw indexes are rebuildable (OKF).
- Depend on **agnostic ports** (OpenClawGateway, EventBus, GatewayRuntime, Billing, Push, Realtime, Auth, Authorization, KnowledgeIndex/Source, SkillCatalog, SecretsVault, ObjectStore, ErrorCapture, EmbeddingProvider). **No vendor types in the core domain.**

## Deployment (ADR-015)
- Local docker-compose in **parity with Dokploy** (single compose, Traefik labels); **no routable orphan Gateway**.

## References
`ARCHITECTURE.md`, `docs/plan/grilling-decisions.md`, all `docs/adr/*`. Companion skills: `openclaw-broker`, `openclaw-gateway-provisioning`, `better-auth`.
