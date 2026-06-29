# Opzava Module Dependency Graph

> The living map of how `src/opzava` modules depend on each other and on the inherited engine. This
> complements `folder-structure.md` (the *rules*) and the colocated `MODULE.md` files (per-module
> *context*). When you change a cross-boundary import, update this graph in the same commit.
>
> **Edge legend**
> - `-->` solid = a static **import** dependency (the graph enforced by `src/opzava/architecture.test.ts`).
> - `-.->` dashed = a **string/value coupling** not captured by imports (team's step-id arrays).
> - `==>` dotted = a **read-seam** across the engine boundary (read-only; never writes across).

## Mermaid

```mermaid
graph TD
  subgraph core["core — framework-independent domain"]
    secrets["secrets<br/>(SecretReference — root)"]
    artifacts["artifacts"]
    approvals["approvals"]
    workflows["workflows"]
  end

  subgraph modules["modules — feature slices"]
    content["content<br/>(+ campaign/send engine)"]
    team["team<br/>(roles, dept pipeline)"]
    social["social"]
    gva["general-va"]
  end

  subgraph platform["platform — cross-feature infra"]
    admin["admin-config"]
    runner["runner"]
    providers["providers<br/>(live/mock execution)"]
    audit["audit"]
    costs["costs"]
    obs["observability"]
    integrations["integrations<br/>(catalog + env/probes/1Password/test)"]
  end

  subgraph inherited["inherited engine A + app"]
    routes["src/app/api/* (thin routes)"]
    lib["src/lib (agents, audit_log, token_usage)"]
    logger["src/lib/logger"]
  end

  %% core internal
  artifacts --> secrets
  %% modules -> core (Dependency Rule: inward)
  content --> artifacts & approvals & workflows
  social --> artifacts & approvals
  gva --> artifacts & approvals
  %% modules -> platform (approved interfaces) — content only
  content --> runner & providers & admin
  %% the single cross-module import edge (via content public barrel; see ARD 0010)
  team --> content
  %% sanctioned platform -> core edge
  providers --> approvals
  admin --> secrets
  %% platform internal
  runner --> admin
  runner --> audit & costs
  providers --> admin & runner
  admin --> audit
  costs --> runner
  %% app / inherited edges
  routes --> content & team & admin & runner & audit & costs & integrations
  logger --> obs

  %% NON-import couplings
  team -.->|"step-id strings<br/>DEPARTMENT_PIPELINE_ORDER"| content
  team -.->|"step-id strings"| social
  team -.->|"step-id strings"| gva
  audit ==>|"read-only unified read"| lib
  costs ==>|"read-only unified read"| lib
```

## ASCII fallback (for agents that don't render Mermaid)

```
                         ┌──────────── ENGINE B: src/opzava ────────────┐
                         │                                               │
   core ──────────>  secrets (root)                      ┌── dashed: team step-id strings ──┐
       └── artifacts ──> secrets                         │   team ─ ─ ─> content / social /   │
       └── approvals                                    │                 general-va         │
       └── workflows                                    │   (not imports; enforced by        │
                         ▲                               │    test/stepid-coupling.test.mjs)  │
                         │ static imports (inward)       └────────────────────────────────────┘
   modules ──────────────┤
       content ──> core{artifacts,approvals,workflows}, platform{runner,providers,admin-config}
       content ──> team   (team ──> content via public barrel; the only cross-module import)
       social  ──> core{artifacts,approvals}
       general-va ──> core{artifacts,approvals}
   platform ────────────┐
       admin-config ──> core/secrets, audit          (admin-config re-exports SecretReference)
       runner ──> admin-config, audit, costs
       providers ──> admin-config, runner, core/approvals   (the one platform->core edge)
       costs ──> runner (cost-queries types)
       observability ──> (self-contained; consumed by src/lib/logger)
                         │
   app ──────────────────┘
       src/app/api/* ──> modules + platform (thin routes)
       src/lib/logger ──> observability

   ┄┄┄ dotted read-seams across the engine boundary (read-only) ┄┄┄
       audit  ═══> src/lib.audit_log       (unified audit count)
       costs  ═══> src/lib.token_usage     (unified cost summary)
                         │
                         ▼   boundary gate: the `agents` table (team <-> src/lib) — see ARD 0007,
                         │   enforced by test/engine-boundary.test.mjs
                         │
                         └──────────── ENGINE A: src/lib (inherited) ──────────┘
```

## Engine A — live surfaces (realtime spine + status registry)

Additive view of the **live `src/lib` surfaces** not modeled by the `src/opzava` graph above —
the realtime spine, the status-action registry, and the routes that drive them. These are Engine-A
internal edges (within `src/lib` + `src/app`) plus the sanctioned read-seams already shown. Full
per-surface context: `docs/architecture/engine-a-live-surfaces.md`. This subsection does not alter
the graph or legend above; it makes the live blind-edit zones navigable.

```mermaid
graph TD
  subgraph engineA_live["Engine A — live surfaces (src/lib + src/app)"]
    sse_events["GET /api/events<br/>(SSE: workspace + chat ACL + resync)"]
    sse_runs["GET /api/v1/runs/stream<br/>(SSE: run types only)"]
    chat_post["POST /api/chat/messages<br/>(write route)"]
    bus["event-bus.ts<br/>(singleton EventEmitter)"]
    outbox["realtime-events.ts<br/>(realtime_events outbox + framing)"]
    status["status-actions.ts<br/>(STATUS_ACTIONS registry)"]
    status_route["GET /api/status"]
    chat_hook["use-server-events.ts<br/>(browser SSE hook)"]
    audit_log["audit_log / db_helpers<br/>(inherited)"]
    messages_tbl["messages table<br/>(inherited)"]
  end

  subgraph opzava_substrate["opzava (read-seams only — no writes across)"]
    obs["platform/observability"]
    content_resolvers["content: resend/wp resolvers"]
  end

  logger["src/lib/logger"]

  %% SSE routes -> spine
  sse_events --> bus
  sse_events --> outbox
  sse_runs --> bus
  sse_runs --> outbox
  %% outbox is the realtime_events table
  outbox ==>|"INSERT/read realtime_events"| outbox_tbl["realtime_events (DB)"]
  bus -->|"record-then-emit<br/>(lazy require)"| outbox
  %% chat write route
  chat_post --> messages_tbl
  chat_post --> bus
  chat_post -->|"logAuditEvent chat_message_sent"| audit_log
  %% status registry
  status_route --> status
  status ==>|"sanctioned read-seam"| content_resolvers
  %% client + observability
  chat_hook -.->|"EventSource GET"| sse_events
  logger --> obs
```

ASCII fallback (live surfaces only; the `src/opzava` graph above is unchanged):

```
   ENGINE A — live surfaces (src/lib + src/app) — additive to the graph above

   SSE routes ─────────> event-bus ──> realtime-events ──> realtime_events (DB outbox)
     /api/events            │            (record-then-emit;   ↑
     /api/v1/runs/stream    │             framing + replay)   │
                            │                                 │
                            └─> (lazy require, avoids db cycle)┘

   chat write route ─┬─> messages (INSERT)
     POST /api/chat/ ├─> audit_log   (logAuditEvent chat_message_sent — unified audit)
       messages      ├─> event-bus ──> realtime-events (outbox row, post-IO, NOT in a tx)
                     └─> db_helpers  (logActivity, createNotification)

   status registry ───> GET /api/status ──> STATUS_ACTIONS table (overview/dashboard/...)
     status-actions.ts  ────────────────==> content resolvers (read-seam; no write across)

   browser:  use-server-events.ts  ─ ─ EventSource ─ ─>  /api/events  ──> Zustand store
   logging:  src/lib/logger  ──>  opzava/platform/observability

   ── edges above the ENGINE A box are the read-seams already in the main graph ──
   ── NO edge crosses the team<->src/lib WRITE boundary (test/engine-boundary.test.mjs) ──
```

Notes specific to the live surfaces:
- **`event-bus → realtime-events` is a lazy `require()`** inside `broadcast`
  (`src/lib/event-bus.ts:69`) to avoid a `db.ts → event-bus.ts → db.ts` module cycle. Do not hoist
  it to a static import.
- **`chat POST → event-bus` runs AFTER gateway I/O** (up to ~21s) and the durable writes are NOT
  wrapped in a transaction — a CONFIRMED correctness gap, not a graph edge to "fix" by adding a
  new module (see `92-stale-findings.md` P1-1/P1-2).
- **`status-actions → content resolvers` is a sanctioned read-seam**, the same pattern as
  `audit`/`costs ⇒ src/lib` in the main graph: read-only config/secret resolution, never a
  provider execution (live probes stay at `POST /api/connections/test`).
- **`logger → observability`** is the one Engine-A→Engine-B edge already present in the main
  graph; repeated here for completeness.

## Notes

- **Acyclic.** All solid edges form a DAG; `src/opzava/architecture.test.ts` rejects cycles and the
  "platform must not import modules" / "core must not import platform" / "no cross-module internals"
  rules (the last two added in the realignment). The only `platform → core` edge is
  `providers → core/approvals` (the approval gate) — intentional and sanctioned.
- **`core/secrets` is the root** of the opzava graph (no dependencies). `core/artifacts` depends on it.
- **The team step-id coupling is invisible to import analysis** — that is exactly why
  `test/stepid-coupling.test.mjs` exists: to make a string-typed dependency machine-checkable.
- **Read-seams are read-only.** `audit`/`costs` read the inherited `audit_log`/`token_usage` tables
  for unified summaries but never write across the boundary (ARD 0007).
