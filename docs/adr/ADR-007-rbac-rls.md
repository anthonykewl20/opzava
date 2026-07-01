# ADR-007: Resource-scoped RBAC, roles-as-data, and Postgres RLS

Status: Accepted

Opzava authorization will use resource-scoped RBAC with roles-as-data behind `AuthorizationPort`, evaluated through a single `can(user, action, resource)` policy path. Organization is the tenant and maps one-to-one to an OpenClaw Gateway; Project is the main child scope; Postgres RLS is a fail-closed backstop behind tenant-scoped repositories so a missing tenant context becomes a hard 403, never a silent empty state.

## Context

ADR-001 establishes Identity & Access as a bounded context, `AuthorizationPort` as the fine-grained authorization capability port, Drizzle/Postgres as the database foundation, and tenant-scoped repositories as a first-class architectural concern. ADR-002 establishes pure-per-tenant Gateway topology: one Organization tenant has exactly one OpenClaw Gateway. ADR-004 makes Opzava Postgres the system of record for identity, tenancy, human workflows, audit, and product policy. ADR-006 keeps Better Auth behind `AuthPort` and explicitly leaves project authorization, resource roles, Guest-Client access, runtime-command admission, admin-board access, and knowledge access to this ADR.

Q5 locks the access model around the product shape rather than the company org chart. Opzava is an AI-staffed company-in-a-box for marketing, support, finance, CRM, project management, internal collaboration, and runtime-control surfaces. Marketing, finance, promotions, and support are departments, project types, queues, workflow domains, or attributes; they are not authorization roles. "Team" is useful as an optional grouping, label, reporting dimension, ownership hint, or routing aid, but it is not a structural parent in the tenant hierarchy.

The hierarchy must align with both Opzava data ownership and OpenClaw runtime isolation. Organization is the tenant and owns the Gateway route. Project is the main child scope for human work, customer/client collaboration, project knowledge, PM cards, assignments, and many runtime-facing policies. Member is a user's membership in an Organization. External clients are not members of the Organization; they are project-scoped principals with a deliberately smaller access surface.

The central sad path is a cross-tenant leak through a forgotten tenant predicate or missing tenant context. App-only filtering is one repository bug away from a leak. RLS-only isolation fights tooling, migrations, and explicit domain modeling if the application stops carrying tenant ids intentionally. Opzava needs both: application repositories that bind tenant context explicitly, and Postgres RLS that fails closed when code forgets.

## Decision

Use this hierarchy:

```text
Organization (= tenant = one OpenClaw Gateway) -> Project -> Member
```

There is no required structural `Team` node. Teams may exist later as optional grouping, label, reporting, routing, or ownership metadata, but they do not sit between Organization and Project and they do not define authorization by themselves. Departments such as marketing, finance, promotions, and support are modeled as attributes, project types, queues, workflow domains, or AI Workforce departments, not as RBAC roles.

Identity & Access owns these aggregates:

- `Organization`: tenant root, tenant policy, lifecycle-facing identity state, role catalog, and Gateway binding references.
- `User`: global human identity independent of any one Organization.
- `Membership`: a user's membership in one Organization, including membership status, membership version, and coarse member category.
- `RoleGrant`: a role assignment to a subject at an organization scope or project scope.
- `Project`: an Organization-owned child scope for work, knowledge, client collaboration, and project-level grants.
- `ExternalIdentity`: a project-scoped external client identity, separate from org membership.
- `Invitation`: the transactional invite and acceptance aggregate for members and external project guests.

Use resource-scoped RBAC with roles-as-data. Roles and permissions are rows owned by Identity & Access, seeded by the system and extendable per Organization only through controlled admin flows. A grant has an explicit subject, role, scope type, and scope id. The supported grant scopes are Organization and Project. Domain code must not hard-code provider roles or Better Auth organization role strings as fine-grained authorization.

Seed these baseline roles:

- `Owner`: controls organization lifecycle, ownership transfer, highest-risk security settings, and final administrative authority.
- `Admin`: manages org settings, invitations, role grants within policy, integrations, and operational administration.
- `Manager`: administers assigned projects, project members, workflow execution, and project-level work surfaces.
- `Member`: performs ordinary internal work on granted organization and project resources.
- `Guest-Client`: external project client role with least-privilege access to the bound project and narrow support-ticket/customer-facing resources.

Use a single `AuthorizationPort` for fine-grained authorization. The port exposes a `can(user, action, resource)` style evaluator that receives the authenticated principal, active organization context, requested action, and resource descriptor. Every privileged command, query, server action, route handler, worker action, broker-mediated runtime command, admin-board operation, billing action, knowledge read, CRM access, project action, and Guest-Client portal action must authorize through this evaluator or through a use case that is explicitly built on it.

The evaluator proves all of the following before allowing access:

- the subject is known and active for the requested path
- the active Organization is authenticated and matches the resource's `orgId`
- the relevant membership or external identity is active
- the role grant applies to the requested Organization or Project scope
- project-scoped grants do not escape to sibling projects
- org-scoped grants apply only within the active Organization
- Guest-Client grants apply only to their single bound Project and external-client resource set
- suspended, deprovisioning, deleted, revoked, expired, or role-invalidated states fail closed

Keep `AuthorizationPort` swappable. The first adapter is Opzava policy evaluation backed by Postgres role/permission/grant tables. ReBAC/Zanzibar-style relationship tuples or narrow ABAC predicates may be added later behind the same port for exceptional cases, but the foundation is not Zanzibar and not broad ABAC. Domain services depend on the port contract, not on a specific policy engine.

External clients live in a separate `external_identities` table and are scoped to exactly one Project. Accepting an external project magic link or Guest-Client invitation creates or refreshes an `ExternalIdentity`; it never creates Organization membership and never inserts the client into Better Auth organization membership. Guest-Clients receive only explicit project/client-portal/support-ticket visibility, comments, uploads, and status reads. They do not receive internal chat, Ask Opzava, org knowledgebase, marketing/finance agent controls, billing administration, org settings, admin boards, or runtime-control access.

Use tenant-scoped repositories as the primary application isolation pattern. Tenant tables carry `orgId` or an equivalent tenant foreign key, and repository methods require the active Organization context instead of accepting optional tenant filters. Cross-tenant references are invalid. Shared-kernel ids such as `TenantId`, `ProjectId`, and `UserId` remain value objects; they do not weaken the rule that tenant data access is bound to one active Organization.

Use Postgres Row-Level Security as a fail-closed backstop on every tenant table. Each request, command, query, or worker unit that touches tenant data must enter a centralized transaction wrapper:

```text
withTenant(orgId, fn)
```

`withTenant` is the only path to tenant tables. It opens a database transaction, sets the tenant context with `SET LOCAL app.current_org = <orgId>`, runs the function, and clears automatically at transaction end. RLS policies read `current_setting('app.current_org', true)` and deny rows when the setting is missing, empty, malformed, or mismatched. Tenant-table access outside this wrapper is a bug, not a supported degraded mode.

Run PgBouncer in transaction pooling mode for application traffic. `SET LOCAL` is transaction-scoped and works with transaction pooling. PgBouncer session pooling is not accepted for app traffic because session-level GUC state can leak across requests or require fragile reset discipline.

The sad-path invariant is explicit:

- forgotten tenant context returns a hard 403
- authorization denial returns a hard 403
- RLS denial from missing or mismatched `app.current_org` returns a hard 403
- the app never converts these failures into `200` with an empty list
- integration tests must assert 403 behavior for missing tenant context
- authorization and tenant-context denials emit audit/security telemetry and alert on spikes

OpenClaw does not get individual Opzava user operator identities. Opzava users are Postgres identities. The broker holds one scoped operator token per tenant Gateway under ADR-003 and carries signed acting-user attribution such as `x-acting-user` for audit and correlation. A compromised broker operator token is a Gateway/runtime incident, not a reason to treat OpenClaw as the Opzava authorization source of truth.

## Consequences

Authorization has one product vocabulary. Organization, Project, Member, RoleGrant, ExternalIdentity, and Invitation carry access semantics; marketing, finance, promotions, support, and Teams do not become competing role systems.

The application gets a simple mental model for common checks while keeping future escape hatches. Most product permissions are org or project scoped RBAC checks. If later features need relationship checks such as document sharing, customer-account hierarchies, or delegated approvals, they can be introduced behind `AuthorizationPort` without rewriting every command handler.

Better Auth remains an authentication and coarse membership tool, not a policy engine. A valid session proves identity and a coarse org context, but every privileged operation still re-checks Opzava membership, role grants, resource scope, tenant lifecycle, and external-client boundaries.

RLS becomes an operational and migration discipline. Every tenant table needs a correct RLS policy, migrations must preserve tenant columns and policy behavior, and repository tests need missing-context cases. The benefit is that a forgotten predicate or accidental broad query fails closed instead of leaking cross-tenant data.

`withTenant` is load-bearing. Application code, server actions, route handlers, workers, projectors, outbox consumers, and admin tools must use the centralized tenant transaction wrapper when touching tenant tables. Bypassing it is equivalent to bypassing authentication.

Denials are intentionally visible. A missing tenant context or authorization failure may be less convenient than returning an empty UI state, but silent empty responses hide security bugs, confuse users, and make cross-tenant leak attempts harder to detect.

Guest-Client support is deliberately separate from member support. This avoids accidentally giving customers org-wide membership, internal collaboration access, Ask Opzava access, project knowledge beyond their one project, admin surfaces, AI employee controls, or billing authority.

PgBouncer configuration is part of the architecture. Application traffic must use transaction pooling with transaction-local tenant context. Any future move to session pooling, alternate poolers, or direct database access must prove equivalent tenant-context isolation.

## Alternatives

Use ReBAC/Zanzibar as the foundation. Deferred because the first Opzava access model is mostly org/project scoped and does not justify the operational cost, tuple modeling overhead, consistency questions, and latency of a Zanzibar-style system. The `AuthorizationPort` exists so relationship-based authorization can be added later where the domain actually needs it.

Use broad ABAC as the foundation. Deferred because large predicate sets over departments, attributes, tags, ownership hints, lifecycle states, and contextual claims are harder to review and audit than explicit resource-scoped grants. Narrow predicates may be useful later behind the evaluator, but broad ABAC is not the base model.

Use provider-owned roles from Better Auth or a managed IdP for all authorization. Rejected because Opzava authorization is domain-specific: projects, Guest-Clients, knowledge, CRM, AI employees, runtime commands, admin boards, billing, approvals, and OpenClaw broker actions do not fit coarse auth-provider organization roles. Provider state can feed Opzava membership workflows, but it does not decide fine-grained access.

Make Teams a structural parent between Organization and Project. Rejected because it would add another hierarchy level without solving the primary access problem. Teams are useful labels and routing/reporting groupings, but Project is the natural scope for work, knowledge, Guest-Client access, and many runtime-facing policies.

Treat departments as roles. Rejected because marketing, finance, promotions, and support describe work domains and workflow policy, not generic authorization authority. A finance project may still have Owner, Admin, Manager, Member, and Guest-Client roles; making "Finance" a role would blur department assignment with privilege.

Use app-only tenant filtering without Postgres RLS. Rejected because the highest-risk sad path is a forgotten tenant predicate or broad query. Tenant-scoped repositories are necessary but not sufficient.

Use Postgres RLS only and stop carrying tenant scope through repositories. Rejected because domain services still need explicit tenant identity for authorization, audit, lifecycle checks, error messages, events, projections, and clear code review. RLS is the backstop, not the domain model.

Return empty results when RLS denies rows. Rejected because `200` with an empty list hides missing tenant context and converts a security invariant into a product ambiguity. Missing or mismatched tenant context is a 403.

Give Guest-Clients Organization membership with a restricted role. Rejected because external clients are project-scoped principals, not internal members. Org membership would expand the blast radius into internal collaboration, knowledge, assistants, admin surfaces, and future org-wide features.

## Related ADRs

- ADR-001: Monorepo, DDD module structure, and locked stack.
- ADR-002: Pure-per-tenant tenancy, `GatewayRuntimePort`, and provisioning saga.
- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-006: Better Auth, revocable sessions, MFA/passkeys, and PWA auth.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
