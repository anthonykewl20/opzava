# ADR-001: Monorepo, DDD module structure, and locked stack

Status: Accepted

> **Current-context note (2026-08-14):** The `ARCHITECTURE.md` ports table is the as-built ports/packages record of truth; unbuilt context packages are owned by their own ADRs, and `EventBusPort` was deleted per #160.

> Current-context note (2026-07-15): CRM references in this retained decision mean the deferred CRM rebuild, which returns only with the future user-side dashboard (GitHub issue #200).

Opzava will be built as a pnpm/turborepo monorepo with a Next.js App Router BFF, a separate `gateway-broker` service, background workers, and one TypeScript domain module per bounded context. The stack is locked to Next.js App Router, TypeScript, Postgres, Drizzle, shadcn/ui, Tailwind, pnpm, and turborepo so the product can start with scale-ready modular DDD, keep OpenClaw behind an anti-corruption layer, and avoid an MVP rewrite.

## Context

Opzava is an AI-staffed company-in-a-box: a custom web UI for OpenClaw that combines project management, CRM, marketing, finance, customer support, internal chat, and AI employee workflows. The governing principles are scale-ready modular DDD from day one, vendor-neutral core domain ports, sad-path-first design, OpenClaw capability parity by harnessing rather than reinventing runtime features, and lean VPS operations.

The locked root architecture is a dedicated Opzava application backend with its own durable multi-tenant Postgres database. The OpenClaw Gateway is a private backend-only AI-runtime dependency, not a client-facing API and not the system of record for users, roles, workspaces, projects, CRM records, approvals, audit, or product workflows.

The foundational decisions that depend on this record are ADR-002 through ADR-014: tenancy and gateway provisioning, the broker ACL and two-token model, hybrid CQRS and outbox, tool-policy-first security, auth, RBAC/RLS, AI Workforce, realtime/chat/push, knowledge management, CRM/external channels, department workflows, incident pipeline, and billing.

## Decision

Use a TypeScript monorepo managed by `pnpm` workspaces and `turborepo`.

- `apps/web` is the only browser-facing product app. It uses Next.js App Router, server components/server actions where appropriate, route handlers for BFF APIs, shadcn/ui, and Tailwind.
- `apps/gateway-broker` is a separate long-lived Node service. It owns the OpenClaw anti-corruption layer, tenant-to-Gateway routing, scoped runtime RPC, gateway WebSocket pools, live stream relay, and broker-owned realtime fan-out surfaces delegated by later ADRs.
- `apps/workers` owns background processing: projection rebuilds, outbox dispatch, provisioning jobs, usage polling, billing sync, scheduled reports, deadletter recovery, and other non-request work.
- `packages/shared-kernel` contains only stable cross-context value objects and primitives such as `TenantId`, `ProjectId`, `UserId`, `AgentEmployeeId`, `Money`, `EmailAddress`, `OpaqueExternalRef`, time abstractions, and domain error/result types.
- `packages/ports` defines provider-agnostic application ports. Domain packages depend on ports, never concrete adapters.
- Each Opzava bounded context is a separate package with its own domain model, application services, events, repository interfaces, and local Drizzle schema/migrations where it owns Postgres tables.
- Infrastructure adapters are composition-root dependencies, not domain dependencies. Apps wire ports to adapters.
- OpenClaw-owned concepts are represented inside Opzava only as opaque value objects or projections. OpenClaw Gateway types must not leak past the `gateway-broker` ACL.

Lock Drizzle as the Postgres toolkit instead of Prisma. Drizzle keeps schemas in TypeScript, stays close to SQL, supports explicit migrations and Postgres-native features, and fits the required tenant-scoped repositories, RLS policies, transactional outbox, advisory locks, projections, and hand-tuned queries. Prisma is rejected for the foundation because a central Prisma schema/client would pull bounded contexts toward a shared data model and adds abstraction around SQL exactly where Opzava needs precise Postgres control.

## Module/folder tree

```text
apps/
  web/
    app/
    components/
    features/
    lib/composition/
  gateway-broker/
    src/
      acl/openclaw/
      routing/
      realtime/
      rpc/
  workers/
    src/
      jobs/
      projections/
      provisioning/
      schedules/
packages/
  shared-kernel/
    src/
      ids/
      money/
      refs/
      result/
      time/
  ports/
    src/
      auth.ts
      authorization.ts
      billing.ts
      embedding-provider.ts
      error-capture.ts
      event-bus.ts
      gateway-runtime.ts
      knowledge-index.ts
      object-store.ts
      openclaw-gateway.ts
      push.ts
      realtime.ts
      secrets-vault.ts
  adapters/
    src/
      billing-stripe/
      error-capture-built-in/
      event-bus-postgres/
      gateway-runtime-docker/
      knowledge-index-openclaw/
      object-store-s3/
      openclaw-gateway-broker-client/
      postgres/
      push-web/
      realtime-ws-redis/
      secrets-vault/
  identity-access/
    src/{domain,application,events,ports,adapters/postgres}
  tenant-provisioning/
    src/{domain,application,events,ports,adapters/postgres}
  platform-ops/
    src/{domain,application,events,ports,adapters/postgres}
  project-management/
    src/{domain,application,events,ports,adapters/postgres}
  internal-collaboration/
    src/{domain,application,events,ports,adapters/postgres}
  ai-workforce/
    src/{domain,application,events,ports,adapters/postgres}
  knowledge-management/
    src/{domain,application,events,ports,adapters/postgres}
  crm/
    src/{domain,application,events,ports,adapters/postgres}
  department-workflows/
    src/{domain,application,events,ports,adapters/postgres}
  finance/
    src/{domain,application,events,ports,adapters/postgres}
  notifications-admin-observability/
    src/{domain,application,events,ports,adapters/postgres}
  billing/
    src/{domain,application,events,ports,adapters/postgres}
  external-channels/
    src/{domain,application,events,ports,adapters/postgres}
  runtime-control/
    src/{domain,application,events,ports,adapters/postgres}
```

Bounded-context packages are allowed to expose only application commands/queries, domain events, and stable DTOs. They must not export database tables, Drizzle query builders, OpenClaw DTOs, Stripe DTOs, provider SDK objects, or framework-specific React/Next.js types.

## Ports catalog

| Port | Purpose | Initial adapter |
| --- | --- | --- |
| `OpenClawGatewayPort` | Runtime RPC to OpenClaw capabilities through the ACL, including sessions, streams, tasks, channels, logs, diagnostics, usage, cron, approvals, skills, memory, and Workboard projections. | `gateway-broker` OpenClaw client |
| `EventBusPort` | Domain events, outbox dispatch, projection notifications, and future broker swaps without changing domain code. | Postgres outbox + `LISTEN/NOTIFY` |
| `GatewayRuntimePort` | Provision, start, stop, health-check, suspend, resume, and deprovision per-tenant Gateway instances. | Rootless Docker runtime |
| `BillingPort` | Subscription, plan, metered usage, invoice, dunning, and entitlement integration. | Stripe |
| `PushNotificationPort` | Background notifications for mentions, approvals, assignments, assistant completions, and alerts. | Web Push with VAPID |
| `RealtimeTransportPort` | Online fan-out for chat, activity, agent streaming, presence, typing, and notifications. | WebSocket hub + Redis backplane |
| `AuthPort` | Authentication, sessions, MFA/passkeys, invitations, password reset, and session revocation. | Better Auth |
| `AuthorizationPort` | Fine-grained resource authorization, roles-as-data, tenant/project grants, and external guest checks. | Opzava policy evaluator + Postgres |
| `KnowledgeIndexPort` | Search and retrieval against derived project/org/employee knowledge indexes. | OpenClaw wiki + memory-lancedb over OKF |
| `KnowledgeSourcePort` | Opzava-owned source-of-truth for KB documents, notes, and uploads that the derived indexes are (re)built from. | Postgres + `ObjectStorePort` |
| `SkillCatalogPort` | Admin-curated catalog of installable OpenClaw skills, provisioned only via the admin/provisioning context. | Opzava catalog + provisioning worker |
| `SecretsVaultPort` | Storage and retrieval of broker device tokens, provider references, and other secret handles without exposing raw secrets to domain code. | Environment/vault-backed secret references |
| `ObjectStorePort` | Durable source files, KB documents, report artifacts, uploads, and generated assets. | S3-compatible object store |
| `ErrorCapturePort` | Application, broker, worker, and ACL error capture with grouping hooks. | Built-in incident ingestion, GlitchTip-compatible later |
| `EmbeddingProviderPort` | Embeddings for knowledge ingestion and search without coupling to a model provider. | OpenClaw/provider adapter |

Ports are named by capability, not vendor. A port can move from a lean first adapter to Redis, NATS, Kafka, K8s, Nomad, native APNs/FCM, GlitchTip, or another provider without changing the owning bounded-context model.

## Consequences

This creates strong module boundaries before feature work starts. New product work must first identify the owning bounded context and then add behavior inside that package; cross-context collaboration uses domain events, application services, or ports.

The web app remains a BFF and UI composition layer. It may orchestrate use cases, but it must not become the domain model or own provider SDK calls directly.

The `gateway-broker` becomes a load-bearing boundary. All OpenClaw integration complexity, protocol drift, opaque refs, streaming, and runtime failure handling is concentrated there and expanded by ADR-003, ADR-004, ADR-008, ADR-009, ADR-010, ADR-011, ADR-012, and ADR-013.

Drizzle requires more explicit repository and migration discipline than a higher-level ORM. The benefit is precise Postgres control for RLS, outbox, tenant transaction wrappers, advisory locks, projections, and hand-written sad-path queries.

Shared code is intentionally constrained. `shared-kernel` must stay small; if it starts accumulating business rules, that is a boundary smell and the rule must move back to an owning context.

## Alternatives

Use a single Next.js app with folders for all domains. Rejected because it would make the first implementation faster but would violate the no-MVP-then-rewrite directive and blur ownership across Identity & Access, Project Management, CRM, AI Workforce, Billing, and Platform-Ops.

Use separate repositories per service/package. Rejected because Opzava is still one product with tightly coordinated contracts, migrations, and UI/domain changes. A monorepo gives atomic changes while preserving package boundaries.

Expose OpenClaw directly to the web app. Rejected because OpenClaw is a single-operator-domain runtime dependency, not Opzava's multi-tenant authorization boundary or data-of-record store.

Use Prisma instead of Drizzle. Rejected for the foundation because Opzava's hardest early problems are tenant isolation, RLS, projections, outbox, and explicit SQL behavior across bounded contexts. Prisma remains an escape hatch only if a future ADR accepts central schema trade-offs and keeps repositories behind the same ports.

Use managed-first services for realtime, auth, billing, object storage, and eventing. Rejected as the default posture because the core domain must stay agnostic and lean-VPS friendly. Managed adapters can be introduced behind ports when a concrete operational need justifies them.

## Related ADRs

- ADR-002: Pure-B tenancy, `GatewayRuntimePort`, and provisioning saga contract.
- ADR-003: `gateway-broker` ACL, two-token model, and WS protocol client.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-005: Tool-policy-first security, approval gates, and sandbox posture.
- ADR-006: Better Auth, revocable sessions, MFA/passkeys, and PWA auth.
- ADR-007: Resource RBAC, roles-as-data, and Postgres RLS.
- ADR-008: AI Workforce, delegate agents, personas, and `AgentDispatch`.
- ADR-009: Realtime WS hub, internal chat, assistants-in-chat, PWA/Web Push.
- ADR-010: Knowledge Mgmt SoT, OKF ingestion, memory/wiki/vector indexes, skill catalog.
- ADR-011: CRM, external channel ACL, and contact identity resolution.
- ADR-012: Department workflow engine, approvals, content pipeline, reports.
- ADR-013: Error-to-admin-card incident pipeline and remediation loop.
- ADR-014: Billing, usage metering, plan enforcement, and dunning lifecycle.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
