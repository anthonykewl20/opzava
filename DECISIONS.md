# Issue #275 decisions

- **Unmanaged representation:** `OpenClawHealthComponent.managed` is browser-safe metadata. The
  worker emits it explicitly on every projected component and sets `managed: false` for `main` (and
  any other non-Opzava agent returned by Gateway health). The field is optional at the port boundary
  only for compatibility with older cached snapshots and existing typed fixtures; omission means
  managed. This preserves the existing three honest health statuses while letting the Health view
  list unmanaged rows and exclude them from totals, attention items, and last-known-healthy counts.
- **Stable readiness detail:** per-agent failures use fixed-order reason codes. Unknown evidence
  (`*_missing`, `*_unavailable`, or `*_unknown`) takes precedence over verified mismatch, while the
  detail retains every applicable reason in the fixed order.
- **Ownership drift:** a difference between the canonical and live Opzava-owned agent sets is
  emitted once as the `agent-ownership-drift` warning. It is not copied onto every sibling agent; an
  extra owned row with no canonical identity is itself marked with config/tool drift so it cannot
  become falsely healthy.
- **Recovered signals:** plugin verification requires the `unavailable` array to be present and
  well-formed. Delivery queues and config reload each receive a system-core component. Missing or
  malformed fields are `not_checked`; an active reload and present empty failure arrays are healthy;
  unavailable plugins, dead-lettered deliveries, and disabled hot reload need attention.
- **Deliberately unchanged:** no doctor scanner, runtime command, persistence, lease, page redesign,
  Incident/ErrorGroup concept, new Gateway fetch, or running-stack mutation was added. The existing
  worker service remains a large established module; this slice added focused helpers at its current
  projection seam rather than moving unrelated code.
- **Aggregate comparison:** the existing exact-canonical/no-op and drift/reconcile tests continue to
  exercise `orchestratorConfigIsCurrent`; both pass after its comparison was decomposed into row and
  tool-policy helpers.
- **Scoped rollup:** unmanaged filtering stays local to the Health view model because the ticket
  permits changes only under `apps/web/lib/health/**`; moving shared summary arithmetic in
  `connections-state` or readiness projections would exceed that boundary.
- **Validation environment:** the worker package's unfiltered test script also loads
  `roadmap.integration.test.ts`, which requires `DATABASE_MIGRATION_URL`. I did not source private
  environment files or mutate a running database. The worker unit suites, including the full
  connections suite, are run separately without that integration test.
