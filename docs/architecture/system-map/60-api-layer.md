# 60 — API Layer (deep)

> Zone: `src/app/api/` — 165 `route.ts` files (Next.js 16 App Router). Two generations coexist: thin
> opzava-native routes that delegate to `@/opzava`, and inherited routes with inline SQL + business logic.
> Marks: ✅ verified (second pass, re-checked vs source — route count, auth floors, group counts, v1/openapi
> all confirmed) · ⚠️ correction/parity flag. See [`99-verification-register.md`](./99-verification-register.md).

## Conventions ✅

File-based routing; handlers named for the HTTP verb; dynamic params are a `Promise` (Next 16) and are
`await`ed. Responses: `NextResponse.json(...)` with conventional codes (200/201/400/401/403/404/409/429/500).
Error shape is uniformly `{ error: string }`.

## Auth & middleware — one shared gate ✅

`requireRole(request, minRole)` (`src/lib/auth.ts:632`) is universal: it calls `getUserFromRequest` and
enforces `viewer(0) < operator(1) < admin(2)`, returning `{user}` or `{error,status}`. Every route uses:
```ts
const auth = requireRole(request, 'admin')
if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
```
Three credential paths, resolved in order (`auth.ts:435-562`): (1) trusted proxy header (only from
`MC_PROXY_AUTH_TRUSTED_IPS`), (2) session cookie (SHA-256-hashed tokens), (3) API key — global
(`settings.security.api_key` or env, synthesizes an **admin** user) or agent-scoped (`agent_api_keys`,
role from scopes). Mutations call `mutationLimiter` (60/min) and bail on 429. Public routes (no
`requireRole`): `health`, `index`, `docs`, `setup`, `releases/check`, `openclaw/version`, `schedule-parse`,
`auth/logout`, `auth/google/disconnect`, and `auth/login`/`auth/google` (rate-limited instead) — **10** total.
⚠️ pass-1 listed 9, omitting `auth/logout` + `auth/google/disconnect`.

## Opzava-native surfaces (thin, delegate to `@/opzava`) ✅

All require **admin**. They are the HTTP boundary over the opzava platform/modules:

| method + path | calls (`@/opzava/...`) |
|---|---|
| `GET /api/ops/runs` | `runner/run-queries → listRecentWorkflowRuns` |
| `POST /api/ops/runs` | `modules/content → runAndRecordContentWorkflow` (**mock**, draft-only) |
| `GET /api/ops/approvals` · `POST .../[id]/decide` | `core/approvals` repo + `transitionApprovalStatus` (409 on illegal) |
| `GET /api/ops/artifacts[/:id]` | `modules/content/artifacts/artifact-repository` |
| `GET /api/ops/costs` | `runner/cost-queries` |
| `GET /api/ops/dead-letters` | `runner/dead-letter-queries` |
| `POST /api/ops/maintenance/prune` | `runner/retention → pruneRunnerData` |
| `GET/POST /api/campaigns` · `POST .../[id]/{approve,run}` | `modules/content` campaign (⚠️ `run` = the one LIVE side effect, F1) |
| `GET /api/team/agents` · `PATCH .../[id]` | `modules/team` |
| `POST /api/connections/test` | `modules/content/providers` connection verifier (never returns the secret) |

Repositories self-provision via `ensureSchema()`/`seedDefaults()` on use — routes never own DDL beyond the
runner migration helper. ✅ **The thin-route invariant holds for opzava-native routes** (workflow policy,
retries, provider orchestration live in `@/opzava`, not the route). The one wrinkle: `ops/runs/POST` and
`campaigns/[id]/run/POST` assemble provider dependency graphs inline (DI at the boundary, not policy).

## Inherited surfaces (inline DB + logic) ✅

| group | #routes | what |
|---|---|---|
| agents | 17 | registry CRUD, soul/memory, heartbeat, **agent-scoped API keys** (admin) |
| tasks | 8 | board CRUD + atomic `queue` claim + Aegis gate |
| memory | 7 | markdown memory tree + FTS5 search/graph |
| auth | 7 | login/logout/me/users/access-requests + Google OAuth |
| sessions / gateways | 12 | live session control + transcripts; gateway registry/control/health |
| super | 6 | multi-tenant provisioning (admin-only) |
| webhooks | 5 | outbound webhook CRUD + retry/test/log |
| + ~90 more single/small groups | | tokens, chat, projects, security-scan, hermes, claude/openclaw, pty/spawn, activities, events(SSE), settings, backup, cron, audit, etc. |

⚠️ **Inherited routes violate the thin-route ideal by design** — substantial inline `better-sqlite3` and
business logic; the invariant is enforced only for new `src/opzava/` code (CLAUDE.md: "the inherited
dashboard/operators layer is preserved"). Role floors: read=viewer, mutate=operator, destructive/secret/
super=admin.

## Versioned API — `api/v1/*` ✅

The Agent-Run-Protocol v0.1.0 over `@/lib/runs` (header `X-Agent-Run-Protocol: 0.1.0`): `runs`
list/create/get/patch, `runs/[id]/eval`, `runs/[id]/provenance`, `runs/stream` (SSE),
`evals/leaderboard`. Genuinely thin wrappers, workspace-scoped to `auth.user.workspace_id ?? 1`.

## openapi.json ✅

`openapi.json` (333 KB, `openapi:3.1.0`, "Opzava API" v1.3.0) is **hand-maintained**, served by
`GET /api/docs`, rendered at `/docs`. NOT generated from routes — `scripts/check-api-contract-parity.mjs`
(`pnpm api:parity`, **runs in CI**) diffs route HTTP exports against the spec's paths, with an ignore file.

## Request flow

```
HTTP → match route.ts → verb handler(req,{params})
  → requireRole (proxy hdr / session cookie / API key)   [public routes skip]
  → mutationLimiter / loginLimiter (mutations) → 429
  → validate (Zod .parse | validateBody | parse*/transition* throw) → 400
  → INHERITED: getDatabase() + inline SQL (+ @/lib/* service) + eventBus.broadcast (SSE)
    OPZAVA:    createXRepository(getDatabase()).ensureSchema() → @/opzava service → repo.save
  → NextResponse.json(payload, {status})
SSE routes (events, v1/runs/stream): Response(ReadableStream) subscribing eventBus, 30s heartbeat
```

## Parity flags ⚠️

1. **openapi.json hand-maintained** — drift possible; `api:parity` (+ ignore file) is the only contract gate
   in CI. Confirm opzava-native paths are in the spec or the ignore file.
2. **Workspace scoping inconsistent** — newer routes use `enforcement/workspace-scope`; many inherited and
   **all opzava** routes fall back to `workspace_id ?? 1` (opzava repos are single-workspace, no tenant
   filter) — a tenant-isolation gap.
3. **Global API key = synthetic admin** — any caller with `API_KEY` gets full admin across every admin-gated
   opzava route (run workflows, decide approvals, send live campaigns, prune). Logged but not restricted;
   agent-scoped keys are the least-privilege path.
4. **Rate-limiter state is in-process** — not shared across multiple instances.
5. `campaigns/[id]/run` is the only opzava route with a live external **side effect** (real Resend send, F1);
   failures route to runner dead-letters. ⚠️ `connections/test` also makes a live *outbound* call, but it is a
   read-only reachability check (no mutation, never returns the secret) — so F1's "only live side effect" holds.
