# AI Workforce Workboard MCP Expansion Research

Status: research and design capture only.

This memo treats OpenClaw Workboard as the native base that Opzava expands into the locked Q17 admin Tasks / AI-Workforce development pipeline.

Q17 remains locked, and this memo applies the session amendment that Ask Admin Opzava only engages on explicit `Assign To = Lead Orchestrator` or `@mention`, never by auto-grabbing an unassigned Todo card.

No product code is specified or changed by this memo.

## Thread 1: Workboard Native Base And Opzava Expansion Delta

OpenClaw Workboard is a bundled but disabled-by-default plugin that adds a Kanban-style board to the Control UI for local agent-sized work cards linked to tasks, runs, sessions, and source URLs. (Source: `docs/openclaw/plugins/workboard.md`.)

Workboard is intentionally Gateway-local operating work, not a replacement for GitHub Issues, Linear, Jira, or other team project-management systems. (Source: `docs/openclaw/plugins/workboard.md`.)

Workboard cards store title, notes, priority, labels, optional agent id, optional linked task, run, session, source URL, execution metadata, attempt summaries, comments, links, proof, artifacts, automation, attachments, worker logs, protocol state, claims, diagnostics, notifications, templates, archive state, stale-session detection, and recent card events. (Source: `docs/openclaw/plugins/workboard.md`.)

The full Workboard status set is `triage`, `backlog`, `todo`, `scheduled`, `ready`, `running`, `review`, `blocked`, and `done`. (Source: `docs/openclaw/plugins/workboard.md`.)

Workboard stores durable board data in a plugin-owned relational SQLite database under the OpenClaw state directory. (Source: `docs/openclaw/plugins/workboard.md`.)

The Workboard CLI `list`, `create`, and `show` commands read and write the same plugin-owned SQLite database used by the dashboard and Workboard agent tools. (Source: `docs/openclaw/cli/workboard.md`.)

The Workboard governed agent registry includes `workboard_list`, `workboard_read`, `workboard_create`, `workboard_link`, `workboard_claim`, `workboard_heartbeat`, `workboard_release`, `workboard_complete`, `workboard_block`, `workboard_specify`, `workboard_decompose`, `workboard_dispatch`, `workboard_comment`, `workboard_proof`, `workboard_reassign`, `workboard_reclaim`, `workboard_promote`, `workboard_unblock`, `workboard_notify_subscribe`, `workboard_notify_list`, `workboard_notify_events`, `workboard_notify_advance`, `workboard_notify_unsubscribe`, `workboard_attachment_add`, `workboard_attachment_read`, `workboard_attachment_delete`, `workboard_worker_log`, `workboard_protocol_violation`, `workboard_board_create`, `workboard_board_archive`, `workboard_board_delete`, `workboard_boards`, `workboard_stats`, and `workboard_runs`. (Source: `docs/openclaw/plugins/workboard.md`.)

Claimed Workboard cards reject agent-tool mutations from other agents unless the caller has the claim token returned by `workboard_claim`. (Source: `docs/openclaw/plugins/workboard.md`.)

Dashboard operators still use the normal Gateway RPC surface and can recover or reassign Workboard cards. (Source: `docs/openclaw/plugins/workboard.md`.)

Workboard dispatch is Gateway-local and does not spawn arbitrary operating-system processes. (Source: `docs/openclaw/plugins/workboard.md`.)

Workboard dispatch promotes dependency-ready cards, records dispatch metadata, blocks expired claims or timed-out runs, marks board-configured triage cards as orchestration candidates, claims a small ready-card batch, and starts worker runs through the Gateway subagent runtime. (Source: `docs/openclaw/plugins/workboard.md`.)

Assigned Workboard cards use deterministic `agent:<id>:subagent:workboard-*` session keys, while unassigned Workboard cards use unscoped `subagent:workboard-*` keys so the Gateway resolves the configured default agent. (Source: `docs/openclaw/plugins/workboard.md`.)

Workers receive bounded card context plus the claim token needed for `workboard_heartbeat`, `workboard_complete`, or `workboard_block`. (Source: `docs/openclaw/plugins/workboard.md`.)

Each Workboard dispatch pass starts at most three workers by default, orders ready cards by priority, position, and creation time, skips archived or claimed cards, and avoids starting duplicate active ownership for the same owner or agent in one pass. (Source: `docs/openclaw/plugins/workboard.md`; `docs/openclaw/cli/workboard.md`.)

The Workboard worker prompt includes card title, bounded notes and context, assigned board, worker protocol, claim owner, and claim token. (Source: `docs/openclaw/plugins/workboard.md`.)

Workboard records worker session key, run id, engine, mode, model label, status, and worker log when a worker starts successfully. (Source: `docs/openclaw/plugins/workboard.md`.)

Workboard blocks the card, clears the claim, records the run-start failure, and appends a worker log line if worker start fails after claim. (Source: `docs/openclaw/plugins/workboard.md`.)

Workboard dispatch entry points are the dashboard dispatch action, `openclaw workboard dispatch`, and `/workboard dispatch`. (Source: `docs/openclaw/plugins/workboard.md`; `docs/openclaw/cli/workboard.md`.)

Board metadata can include `autoDecompose`, `autoDecomposePerDispatch`, `defaultAssignee`, and `orchestratorProfile`, while specification and decomposition still happen through normal Workboard tools. (Source: `docs/openclaw/plugins/workboard.md`.)

The Workboard RPC namespace is `workboard.*`, with read calls such as card list, export, diagnostics, attachment reads, and notification reads requiring `operator.read`. (Source: `docs/openclaw/plugins/workboard.md`.)

Workboard mutating RPC calls such as create, update, move, delete, comment, link, proof, artifact, attachment add/delete, worker log, protocol violation, claim, heartbeat, release, complete, block, unblock, dispatch, bulk, and archive require `operator.write`. (Source: `docs/openclaw/plugins/workboard.md`.)

OpenClaw native subagents run in their own session keys, are tracked as background tasks, and report completion back to the requester session. (Source: `docs/openclaw/tools/subagents.md`.)

OpenClaw native subagents do not get session tools by default, and `sessions_spawn` availability depends on effective tool policy. (Source: `docs/openclaw/tools/subagents.md`; `docs/openclaw/gateway/config-tools.md`.)

OpenClaw `group:sessions` includes `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `sessions_yield`, `subagents`, and `session_status`. (Source: `docs/openclaw/gateway/config-tools.md`.)

OpenClaw `delegationMode: "prefer"` is prompt guidance for coordinator agents to stay responsive and push non-trivial work into subagents. (Source: `docs/openclaw/tools/subagents.md`; `docs/openclaw/concepts/parallel-specialist-lanes.md`.)

ACP is explicitly the external harness path running on the Gateway host, while normal subagents are the OpenClaw-native delegated runtime. (Source: `docs/openclaw/tools/acp-agents.md`.)

Q17 defines the Opzava admin Tasks board as the admin-only Opzava-platform development pipeline for slices, fixes, incidents, PRs, and verification work. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 defines exactly three actors for this slice: human admin, doer agent, and Lead Orchestrator Ask Admin Opzava. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 defines doer agents as either gateway-side native subagents running on the VPS or local tools connected through hosted MCP. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 explicitly excludes ACP from the local-tool path because ACP and CLI backends run on the gateway host rather than the developer's local machine. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`; `docs/openclaw/tools/acp-agents.md`.)

Q17 changes the lifecycle to five lanes, `backlog`, `todo`, `in_progress`, `review`, and `done`, with `blocked` as an orthogonal flag. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 makes `Backlog -> Todo` human-only, `Todo -> In Progress` doer-owned through `task.claim`, `In Progress -> Review` doer-owned through `task.request_review`, `Review -> In Progress` reviewer-owned through `review.request_changes`, and `Review -> Done` human-only. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 forbids doers from touching Backlog, moving Backlog to Todo, setting Done, calling merge, or calling reviewer tools. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 requires evidence-gated Review and adversarial Quality Review by Ask Admin Opzava, with review pass enabling human Done but not moving the card to Done. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 requires code tasks to branch from `development`, produce a PR, link the PR as `TaskPrLink`, include `Closes #NN` when a primary issue exists, and attach PR, CI, test, screenshot, and review artifacts as evidence. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 states GitHub remains source of truth for issue number, title, labels, assignee, state, and updated time, while Opzava owns Task, curation, execution, links, audit, divergence, and activity. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/research/slice2.5-cc-mcp-live-card.md`.)

Q17 states PR support is net-new because Slice 2.5 has `IssueTrackerPort` but not a PR port. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/ports/src/issue-tracker.ts`.)

Q17 defines the dispatcher worker as an ADR-004 outbox consumer that pushes events to Ask Admin Opzava, dispatches native subagents through the broker, and projects runtime refs into `AgentDispatch`, `TaskAgentAssignment`, and AI Run. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/adr/ADR-004-data-boundary-cqrs.md`; `docs/adr/ADR-008-ai-workforce.md`.)

The Q17 amendment in this memo narrows dispatch engagement so unassigned Todo does not auto-select a Lead Orchestrator doer unless the human explicitly assigns the card to Lead Orchestrator or mentions it. (Source: current user request; source of pre-amendment text: `docs/plan/consensus/tasks-ai-workforce-design.md`.)

Q18 states the OpenClaw Workboard view is deliberately not ported because Opzava Tasks is the workboard under Q17. (Source: `docs/plan/grilling-decisions.md`.)

### Delta Table

| Concern | Workboard native | Opzava Q17 must add/change | Citation |
| --- | --- | --- | --- |
| Storage | Gateway-local plugin-owned SQLite under the OpenClaw state directory. | Postgres is truth for Opzava Tasks, RLS tenancy applies, OpenClaw refs are opaque, and projections remain rebuildable cache. | `docs/openclaw/plugins/workboard.md`; `docs/openclaw/cli/workboard.md`; `docs/adr/ADR-004-data-boundary-cqrs.md`; `packages/project-management/src/adapters/postgres/schema/tasks.ts` |
| Status model | Nine statuses: `triage`, `backlog`, `todo`, `scheduled`, `ready`, `running`, `review`, `blocked`, and `done`. | Five lanes: `backlog`, `todo`, `in_progress`, `review`, and `done`, with `blocked` as an orthogonal flag and migration from the current `todo|in_progress|blocked|done` enum. | `docs/openclaw/plugins/workboard.md`; `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/project-management/src/adapters/postgres/schema/tasks.ts` |
| Transition ownership | Operator `operator.write` can mutate Workboard lifecycle through dashboard, CLI, slash command, and Workboard tools. | `Backlog -> Todo` and `Review -> Done` are human-only, doers can only claim and request review, and reviewer tools are reserved to Lead Orchestrator. | `docs/openclaw/plugins/workboard.md`; `docs/openclaw/cli/workboard.md`; `docs/plan/consensus/tasks-ai-workforce-design.md` |
| Issue and PR | Workboard stores local metadata and explicitly does not replace GitHub Issues. | GitHub Issue to Task to PR sync is required, GitHub issue state remains projection truth, PR support and CI status must be added beyond the current issue-only port, and code branches must start from `development`. | `docs/openclaw/plugins/workboard.md`; `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/ports/src/issue-tracker.ts`; `packages/adapters/src/github/issues.ts` |
| Evidence and review | Workboard supports proof, artifacts, diagnostics, worker logs, and done-without-proof diagnostics. | `task.request_review` is hard-gated by declared change type and qualifying evidence, and Ask Admin Opzava independently verifies screenshots, tests, PR diff, CI, and issue claims. | `docs/openclaw/plugins/workboard.md`; `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/project-management/src/adapters/postgres/schema/evidence-quality.ts` |
| Done and merge | Workboard lets operators manually move accepted cards to `done`. | Human Done is the only Done transition, merge is orchestrator-internal after human Done and CI-green, and no agent receives `set_Done` or merge. | `docs/openclaw/plugins/workboard.md`; `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md` |
| Dispatch trigger | Workboard dispatch is a manual or slash-command pass that claims a small ready-card batch and starts Gateway subagents. | Opzava dispatch is an ADR-004 outbox dispatcher worker and only engages Lead Orchestrator on explicit assignment or mention under this memo's Q17 amendment. | `docs/openclaw/plugins/workboard.md`; `docs/openclaw/cli/workboard.md`; `docs/plan/consensus/tasks-ai-workforce-design.md`; current user request |
| View | Workboard adds its own Control UI tab when the plugin is enabled. | Q18 deliberately does not port the Workboard view, and Opzava Tasks is the workboard by reusing the pattern rather than enabling the plugin as the product surface. | `docs/openclaw/plugins/workboard.md`; `docs/plan/grilling-decisions.md` |

## Thread 2: MCP Hosting And Device Authentication For External Local CLIs

OpenClaw `openclaw mcp serve` makes OpenClaw act as an MCP server over stdio for external MCP clients that read and send OpenClaw-backed channel conversations. (Source: `docs/openclaw/cli/mcp.md`.)

OpenClaw `openclaw mcp list`, `show`, `status`, `doctor`, `probe`, `add`, `set`, `configure`, `tools`, `login`, `logout`, `reload`, and `unset` manage OpenClaw-saved outbound MCP server definitions under `mcp.servers`. (Source: `docs/openclaw/cli/mcp.md`; `docs/openclaw/gateway/configuration-reference.md`.)

OpenClaw supports remote outbound MCP server entries using `transport: "streamable-http"` or `transport: "sse"`, with optional headers, OAuth, TLS, mTLS, timeout, and tool filters. (Source: `docs/openclaw/cli/mcp.md`; `docs/openclaw/gateway/configuration-reference.md`; `docs/openclaw/plugins/bundles.md`.)

OpenClaw accepts CLI-native `type: "http"` as an alias normalized to the canonical `transport: "streamable-http"` config shape. (Source: `docs/openclaw/cli/mcp.md`; `docs/openclaw/gateway/configuration-reference.md`; `docs/openclaw/plugins/bundles.md`.)

OpenClaw's MCP Control UI page edits saved `mcp.servers` config, redacts credential-bearing URL-like values, and does not start MCP transports by itself. (Source: `docs/openclaw/cli/mcp.md`; `docs/openclaw/web/control-ui.md`.)

OpenClaw `openclaw mcp login <name>` performs the MCP OAuth network flow for a configured HTTP server and saves local credentials under OpenClaw state. (Source: `docs/openclaw/cli/mcp.md`.)

OpenClaw `openclaw mcp doctor --probe` and `openclaw mcp probe` are the live proof paths for configured MCP server reachability and discovered capabilities. (Source: `docs/openclaw/cli/mcp.md`; `docs/openclaw/web/control-ui.md`.)

Q17 requires Opzava to promote its MCP server to a first-class compose service using hosted Streamable HTTP at `mcp.opzava.<domain>` behind Traefik on the VPS, while retaining stdio as local fallback. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q16 originally locked local Claude Code as a local client connecting to Opzava's own MCP server through scoped revocable link tokens. (Source: `docs/plan/grilling-decisions.md`; `docs/plan/research/slice2.5-cc-mcp-live-card.md`.)

The current Opzava MCP server verifies `OPZAVA_LINK_TOKEN`, registers task tools based on `tasks:read` and `tasks:write` scopes, and exposes only `opzava_tasks_*` tools. (Source: `apps/mcp-server/src/server.ts`; `apps/mcp-server/src/tools.ts`.)

The current Opzava link-token application uses the audience `opzava:mcp`, client id `claude-code`, scopes `tasks:read` and `tasks:write`, SHA-256 token hashing, expiry, revocation, membership-version checks, and active session checks. (Source: `packages/identity-access/src/application/link-tokens.ts`; `packages/identity-access/src/adapters/postgres/schema/link-tokens.ts`.)

The current MCP tool handlers derive tenant, workspace, and actor from the verified link-token principal, while tenant and user ids in tool arguments are optional untrusted text. (Source: `apps/mcp-server/src/tools.ts`; `packages/identity-access/src/application/link-tokens.ts`.)

The current MCP result payload hard-codes `viaClient: "claude-code"`, which matches Q16 but must generalize under Q17 to one token per local tool or client with a named agent identity bound at issuance. (Source: `apps/mcp-server/src/tools.ts`; `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 requires a hosted MCP token to resolve to issuing human principal, organization, workspace, scopes, client kind, named agent identity, and via-client attribution, with client-declared identity ignored. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 requires token revocation, membership-version change, session-version change, expiry, or explicit revoke to kill the identity path. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/identity-access/src/application/link-tokens.ts`.)

The Opzava Connections port already models provider and GitHub device-flow challenges with `flowId`, `verificationUri`, `userCode`, `expiresAt`, and `intervalSeconds`. (Source: `packages/ports/src/connections-provisioning.ts`; `apps/web/lib/connections-state.ts`; `apps/web/lib/connections.ts`.)

The provisioning worker currently starts GitHub device flow by requesting `https://github.com/login/device/code`, stores `device_code`, `user_code`, `verification_uri`, expiry, interval, repository, and principal, then polls `https://github.com/login/oauth/access_token`. (Source: `apps/workers/src/provisioning/gateway-admin-connections.ts`.)

The provisioning worker stores successful GitHub access tokens through `SecretsVaultPort` and reports token material as excluded in the GitHub provisioning receipt. (Source: `apps/workers/src/provisioning/gateway-admin-connections.ts`; `apps/workers/src/provisioning/connections.ts`.)

The provisioning worker also drives model-provider device-code login by starting a Gateway runtime process, parsing the prompter log for a verification URL and user code, polling the Gateway connection state, and cleaning up expired or terminal flows. (Source: `apps/workers/src/provisioning/gateway-admin-connections.ts`.)

The MCP upgrade path should preserve Q16 on-behalf-of authority by treating the device authorization as token issuance and attribution, not as standalone execution authority. (Source: `docs/plan/grilling-decisions.md`; `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/identity-access/src/application/link-tokens.ts`.)

The MCP upgrade path should bind named `AgentIdentity` at issuance in the admin UI, bind it to the issuing human and local client, store only hashed token material, and re-check human RBAC/RLS on every request. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/identity-access/src/application/link-tokens.ts`; `packages/identity-access/src/adapters/postgres/schema/link-tokens.ts`; `packages/project-management/src/adapters/postgres/schema/tasks.ts`.)

The MCP upgrade path should keep Better Auth session and revocation semantics as part of token verification because current link-token verification already checks active session state and membership version. (Source: `packages/identity-access/src/application/link-tokens.ts`; `docs/plan/grilling-decisions.md`.)

The MCP upgrade path should not store GitHub credentials, MCP bearer tokens, raw CI secrets, OpenClaw device tokens, or provider tokens in this research file or in task rows. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/adr/ADR-003-gateway-broker-acl-two-token.md`; `docs/adr/ADR-005-tool-policy-security.md`; `apps/workers/src/provisioning/connections.ts`.)

### 2.5 Host-verified web findings (fetched 2026-07-12; resolves the HOST-VERIFY items above)

Material finding: the "device auth like GitHub" requirement is the right intuition but the wrong mechanism for MCP. The MCP authorization spec and all three target CLIs use OAuth 2.1 Authorization Code + PKCE via a browser redirect, not the OAuth 2.0 Device Authorization Grant (RFC 8628). Re-specify the requirement as standard MCP OAuth 2.1 with Opzava as the authorization server and the admin dashboard as the consent surface; do not build a bespoke RFC 8628 device flow, because the CLIs will not invoke it.

MCP authorization spec, current version 2025-11-25, binds the design as follows.
Authorization is optional; HTTP-transport MCP servers should conform; STDIO servers read creds from env.
A protected MCP server is an OAuth 2.1 resource server, the MCP client is an OAuth 2.1 client, and the authorization server is separate and may be co-hosted.
MCP servers MUST implement Protected Resource Metadata (RFC 9728); clients MUST use it for discovery via a 401 `WWW-Authenticate` header (`resource_metadata=...`) or the `/.well-known/oauth-protected-resource` URI.
The authorization server MUST provide RFC 8414 metadata or OpenID Connect Discovery; clients MUST support both.
Client registration priority is pre-registration, then Client ID Metadata Documents, then Dynamic Client Registration (RFC 7591, MAY, backwards-compat), then prompt the user.
PKCE `S256` is mandatory; clients MUST verify `code_challenge_methods_supported` and refuse to proceed if absent.
Resource Indicators (RFC 8707) are mandatory: the client sends a `resource` parameter binding the token to the canonical MCP server URI, and the server MUST validate token audience.
Redirect URIs MUST be `localhost` or HTTPS with exact match.
The device authorization grant (RFC 8628) is not referenced anywhere in the MCP auth spec. (Source: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization, 2026-07-12.)

Per-CLI remote authenticated-MCP support: all three support it, all via browser OAuth, none via device code.
Claude Code authenticates remote MCP with `claude mcp login <name>` (v2.1.186+) or `/mcp`, built-in OAuth 2.1 + PKCE, supporting DCR and Client ID Metadata Documents. (Source: https://code.claude.com/docs/en/mcp, 2026-07-12.)
Codex CLI supports Streamable HTTP MCP servers and `codex mcp login <server>` for OAuth on Streamable HTTP servers only; config in `~/.codex/config.toml`. (Source: https://developers.openai.com/codex/mcp, 2026-07-12.)
OpenCode configures remote servers with `type: "remote"` + `url`, auto-detects a 401, runs OAuth with DCR, `opencode mcp auth <server>` opens the browser, and stores tokens in `~/.local/share/opencode/mcp-auth.json`. (Source: https://opencode.ai/docs/mcp-servers/, 2026-07-12.)

GitHub device flow, for contrast only: POST `https://github.com/login/device/code` returns `device_code`, `user_code`, `verification_uri`, `expires_in` (900s), `interval` (5s); the app polls `https://github.com/login/oauth/access_token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`, handling `authorization_pending`, `slow_down`, `access_token`, `expired_token`, `access_denied`. This is RFC 8628, which the MCP clients do not use for MCP auth. (Source: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps, 2026-07-12.)

Upgrade path: Better Auth is the authorization server. The first-party `@better-auth/oauth-provider` plugin turns the instance into a full OAuth 2.1 authorization server with OIDC compatibility, supporting `authorization_code`, `refresh_token`, and `client_credentials` grants and Dynamic Client Registration via `allowDynamicClientRegistration`. (Source: https://better-auth.com/docs/plugins/oauth-provider, 2026-07-12.)
The Better Auth `mcp` plugin acts as an OAuth provider for MCP clients, extends the OIDC provider with MCP-specific endpoints and CORS, and proxies discovery metadata so MCP clients auto-discover the authorization, token, and registration endpoints. (Source: https://better-auth.com/docs/plugins/mcp, 2026-07-12.)
Better Auth's grant list omits the device grant, reinforcing that RFC 8628 is not the path.

Corrected upgrade path, superseding the literal "device authorization flow" target that Q16 asked to validate against current Better Auth docs at the multi-user tripwire:
1. Enable Better Auth `oauth-provider` (+ `mcp`) so Opzava is the OAuth 2.1 authorization server with DCR and discovery; execution authority still comes only from the human's Better Auth session, RBAC, and RLS.
2. Make the hosted MCP service (Streamable HTTP at `mcp.opzava.<domain>`, Q17 s10.1) an OAuth 2.1 resource server that emits RFC 9728 Protected Resource Metadata pointing at the Better Auth authorization server and validates token audience (RFC 8707).
3. The admin dashboard is the consent surface; the human is already logged in via Better Auth, approves the CLI client, and the named agent identity is bound at issuance server-side, never client-declared, preserving Q16 on-behalf-of authority.
4. Support DCR (and optionally Client ID Metadata Documents) so Claude Code, Codex, and OpenCode register without manual client setup.
5. The Slice 2.5 scoped, revocable, hashed link token remains the stdio-local fallback (Q17 s10) and for clients that cannot do browser OAuth; revocation continues to die with membership and session-version changes.
6. The device grant (RFC 8628) is an optional future extension only for a truly headless, browserless box; it is not the primary path and Better Auth does not ship it today.

## Thread 3: MCP Tool Surface For GitHub And Tasks Cards

The hosted MCP registry should be consumer-agnostic, meaning gateway-side subagents and local MCP tools see the same tool contracts filtered by identity and policy. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/adr/ADR-005-tool-policy-security.md`.)

The current Opzava MCP registry is task-only and exposes `opzava_tasks_list`, `opzava_tasks_get`, `opzava_tasks_create`, `opzava_tasks_update`, `opzava_tasks_steps_create`, `opzava_tasks_steps_toggle`, `opzava_tasks_steps_reorder`, `opzava_tasks_comments_add`, `opzava_tasks_comments_mark_read`, `opzava_tasks_quality_checks_add`, `opzava_tasks_due_set`, and `opzava_tasks_watchers_set`. (Source: `apps/mcp-server/src/server.ts`; `apps/mcp-server/src/tools.ts`.)

The Q17 Task tool surface replaces the Slice 2.5 task-only registry for the admin dev pipeline with `task.claim`, `task.report_run_step`, `task.attach_evidence`, `task.comment`, `task.reply`, `task.request_review`, `task.update`, and `list_my_open_items`. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 reviewer-only tools are `review.record_check`, `review.pass`, and `review.request_changes`, and only the Lead Orchestrator identity may call them. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Q17 never exposes `set Done`, `merge`, raw Git credentials, raw CI secrets, raw repo secrets, direct DB writes, or direct OpenClaw admin config writes to any agent. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`; `docs/adr/ADR-005-tool-policy-security.md`.)

The current `IssueTrackerPort` supports issue listing, issue get, issue creation, and issue close, but it has no PR or CI operations. (Source: `packages/ports/src/issue-tracker.ts`; `packages/adapters/src/github/issues.ts`.)

The current GitHub adapter implements GitHub issue list, get, create, and close through REST calls and token resolution, while skipping pull requests returned by the issues endpoint. (Source: `packages/adapters/src/github/issues.ts`.)

The current project-management issue service syncs issue projections, creates tracked issues through `IssueTrackerPort`, enqueues issue-close outbox entries, and processes close outbox with claim tokens and retries. (Source: `packages/project-management/src/application/issues.ts`; `apps/workers/src/issues/process-close-outbox.ts`.)

Q17 requires a PR concept beyond current `IssueTrackerPort`, plus branch, CI, checks URL, mergeability, and merge audit fields on `TaskPrLink`. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/ports/src/issue-tracker.ts`.)

The hosted MCP GitHub surface should therefore include issue tools that adapt the current port and PR/CI tools that represent a new GitHub PR port extension. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/ports/src/issue-tracker.ts`; `packages/adapters/src/github/issues.ts`.)

The issue tools should be `github.issue.list`, `github.issue.create`, `github.issue.update`, and `github.issue.link_to_task`. (Source: design derived from `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/ports/src/issue-tracker.ts`.)

`github.issue.update` should support only governed issue projection updates and close operations allowed by the application service, not arbitrary raw GitHub API access. (Source: `packages/ports/src/issue-tracker.ts`; `packages/project-management/src/application/issues.ts`; `docs/adr/ADR-005-tool-policy-security.md`.)

The PR tools should be `github.pr.open`, `github.pr.read`, `github.pr.read_ci_status`, `github.pr.link_to_task`, and `github.pr.ensure_closes_issue`. (Source: design derived from `docs/plan/consensus/tasks-ai-workforce-design.md`.)

`github.pr.ensure_closes_issue` should manage the `Closes #NN` linkage for the primary issue but must not merge. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`.)

`github.pr.read_ci_status` should provide CI evidence for Review and human Done gating but must not expose raw CI secrets or write workflow configuration. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/adr/ADR-005-tool-policy-security.md`.)

Gateway-side code doers need governed git and PR creation capability, a repo clone on the VPS, and a safe credential or vault path, but MCP tools must expose governed commands rather than raw credentials. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/adr/ADR-005-tool-policy-security.md`; `apps/workers/src/provisioning/connections.ts`.)

Local-tool doers run on the human's machine and should poll `list_my_open_items` rather than expecting Opzava push delivery. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Gateway-side subagent doers are pushed by the dispatcher through broker to Ask Admin Opzava, then through native subagent runtime when explicitly assigned or mentioned under this memo's Q17 amendment. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/openclaw/tools/subagents.md`; current user request.)

Human users remain the only identity that can move Review to Done or approve Done eligibility in the product UI. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

### Proposed Hosted MCP Tools

| Tool | Purpose | Citation |
| --- | --- | --- |
| `list_my_open_items` | Return assigned or queued tasks for the token-bound named agent identity, including next action, recent comments, due date, blocked flag, evidence requirements, and links. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `task.claim` | Move an assigned Todo task to In Progress and start or attach an AI Run for the assigned doer. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `task.report_run_step` | Append a human-readable AI Run step summary and artifact refs without dumping raw tool logs. | `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/research/slice2.5-cc-mcp-live-card.md` |
| `task.attach_evidence` | Attach typed evidence such as screenshot, e2e, smoke, real-world, mutation, deep verification, or PR evidence. | `docs/plan/consensus/tasks-ai-workforce-design.md`; `packages/project-management/src/adapters/postgres/schema/evidence-quality.ts` |
| `task.comment` | Add a human-readable task comment under the token-bound actor and via-client attribution. | `docs/plan/consensus/tasks-ai-workforce-design.md`; `apps/mcp-server/src/tools.ts` |
| `task.reply` | Reply to a specific human comment or mention under the token-bound actor and via-client attribution. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `task.request_review` | Request Review with declared change type and evidence refs, failing closed when evidence is missing or wrong. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `task.update` | Update overview, labels, due, watchers, issue link, or PR link, while never setting Done, passing review, merging, or changing assignment unless a human/admin path authorizes it. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `review.record_check` | Record an orchestrator review check against evidence, screenshots, tests, PR diff, CI, or issue claim. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `review.pass` | Mark orchestrator Quality Review as passed without moving the task to Done. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `review.request_changes` | Return a Review task to In Progress for the same doer with a required note. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `github.issue.list` | List connected GitHub issue projections through the issue port and application authorization. | `packages/ports/src/issue-tracker.ts`; `packages/adapters/src/github/issues.ts`; `packages/project-management/src/application/issues.ts` |
| `github.issue.create` | Create a tracked GitHub issue and project it into Opzava under idempotent application service control. | `packages/ports/src/issue-tracker.ts`; `packages/project-management/src/application/issues.ts` |
| `github.issue.update` | Govern issue updates or closes through current issue services and future port extension, without raw API access. | `packages/ports/src/issue-tracker.ts`; `packages/project-management/src/application/issues.ts` |
| `github.issue.link_to_task` | Link one primary issue to one Task, respecting the Q17 `0..1` primary issue rule. | `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/research/slice2.5-cc-mcp-live-card.md` |
| `github.pr.open` | Open a PR from the development-based branch for a code task through governed GitHub credentials. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `github.pr.read` | Read PR metadata, diff summary, mergeability, and linked issue/Task refs for evidence and review. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `github.pr.read_ci_status` | Read CI/check state for evidence and Done/merge gating. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `github.pr.link_to_task` | Persist or update `TaskPrLink` with PR ref, branch, CI state, checks ref, mergeability, and audit metadata. | `docs/plan/consensus/tasks-ai-workforce-design.md` |
| `github.pr.ensure_closes_issue` | Ensure the PR body contains the correct `Closes #NN` linkage when a primary issue exists. | `docs/plan/consensus/tasks-ai-workforce-design.md` |

### Never Exposed Tools Or Capabilities

`set_Done` is never exposed to local-tool doers, gateway-side subagent doers, or the Lead Orchestrator. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

`merge` is never exposed to local-tool doers, gateway-side subagent doers, or the Lead Orchestrator as a callable MCP tool, because merge is orchestrator-internal only after human Done and CI-green. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/plan/grilling-decisions.md`.)

Raw Git credentials, raw CI secrets, raw repo secrets, direct DB writes, and direct OpenClaw admin config writes are never exposed to any agent identity. (Source: `docs/plan/consensus/tasks-ai-workforce-design.md`; `docs/adr/ADR-005-tool-policy-security.md`; `docs/adr/ADR-003-gateway-broker-acl-two-token.md`.)

### Identity X Tool Matrix

| Tool | LOCAL-tool doer | Gateway-side subagent doer | Lead Orchestrator/reviewer | Human |
| --- | --- | --- | --- | --- |
| `list_my_open_items` | Allow for token-bound identity | Allow for assigned identity | Allow for review queue | Allow |
| `task.claim` | Allow only assigned Todo | Allow only assigned Todo | Deny except human-assigned doer role | Allow via UI/service |
| `task.report_run_step` | Allow only assigned In Progress | Allow only assigned In Progress | Allow for review-run notes only | Allow via UI/service |
| `task.attach_evidence` | Allow only assigned task | Allow only assigned task | Allow for verification evidence | Allow |
| `task.comment` | Allow scoped to visible task | Allow scoped to visible task | Allow | Allow |
| `task.reply` | Allow scoped to visible comment | Allow scoped to visible comment | Allow | Allow |
| `task.request_review` | Allow only assigned In Progress with evidence | Allow only assigned In Progress with evidence | Deny as reviewer self-submit path | Allow via UI/service when acting as human |
| `task.update` | Allow limited fields only | Allow limited fields only | Allow limited planner/review fields | Allow |
| `review.record_check` | Deny | Deny | Allow | Allow via UI/service |
| `review.pass` | Deny | Deny | Allow but does not set Done | Allow via UI/service |
| `review.request_changes` | Deny | Deny | Allow | Allow via UI/service |
| `github.issue.list` | Allow when linked token policy permits | Allow when assigned task policy permits | Allow for review | Allow |
| `github.issue.create` | Allow when task policy permits | Allow when task policy permits | Allow for planning/review when policy permits | Allow |
| `github.issue.update` | Allow only governed issue projection or close actions authorized by task policy | Allow only governed issue projection or close actions authorized by task policy | Allow for review/planning when policy permits | Allow |
| `github.issue.link_to_task` | Allow for assigned task only | Allow for assigned task only | Allow | Allow |
| `github.pr.open` | Allow for assigned code task only | Allow for assigned code task only | Deny as reviewer by default | Allow via UI/service |
| `github.pr.read` | Allow for assigned or visible task | Allow for assigned or visible task | Allow | Allow |
| `github.pr.read_ci_status` | Allow for assigned or visible task | Allow for assigned or visible task | Allow | Allow |
| `github.pr.link_to_task` | Allow for assigned task only | Allow for assigned task only | Allow | Allow |
| `github.pr.ensure_closes_issue` | Allow for assigned task only | Allow for assigned task only | Allow for review correction when policy permits | Allow |
| `set_Done` | Deny | Deny | Deny | Allow only through human UI/service gate |
| `merge` | Deny | Deny | Deny as exposed MCP tool | Allow only as human Done triggering internal orchestrator merge path |
| `raw_git_credentials` | Deny | Deny | Deny | Deny in UI, secrets remain vault/config only |
| `raw_ci_secrets` | Deny | Deny | Deny | Deny in UI, secrets remain vault/config only |
| `direct_db_write` | Deny | Deny | Deny | Deny, use application services |
| `direct_openclaw_admin_config_write` | Deny | Deny | Deny | Deny in MCP, provisioning worker owns audited admin path |

The deny entries in the identity matrix are policy requirements, not UI hints. (Source: `docs/adr/ADR-005-tool-policy-security.md`; `docs/plan/consensus/tasks-ai-workforce-design.md`.)

## Citations

- `docs/openclaw/plugins/workboard.md` owns the native Workboard card model, statuses, tool registry, dispatch model, RPC permissions, and SQLite locality.
- `docs/openclaw/cli/workboard.md` owns Workboard CLI behavior, dispatch selection, fallback behavior, and operator scope notes.
- `docs/openclaw/tools/subagents.md` owns native subagent runtime behavior, session keys, `sessions_spawn`, `sessions_yield`, and tool-policy availability.
- `docs/openclaw/tools/acp-agents.md` owns the ACP boundary and the distinction between ACP hosted external harnesses and native subagents.
- `docs/openclaw/concepts/multi-agent.md` owns agent isolation, agent directories, workspaces, auth profiles, and session store vocabulary.
- `docs/openclaw/concepts/parallel-specialist-lanes.md` owns coordinator-lane and `delegationMode: "prefer"` posture.
- `docs/openclaw/cli/mcp.md` owns `openclaw mcp serve`, the saved MCP registry, OAuth login, Streamable HTTP config, Control UI notes, and probe/doctor proof.
- `docs/openclaw/gateway/configuration-reference.md` owns `mcp.servers` config fields for remote transports, OAuth, headers, filters, and Codex projection metadata.
- `docs/openclaw/plugins/bundles.md` owns bundle MCP HTTP and Streamable HTTP transport notes plus provider-safe tool naming.
- `docs/openclaw/gateway/config-tools.md` owns tool profiles, `group:sessions`, `group:plugins`, sandbox MCP gates, and deny-wins policy.
- `docs/openclaw/web/control-ui.md` owns the MCP settings page behavior.
- `docs/plan/consensus/tasks-ai-workforce-design.md` owns the Q17 slice contract.
- `docs/plan/grilling-decisions.md` owns Q16, Q17, and Q18 locked decisions.
- `docs/adr/ADR-002-tenancy-provisioning.md` owns per-tenant Gateway lifecycle and runtime isolation.
- `docs/adr/ADR-003-gateway-broker-acl-two-token.md` owns broker ACL, two-token runtime/admin split, tenant routing, and secret boundaries.
- `docs/adr/ADR-004-data-boundary-cqrs.md` owns Postgres truth, OpenClaw runtime truth, projections-as-cache, outbox, and `AgentDispatch` as bridge.
- `docs/adr/ADR-005-tool-policy-security.md` owns tool-policy-first governance, deny-wins posture, approval rows, and code-capable exception posture.
- `docs/adr/ADR-008-ai-workforce.md` owns AI Workforce, `AgentEmployee`, `Assignment`, and `AgentDispatch` vocabulary.
- `docs/adr/ADR-011-crm-channel-identity.md` supports the projection vocabulary that external runtime facts are not Opzava product truth.
- `docs/plan/research/slice2.5-cc-mcp-live-card.md` owns Slice 2.5 MCP/link-token/card/issue design.
- `docs/plan/consensus/slice2.5-verify.codex.md` owns the verified Slice 2.5 link-token, MCP, RLS, and issue-close posture.
- `apps/mcp-server/src/server.ts` owns current MCP server registration and link-token scope gating.
- `apps/mcp-server/src/tools.ts` owns current `opzava_tasks_*` tool handlers and via-client payload shape.
- `packages/identity-access/src/application/link-tokens.ts` owns current link-token issuance, hashing, verification, expiry, revocation, membership-version, session-current, and principal construction.
- `packages/identity-access/src/adapters/postgres/schema/link-tokens.ts` owns current link-token storage constraints and RLS.
- `packages/project-management/src/adapters/postgres/schema/tasks.ts` owns current Task, step, watcher, comment, status, priority, and RLS schema.
- `packages/project-management/src/adapters/postgres/schema/evidence-quality.ts` owns current evidence and quality-review schema.
- `packages/ports/src/connections-provisioning.ts` owns current Connections device-flow DTOs and provisioning port shape.
- `apps/web/lib/connections-state.ts` and `apps/web/lib/connections.ts` own current web projection and provisioning-client connection flow shape.
- `apps/workers/src/provisioning/ask-admin-agent.ts` owns current Ask Admin Opzava identity, tool policy, deny list, and allowed `opzava_tasks_*` tools.
- `apps/workers/src/provisioning/gateway-admin-connections.ts` owns current provider and GitHub device-flow implementation.
- `apps/workers/src/provisioning/connections.ts` owns current GitHub provisioning receipt with token material excluded.
- `packages/ports/src/issue-tracker.ts` owns current issue-only port shape.
- `packages/adapters/src/github/issues.ts` owns current GitHub issue adapter behavior.
- `packages/project-management/src/application/issues.ts` owns current issue projection, tracked issue creation, and close outbox behavior.

Web sources (fetched 2026-07-12):

- MCP authorization spec 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Codex CLI MCP: https://developers.openai.com/codex/mcp
- OpenCode MCP servers: https://opencode.ai/docs/mcp-servers/
- GitHub OAuth device flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- Better Auth OAuth 2.1 Provider plugin: https://better-auth.com/docs/plugins/oauth-provider
- Better Auth MCP plugin: https://better-auth.com/docs/plugins/mcp
- Normative RFCs: 9728 Protected Resource Metadata, 8414 Authorization Server Metadata, 7591 Dynamic Client Registration, 8707 Resource Indicators, 7636 PKCE, 8628 Device Authorization Grant (not used by MCP), OAuth 2.1 draft-ietf-oauth-v2-1-13.

## Open Questions / Unverified Assumptions

Resolved by section 2.5 (fetched 2026-07-12): the MCP auth spec (2025-11-25), the OAuth 2.1 / PKCE / RFC 9728 / RFC 8414 / RFC 7591 / RFC 8707 relationships, the GitHub device-flow fields, and per-CLI remote authenticated-MCP support for Claude Code, Codex, and OpenCode. The device grant (RFC 8628) is confirmed not part of MCP auth.

Still open (genuine, must resolve before build):

Better-Auth-check: Confirm Better Auth's `oauth-provider` + `mcp` plugins expose consent/claims customization to bind a named `AgentIdentity` at issuance (not client-declared), and confirm scope-to-tool mapping for the governed registry. Check: Better Auth oauth-provider consent + custom-claims docs and a scratch client registration.

Version-check: Confirm the installed Claude Code (>= v2.1.186), Codex CLI, and OpenCode versions in the operator environment match current-docs OAuth behavior. Check: run `claude mcp login`, `codex mcp login`, `opencode mcp auth` against a scratch OAuth MCP server.

Live-check: Confirm Opzava's Traefik one-public-WS posture (Q18) exposes the MCP Streamable HTTP resource server + Better Auth OAuth endpoints + the `.well-known` PRM/AS metadata with correct CORS on `mcp.opzava.<domain>` / `app.opzava.<domain>`. Check: stand up the endpoints behind Traefik and run each CLI login end to end.

Headless-check: Decide whether a browserless operator box is a real requirement; if yes, that is the only case needing an RFC 8628 device-grant extension, which Better Auth does not ship today. Check: Better Auth changelog/plugin config for device-grant support before committing.

Claude Desktop note: Claude Desktop remote-MCP support was requested in the original brief but is not one of the three named local doers (Claude Code / OpenCode / Codex); treat it as out of scope unless the user adds it, then verify separately.

Repo-check: Confirm the current branch has no PR port or CI-status port beyond issue projection before implementation planning, because this memo found `IssueTrackerPort` but no PR equivalent in the inspected sources.

Repo-check: Confirm whether future implementation will rename current `opzava_tasks_*` tools or wrap them behind Q17 `task.*` tools, because this memo treats Q17 `task.*` as the design target while current code still exposes Slice 2.5 names.

Repo-check: Confirm the data migration plan for `blocked` as an orthogonal flag before implementation, because current code still stores `blocked` as a task status.
