# 61 — Frontend (deep)

> Zone: `src/app/` (pages), `src/store/` (Zustand, ~1.2k LOC), `src/components/` (44 panels + layout +
> dashboard). A single-page App-Router shell. Marks: ✅ verified (second pass, all claims re-checked
> vs source) · ⚠️ correction applied this pass. See [`99-verification-register.md`](./99-verification-register.md).

## App shell & routing ✅

Only **4** `page.tsx` exist: `[[...panel]]/page.tsx` (the **whole SPA** — the optional catch-all matches `/`,
`/tasks`, `/artifacts`, …), plus `login/`, `setup/`, `docs/`. Root `layout.tsx` is a layout, not a page
(⚠️ pass-1 said "5", conflating `layout.tsx`).

- **URL → tab**: `panelFromUrl = pathname==='/' ? 'overview' : pathname.slice(1)` → `setActiveTab(...)`
  (`sessions` normalized to `chat`). `activeTab` is a single Zustand string.
- **Boot** (one mount effect, 9 tracked steps `auth→capabilities→config→connect→agents→sessions→projects→
  memory→skills`): `/api/auth/me` (→ `/login` on 401), update-banner checks, `/api/status?action=capabilities`
  (decides `dashboardMode` full|local, gateway availability, whether to open the WS), `/api/onboarding`,
  then a parallel preload of agents/sessions/projects/memory/skills into the store. `useServerEvents()` opens
  SSE unconditionally.
- **Layout**: `flex h-screen` → `NavRail` | (`HeaderBar` + banners + `<main>` with `ContentRouter`) | `LiveFeed`.
- **`ContentRouter`** (`page.tsx`): a `switch(tab)` returning the panel. Essential-mode guard hides
  non-essential tabs; some tabs branch on `dashboardMode==='local'` (gateways/channels/nodes/exec-approvals
  render a "local mode unavailable" shell); `default:` → plugin panel → `Dashboard`.

⚠️ Adding a panel means editing **three** places: a `case` in `ContentRouter`, a `NavItem` in `nav-rail.tsx`,
an import in the shell. No per-panel Next route — one client bundle (aside from plugin panels).

## State — one Zustand store ✅

`useMissionControl = create(subscribeWithSelector(...))` (`src/store/index.ts`). Flat bag of ~30 slices
(no slice files): mode/boot, `connection:{isConnected (WS), sseConnected (SSE)}`, tasks/agents/activities/
notifications/comments, sessions/logs/cron/spawn/memory/tokens/models (capped + deduped), chat (optimistic
helpers), auth/tenant/project (persisted to `localStorage`), exec-approvals queue, persisted UI prefs
(**10** `mc-*` keys, SSR-guarded).

**Live wiring**: SSE (`use-server-events.ts`) calls store reducers directly (`task.created→addTask`, etc.),
uses browser-native EventSource reconnection, and dedupes durable event ids before dispatch. Store insert
reducers for tasks, agents, and notifications are idempotent by entity id so replay is safe. WS (`websocket.ts`)
feeds sessions/logs/spawn/cron, closes deterministically when browser send buffering exceeds 1 MiB, rejects
oversized text frames, and truncates malformed-frame logging. The terminal UI (`terminal-view.tsx`) uses the
same 1 MiB send-buffer guard for `/ws/pty` and a connection-generation guard so stale async setup cannot
overwrite a newer terminal/socket. ⚠️ **Disjoint ownership**:
SSE owns local-DB entities; WS owns
gateway/session/log/spawn/cron.

## Data flow ✅

- `apiFetch<T>` (`api-client.ts`): canonical REST wrapper with centralized 401→`mc:auth-expired`+redirect,
  403/404/5xx typed errors. `AuthExpiredListener` (in layout) handles expiry app-wide.
- `useSmartPoll`: visibility-aware polling that pauses while WS/SSE connected.
- ⚠️ **Mixed fetch discipline**: only `ops-failures-panel` + the Dashboard use `apiFetch`; the other opzava
  panels (team, content-runs, artifacts, ops-costs, campaigns, maintenance, **approval-queue**) use **raw `fetch`** and only
  handle `res.ok` — so they silently fail-to-error-string on 401 instead of triggering the global redirect.

## Panel inventory ✅

44 panels in `src/components/panels/`. **8 are opzava-native** (the rest inherited):

| panel | route(s) | shows |
|-------|----------|-------|
| `team-dashboard-panel` | `/api/team/agents` (+ PATCH) | virtual staff by department + pipelines |
| `content-runs-panel` | `/api/ops/runs` (GET/POST) | runs summarized from operational events |
| `artifacts-panel` | `/api/ops/artifacts[/:id]` | artifacts + lineage + validation status |
| `approval-queue-panel` | `/api/ops/approvals[/:id]/decide` | human approval queue (the gate) |
| `ops-costs-panel` | `/api/ops/costs` | runner cost events + summary |
| `ops-failures-panel` | `/api/ops/dead-letters` | dead letters (uses `apiFetch`) |
| `campaigns-panel` | `/api/campaigns[/:id]/{approve,run}` | compose/approve/run email campaigns |
| `maintenance-panel` | `/api/ops/maintenance/prune` | runner retention GC |

These are deliberately **thin, read-mostly** views; orchestration/state-machines/validation stay server-side.
⚠️ Unlike the inherited gateway panels, the 8 opzava panels are **not** `dashboardMode`-gated — they render
in both local and full mode. ⚠️ Their TS interfaces (`RunSummary`, `ArtifactDetail`, `CostEvent`, …) are
**hand-declared local copies** of the server response shapes — they can drift from `@/opzava` contracts.

The largest inherited panels (by size): `agent-detail-tabs` (124KB), `task-board-panel` (114KB), `office-panel`
(104KB), `cron-management-panel` (74KB). ⚠️ `nav-rail` (72KB) is **not** a panel — it lives in `layout/`,
not `panels/`; the largest *panel* proper after the four above is `agent-squad-panel-phase3` (~52KB).

## Layout & shared ✅

- **NavRail** (`layout/nav-rail.tsx`, the panel registry): 4 nav groups — `core` (overview, agents, team,
  tasks, chat, channels, skills, memory), `observe` (activity, logs, cost-tracker, nodes, exec-approvals,
  **failures, costs, approval-queue, content-runs, artifacts**, office, monitor), `automate` (**campaigns**, cron, webhooks, alerts, github),
  `admin` (security, users, audit, **maintenance**, gateways, integrations, settings). Collapsible, persisted,
  essential/full toggle, mobile bottom bar. Icons are inline SVG (no icon lib, per project rule).
- **HeaderBar**: ⌘K command search (`/api/search`), connection/SSE badges, project chip, notifications bell.
- **LiveFeed**: right-rail merge of store logs + activities + sessions (pure store reader — reflects SSE/WS).
- **Dashboard** (`overview`): `useSmartPoll(loadDashboard, 15s/60s)` → widget grid.

## Serialization boundary ✅ (design invariant)

The client only receives JSON from REST/SSE/WS — no secrets, provider credentials, file/DB handles. Credentials
live in admin settings/secret refs server-side. The store's typed interfaces are the contract.

## Subtleties for parity comparison

1. The entire UI is one catch-all route + a `switch` — no route-level code splitting; panels aren't isolated.
2. `activeTab` is an unvalidated string; unknown tabs fall to plugin→Dashboard; `sessions↔chat` aliasing is
   hand-maintained in 3 places.
3. Two realtime channels with disjoint ownership; `useSmartPoll` consumers must set the right `pauseWhen*`.
4. Opzava panels mostly use raw `fetch` (no global 401 handling) and carry hand-copied response types.
