# Slice 2.5 design memo: Claude Code MCP + live Task Card

Research + design only. This memo locks Slice 2.5: local Claude Code controls Opzava Tasks through
an Opzava-owned MCP server, Task cards become live human-readable work records, Ask Admin Opzava
moves to its own page, and Issues syncs with GitHub without making GitHub the Opzava source of
truth.

## Verdict summary

Build Slice 2.5 as an Opzava product slice, not as a direct OpenClaw or GitHub shortcut:

1. Create an Opzava-hosted MCP server as a separate app that exposes only governed `opzava_tasks_*`
   tools. The server derives authority from an admin-issued link token and constructs the same
   on-behalf-of `ToolExecutionContext` that Slice 2d uses. Local Claude Code is a client
   attribution, never authority.
2. Extend Project Management for the full `pm.Card` surface: stable human card handles, due dates,
   provenance, watchers, steps, comments/read markers, evidence refs, quality review, issue links,
   and activity. OpenClaw Workboard remains separate per ADR-004.
3. Add `ObjectStorePort` and an S3-compatible MinIO adapter for card evidence/files. The UI opens
   and uploads through authenticated Opzava routes, not public object URLs.
4. Move Ask Admin Opzava from the interim Tasks side panel into a dedicated `/ask-opzava` page wired
   from the sidebar. The Tasks board remains a live board and receives MCP, assistant, and browser
   mutations through the same task activity stream.
5. Add `IssueTrackerPort` and a GitHub adapter for this repo's issues. GitHub is the issue source of
   truth; Opzava owns projections, triage, task links, write-through close, audit, and divergence
   display.
6. Treat mockup functional parity as the backbone: any visible control on the implemented Ask,
   Tasks, Card, and Issues screens either works against real data or is not rendered in Slice 2.5.
   Disabled placeholder chrome is a bug.

The load-bearing invariant remains unchanged from Slice 2: all tenant data access runs under
`withTenant`/RLS and `AuthorizationPort`; runtime work goes through the broker and Runtime-Control
receipts; tool policy and application services are authority, not model text.

## Sources and constraints

- Slice contract: `docs/plan/EXECUTION.md` Slice 2.5 says the local Claude Code session controls the
  Tasks board through Opzava's MCP server; the card detail follows `essential-card.html`; Ask Admin
  relocates to its own page; canonical mockups are `orchestrator-chat.html`, `task-board.html`,
  `essential-card.html`, and `issues.html`.
- Q16: `docs/plan/grilling-decisions.md` locks local Claude Code as an external client to Opzava's
  MCP server, not ACP-hosted; authority is hybrid on-behalf-of and link-token based.
- Mockup parity: `CLAUDE.md` and `docs/plan/EXECUTION.md` require every visible element on an
  implemented mockup screen to function live, with real data and interactions.
- Current Slice 2 implementation: `packages/runtime-control/src/application/task-tools.ts` exposes
  `opzava_tasks_list`, `opzava_tasks_create`, and `opzava_tasks_update`; `ToolExecutionContext` is
  branded and constructible from a session-derived principal only in
  `packages/runtime-control/src/application/assistant-conversations.ts`.
- Current Tasks UI: `apps/web/components/tasks/tasks-board.tsx` still mounts the interim Ask Admin
  panel; `apps/web/components/shell/admin-nav.tsx` renders `Ask Opzava` as disabled, which is
  explicitly the Slice 2.5 parity violation to fix.
- OpenClaw: `docs/openclaw/cli/mcp.md` distinguishes OpenClaw's own stdio MCP bridge from
  OpenClaw-managed outbound `mcp.servers`; `docs/openclaw/gateway/configuration-reference.md`
  supports remote `mcp.servers` entries with `transport: "streamable-http"` or `"sse"`;
  `docs/openclaw/tools/acp-agents.md` says ACP is the Gateway-hosted external-harness path, not the
  local Claude Code path; `docs/openclaw/gateway/config-tools.md` says tool policy deny wins and
  `minimal` is `session_status` only.
- MCP official docs: the 2025-06-18 transport spec defines stdio and Streamable HTTP as standard
  transports, says Streamable HTTP uses one endpoint supporting POST and GET, and requires origin
  validation, local bind discipline, and authentication for HTTP servers:
  <https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>.
- MCP TypeScript SDK docs: the official build-server guide uses `@modelcontextprotocol/sdk` for
  TypeScript servers and registers tools through `McpServer`:
  <https://modelcontextprotocol.io/docs/develop/build-server>.
- GitHub official docs: REST Issues supports list, create, get, and update issue operations, and
  update can close a linked issue with Issues write permission:
  <https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28>. Rate-limit handling must
  honor `retry-after`, `x-ratelimit-remaining`, and `x-ratelimit-reset`:
  <https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28>.
- Object storage docs: `docs/plan/official-docs.md` lists MinIO as the official S3-compatible
  object-store reference; AWS SDK for JavaScript v3 official examples cover `S3Client`,
  `PutObjectCommand`, `GetObjectCommand`, `ListObjectsV2`, and deletion:
  <https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html>.

## Locked recommendations

### 1. Opzava MCP server

Recommendation: create a new `apps/mcp-server` package (`@opzava/mcp-server`) that hosts a remote
Streamable HTTP MCP endpoint at `/mcp`. Do not put the MCP transport in `apps/web` or
`apps/gateway-broker`.

Why this shape:

- Q16 says Claude Code runs locally and connects to Opzava's own MCP server; ACP is rejected because
  it runs the harness on the Gateway host (`docs/plan/grilling-decisions.md`,
  `docs/openclaw/tools/acp-agents.md`).
- Streamable HTTP is the correct primary transport for an Opzava-hosted server because the MCP
  transport spec treats it as the remote, independent-process server path. Stdio is still useful for
  local subprocess servers, but would make Opzava ship a local bridge instead of the hosted product
  seam.
- OpenClaw P1 gateway registration becomes pure config: `mcp.servers.opzava` can point to the same
  remote endpoint with `transport: "streamable-http"` and an Authorization header, as documented in
  `docs/openclaw/gateway/configuration-reference.md`. Slice 2.5 does not register it into Gateway
  yet because Q16 defers the autonomous-agent principal question to P1.
- A separate app matches existing DDD boundaries: the MCP transport adapts external clients into
  Opzava application services, while `packages/runtime-control` and `packages/project-management`
  stay transport-agnostic.

Transport and dependencies:

- Add `@modelcontextprotocol/sdk` in `apps/mcp-server`, pinned during implementation against the
  official MCP build-server docs. If the SDK release still requires `zod@3`, keep that dependency
  local to `apps/mcp-server`; do not force the existing `apps/web` zod version or leak zod schemas
  into package ports.
- Use Streamable HTTP only for the product endpoint. If the local Claude Code build being used by
  the operator cannot yet consume remote MCP servers, add a thin stdio proxy command in the same app
  that forwards MCP JSON-RPC to the hosted endpoint. The proxy is transport glue only and must not
  duplicate tool logic or token validation.
- Enforce the MCP HTTP security requirements from the official transport spec: valid Authorization,
  strict origin/CORS allowlist, payload caps, request timeouts, and no unauthenticated GET stream.

Link-token auth:

- Add an Identity & Access owned link-token table in the Slice 2.5 migration stream:
  `mcp_link_tokens(id, organization_id, workspace_id, user_id, client_id, token_hash, token_prefix, scopes, expires_at, revoked_at, membership_version, session_version, created_by_user_id, last_used_at, created_at, updated_at)`.
- The admin UI issues the token, shows it once, stores only a hash, and records scopes `tasks:read`
  and/or `tasks:write`. Use a random 32-byte token plus server-side hashing; never store raw token
  material. If a pepper is used, it is an env/vault secret, not source.
- Validation fails closed when the token is expired, revoked, hashed mismatch, wrong scope, wrong
  organization/workspace, membership version changed, session version changed, or the user is no
  longer active. Every failure is an auth error, not a hidden empty tool result.
- After validation, construct a branded `ToolExecutionContext` from the token-bound user, workspace,
  organization, and client attribution `viaClient: "claude-code"`. Tenant/user ids from MCP tool
  arguments are rejected as malformed/untrusted text.

Tool registry:

- Keep the existing Slice 2d tools and extend the registry with card-surface tools. Exact names:
  - `opzava_tasks_list({ status?, limit? })`
  - `opzava_tasks_get({ taskIdOrKey })`
  - `opzava_tasks_create({ title, description?, status?, priority?, labels?, dueAt?, steps?, watchers? })`
  - `opzava_tasks_update({ taskIdOrKey, title?, description?, status?, priority?, labels?, dueAt? })`
  - `opzava_tasks_steps_list({ taskIdOrKey })`
  - `opzava_tasks_steps_create({ taskIdOrKey, title, assigneeUserId? })`
  - `opzava_tasks_steps_update({ taskIdOrKey, stepId, title?, assigneeUserId?, done? })`
  - `opzava_tasks_steps_delete({ taskIdOrKey, stepId })`
  - `opzava_tasks_comments_list({ taskIdOrKey, limit? })`
  - `opzava_tasks_comments_create({ taskIdOrKey, body })`
  - `opzava_tasks_comments_update({ taskIdOrKey, commentId, body })`
  - `opzava_tasks_comments_delete({ taskIdOrKey, commentId })`
  - `opzava_tasks_watchers_list({ taskIdOrKey })`
  - `opzava_tasks_watchers_add({ taskIdOrKey, userId })`
  - `opzava_tasks_watchers_remove({ taskIdOrKey, userId })`
- Each tool description embeds the `.claude/skills/opzava-task-authoring/SKILL.md` contract:
  human-readable titles, context/impact/evidence descriptions, verifiable steps, status-forward
  comments, honest labels, and no invented ids.
- All write tools use the Runtime-Control outcome-first protocol from Slice 2: record the started
  receipt before mutation, call Project Management/Internal Collaboration services under
  `withTenant`, then write the result summary and target ref. Duplicate same payload returns the
  recorded outcome; duplicate conflicting payload returns conflict.
- `forbidden` and `not_found` stay distinct: `AuthorizationPort` denial maps to `forbidden`; row
  absence under a valid tenant context maps to `not_found`.

### 2. Task model extension and 0004 RLS migration

Recommendation: extend Project Management as the owner of the card write model and add a narrow
Internal Collaboration seam for comments/read markers where the ADR-009 durable-chat model later
generalizes. Keep one Slice 2.5 SQL migration `0004_slice2_5_live_card.sql` in the existing ordered
migration stream and copy the 0002/0003 RLS pattern exactly: owner, explicit grants to `opzava_app`,
`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, permissive current-org policy, restrictive
no-context policy, and composite tenant foreign keys.

Core card fields:

- Add to `tasks`: `card_sequence`, `card_key`, `due_at`, `provenance_kind`, `provenance_summary`,
  `source_client`, `archived_at`, `completed_at`, `version`, and `last_activity_at`.
- Add workspace-level card prefix configuration or a `workspace_card_sequences` table. The handle
  format is `PREFIX-N`, matching the `essential-card.html` explanatory copy for `CS-1042` and the
  copy chip. Sequence allocation occurs inside one tenant transaction with `SELECT ... FOR UPDATE`.
  Gaps are acceptable and never reused.
- Add uniqueness on `(organization_id, workspace_id, card_key)` and
  `(organization_id, workspace_id, card_sequence)`; add a composite FK from each child table back to
  `(tasks.id, tasks.organization_id)`.

Child tables:

- `task_steps`: `id`, `organization_id`, `workspace_id`, `task_id`, `position`, `title`,
  `assignee_user_id`, `done_at`, `done_by_user_id`, `source`, `created_by_user_id`, timestamps.
  Per-step assignee and done state power the `essential-card.html` step checklist and counter.
- `task_watchers`: `organization_id`, `workspace_id`, `task_id`, `user_id`, `added_by_user_id`,
  timestamps. This backs watcher avatars and notifications.
- `task_comments`: `id`, `organization_id`, `workspace_id`, `task_id`, `author_user_id`,
  `author_agent_key`, `via_client`, `body`, `assistant_turn_id`, `edited_at`, `deleted_at`,
  timestamps. Exactly one human or agent author is required.
- `task_comment_reads`: `organization_id`, `workspace_id`, `task_id`, `comment_id`, `user_id`,
  `read_at`. This backs "Read by Echo" and "Sent - not read yet".
- `task_evidence_objects`: object metadata refs only: `id`, `task_id`, `object_key`, `file_name`,
  `mime_type`, `size_bytes`, `provenance_kind`, `provenance_summary`, `uploaded_by_user_id`,
  `assistant_turn_id`, `tool_outcome_id`, timestamps.
- `task_evidence_links`: external links such as GitHub issue, customer ticket, or trace URL, with
  type, label, URL/ref, provenance, and timestamps.
- `task_quality_checks`: `id`, `task_id`, `label`, `kind` (`assistant_precheck` or `human_check`),
  `status`, `checked_by_user_id`, `assistant_turn_id`, `tool_outcome_id`, `details`, timestamps.
- `task_reviewers`: `task_id`, `reviewer_user_id`, `status`, `decision_comment_id`, timestamps.
- `task_issue_links`: `task_id`, `provider`, `repo_owner`, `repo_name`, `issue_number`,
  `issue_node_id`, `linked_by_user_id`, `sync_status`, timestamps.
- `task_activity_events`: append-only, tenant-scoped events with actor, via-client, target refs,
  payload summary, idempotency key, and created time. This is the activity/audit backbone for
  actor-via-claude-code and live task SSE.

Application services:

- Extend `@opzava/project-management` services rather than writing SQL in web routes or MCP
  handlers. Services must include `getTaskByKey`, step CRUD, watcher CRUD, due update, evidence
  metadata, quality checks/reviewers, issue link/unlink, and task activity append.
- All services accept a session-derived application context; they never trust model/browser tenant,
  user, or workspace ids.
- Board and card reads return DTOs suitable for UI write-through updates; OpenClaw refs and GitHub
  refs are opaque value objects or projection metadata, not authority.

### 3. Card detail page: every element live

Recommendation: build `/tasks/[cardKey]` as the canonical card detail route. The route resolves the
human handle under tenant/workspace authorization and renders the `essential-card.html` surface with
no dead controls.

Required live behavior by mockup element:

- Breadcrumb and `#CS-1042` chip (`essential-card.html` lines 83, 92): use the resolved card key.
  Copy writes the card key to clipboard; copy failure shows an accessible fallback.
- "What's this ID?" popover (line 94): live disclosure using the workspace prefix and sequence
  policy; no static `CS` explanation unless that is the actual workspace prefix.
- Mark done and confirmation dialog (lines 102, 291): calls `completeTask`; warns on unresolved
  quality gates, open steps, pending assistant draft, or linked issue close failure. If a linked
  GitHub issue exists, close it through `IssueTrackerPort` as an audited write-through action;
  already closed is success, GitHub failure queues retry and shows divergence.
- Overflow menu (line 107): Copy link, Re-assign, Move to column, Put on hold, Archive card all call
  real PM services. Put on hold requires a reason comment; archive is soft delete with audit.
- Title, status/label/due chips, assigned-to, provenance, watcher avatars (lines 122, 138): all come
  from Project Management DTOs. Assignee hovercard uses human/AI identity projections, not hardcoded
  Echo text.
- Overview tab (lines 148, 154): description, step counter, steps, comments, read receipts, AI
  replying, human typing, mention popover, and comment composer are backed by services and SSE.
  Typing is an interim in-memory TTL feed for one web instance; P2 swaps transport to WS+Redis
  without changing UI semantics.
- AI Run tab (line 149): reads Runtime-Control `assistant_turns` and `assistant_tool_outcomes` whose
  target refs point at the card, then maps queued/streaming/finalizing/final/failed into
  plain-language steps. The live elapsed ticker derives from turn timestamps and stops when final.
- Evidence & Files tab (line 150): add `ObjectStorePort` in `packages/ports`, a MinIO/S3 adapter in
  `packages/adapters`, and authenticated upload/open routes in `apps/web`. Files are private,
  tenant-scoped, size-capped, mime-allowlisted, and stored with provenance. The badge count is the
  real count of evidence objects plus links.
- Quality Review tab (line 151): assistant pre-checks are recorded from tool outcomes; human checks
  and reviewer decisions are Project Management commands. "Approve & send to customer" only renders
  when there is a concrete send target and approval action; otherwise render the real next action
  such as "Approve card result". No fake customer send.
- Modal focus, tab keyboard behavior, menu focus, and ARIA live regions mirror the mockup scripts
  but are implemented in React with real service calls.

Object storage:

- Add MinIO to the compose parity stack if it is not already present, with private internal service
  networking. The app reads endpoint/access refs from env/vault-backed config, never source.
- Use `@aws-sdk/client-s3` for the adapter because the official AWS SDK v3 examples cover the S3
  operations needed and MinIO is selected as S3-compatible storage in `docs/plan/official-docs.md`.
- Do not expose public object URLs. `Open` streams through an authenticated route that re-checks
  task access and logs the read. Upload goes through a route that enforces size, content type, and
  tenant quota before `PutObject`.

### 4. Ask Admin Opzava page and Tasks-panel removal

Recommendation: create a dedicated Ask page at `/ask-opzava`, make the sidebar `Ask Opzava` entry an
active link, and remove `AskAdminPanel` from the Tasks board once the page ships. The page uses the
existing Slice 2 Runtime-Control conversation loop and broker stream but expands the visible surface
to the `orchestrator-chat.html` contract.

Live behavior by mockup element:

- Sidebar current item and warning dot (`orchestrator-chat.html` lines 451, 495): `Ask Opzava` is a
  link with route state. The warning dot is backed by unread/pending admin attention count or not
  rendered. Non-slice rail entries from the mockup, such as Costs/Logs/Integrations/Alerts (lines
  467-473), are only rendered if their route is live; disabled placeholders violate the hard rule.
- Header health pill and account avatar (around lines 489-516): source health from Opzava app health
  plus broker/Gateway route state; avatar from the session user.
- Page title/subtitle (line 516): real page metadata. "Platform oversight..." is kept only if the
  backing digest spans the real available surfaces: tasks, issues, runtime health, and activity.
- Proactive digest table and Review/Fix links (lines 566-570): generated from Project Management
  board/card summaries, GitHub issue projections, Runtime-Control failures, and notifications. Links
  navigate to real Task/Card/Issue/Activity pages.
- "Want me to chase the blocker?" Yes/No (lines 618-620): Yes creates or updates a real task/comment
  via the governed tool registry and posts an assistant turn; No records dismissal/read state. Both
  write activity.
- User message and assistant stream (lines 650-661): existing Slice 2 SSE path, persisted turns,
  deltas, finalization, duplicate-send conflict, gateway unavailable, policy denied, and interrupted
  stream states.
- Collapsible tool card `standup.report` (lines 653-665): backed by Runtime-Control tool receipts.
  If `standup.report` is not implemented in 2.5, use a real `opzava_admin_digest` tool name or do
  not render the sample card. Tool cards show request summary/result summary only after receipt.
- Action bubble approval (lines 690-719): rendered from real approval/review records. Buttons call
  approval services and audit the decision. The copy must match the actual target, not "Series B"
  unless that project exists.
- "Conversation states and recovery paths" disclosure (line 727): all states are real: loading,
  empty, offline/gateway unavailable, policy denied, duplicate send, stream interrupted, retry.
- Composer (lines 751-757): posts to `/api/ask-opzava/turn` with required idempotency key and
  session-derived principal. Enter/send and button disabled states match actual request lifecycle.

Tasks board parity:

- `task-board.html` remains the board reference: title, New task, filters, columns, counts, cards,
  progress/status, and empty/loading states must use real task data (`task-board.html` lines
  270-304, 307-471). The Slice 2 side panel is removed from
  `apps/web/components/tasks/tasks-board.tsx`.
- Board updates from MCP, Ask Opzava, and browser actions arrive through `task_activity_events` SSE
  plus route revalidation. The existing 2d write-through task DTO patch stays for immediate user
  feedback but is no longer tied to a panel on the board.

### 5. GitHub issues and task links

Recommendation: add `IssueTrackerPort` in `packages/ports` and a GitHub REST adapter in
`packages/adapters`. Use the global `fetch`/Node HTTP stack first; do not add Octokit unless the
implementation proves it materially reduces complexity and official docs are checked at that time.

Port shape:

- `listIssues({ repo, state, labels?, since?, page? })`
- `getIssue({ repo, issueNumber })`
- `createIssue({ repo, title, body?, labels?, assignees? })`
- `updateIssue({ repo, issueNumber, title?, body?, state?, labels?, assignees? })`
- `closeIssue({ repo, issueNumber, reason?, idempotencyKey })`
- `syncIssues({ repo, cursor })`

Auth and source of truth:

- Store the GitHub credential as a vault ref on an integration connection. The adapter resolves it
  through `SecretsVaultPort`; no token lives in source, env examples, task rows, or projections.
- Internal phase repo is `anthonykewl20/opzava`; the repo URL in `issues.html` line 272 is real.
- GitHub issue metadata is source of truth for issue number, title, labels, assignee, state, and
  updated time. Opzava owns the rebuildable projection, triage mapping, task link, divergence flag,
  and audit.
- Projection tables: `issue_tracker_connections`, `issue_projection`, `issue_sync_runs`,
  `issue_projection_events`, and `task_issue_links`.
- Sync now is idempotent and rate-limit aware. Honor GitHub `retry-after` and reset headers; show
  stale/divergent state rather than making the page look current.

Issues page parity by mockup element:

- Sidebar Issues count (`issues.html` line 166): real open issue projection count.
- Header subtitle (`issues.html` line 272): actual repo URL and last successful sync timestamp.
- `Sync now` (line 279): starts a sync job or performs a bounded sync; disabled with progress while
  running; errors show rate-limit/outage detail.
- `New issue` (line 285): opens a form and creates a real GitHub issue through `IssueTrackerPort`.
- Triage summary strip (lines 297-333): real projection counts for Needs triage, Ready for agent,
  Ready for human, In progress, Done this week.
- Filter tabs (lines 341-351): query projection by selected stage/state and update URL/search
  params.
- Table and footer (lines 355-571): rows render issue number, title, labels, assignee mapping
  ("You", agent employee, GitHub login, Unassigned), relative updated time, status, and the real
  "Showing N of M open" footer.
- Task link chip: card detail and issue rows show linked task/issue chips. Clicking a chip navigates
  to the authorized target; stale/deleted external issue shows divergence, not a broken silent link.
- Completing a Task with a linked issue performs an explicit audited close through
  `IssueTrackerPort`; close failure does not block task completion, queues retry, and marks
  divergence. Externally reopened issues never auto-reopen Tasks.

### 6. Mentions, assistant replies, and task-authoring skill

Recommendation: implement `@` mentions in card comments as an Internal Collaboration-style command
that can create assistant reply turns through the existing Slice 2 loop.

Flow:

1. User posts a task comment with an idempotency key.
2. Comment service parses mentions against authorized humans and AI employees. Browser-supplied ids
   are hints only; the server resolves mention handles under tenant/workspace authorization.
3. If the mention targets Ask Admin Opzava or a card-assigned assistant, Runtime-Control creates an
   assistant turn for surface `task:<taskId>:comments` and target ref `task:<taskId>`.
4. The broker stream produces deltas; the card comment feed shows "assistant is replying" and then
   one durable AI-attributed comment when final.
5. Tool outcomes from the reply can mutate tasks through the same governed registry and update the
   board/card live.

Loop and honesty guards:

- Assistant-authored comments do not trigger assistant mentions unless a human explicitly asks.
- One active assistant reply per card/comment thread unless a later mention is queued with a new
  idempotency key.
- A mention max-depth and source-turn id prevent ping-pong loops.
- The `opzava-task-authoring` skill is referenced in Ask Admin `AGENTS.md`, MCP tool descriptions,
  and the link-token connect recipe so both OpenClaw Ask Admin and local Claude Code produce human
  cards. The skill is guidance; validation and service constraints remain authority.

### 7. New ports and package ownership

Add these ports:

- `ObjectStorePort`: `putObject`, `getObjectStream`, `deleteObject`, `statObject`, `listObjects`,
  with tenant/workspace/task-scoped object keys generated by Opzava. Initial adapter:
  `S3ObjectStoreAdapter` against MinIO.
- `IssueTrackerPort`: vendor-neutral issue list/create/update/close/sync operations. Initial
  adapter: GitHub REST for this repo.
- `McpLinkTokenPort` is not necessary as a public port unless another app needs to validate tokens.
  Prefer Identity & Access application services for issue/revoke/list and `apps/mcp-server` for
  validation.

Package ownership:

- `apps/mcp-server`: MCP transport, HTTP auth, token validation adapter, tool registration, MCP
  result mapping.
- `packages/runtime-control`: governed tool executor, outcome receipts, assistant turn targeting,
  tool descriptions.
- `packages/project-management`: card aggregate, steps, watchers, evidence metadata, quality review,
  issue link, task activity.
- `packages/adapters`: S3/MinIO object store adapter, GitHub issue adapter, secrets/vault adapters.
- `apps/web`: pages/routes/components for Ask Opzava, Tasks board, card detail, Issues, upload/open,
  task activity SSE.
- `apps/workers`: issue sync worker and projection rebuild job.

## Live-parity acceptance checklist

### `orchestrator-chat.html` - Ask Opzava page

- Ask Opzava sidebar entry is a real link and active state; counts/dots are real or hidden.
- Any rendered sidebar item routes to a live page. Non-live mockup rail items are not rendered in
  Slice 2.5.
- Header collapse/search/health/account controls function or are omitted from this slice's rendered
  shell.
- Page title/subtitle render from the route; no placeholder project names.
- Digest table uses real Tasks/Issues/runtime/activity data; Review/Fix links navigate.
- Chase Yes/No writes dismissal or follow-up task/comment activity.
- Chat history loads from Runtime-Control.
- User send requires idempotency key and streams through the Slice 2 loop.
- Tool cards render from actual tool receipts.
- Approval bubbles render from real approval/review records only.
- Loading, empty, offline/gateway unavailable, policy denied, duplicate send, interrupted stream,
  and retry states are visible and deterministic.

### `task-board.html` - Tasks board

- Title, workspace/date context, New task, view controls, counts, filters, columns, cards, labels,
  assignee, progress, empty states, and loading states come from Project Management DTOs/read
  models.
- Ask Admin side panel is removed.
- Board receives live patches from task activity SSE for browser, MCP, and assistant writes.
- Card clicks open `/tasks/[cardKey]`.
- Search/filter state changes actual visible data.
- Counts match the filtered board data.
- No skeleton/demo cards remain in the loaded state.

### `essential-card.html` - Card detail

- Breadcrumb, card key chip, copy button, ID popover, title, status, labels, due date, provenance,
  assignee hovercard, watcher avatars, Mark done, overflow menu, and tabs are live.
- Overview tab has editable/checkable steps with per-step assignee, accurate counter, live assistant
  working state, comments, AI/human attribution, read markers, typing hints, mention popover, and
  comment post.
- AI Run tab lists real Runtime-Control turns/tool outcomes with live elapsed ticker while
  streaming.
- Evidence & Files tab uploads, lists, opens, counts, and shows provenance for real private objects
  and links.
- Quality Review tab records assistant pre-checks, human checks, reviewer decisions, changes
  requested, and approval. The primary action is only rendered when it has a real backing command.
- All dialogs, menus, tabs, popovers, focus return, keyboard paths, and ARIA live regions work.
- Forbidden, not found, upload too large, object missing, conflict, stale edit, gateway unavailable,
  and issue-close divergence states render without fake success.

### `issues.html` - Issues page

- Sidebar count, repo link, last sync, Sync now, New issue, triage strip, filter tabs, table rows,
  labels, assignees, updated ages, statuses, and footer are real projection data.
- Sync now handles in-progress, success, stale, GitHub outage, and rate-limit states.
- New issue creates a real GitHub issue in the internal repo.
- Filters update query state and table results.
- Task/issue link chips navigate to authorized targets.
- Completing a linked task closes the GitHub issue through the port; failure queues retry and shows
  divergence.

## Sad-path ledger

| Sad path                                 | Design response                                                                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link token theft                         | Random token shown once, stored hashed, scoped, expires, revocable, membership/session-version bound, last-used/audit, rate-limited validation, no tenant/user ids from tool args. |
| Token revocation during MCP session      | Validate before every tool call. Existing initialized MCP session receives auth failure on next request and cannot continue mutating.                                              |
| Claude Code sends stale or malicious ids | Tool args are data only. Server resolves card ids/keys under the token-bound principal and rejects tenant/user/workspace authority in args.                                        |
| MCP parallel duplicate writes            | Outcome-first receipts plus idempotency keys; conflicting duplicate payload returns conflict. Per-card optimistic version protects concurrent edits.                               |
| GitHub rate limit/outage                 | Honor official retry headers, back off sync, mark projection stale/divergent, keep Opzava cards usable, queue close retries.                                                       |
| GitHub external reopen                   | Projection shows divergence. Do not auto-reopen Opzava Task; user/assistant can create follow-up if authorized.                                                                    |
| Upload abuse or malware-shaped files     | Size cap, mime allowlist, private bucket, generated keys, per-org quota, no direct public URL, optional future scanning quarantine.                                                |
| Object missing after metadata exists     | Evidence row renders missing/degraded and offers retry/remove if authorized; card does not crash.                                                                                  |
| Mention loops                            | Assistant-authored comments do not auto-trigger assistant mentions; max depth and active-turn guard per card/thread.                                                               |
| Concurrent card edits                    | Optimistic `version`/`updated_at`; server returns conflict with current DTO; client prompts reload/merge.                                                                          |
| Sequence gaps                            | Gaps are accepted and never reused. Human card keys remain stable; rollback/failed create may consume a number.                                                                    |
| RLS/tenant context failure               | `withTenant` fail-closed hard 403, not empty list. Integration tests cover missing context and cross-tenant denial.                                                                |
| SSE disconnect                           | Client reconnects to task activity/history cursors; draft streaming shows interrupted state and can retry with a new idempotency key.                                              |
| Gateway unavailable                      | Ask/card AI surfaces degrade; PM card data and issue projections remain available from Postgres.                                                                                   |
| Tool policy drift                        | Broker/runtime-control checks effective tools; unknown tool or missing expected tool fails closed and records admin event.                                                         |
| Non-live mockup chrome                   | Do not render it. A visible disabled placeholder is a parity bug unless `EXECUTION.md` explicitly descopes it.                                                                     |

## Sub-slice plan

### 2.5a - Card model, RLS, and services

Goal: extend Project Management for live card identity and core subresources.

Deliverables:

- 0004 migration with task card fields, sequences, steps, watchers, comments/read markers, evidence
  metadata, quality review, issue links, task activity, composite tenant FKs, and RLS policies.
- Project Management application services and DTOs for card get-by-key, steps CRUD, watchers CRUD,
  comments/read markers, due/provenance updates, quality checks/reviewers, and task activity.
- Unit tests for validation/state transitions and integration tests for RLS cross-tenant/missing
  context, sequence allocation, optimistic conflict, forbidden vs not_found.

Acceptance:

- Creating a task assigns a stable card key.
- Steps/checks/watchers/comments persist under tenant RLS.
- Cross-tenant reads are invisible only through authorized not-found paths; RLS/authz denials are
  hard forbidden.

Self-verification: `pnpm --filter @opzava/project-management test`, relevant integration tests, then
root `pnpm typecheck`, `pnpm lint`, `pnpm test -- --filter` as available.

### 2.5b - MCP server and link tokens

Goal: local Claude Code can list/create/update Tasks and card subresources through Opzava MCP with
on-behalf-of authority.

Deliverables:

- `apps/mcp-server` with stdio transport for local Claude Code, link-token validation, MCP tool
  registration, and no OpenClaw DTOs. The implementation pins `@modelcontextprotocol/sdk@1.29.0`
  with `zod@4.4.3`; the official TypeScript guide uses `McpServer`, `StdioServerTransport`, and Zod
  schemas, and the 2025-06-18 transport spec says stdio messages are newline-delimited JSON-RPC over
  stdin/stdout with stderr-only logging.
- Identity & Access link-token services/admin UI seam: issue, list, revoke, validate; token shown
  once and stored hashed.
- Project Management task/card tools exposed through MCP with task-authoring tool descriptions.
- MCP client tests for auth success, revoked token failure, scope denial, malformed args, and
  actor-via-claude-code authority.

Local `.mcp.json` recipe until the admin UI exists:

```json
{
  "mcpServers": {
    "opzava": {
      "command": "pnpm",
      "args": ["--dir", "/ABSOLUTE/PATH/TO/opzava", "--filter", "@opzava/mcp-server", "start"],
      "env": {
        "OPZAVA_LINK_TOKEN": "<token shown once by pnpm --filter @opzava/workers issue:mcp-link-token>",
        "DATABASE_URL": "<runtime database url>"
      }
    }
  }
}
```

The token is env-only and must not be placed in URLs, command args, logs, or committed config.

Acceptance:

- A local MCP client can create a task with steps; revoking the token makes the next call fail
  cleanly; activity shows the human actor via Claude Code.

Self-verification: `pnpm --filter @opzava/mcp-server test`,
`pnpm --filter @opzava/runtime-control test`, then root typecheck/lint/test.

### 2.5c - Task board live activity and Ask page relocation

Goal: remove the interim Tasks chat panel and ship the dedicated Ask Opzava page with real stream
states and board live updates.

Deliverables:

- `/ask-opzava` page and sidebar link.
- `/api/ask-opzava/turn` route reusing Slice 2 Runtime-Control/broker stream and expanded event
  states.
- Task activity SSE route and board/card client reducer for live patches.
- Remove `AskAdminPanel` from `TasksBoard`.
- Route/component tests for gateway down, duplicate send, policy denied, stream interrupted, and
  board patching.

Acceptance:

- Ask Opzava page can stream a turn and execute task tools.
- Tasks board updates live when MCP or Ask creates/updates a card.
- The sidebar Ask entry is no longer dead.

Self-verification: `pnpm --filter @opzava/web test`, `pnpm --filter @opzava/web typecheck`,
Playwright route-level or e2e fake-lane tests if available, then root lint/typecheck/test.

### 2.5d - Card detail live parity

Goal: implement `/tasks/[cardKey]` with every `essential-card.html` element backed by real data.

Deliverables:

- Card route, server load, React tabs, steps, comments, read markers, typing TTL, mention popover,
  AI Run timeline, evidence/files, quality review, mark done, menu actions.
- `ObjectStorePort`, S3/MinIO adapter, authenticated upload/open routes, compose MinIO parity if
  still absent.
- Mention-to-assistant reply turn through the existing Slice 2 loop.
- Component/route/application tests plus Playwright card parity flow across two sessions for
  read/typing.

Acceptance:

- Opening a card from the board shows the full mockup surface with live actions.
- Attach/open evidence works against MinIO.
- Mentioning the assistant produces a live AI-attributed comment.

Self-verification: package tests for PM/adapters/web, Playwright card flow, root
lint/typecheck/test/build.

### 2.5e - GitHub Issues and task issue links

Goal: make `issues.html` fully live against the internal GitHub repo and link Tasks to Issues.

Deliverables:

- `IssueTrackerPort`, GitHub adapter through vault ref, sync worker/projection tables, issue link
  services.
- `/issues` page with sync now, new issue, triage counts, filters, table, footer, stale/divergence
  states.
- Task card issue chips and active close-on-task-complete behavior with retry/divergence.
- Tests for GitHub API adapter with fake fetch, rate limit/outage, projection rebuild, create issue,
  close linked issue, externally reopened divergence.

Acceptance:

- Issues page every visible element uses real projection/GitHub data.
- New issue creates a GitHub issue.
- Completing a linked Task closes the issue or records a visible retry/divergence.

Self-verification: adapter/unit tests, worker projection tests, web route/page tests, root
lint/typecheck/test.

### 2.5f - Final parity, hardening, and docs

Goal: prove the whole Slice 2.5 user journey and remove remaining dead chrome.

Deliverables:

- End-to-end fake-lane: Claude/MCP creates task with steps; board updates; card opens; comment
  mention triggers assistant; evidence upload/open; quality check approve; linked issue sync/close.
- Accessibility and keyboard tests for tabs, menus, dialogs, popovers, composer, filters, and table.
- Update Ask Admin `AGENTS.md` and MCP descriptions to reference `opzava-task-authoring`.
- Update `EXECUTION.md` worklog/control state after implementation, not in this memo.

Acceptance:

- No visible dead controls on the implemented mockup surfaces.
- Revoked link token fails.
- Activity/audit consistently shows actor-via-client.
- Root verification passes with tests/lint/typecheck/build.

Self-verification: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, plus targeted
Playwright flows.

## Open questions requiring user decision

None blocking. The only implementation proof gate is client support for remote Streamable HTTP MCP
from the operator's local Claude Code build. If that client cannot connect directly, the locked
fallback is a stdio proxy that forwards to the hosted MCP endpoint without duplicating tool logic.

## Red-team adjudication (2026-07-03)

Red-team source: `docs/plan/consensus/slice2.5-design-redteam.spark.md` (verdict: UNSOUND). This
section supersedes conflicting recommendations above.

Locked resolutions:

1. Link tokens are header/env-only bearer credentials. They are never placed in URL/query strings,
   page links, logs, or Referrers. The Slice 2.5 token is intentionally simple for one internal
   developer: proof-of-possession is rejected as premature. Claims are
   `{ aud, scope, sid, tenant_id, exp, jti }`, where `scope` is limited to `tasks:read` and
   `tasks:write`; TTL is short; `jti` is single-use and stored write-once; every request re-checks
   session `membership_version` and revocation state.
2. MCP transport for local Claude Code is stdio. The token enters the spawned process through
   `.mcp.json` environment, and the process boundary is the auth boundary. MCP HTTP+SSE is
   deprecated; Streamable HTTP is current per the official 2025-06-18 MCP transport spec, but remote
   HTTP/Streamable MCP is deferred to P1 Gateway registration. The web live-card broadcast is
   separate from MCP and remains the Slice 2c-style web SSE path.
3. Card ids are DB-native. `tasks.card_number` is a `bigint` filled by a database sequence and
   protected by `unique(workspace_id, card_number)`; task creation uses `insert ... returning` and
   retries on unique conflict. Advisory-lock counters are rejected.
4. GitHub active-close is an explicit close state plus durable outbox row with a dedupe key. Task
   completion is not blocked by GitHub close failure; failure queues retry and marks divergence.
5. Mockup parity is exhaustive. Implementation approval requires a visible-element matrix derived
   from the actual HTML for `orchestrator-chat.html`, `task-board.html`, `essential-card.html`, and
   `issues.html`; each visible element maps to an owning data source and event/command.
6. 0004 migration must copy the 0002/0003 RLS posture with owner, explicit grants to `opzava_app`,
   `ENABLE` + `FORCE ROW LEVEL SECURITY`, permissive `current_org` policy, restrictive no-context
   policy, and symmetric `USING` + `WITH CHECK`.
7. Read receipt and typing transport stays an interim single-web-instance SSE implementation in
   Slice 2.5. P2 replaces the transport with WS+Redis; this is a documented deferral, not a defect.
8. Sub-slices are re-split for one-run self-verification: 2.5a data layer; 2.5b stdio MCP server +
   link tokens; 2.5c card detail page live; 2.5d Ask Admin page relocation; 2.5e GitHub issues +
   active-close; 2.5f mentions + evidence/MinIO + hardening.
9. Mentions are bounded: assistant-authored messages do not trigger mentions, self-mentions are
   rejected, and assistant reply creation enforces max chain depth, a per-task loop counter, and
   message-hash dedupe.

Exhaustive live-parity backbone:

- `orchestrator-chat.html`: sidebar current Ask item, all rendered rail links/counts/dots, collapse,
  breadcrumb, online/health/account indicators, page title/subtitle, digest card, project/status
  rows, Review/Fix links, chase Yes/No, user bubble, assistant stream, tool disclosure, action
  approval bubble, confirmation, recovery states disclosure, composer textarea, send affordance,
  example chips, loading/offline/empty states all map to Runtime-Control turns, task/issue
  projections, approval records, health probes, and web-SSE events. Non-live rail entries are not
  rendered.
- `task-board.html`: sidebar Tasks item/count, command search if rendered, health/notification
  indicators, title/date/workspace context, New task, search, project filter, columns, counts,
  cards, assignees, badges, progress bars, timestamps, Review and Done empty/skeleton states all map
  to Project Management reads and task activity events.
- `essential-card.html`: breadcrumb, card key/copy/popover, Mark done/dialog, overflow actions,
  title, status/label/due chips, assignee hovercard, provenance, watcher avatars, tabs, step
  checklist/counter/assignees/working state, comments, read markers, AI/human typing, composer,
  mention popover, AI Run timeline/ticker, evidence thumbnails/files/links/open buttons, quality
  alert/checks/reviewers/approve action all map to task/card tables, Runtime-Control receipts,
  object metadata/storage, and task activity/read/typing events.
- `issues.html`: sidebar Issues count, search/health/live/notification/account indicators, title,
  GitHub repo link, last sync, Sync now, New issue, triage summary cards, filter tabs, table
  caption/columns/rows/labels/assignees/updated/status, and footer counts all map to
  `IssueTrackerPort`, GitHub projection rows, sync runs, task issue links, and divergence state.
