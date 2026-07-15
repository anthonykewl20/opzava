# Opzava seam map

> **Migration note (2026-07-15):** This is an as-built inventory. Current Task/Issue seams stay documented until migrated; target Dev Board seams are defined by PRD-019, ADR-017, and `docs/plan/dev-board-migration-manifest.md` and are not built yet. Historical #147–#157 planning is superseded as future implementation authority.

This is the canonical map of where every Module Interface lives across the Opzava-owned codebase.
It names the seams, grades them real versus hypothetical versus not-yet-built, and points to the deep per-module documentation behind each one.
Read it alongside [ADR seam constraints](adr-seam-constraints.md), [bounded contexts](bounded-contexts.md), the [ubiquitous-language bridge](ubiquitous-language-bridge.md), and the [Mainframe seam](mainframe-seam.md).

Vocabulary is fixed from codebase-design and used exactly here: Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality (see [README.md](README.md)).
A seam is graded three ways.
REAL seam: two or more concrete Adapters exist today (or are locked by ADR), so something actually varies across it.
HYPOTHETICAL seam: one Adapter today, preserved for swap but not yet exercised by a second implementation.
NOT-YET-A-SEAM: zero Adapters; the Interface is declared ahead of implementation and may move.

## How to read this map

Start at the [port reality table](#port-reality-table) for the agnostic capability seams.
Then read the [layered seam graph](#layered-seam-graph) for how packages depend on each other.
Then read the [three load-bearing seams](#the-three-load-bearing-seams) for the ACL, admin path, and fork.
The [depth heat](#depth-heat) and [seam-placement smells](#seam-placement-smells) sections are the input to the [deepening-opportunities register](DEEPENING-OPPORTUNITIES.md).

## Port reality table

Empirical Adapter counts come from a repo-wide `implements <Name>Port` grep; design intent comes from the ADRs in [adr-seam-constraints.md](adr-seam-constraints.md).
A port is the deepest kind of seam: a small Interface a lot of behavior sits behind, placed so callers depend on capability, not vendor.

| Port | Defined at | Adapters today (grep) | By design (ADR) | Verdict |
| --- | --- | --- | --- | --- |
| `ConnectionsProvisioningPort` | `packages/ports/src/connections-provisioning.ts:239` | 4 (`apps/web/lib/connections.ts` x2, `apps/workers/.../gateway-admin-connections.ts` x2) | real | REAL, the heaviest seam in the codebase |
| `AuthorizationPort` | `packages/ports/src/authorization.ts:59` | 2 (`packages/{project-management,runtime-control}/src/application/authorization.ts`) | real | REAL, shared across two current bounded contexts; CRM is deferred to the future user-side dashboard (GitHub issue #200) |
| `ObjectStorePort` | `packages/ports/src/object-store.ts:59` | 2 (`packages/adapters/src/object-store/{in-memory,s3}-object-store.ts`) | real | REAL |
| `OpenClawAdminRpcPort` | `apps/workers/src/provisioning/openclaw-admin-client.ts:21` (outside `packages/ports`) | 3 (all in `apps/workers`) | real | REAL but misplaced (see smells) |
| `OpenClawGatewayPort` | `packages/ports/src/openclaw-gateway.ts:114` | 1 (`apps/gateway-broker/src/routing/connection-manager.ts`) | real, the only hot-path ACL | HYPOTHETICAL by count; the port itself is shallow today (only `startAssistantStream`, `getEffectiveTools`, `getHealth` are implemented) |
| `AuthPort` | `packages/ports/src/auth.ts:85` | 1 (`packages/identity-access/src/adapters/better-auth/auth-port-adapter.ts`) | real (Better Auth primary, Auth.js v5 fallback per ADR-006; the fallback Adapter was not found by `implements` grep and is unverified) | HYPOTHETICAL today, REAL by design |
| `IssueTrackerPort` | `packages/ports/src/issue-tracker.ts:48` | 1 (`packages/adapters/src/github/issues.ts`) | real | HYPOTHETICAL today |
| `SecretsVaultPort` | `packages/ports/src/secrets-vault.ts:33` | 1 (`packages/adapters/src/secrets/local-file-secrets-vault.ts`) | real | HYPOTHETICAL today |
| `GatewayRuntimePort` | `apps/workers/src/provisioning/gateway-admin-connections.ts` (inside the god-module; definition not matched by `export interface` grep) | 1 (`DockerOpenClawGatewayRuntime`) | real (Docker now, K8s or Nomad later per ADR-002) | HYPOTHETICAL today, misplaced (port and Adapter share one file; see smells) |
| `ErrorCapturePort` | `packages/ports/src/error-capture.ts:21` | 0 class Adapters; used as inline object literals in `apps/web` | real (built-in plus GlitchTip per ADR-013) | NOT-YET-A-SEAM (inline-Adapter smell) |
| `EventBusPort` **(deleted — not in code)** | _was_ `packages/ports/src/event-bus.ts` | 0 | planned (outbox plus projection dispatcher per ADR-004) | DELETED IN #160 — an uninhabited port is a dead feature, not a seam. Any replacement must be designed by PRD-019/ADR-017 and the migration manifest, with the outbox and its first real consumer in the same slice. |
| `RealtimeTransportPort` | `packages/ports/src/realtime-transport.ts:41` | 0 | real (broker hub plus managed per ADR-009) | NOT-YET-A-SEAM |
| `BillingPort` | not yet in `packages/ports` | 0 (null Adapter) | real (Stripe later per ADR-014) | DEFERRED (null Adapter, ships with local entitlements only) |

Two readings of the table matter.
By today's code, only four agnostic ports are real seams (`ConnectionsProvisioning`, `Authorization`, `ObjectStore`, `OpenClawAdminRpc`), and one of those is misplaced.
By ADR intent, almost every agnostic port is a real seam preserved for a planned second Adapter, which is why the codebase pays the cost of the Interface even before the second implementation lands.
The `OpenClawGatewayPort` row is the most important nuance: it is the single load-bearing seam of the whole system (the only hot-path ACL to OpenClaw), yet today its Interface exposes three methods and its single Adapter carries all the real depth, so the depth lives in `apps/gateway-broker` more than in the port.

## Layered seam graph

Dependencies point downward; the graph is acyclic at the port seam.
Each layer may only depend on the layer above it, never below, enforced by the ESLint boundaries config at `packages/config/eslint/base.mjs`.

```
apps/web  (BFF + UI composition)
apps/gateway-broker  (hot-path ACL; OpenClawGatewayPort Adapter)
apps/mcp-server  (hosted MCP tool registry)
apps/workers  (admin/JIT path; provisioning, projections, jobs)
   |
   v  depend on
packages/{identity-access, project-management, runtime-control}  (current bounded contexts; CRM deferred to the future user-side dashboard)
packages/adapters  (concrete vendor Adapters behind ports)
   |
   v  depend on
packages/ports  (agnostic capability Interfaces)
   |
   v  depends on
packages/shared-kernel  (Result, DomainError, branded ids, Money, refs, Clock)
```

The shared kernel is the blast-radius center: `packages/shared-kernel/src/result/index.ts` (`Result`, `DomainError`, `ok`, `err`) is imported by almost every other Module, so a change there touches the whole codebase.
The ports layer is the anti-corruption spine: bounded contexts and apps depend on `packages/ports` Interfaces, never on OpenClaw DTOs, provider SDKs, or Drizzle builders (ADR-001, ADR-003).
`apps/web` honors this: the inventory found no `mainframe/` import and no vendor OpenClaw SDK type leak, with OpenClaw names reaching web only through `packages/ports`.

## The three load-bearing seams

These three seams are load-bearing and locked by ADR; deepening proposals must not weaken them (see [adr-seam-constraints.md](adr-seam-constraints.md)).

### 1. The gateway-broker ACL (hot path)

`apps/gateway-broker` is the only production path from any Opzava caller to OpenClaw (ADR-003).
The Interface is `OpenClawGatewayPort` at `packages/ports/src/openclaw-gateway.ts:114`; the single Adapter is `GatewayConnectionManager` at `apps/gateway-broker/src/routing/connection-manager.ts`.
Behind the seam, in `apps/gateway-broker/src/acl/openclaw/operator-client.ts`, sit protocol drift handling, method and frame translation, tenant-to-Gateway routing, the WS operator client lifecycle, per-tenant circuit breakers, idempotency, opaque-ref mapping, and scope negotiation.
The hot-path device token carries only `operator.write` plus `operator.approvals`.
Routing is tenant-derived, not caller-supplied: one broker connection maps to exactly one tenant Gateway.

### 2. The provisioning-worker admin path (admin/JIT)

`apps/workers` is the admin and just-in-time path, distinct from the broker hot path (ADR-003, ADR-002, ADR-015).
It holds three real seams: `ConnectionsProvisioningPort` (4 Adapters), `OpenClawAdminRpcPort` (3 Adapters, defined in-worker), and `GatewayRuntimePort` (1 Adapter, the only Docker mutation surface).
The short-lived JIT `operator.admin` credential lives here, separate from the hot-path device token.
Docker mutation reaches the host only through the mutation-scoped `tecnativa/docker-socket-proxy`, and only `worker-provisioning` may reach it; the broker never mounts Docker (ADR-015).

### 3. The Mainframe fork (Docker image)

`mainframe/` is the Opzava-owned tracked fork of OpenClaw (ADR-016).
The seam is the Docker image boundary, not a code import: `mainframe/` is its own pnpm workspace, excluded from the Opzava workspace, and the Platform Gateway image is built from `./mainframe`.
Every change lands on the lowest rung of the customization ladder that can express it: Rung 0 config, Rung 1 extension points, Rung 2 additive `extensions/opzava-*` modules, Rung 3 logged source patches in `mainframe/PATCHES.md`.
Today only Rung 0 and one Rung 3 Dockerfile patch are logged; Rung 2 is aspirational.
Owning Mainframe grants no bypass of the broker ACL or the two-token model.
See [mainframe-seam.md](mainframe-seam.md).

## Depth heat

Deep Modules (small Interface, lots of behavior behind it) are the load-bearing anchors.
Shallow Modules (Interface nearly as complex as Implementation) are deepening candidates or intentional thin glue.

Deep anchors:

- `apps/gateway-broker/src/acl/openclaw/operator-client.ts`, the broker replay and idempotency engine, is the deepest runtime Module.
- `apps/workers/src/provisioning/gateway-admin-connections.ts` (about 4633 lines) is the largest single Module and mixes Docker runtime control, provisioning orchestration, config mutation, and fallback behavior; it is deep but also a god-module (top deepening candidate).
- `packages/runtime-control/src/application/*` (assistant conversation, task tool runners) and per-context application services such as `packages/project-management/src/application/tasks.ts` hide command and projection behavior behind small Interfaces. CRM application services were removed and are deferred to the future user-side dashboard (GitHub issue #200).
- The shared-kernel value objects (`Money`, branded ids, `Result`) are deep: tiny surfaces, invariant-checking factories, wide reuse.
- `packages/adapters/src/object-store/s3-object-store.ts` hides streaming, presigning, and storage semantics behind `ObjectStorePort`.

Shallow Modules (intentional or candidates):

- Barrels and index files (`packages/ports/src/index.ts`, `packages/shared-kernel/src/index.ts`, the per-app `src/index.ts` files) are re-export glue and should stay thin.
- `packages/shared-kernel/src/time/index.ts` (one `Clock` method, trivial implementation) is intentionally minimal.
- `packages/config/*` (eslint, tsconfig, postcss, tailwind) are declarative build configs, shallow by nature but high blast radius.
- `OpenClawGatewayPort` today: three methods implemented, the rest aspirational; shallow now, deep by design.

## Seam-placement smells

These are places where a seam is declared or satisfied in a location that hurts Locality or clarity.
Each is a candidate for the [deepening register](DEEPENING-OPPORTUNITIES.md).

- Ports defined outside `packages/ports`.
  `OpenClawAdminRpcPort` is defined in `apps/workers/src/provisioning/openclaw-admin-client.ts:21`, and `GatewayRuntimePort` is defined inside the `apps/workers/src/provisioning/gateway-admin-connections.ts` god-module alongside its own Adapter.
  Both are real seams that belong in `packages/ports` so the capability Interface is independent of the app that first implements it.
- Inline Adapters for `ErrorCapturePort`.
  `apps/web/app/(app)/tasks/[cardId]/actions.ts` and `apps/web/app/api/tasks/ask-admin/turn/route.ts` satisfy the port with object literals instead of a real Adapter, so the seam exists in practice but has no reusable implementation.
- `ConnectionsProvisioningPort` sprawl.
  Four Adapters split across `apps/web` and `apps/workers` with an `Unavailable*` fallback in each app, which spreads one capability across two apps and a fallback pair.
- God-module concentration.
  `apps/workers/src/provisioning/gateway-admin-connections.ts` owns a port definition, the Docker runtime Adapter, provisioning orchestration, and fallback behavior in one 4633-line file.

## Cross-context coupling points

- `AuthorizationPort` is implemented by two current bounded contexts (`project-management`, `runtime-control`); the CRM implementation was removed and is deferred to the future user-side dashboard (GitHub issue #200).
- `packages/shared-kernel/src/result/index.ts` is imported by nearly every Module; it is the widest blast radius in the codebase.
- `packages/project-management/src/application/issues.ts` couples PM to the issue-tracker capability (`IssueTrackerPort`) beside its task logic, the clearest cross-context coupling inside a package.
- Every bounded context depends on Identity and Access first (session, `AuthorizationPort`, `withTenant` RLS), and every OpenClaw-bound call funnels through the broker; the dependency graph stays acyclic at the port seam.

## Pointers

- Per-module depth: [modules/](modules/) (one doc per package and app).
- Locked decisions: [adr-seam-constraints.md](adr-seam-constraints.md) (15 do-not-re-litigate items).
- Context ownership: [bounded-contexts.md](bounded-contexts.md).
- Term-to-code: [ubiquitous-language-bridge.md](ubiquitous-language-bridge.md).
- Fork boundary: [mainframe-seam.md](mainframe-seam.md).
- Refactor candidates: [DEEPENING-OPPORTUNITIES.md](DEEPENING-OPPORTUNITIES.md).
- System overview and invariants: `ARCHITECTURE.md`. Glossary: `CONTEXT.md`.
