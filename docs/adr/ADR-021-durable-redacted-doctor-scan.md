# ADR-021: Durable, redacted OpenClaw doctor scans

## Status

Accepted — ratified 2026-08-12
**Ratified by:** merged PRs #299, #300 below.

> **OWNER DECISION — TOPOLOGY DEFAULT:** This ADR proceeds with current reality: scan the single
> static `openclaw-platform-gateway` as a **platform-scoped, not tenant-scoped**, capability.
> Compose defines that one service at `docker-compose.yml:290-306`, and ADR-002 explicitly defers
> dynamic per-tenant Gateway provisioning while retaining it for the multi-tenant phase
> (`docs/adr/ADR-002-tenancy-provisioning.md:3-8`). The alternative is to make #280 per-tenant now.
> The recommendation is the single-platform topology now, with scope keys, storage, leases, and the
> scheduler shaped per Gateway so a future per-tenant fleet is additive rather than a rewrite.

## Context

Issue #275, Health slice 1, is merged. Issue #280 is the P1, high-risk keystone of the remaining
Health chain: run `doctor --lint --all --severity-min info --json` against the platform Gateway on a
cadence, retain the result durably, and expose an honest read model to the Health leaf in #281. That
leaf remains blocked on #280 and an approved mockup. The records must be sufficient to rebuild
projections, and no secret may ever enter a browser contract.

The topology is temporarily simpler than the accepted tenancy target. ADR-002's target remains one
Gateway per tenant (`docs/adr/ADR-002-tenancy-provisioning.md:22-26`), but its amendment makes the
static Compose service canonical while Opzava is single-tenant
(`docs/adr/ADR-002-tenancy-provisioning.md:3-8`). Compose confirms that current runtime and its
mainframe-built image (`docker-compose.yml:290-306`). This ADR therefore uses a platform Gateway
scope now without turning that temporary deployment fact into a permanent shared-Gateway model.

The scan is not a new OpenClaw Gateway protocol capability. `GatewayRuntimePort` already owns
container/runtime mechanics (`packages/ports/src/gateway-runtime.ts:152-174`), while the existing
Gateway `doctor.*` handlers inspect and repair memory dreaming artifacts, cron state, and REM
previews (`mainframe/src/gateway/server-methods/doctor.ts:1-31,737-967`). Those methods are
unrelated to CLI lint and must not be overloaded.

The upstream output is hostile from a disclosure perspective even when it is valid JSON.
`HealthFinding` contains eleven fields, including free-form `message`, `source`, filesystem `path`,
OpenClaw path, target, requirement, and fix hint (`mainframe/src/flows/health-checks.ts:34-47`). The
shared doctor error scrubber only removes control characters and truncates text
(`mainframe/src/flows/doctor-error-message.ts:3-20`); it is not a secret redactor. ADR-013 requires
redaction at ingest, before storage or forwarding, rather than at read time
(`docs/adr/ADR-013-error-admin-card.md:179-189`). A regex sanitizer over upstream strings cannot
prove that a secret is absent.

The existing Docker execution helper is also unsafe to reuse unchanged for this scanner. It starts
an attached exec, buffers the full multiplexed response, and only then inspects the exit code
(`apps/workers/src/provisioning/docker-gateway-runtime.ts:2194-2257`). It has no output cap and a
request timeout does not prove termination of the child process. A dedicated bounded operation is
required before container execution is allowed.

## Decision

### Add one runtime scan seam, not a Gateway RPC

Add this capability to `GatewayRuntimePort` in `packages/ports/src/gateway-runtime.ts`:

```ts
interface DoctorLintRawResult {
  readonly exitCode: 0 | 1;
  readonly stdout: string;
}

runDoctorLintScan(): Promise<Result<DoctorLintRawResult>>;
```

`DoctorLintRawResult` is adapter-private transient data in the sense that no application response,
database row, log, event, or browser DTO may retain it. The worker parses it immediately at ingress
and discards it. Stderr never crosses the Docker adapter boundary.

The Docker adapter maps the capability exactly to:

```text
node /app/openclaw.mjs doctor --lint --all --severity-min info --json
```

`--severity-min info` is mandatory because lint applies the severity filter before emitting JSON.
Exit codes 0 and 1 are successful executions whose JSON must be parsed: exit 1 means findings were
found, not that the scanner failed. Exit 2, timeout, invalid JSON, executable absence, or Docker
execution failure maps to `unavailable`; raw stderr or exception text is never returned or stored.

Do not add `doctor.lint` to the Gateway protocol. The existing `doctor.*` protocol surface is the
unrelated memory tooling identified above. A new method would create and maintain a second upstream
protocol surface for a capability already owned by the runtime adapter.

### Put orchestration behind a worker-owned application port

Define a worker-owned `OpenClawDoctorScanPort` on the ADR-003 admin/JIT path with three operations:

- `readLatest(scope)` returns the latest durable attempt and derived honest state.
- `ensureFresh(scope)` atomically claims work when due, starts it asynchronously, and immediately
  returns the latest durable record plus `in_progress`. It never holds a web request open for the
  expected 8-12 second scan.
- `force(scope)` requests an authorization-gated scan, subject to a 30-second minimum interval.

The browser/BFF may call only a typed internal read/ensure/force endpoint backed by this application
port. Browser code never executes Docker, sees stdout or stderr, receives a Gateway DTO, or obtains
admin/JIT credentials. This follows the established split in which runtime mutations use the audited
provisioning-worker path rather than browser handlers or the broker hot path
(`docs/adr/ADR-013-error-admin-card.md:155-159`) and the remediation product forbids browser and hot
broker possession of `operator.admin` authority (`docs/prd/PRD-018-admin-remediation.md:103-112`).

### Make redaction structural at worker ingress

The highest-risk invariant is: **no upstream free-form diagnostic string is persisted or returned.**
After parsing the JSON envelope, the worker must discard `message`, `source`, `path`, `line`,
`column`, `ocPath`, `target`, `requirement`, `fixHint`, and every unknown field. It then constructs
only this closed Opzava DTO:

```ts
interface DoctorFinding {
  readonly checkId: string;
  readonly severity: "info" | "warning" | "error";
  readonly group: string;
  readonly summary: string;
  readonly detailState: "available" | "redacted_unavailable";
  readonly locationLabel: string | null;
  readonly targetLabel: string | null;
  readonly fixHint: string | null;
  readonly suppressed: boolean;
  readonly suppressionReason: string | null;
}
```

`checkId` must match a strict safe-id grammar or become `unknown`. `severity` is a closed enum.
`group`, `locationLabel`, and `targetLabel` come only from field-specific allowlists; an
unrecognized value is replaced by a safe fallback or `null`, never cleaned and forwarded. `summary`
comes from an Opzava-owned registry keyed by a classified check. `fixHint` remains `null` unless
Opzava owns an exact static template. Suppression fields are likewise closed application policy, not
copied text.

For an unknown check, preserve only its existence and validated severity with this exact template:

```text
OpenClaw doctor reported a <severity> finding in an unclassified check.
```

If classification or safe detail is uncertain, retain the safe check/severity/group and set
`detailState` to `redacted_unavailable`. Never pass through an upstream `message` or `fixHint` to
make the result more useful. This implements ADR-013's pre-storage boundary; it is deliberately not
a regex-redaction policy.

The BFF validates only the closed persisted schema and its `schema_version`. It does not run a
second redactor, because two redactors would drift and make the weaker path the effective boundary.

### Persist append-only runs and findings

Use normalized append-only records, not a mutable one-row JSONB cache:

- `platform_doctor_scan_run`: `id`, `scope`, `status` (`succeeded` or `unavailable`), `started_at`,
  `completed_at`, `checks_run`, `checks_skipped`, bounded `failure_code`, and `schema_version`.
- `platform_doctor_scan_finding`: `scan_run_id`, `ordinal`, `check_id`, `severity`, `display_group`,
  `summary`, `detail_state`, `location_label`, `target_label`, `suppressed`, and
  `suppression_reason`.
- `platform_doctor_scan_lease`: `scope`, `lease_token`, `lease_acquired_at`, `lease_expires_at`, and
  `last_force_requested_at`.

`scope` identifies the current platform Gateway and must be extensible to a concrete Gateway
instance in the future. It must not be interpreted as permission to issue a cross-tenant browser
query. Under the default topology, only explicitly authorized platform operators can read or trigger
this platform scope. The storage/repository boundary must still require the active organization
tenant context and fail hard for absent or mismatched context; ADR-013's visibility model forbids
tenant access to platform rows and cross-tenant detail
(`docs/adr/ADR-013-error-admin-card.md:134-140`).

Enable and force RLS on all three tables. Model the tenant-isolation and restrictive
tenant-context-required policies on `governance_audit`, including `app.current_org_id()` and owner
administration (`packages/identity-access/drizzle/0017_governance_audit.sql:85-148`). Missing or
mismatched tenant context maps to 403, never an empty result.

Retain successful runs for 30 days and unavailable runs for 90 days. Pruning must never delete the
latest completed run for a scope. The run/finding history is the durable source from which the
Health projection can be rebuilt; lease state is coordination state, not health truth.

The existing identity-access migration ledger owns these tables and the required migration manifest
update. Do not create a second migration runner: the current runner resolves
`packages/identity-access/drizzle`, verifies its manifest, and applies that directory
(`packages/adapters/src/postgres/migrate.ts:15-30`).

### Schedule with a fenced, expiring lease

Run a dedicated worker job every five minutes. Do not use process-local `setInterval`, and do not
put scanning in the broker. Every scheduled, ensure-fresh, or forced request goes through one atomic
SQL lease claim scoped to the platform/Gateway:

1. Claim by upsert only when no unexpired lease exists and the cadence or force cooldown permits.
2. Write a cryptographically random `lease_token`; set expiry to the hard execution timeout plus a
   cleanup margin.
3. Execute no container operation inside the claim transaction and hold no advisory lock or
   transaction across Docker exec.
4. Publish the run only with a fenced update equivalent to
   `UPDATE ... WHERE lease_token = $token AND lease_expires_at > now()`.
5. On worker death, allow the lease to expire and a later worker to steal it. A late, fenced-out
   worker must not publish stale results.

A concurrent caller returns the existing durable record with `in_progress`; it never starts a second
exec. `force` bypasses freshness, not concurrency or its 30-second floor.

### Bound output and terminate execution before lease expiry

The dedicated Docker operation must stream through a bounded output reader. It must stop reading,
terminate the in-container doctor child, and return `unavailable` when the byte cap, hard timeout,
or JSON envelope bound is exceeded. The child-termination deadline must precede lease expiry by the
cleanup margin. A client-side Docker request timeout alone is insufficient because the existing
helper does not prove that the child ended
(`apps/workers/src/provisioning/docker-gateway-runtime.ts:2231-2257`).

**VERIFIED (2026-08-13, #280 B2):** driven against the built
`opzava/mainframe-gateway:2026.7.2-beta.3` image — `/usr/bin/timeout` is present, and
`node /app/openclaw.mjs doctor --lint --all --severity-min info --json` exits 1 with a valid
`{ ok, checksRun, checksSkipped, findings[] }` envelope that `parseDoctorLintOutput` accepts (53 run /
0 skipped / 41 findings, all classified). The adapter therefore retains its configurable host-side
hard deadline and ADR-envelope validation as defense-in-depth rather than relying on the in-container
`timeout`. No implementation may infer the binary/path from the host or from training knowledge.

### Expose honest Health state

The #281 read contract derives exactly these states:

- `never` / `not_checked`: no completed run exists.
- `in_progress`: a valid lease owns a scan; include the last durable record if one exists.
- `healthy`: the latest successful run is fresh and has no unsuppressed warning or error.
- `degraded`: the latest successful run is fresh and has at least one unsuppressed warning or error.
- `stale`: the latest successful run is older than 10 minutes.
- `unavailable`: the latest attempt failed.
- `unknown`: the persisted `schema_version` is unsupported or invalid.

Freshness is 10 minutes: two missed five-minute windows. Never infer `healthy` from no record, a
failed attempt, stale data, an unsupported schema, or an in-progress first scan. Informational
findings remain visible and must not be described as “zero findings,” but `info` alone does not
degrade health.

When a newer unavailable attempt follows an older success, the state is `unavailable`, while the
older success may be shown only as explicitly stale historical context. Availability failure must
not be hidden by the last good result.

### Deliver in two security-complete slices

1. **PR A — safe foundation:** closed DTO and parser, safe-summary registry, repository, migration
   and migration manifest, RLS, lease claim/fencing, unit tests, and real-Postgres concurrency/RLS
   tests. It contains no container execution.
2. **PR B — capability:** `GatewayRuntimePort.runDoctorLintScan`, bounded Docker execution, scan
   orchestration, typed internal read/ensure/force endpoint, scheduled worker job, and real-stack
   proof against the built Gateway image.

Do not split redaction from persistence: unsafe upstream text must never land temporarily. Do not
split output bounding from the executable adapter: an unbounded scanner must never become runnable.
Each is a security boundary, not follow-up hardening.

## Sad paths and invariants

- Gateway unavailable, timeout, exit 2, executable absence, malformed/oversized JSON, output-cap
  breach, or Docker execution failure appends an `unavailable` run with a bounded Opzava-owned
  `failure_code`. Raw stderr, stdout, exception messages, filesystem paths, and Docker details are
  discarded.
- Exit 1 with a valid envelope appends a `succeeded` run and its closed findings. Findings are not
  an availability failure.
- Redaction uncertainty emits safe classification plus `detailState: redacted_unavailable`; it does
  not omit the finding or forward suspect detail.
- A concurrent request returns the existing durable result plus `in_progress`; it does not execute
  again.
- A crashed worker loses authority at lease expiry. Its late result cannot publish without the live
  token fence.
- Records and claims are scope-bound. Platform scope requires explicit platform-operator
  authorization; it is not a tenant-visible cross-tenant query facility.
- Missing or mismatched tenant context is a hard 403, consistent with ADR-013's visibility boundary,
  never `[]`, `not_checked`, or `healthy`.
- No projection or browser endpoint reads raw OpenClaw output. Only the closed persisted schema is a
  contract.

## Owner decisions required before acceptance

### Approve the current-reality topology default

**Recommended: single static platform Gateway now.** Scan `openclaw-platform-gateway` as a
platform-scoped capability because ADR-002 defers dynamic per-tenant provisioning. Require
per-Gateway-extensible scope keys, leases, repository queries, and scheduler iteration so adding the
future one-Gateway-per-tenant fleet does not change the run/finding model.

**Alternative: per-tenant now.** Require every scan, lease, authorization check, retention query,
and Health projection to bind a tenant `GatewayInstance` immediately, despite the fleet not existing
yet. This is not recommended because it implements the deferred topology ahead of ADR-002's
provisioning lifecycle.

### Approve the strict safe-summary policy

**Recommended: generate Opzava-owned summaries and forward no upstream `message` or `fixHint`.** An
unknown check preserves only safe severity and existence through the fixed unclassified-check
template. Classification can add exact static summaries later.

**Alternative: sanitize and forward upstream text.** Reject. Regex and control-character scrubbing
cannot prove secrets, paths, customer data, or plugin-provided values absent, and would violate the
ADR-013 pre-storage boundary.

### Approve append-only durability and fenced coordination

**Recommended: append-only run/finding history plus an expiring fenced lease.** It preserves failed
attempts and findings, supports projection rebuilds, and prevents stale workers from publishing.

**Alternative: the issue's mutable one-row JSONB cache.** Reject. It destroys history, makes failure
and recovery indistinguishable, cannot rebuild time-based projections, and couples coordination to
the latest display payload.

## Consequences

- Health gains durable, rebuildable evidence and explicit never, in-progress, stale, unavailable,
  degraded, and unknown states. It can never manufacture healthy from absence.
- Secrets are excluded structurally: upstream free-form fields are discarded before persistence, and
  the browser contract contains only Opzava-owned closed fields.
- Exit 1 and informational findings remain truthful without misclassifying either as scanner failure
  or degradation.
- The worker and database gain scheduler, retention, RLS, and lease complexity. Real-Postgres
  concurrency tests and built-image adapter proof are mandatory because in-memory tests cannot
  establish fencing or RLS behavior.
- The current platform topology remains explicit instead of being mistaken for the future tenancy
  target. Per-Gateway scope makes fleet expansion additive.
- Once this ADR is approved and #280 lands, #281 is architecturally unblocked but still requires its
  approved mockup.

## Alternatives

- **Add a `doctor.lint` Gateway RPC.** Rejected: it creates a second OpenClaw protocol surface for a
  CLI/runtime operation, while the existing `doctor.*` methods are unrelated memory tooling.
- **Regex-sanitize upstream `message`, `fixHint`, paths, and targets.** Rejected: no regex can prove
  a secret absent from arbitrary core or plugin-authored text. Closed templates are the boundary.
- **Store raw output and redact in the BFF.** Rejected: one missed query, export, projection, log,
  or future adapter would leak it; ADR-013 requires pre-storage redaction.
- **Use a mutable one-row JSONB cache.** Rejected: it is neither append-only nor reconstructable and
  loses unavailable attempts and finding history.
- **Hold a transaction or advisory lock across container execution.** Rejected: an 8-12 second exec,
  timeout, worker crash, or stuck child can wedge database coordination. Claim briefly, execute
  outside the transaction, and fence publication.
- **Reuse the existing Docker exec helper unchanged.** Rejected: it buffers the complete response
  and does not guarantee child termination on request timeout
  (`apps/workers/src/provisioning/docker-gateway-runtime.ts:2194-2257`).
- **Schedule in the broker or with process-local `setInterval`.** Rejected: the broker is the
  hot-path ACL, while process-local timers do not provide durable cadence, deduplication, or crash
  fencing.

## Residual risk

OpenClaw core and plugin authors can add new checks or alter payloads at any time. The default-safe
path preserves a finding's existence and validated severity but withholds detail until Opzava
classifies the check and owns a safe template. This intentionally reduces immediate diagnostic
detail rather than risking disclosure.

The exact in-container timeout binary and path remains **UNVERIFIED** until PR B proves it against
the built image. Until bounded reading and positive child-termination proof exist, the scanner must
not execute in a container.

The platform-scoped default is an owner decision, not a permanent topology amendment. If the owner
selects per-tenant now, the implementation brief must be revised before PR A; if ADR-002's dynamic
fleet later lands, scheduler discovery and authorization must bind every scope to its concrete
tenant Gateway without weakening RLS or browser isolation.

## Related decisions and issues

- ADR-002: current static Gateway amendment and deferred pure-per-tenant fleet
  (`docs/adr/ADR-002-tenancy-provisioning.md:3-10`).
- ADR-003: broker hot-path ACL and provisioning-worker admin/JIT authority.
- ADR-013: pre-storage redaction, platform/tenant visibility, and audited admin execution
  (`docs/adr/ADR-013-error-admin-card.md:134-159,179-189`).
- PRD-018: bounded admin remediation authority and secret-exclusion requirements
  (`docs/prd/PRD-018-admin-remediation.md:93-119`).
- Issues #275, #280, and #281: Health slices 1, 2, and 3.

---

> **Validate against official docs and the built image before implementing.** Training knowledge is
> a starting point, not the source of truth. In particular, prove the CLI envelope/exit behavior and
> in-container timeout/termination mechanism against the pinned mainframe image before PR B.
