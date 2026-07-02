# Slice 1b Postgres tenant-isolation data layer review (adversarial)

| severity | file:line | issue | fix |
| --- | --- | --- | --- |
| medium | `packages/adapters/src/postgres/__tests__/tenant-rls.integration.test.ts:6` | Integration proof relies on `db` from `DATABASE_URL` but does not verify the session is `opzava_app`; if CI/local env accidentally sets `DATABASE_URL` to owner/superuser, `withTenant` tests can pass while RLS is bypassed, so cross-tenant assertions are not trustworthy. | Add a startup guard in the test to assert `current_user`/`session_user` equals `opzava_app` and abort if `pg_has_role(..., 'opzava_owner', 'member')` is true (and ideally run via a fixed `DATABASE_URL` fixture that is intentionally non-owner). |
| medium | `packages/identity-access/drizzle/0000_slice1b_tenancy_rls.sql:93` | `alter default privileges in schema public/app grant ... to opzava_app` grants blanket DML/execute on all future tables/functions in those schemas, which weakens least-privilege; future non-tenant tables can inherit app access without explicit tenant-policy review. | Replace broad default grants with explicit grants on approved tenant tables, and require each new table migration to declare tenant policy + explicit grants as part of the schema change review. |
| low | `packages/adapters/src/postgres/tenant-context.ts:82` | `SET LOCAL` uses `sql.raw(\`set local app.current_org = '${orgId}'\`)`; it is currently safe because of the regex check, but it bypasses typed parameterization and couples SQL safety to validator correctness. | Use parameterized SQL (`await tx.execute(sql\`set local app.current_org = ${orgId}\`)`) so tenant binding is safer against future validator drift and static-analysis regressions. |

VERDICT: SOUND (0 blocker(s))

