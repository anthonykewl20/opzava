(a) **Read another tenant's rows**

- **Policy scope**: `USING (org_key = app.current_org_id())` on every tenant-keyed table, `FORCE RLS` so even owner is subject. Function is `STABLE` (won't be inlined to a constant by planner in a way that lets the planner skip it). **`OK`** provided `org_key` is `NOT NULL` and there's no composite-key ambiguity.
- **Fix check**: add `CHECK (org_key IS NOT NULL)` and a NOT NULL FK to `organizations(id)`. Currently the spec doesn't state this — **HOLES(+1)** because a `NULL` row would match `app.current_org_id() = NULL` (which is `NULL`, not true), but actually that's safe. The real risk: if `org_key` is nullable, RLS passes only when comparison is `true`, so NULL rows are hidden. That's actually correct behavior. **OK**.
- **BYPASSRLS on owner**: tables owned by `opzava_owner`. **`OK`** because `FORCE RLS` overrides owner bypass.
- **Cache poisoning / function inlining**: planner can mark a `STABLE` function as effectively constant per query if it has no dependencies. Since it reads `current_setting`, it can't be folded. **`OK`**.
- **EXPLAIN / function volatility leakage**: `EXPLAIN` output doesn't include row data, only plan. **`OK`**.
- **Empty string / non-uuid GUC**: regex check returns NULL → comparison NULL → row hidden. **`OK`**.
- **Numeric/UUID coercion in comparison**: `org_key` is uuid type (presumably), `app.current_org_id()` returns uuid. No coercion surprise. **`OK`** if column is uuid.
- **`pg_catalog` / `information_schema` leakage**: `opzava_app` should not have read on system catalogs beyond `USAGE`. Verify: revoke default `pg_read_all_data`-style memberships. **CHECK REQUIRED** — if `opzava_app` is `pg_read_all_settings` or inherited from `pg_read_all_data` (Postgres 14+), it can read settings of *other* sessions? No, `current_setting('app.current_org', true)` only reads *own* session. **`OK`**. But `current_setting('app.current_org', false)` (the non-missing variant) would error rather than returning NULL — the spec uses `true`, correct.
- **Index-only scans / visibility map**: no data leak; RLS applies to all plans. **`OK`**.

(b) **Write/point a row at another tenant**

- WITH CHECK on policy = symmetric. **`OK`**.
- **INSERT with stolen org_key** from request body: `withTenant` validates UUID only, then `SET LOCAL app.current_org = orgId`. The body could specify a different `org_key` value — RLS WITH CHECK enforces `org_key = current_org_id()`, so it rejects. **`OK`**.
- **UPDATE flipping org_key to another tenant**: WITH CHECK on UPDATE requires the *new* row to match → blocked. **`OK`**.
- **DEFAULT values / sequences**: if a column has `DEFAULT org_key` set by a function referencing something tenant-scoped, ensure it resolves inside `app.current_org_id()` context. Generally sequences don't honor RLS, but `nextval` on a uuid sequence is irrelevant; if someone uses `gen_random_uuid()` as default and then sets `org_key` from app-supplied body, RLS blocks. **`OK`**.
- **FK error messages**: a failed FK insert against another tenant's row raises `23503`. The message includes the key value being inserted. Combined with (e) below, this can leak. **HOLES(+1)**: see (e).

(c) **Fail OPEN on missing context**

- All queries are wrapped in `withTenant`; if `SET LOCAL` throws or `app.current_org_id() != orgId`, code throws `TenantContextMissing`. **`OK`**.
- **DB-level guard**: any future code path that bypasses `withTenant` will run with GUC unset → `current_org_id()` returns NULL → policy returns NULL → 0 rows. That's fail-closed **at row level**, but the application might still return HTTP 200 with empty body. Spec says targeted resource read returns hard 403 when context missing. Enforce via a **global RLS predicate that always fails when GUC is unset**:
  ```
  CREATE POLICY no_context ON ALL tenant tables AS RESTRICTIVE
    FOR ALL TO opzava_app USING (app.current_org_id() IS NOT NULL);
  ```
  This guarantees *any* read without a valid GUC returns zero rows (already true) but with `RESTRICTIVE + FORCE` it's belt-and-braces against a future SELECT through a SECURITY DEFINER view. **Fix: add RESTRICTIVE no-context policy as defense in depth.**
- **Reports / aggregations**: if any code runs `SELECT count(*) FROM tenant_table` outside `withTenant` for health/observability, it silently returns 0. Could mask outages. Acceptable trade-off; document.

(d) **SET LOCAL surviving PgBouncer transaction mode**

- This is the **classic disaster**. `SET LOCAL` is scoped to the *current transaction*. In transaction-mode PgBouncer, when the client sends `COMMIT`, the server returns to pool mode and **the next client may inherit GUCs only if** the server reset state is incomplete or `RESET ALL` wasn't issued.
- `SET LOCAL` itself does NOT survive past `COMMIT/ROLLBACK` on the server side — Postgres clears it. So in theory this is safe.
- **However**: if Drizzle/`withTenant` ever runs a query *before* `BEGIN` (e.g., a connection health check, `SELECT 1`, or Drizzle's introspection), `SET LOCAL` outside a tx becomes `SET SESSION` and **leaks to the next pooled user**. The spec says `db.transaction(tx => { SET LOCAL ... })`, which puts it inside the tx. But Drizzle sometimes issues setup queries outside the explicit transaction.
- **Fix**: ensure `withTenant` always wraps everything in a single `BEGIN … COMMIT`. PgBouncer's `server_reset_query` should be set to `DISCARD ALL` (default). **`OK`** only if Drizzle doesn't auto-prepare or run pre-tx queries; the spec explicitly disallows `.prepare()`. **Verify with `pg_stat_statements`** that no `SET` (non-LOCAL) appears.
- **`max_prepared_statements=0`**: avoids prepared-statement bleed
