# Q5 Tenancy + RBAC

**Recommendation: org-first tenancy, resource-scoped RBAC, app repositories with RLS backstop.**

1) **Hierarchy.** Model `Organization` as the tenant aggregate root: one Organization equals one OpenClaw Gateway. Use `Organization -> Project -> Membership/RoleAssignment`; keep `Team` as an optional grouping for ownership, routing, reporting, and filters, not as a required parent. Projects map cleanly to OpenClaw agent workspaces. Marketing, finance, promotions, and support are departments, project types, queues, or workflow domains; they are not RBAC roles. Permissions answer "may this subject perform this action on this resource?", not "which department is this?"

2) **Authorization model.** Choose resource-scoped RBAC behind an `AuthorizationPort`: `can(user, action, resource)` evaluates org- and project-scoped `RoleAssignment`s against roles-as-data seeded by the system and extendable per org. This is scale-ready without the ops and mental load of Zanzibar/ReBAC today, and more reviewable than broad ABAC. Keep the port boundary strict so relationship tuples or ABAC predicates can be added later for exceptional cases without rewriting domain services.

3) **Postgres isolation.** Use tenant-scoped repositories plus Postgres Row-Level Security as a fail-closed backstop. App code must always bind `orgId` explicitly; RLS catches missing or buggy predicates. RLS must use `SET LOCAL app.current_org = ...` inside each transaction, so PgBouncer transaction pooling is compatible, but session pooling must be avoided or carefully reset because GUC state can leak across requests. Do not rely on app-only checks; do not rely on RLS-only ergonomics.

4) **Roles and external clients.** Seed `Owner`, `Admin`, `Manager`, `Member`, and `Guest-Client`. `Owner` controls org lifecycle and ownership transfer; `Admin` manages org settings, invites, role grants, and integrations; `Manager` administers assigned projects; `Member` performs normal project work; `Guest-Client` is an external portal principal with least privilege: no org-wide membership, no marketing/finance/agent controls, and only explicit project/support-ticket visibility, comments, uploads, and status reads for the customer-support surface.

5) **OpenClaw identity.** Confirmed: Opzava users do not get individual OpenClaw operator identities. The broker holds one scoped operator token per tenant Gateway. The acting Opzava user is carried only as signed attribution metadata for audit/correlation; Opzava RBAC remains the real access-control decision.

**Identity & Access aggregate sketch.** `User` is a global identity. `Organization` owns tenant policy, `GatewayBinding`, org `Membership`s, and role catalog. `Project` belongs to exactly one Organization. `Role` defines permissions; `RoleAssignment(subjectId, roleId, scopeType, scopeId)` grants at org or project scope. Every resource has an `orgId`; cross-tenant references are invalid.

**Biggest sad path.** Cross-tenant leak or privilege escalation through a missing tenant predicate or stale role grant. Invariant: every command/query has one authenticated `orgId`; every tenant row carries that `orgId`; every authorization decision proves subject scope and resource scope share it; unset or mismatched context returns 403 and emits audit, never a silent empty result.

**Scale + lean ops.** This keeps runtime cost O(tenants + projects in Postgres rows), not O(team graphs or per-user Gateway identities), while staying evolvable behind ports.
