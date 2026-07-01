1) Hierarchy: `Organization (= tenant = 1 Gateway) → Project → Member`. Drop Teams as a structural node; model department as a `department` attribute/membership on the Project and an optional `groups` tag for org-level grouping. Marketing/Finance/Promotion/Support are **departments + project types**, not RBAC roles. Simpler graph, fewer joins, cleanest mapping to OpenClaw workspaces (one workspace per Project).

2) RBAC: **Resource-scoped RBAC behind an `AuthorizationPort`** — roles as data (`role_grants(user_id, role, scope)`), `can(user, action, resource)` resolved through a single policy evaluator. Wrap it so a Zanzibar/ReBAC adapter can be swapped in later without touching domain code. Not ReBAC now (cost, latency, ops burden for MVP); not pure ABAC (unreviewable).

3) Isolation: **App-scoped repositories + Postgres RLS as fail-closed backstop**. Force `SET LOCAL app.current_org` in a Postgres `BEFORE STATEMENT` trigger; deny `current_setting('app.current_org', true) = ''` on every tenant table. Pool via PgBouncer in **transaction mode** with a short-lived `SET LOCAL` per tx — session pooling breaks it. App-only is one bug away from a leak; RLS-only fights tools.

4) Roles: `Owner / Admin / Manager / Member / Guest / ExternalClient`. External clients live in a separate `external_identities` table bound to a Project via a least-privilege `ExternalClient` grant (read-only on that project + a narrow support-ticket resource). No org-wide membership; hard scoping to one Project.

5) **Confirmed.** Opzava users are Postgres identities only; the broker holds one operator token per Gateway. Acting user is metadata (`x-acting-user`, signed) for audit. Compromised operator ≠ tenant compromise.

**Biggest sad path: cross-tenant leak via forgotten `app.current_org`** — a repository that forgets to set the tenant context returns rows, RLS rejects them, but the app surfaces an empty state instead of a hard 403. Mitigation: centralized `withTenant(org, fn)` wrapper, integration tests asserting 403 (not 200-with-empty), and Prometheus counter on 403s.

**Scale + lean-ops:** Single VPS, PgBouncer + Postgres, broker as a stateless sidecar; horizontal by adding Gateways per tenant, not by re-architecting.
