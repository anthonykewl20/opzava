# PRD-013: Connections, providers, channels, tools, and the connect wizard

> **WF-232 amendment status:** Runner enrollment, capability, coordination, and trust-protocol
> details added by WF-232 are a prepared inactive candidate until reviewed #232 landing, tracker
> closure, and the matching #228 parent-map pointer designate them current. Existing accepted
> setup behavior remains current; these staged additions do not activate early.

> **Dev Board execution setup amendment (2026-07-15):** The target Admin setup also enrolls the local execution environment used by Dev Board. It covers a GitHub App health/webhook/outbox panel; an enrolled local machine; an explicit **Codex Desktop / Codex CLI / Claude Code** selector; runner lease, heartbeat, disconnect, reconcile, and resume state; the user's local Docker stack and expiring preview tunnel; reviewer tool and model selection; and the Slack Personal Assistant. These are target requirements, not claims about the current implementation. Today's Connections flow remains a legacy OAuth/manual projection until migrated under PRD-019, ADR-017, and `docs/plan/dev-board-migration-manifest.md`.

> **Admin IA ownership amendment (2026-07-16):** This PRD remains authoritative for integration,
> provider, channel, tool, GitHub, Runner enrollment, local Docker, reviewer, Personal Assistant,
> MCP, setup/provisioning, authorization, secret-handling, health-detail, and audit semantics. Its
> former monolithic **Connections** target is superseded. PRD-020, **Admin Control Center — shell,
> navigation, and overview composition**, places these capabilities across **Gateway**, **Models &
> Providers**, **Runners**, **Environments**, **Integrations**, **Engineering Skills**, **MCP
> Servers**, **Secrets**, **Security & Audit**, and **Settings**. Existing Connections pages and
> routes are as-built migration inputs, not target IA. PRD-013 does not own the Admin shell,
> Admin Overview, or global health meaning. Target topbar health is platform/readiness status;
> its attention count/feed is separate. OpenClaw health remains a contributing source and a
> Connections/detail fact. Within the Admin Control Center, **Integrations** is limited to Opzava
> development/platform connections such as GitHub and Slack Personal Assistant delivery. This
> PRD's retained customer-channel semantics do not place future business/customer connections in
> Admin; their eventual product surface belongs to the future user dashboard or another approved
> contract.

## Problem

Opzava needs one coherent product contract for the integration control plane: tenant Gateway status, model/provider settings, external customer channels, operator-linked coding tools, MCP/tool catalog visibility, and the connect wizard.

Without this PRD, this slice can drift into unsafe or confusing product shapes:

- Slack, WhatsApp, Gmail, and other customer channels could be connected as ordinary Opzava app integrations instead of Gateway-owned runtime channel connections mediated through the ADR-003 ACL.
- Channel secrets, provider credentials, OAuth tokens, webhook signing material, or Gateway-local config could be copied into Opzava product tables or browser-visible setup commands.
- Provider/model settings could become a loose Settings tab instead of schema-backed Gateway configuration with SecretRef health, auth order, model catalogs, usage state, and reload impact.
- The Connections page, Settings Connections tab, Your tools page, and connect wizard could show conflicting concepts of "connected", "active", "degraded", and "needs reconnect".
- Operator-linked tools such as Claude Code, Codex CLI, OpenCode, Codex Desktop, and Claude Desktop could be confused with tenant-admin skill installation or OpenClaw skill runtime.
- MCP server visibility could bypass ADR-005 tool policy, approval gates, and admin-only install governance.
- Tenant admins could think they are editing raw Gateway configuration or installing arbitrary executable skills from the browser, even though ADR-003 and ADR-010 require admin/provisioning jobs for those operations.
- Billing/plan limits could allow more channels, tools, seats, providers, or runtime use than the tenant entitlement permits.

The solution is a coherent integration and setup control plane that separates customer channels,
model providers, tenant Gateway health, operator-linked tools, MCP/tool policy, and skill
provisioning while allowing PRD-020 to place them in focused Admin destinations. Opzava owns
tenant-visible connection metadata, status projections, authorization, plan enforcement, audit,
connect intents, tool-link records, admin catalog selections, and UI state. OpenClaw remains
harnessed for Gateway runtime health, provider/channel runtime configuration, channel status, tool
catalog/effective policy, MCP runtime projection, and skill execution through the broker ACL and
provisioning paths. ADR-003, ADR-005, ADR-010, and ADR-014 are authoritative for boundaries.

## Goals and Non-goals

### Goals

- Preserve and migrate the current `connections.html` capabilities into the focused Admin
  destinations placed by PRD-020; the existing monolithic page is as-built input, not the target.
- Ship the settings touchpoints that affect integration policy without treating Connections as the
  primary container for every setup and operations concern.
- Ship the `essential-tools.html` and `essential-tools-empty.html` operator-facing linked-tools page.
- Ship the `essential-connect-wizard.html` four-step modal for linking terminal and desktop tools.
- Connect external customer channels such as Slack, WhatsApp, and Gmail into the tenant Gateway through broker-mediated ACL/provisioning flows.
- Keep channel secrets in the tenant Gateway and Gateway secret stores, not in Opzava product tables or browser payloads.
- Keep provider credentials and OAuth material server-side as Gateway/SecretRef state, with Opzava storing only opaque refs, health, policy, status, and audit metadata.
- Show tenant Gateway status, heartbeat, region, host identity, routability, degraded states, and last health check in product language.
- Support provider/model settings for auth order, routing policy, default model choices, model catalogs, plan/usage state, SecretRef resolution, reload impact, and validation results.
- Support operator-linked tools including Claude Code, OpenCode, Codex CLI, Codex Desktop, Claude Desktop, and future local clients.
- Enroll one user-owned local machine for Dev Board execution and require an explicit supported runner choice: Codex Desktop, Codex CLI, or Claude Code.
- Configure the local Docker review stack, reviewer tool/model, GitHub App synchronization health, and Slack Personal Assistant from Admin without requiring users to assemble state across other screens.
- Support MCP connection modes and live-agent modes without embedding long-lived secrets in copied commands.
- Surface tool catalog and effective tool policy as readable governance state, with admin-only changes where policy or install authority is required.
- Preserve ADR-010 admin-only curated skill install governance: tenants and admins select approved catalog capabilities, while install/update/upload runs through audited provisioning with `operator.admin`.
- Apply ADR-005 tool-policy-first security to connected tools, MCP servers, skills, and channel-capable agents.
- Apply ADR-014 plan enforcement to connected-channel counts, provider/model availability, tool linking, runtime starts, and usage limits.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw-parity notes for native harnessed capabilities versus Opzava-owned product authority.
- Define acceptance and testing decisions for the named mockups, authorization, secrets handling, status projection, and sad-path states.

### Non-goals

- Build or replace OpenClaw Gateway, channel plugins, provider adapters, MCP server internals, skill runtime, or OpenClaw config storage.
- Store Slack, WhatsApp, Gmail, provider, webhook, model-provider, Talk, OAuth, or Gateway shared-secret values in Opzava Postgres.
- Let browser clients, Next.js handlers, ordinary assistant chats, or the hot-path broker token call Gateway admin config mutation, `skills.install`, `skills.update`, `skills.upload`, or raw channel secret reads.
- Build the full CRM/support inbox, customer transcript view, ticket flow, or contact resolution UX. The deferred user-side CRM/support surface consumes channel events and conversation refs.
- Build full internal chat. PRD-004 owns Opzava internal messages; this PRD only covers external channel connections and Slack alert/ops delivery settings.
- Build billing, invoices, subscriptions, or dunning. ADR-014 (and the deferred Billing settings surface) own billing and cost views; this PRD consumes plan/entitlement decisions.
- Build full admin observability, logs, Incidents, or Debug. PRD-012 owns those surfaces; this PRD links to diagnostics and consumes Gateway health/status.
- Define the Admin shell, Admin Overview, topbar composition, global platform/readiness health
  meaning, attention feed, or target route hierarchy. PRD-020 owns those contracts.
- Define DevTicket workflow, Sprint, Ready, Review, merge, release, or GitHub synchronization semantics. PRD-019 and ADR-017 own those contracts; this PRD owns their setup and health controls.
- Redesign ADR-003, ADR-005, ADR-010, or ADR-014.
- Publish this PRD, create issues, call GitHub, or run build/test/lint commands.

## User Stories

1. As an owner, I want focused Admin destinations for Gateways, providers, channels, tools, and
   setup that share consistent status and policy semantics, so that organization does not create
   contradictory facts.
2. As an owner, I want each destination to show its relevant connected, attention, and health
   facts while contributing platform/readiness status to PRD-020, so that detail and global status
   remain coherent without being conflated.
3. As an owner, I want the Integrations inventory to show connected-system and needs-attention
   counts, so that I can prioritize reconnects and limit issues without treating inventory as
   global platform health.
4. As an owner, I want health-check actions on the owning Gateway, provider, integration, Runner,
   environment, or MCP surface, so that I can refresh the exact capability I repaired.
5. As an owner, I want Add integration in Integrations and explicit enrollment/setup actions in
   their owning focused destinations, so that unlike setup types are not forced through one fake
   connection flow.
6. As an owner, I want the Gateway destination to show Active, Degraded, Suspended, Provisioning,
   Unreachable, Circuit open, and Unknown states, so that runtime availability is explicit.
7. As an owner, I want Gateway status to include heartbeat freshness, region, route identity, host class, and health-check age, so that stale data does not look healthy.
8. As an owner, I want Gateway status to show the fleet or agents hosted by the tenant Gateway, so that I know which employees depend on it.
9. As an owner, I want Gateway status to fail closed when the tenant is suspended or not entitled, so that billing state cannot be bypassed by a reconnect.
10. As an operator, I want Gateway status to distinguish private-loopback exposure from public exposure, so that unsafe Gateway networking is obvious.
11. As an owner, I want Gateway configuration changes to show reload impact and restart-gated status, so that I understand operational risk before applying.
12. As an owner, I want Gateway token rotation to require owner approval and audit, so that credential repair cannot happen casually.
13. As an operator, I want Gateway configuration to show last-known-good and schema validation state, so that a bad config draft can be rejected before runtime.
14. As an owner, I want the Config & schema Settings tab to preview SecretRef resolution, validation, base hash, and reload impact, so that configuration writes are safe.
15. As an owner, I want unresolved SecretRefs to block config writes that depend on them, so that provider or channel changes cannot apply with missing secrets.
16. As an owner, I want raw JSON5 config to remain an escape hatch, so that normal users use schema-backed forms by default.
17. As an owner, I want Deployment settings to show that the OpenClaw Gateway stays private behind the backend, so that I do not accidentally expose it.
18. As an owner, I want deployment checks to confirm the public app and private Gateway, so that releases do not break runtime routing.
19. As an owner, I want model providers listed with provider name, auth type, current models, lead/subagent role, live status, and row actions, so that model routing is understandable.
20. As an owner, I want providers such as OpenAI/GPT Plus, Anthropic/Claude Max, GLM, KIMI, MiniMax, and OpenRouter to appear as provider catalog entries, so that multiple model sources can be governed consistently.
21. As an owner, I want provider auth order to prefer OAuth where available and fall back to SecretRef API keys where policy allows, so that safer auth paths are first.
22. As an owner, I want provider credentials to stay server-side, so that raw keys never reach browser state, generated setup commands, logs, or exports.
23. As an owner, I want provider routing policy to show which provider backs the lead orchestrator, content workers, research, and local CLI workers, so that cost and capability choices are visible.
24. As an owner, I want provider usage to show within-limits, metered, token-plan, near-limit, quota exceeded, auth failed, and unavailable states, so that runtime failures are explained.
25. As an owner, I want provider settings to write audit rows when defaults, routing order, auth order, or enabled models change, so that model governance is reconstructable.
26. As an owner, I want default model settings in General and Agents settings to resolve against the provider catalog, so that users cannot pick models that are not enabled or entitled.
27. As a billing admin, I want provider usage and plan status to respect ADR-014 quotas, so that runtime spend and provider limits are enforced before work starts.
28. As a tenant admin, I want Slack, WhatsApp, and Gmail external customer channels to connect into the tenant Gateway, so that AI employees can receive and respond through approved customer surfaces.
29. As a tenant admin, I want Slack workspace connections to show team/workspace identity, status, last checked, and Test/Configure actions, so that I can verify the channel.
30. As a tenant admin, I want WhatsApp Business connections to show account/phone identity, webhook health, template status where available, and last delivery health, so that support messaging is operable.
31. As a tenant admin, I want Gmail connections to show mailbox identity, sync/webhook health, send permission, and auth expiry state, so that support email routing is operable.
32. As a tenant admin, I want channel OAuth/connect flows to finish inside the Gateway/provisioning path, so that channel credentials live in the Gateway and not in Opzava.
33. As a tenant admin, I want Opzava to store channel refs, account labels, health status, enabled scopes, and audit receipts only, so that product UI can show status without owning secrets.
34. As a tenant admin, I want channel reconnect actions to create a scoped reconnect intent, so that expired OAuth or webhooks can be repaired without exposing old credentials.
35. As a tenant admin, I want channel removal or pause to stop sends before deleting config, so that active customer conversations do not continue unexpectedly.
36. As a tenant admin, I want channel sends to respect agent channel bindings, consent, approval gates, and tool policy, so that connected channels do not give every agent broad send authority.
37. As a tenant admin, I want channel receive events to enter CRM/support projections with opaque conversation and sender refs, so that contacts/tickets can resolve identities without raw Gateway internals.
38. As a tenant admin, I want channel status to distinguish Connected, Needs reconnect, Auth expired, Webhook failing, Scope denied, Rate limited, Suspended, and Gateway unavailable, so that each failure has a next action.
39. As a tenant admin, I want the Channels & services table to show service, use, status, and last sync, so that publishing and messaging integrations are scannable.
40. As a tenant admin, I want Slack, WhatsApp, Gmail, WordPress, Resend, LinkedIn, X, and future services to share status vocabulary, so that users do not learn one-off states.
41. As a tenant admin, I want Slack for internal ops alerts to remain distinct from Slack as an external/customer channel where applicable, so that message ownership is clear.
42. As a tenant admin, I want webhook signing secrets and inbound automation callbacks to use the existing secrets/config mechanism, so that Settings does not show raw signing material.
43. As a tenant admin, I want OAuth approval policy to control who can connect third-party accounts, so that members cannot add risky channels without admin policy.
44. As a tenant admin, I want a connection timeout policy for tool calls and channel checks, so that stuck calls fail in predictable time.
45. As a tenant admin, I want allowed account-linking domains where applicable, so that provider and channel account linking can be constrained.
46. As a tenant admin, I want connection logs to link to PRD-012 redacted logs, so that repair evidence is available without leaking secrets.
47. As an operator, I want the Your tools page to show terminal and desktop tools linked to my Opzava account, so that I know which local tools can execute assignments owned by a `pm.Card` or DevTicket.
48. As an operator, I want Your tools to list Claude Code, OpenCode, Codex CLI, Codex Desktop, and Claude Desktop, so that supported clients are recognizable.
49. As an operator, I want each tool row to show client name, connection path, status, last seen, and more actions, so that local tool state is easy to scan.
50. As an operator, I want tool statuses Active, Connected, Degraded, Disconnected, Not linked, Verifying, Expired, Revoked, and Needs reconnect, so that status is not color-only.
51. As an operator, I want Active to mean the tool is currently running work, so that it is distinct from merely Connected.
52. As an operator, I want Degraded to show latency or health reason, so that I can decide whether to reconnect.
53. As an operator, I want Disconnected tools to show Reconnect and technical details, so that I can repair them without hunting for docs.
54. As an operator, I want a copyable reconnect command, so that desktop MCP clients can be relinked quickly.
55. As an operator, I want copied commands to use generated short-lived or redacted credentials, so that commands cannot leak long-lived secrets.
56. As an operator, I want Connect another from Your tools, so that linking another local client starts the wizard.
57. As a new operator, I want an empty Your tools state that says Connect your first tool, so that I know what to do before any local tool exists.
58. As a new operator, I want the empty state to explain that linking takes about a minute, so that the first connection feels lightweight.
59. As a new operator, I want a ghost preview of linked tools, so that I understand the payoff without a dashboard.
60. As an operator, I want the connect wizard as one modal with four steps, so that linking a tool does not require navigating several pages.
61. As an operator, I want Step 1 to pick a tool, so that I can choose Claude Code, OpenCode, Codex CLI, Codex Desktop, or Claude Desktop.
62. As an operator, I want Step 1 to distinguish terminal agents from desktop MCP clients, so that connection options are relevant.
63. As an operator, I want Step 2 to choose MCP or Live agent when the selected tool supports both, so that I can pick the right integration mode.
64. As an operator, I want MCP marked recommended where it is the simplest mode, so that I do not need to understand every transport.
65. As an operator, I want Live agent mode for tools that can show in Opzava and pick up assigned work, so that local agents can be operated as workforce participants.
66. As an operator, I want Step 3 to show a copyable command, so that I can paste it into the selected local tool.
67. As an operator, I want Step 3 to support "Run it yourself" and "Let the assistant wire itself" where policy allows, so that setup can be manual or assisted.
68. As an operator, I want Step 3 to explain what the command does, so that I can review the connection impact before running it.
69. As a security reviewer, I want setup commands to avoid raw long-lived API keys and use short-lived pairing/setup tokens or masked values, so that copied commands are not credential artifacts.
70. As an operator, I want Step 4 to wait for check-in, so that Opzava confirms the link when the tool appears.
71. As an operator, I want MCP links that cannot be auto-verified to show manual confirmation instructions, so that setup can finish honestly.
72. As an operator, I want a "taking a while" troubleshooting disclosure, so that stalled verification has next steps.
73. As an operator, I want successful links to appear in Your tools and Connections status, so that the wizard outcome is visible.
74. As an operator, I want cancel/close to revoke unused setup tokens, so that abandoned wizard sessions do not remain valid.
75. As an admin, I want operator-linked tools to be scoped to the acting Opzava account and tenant, so that one user's local client cannot silently act for another user.
76. As an admin, I want linked tools to use Opzava-issued credentials or pairing refs distinct from Gateway operator tokens, so that local clients do not receive broker or admin credentials.
77. As an admin, I want linked tool access to expire or revoke when the user loses membership, role, or session access, so that stale clients cannot keep acting.
78. As an admin, I want tool link creation, reconnect, revoke, and last-seen updates audited, so that local tool authority is reconstructable.
79. As an admin, I want MCP & tool policy to list MCP servers, transport, auth, tools, status, default policy, sandbox posture, exec approvals, and Codex projection, so that callable capability is inspectable.
80. As an admin, I want MCP server status to distinguish Active, Approval-gated, Disabled, Policy denied, Missing auth, Degraded, and Gateway unavailable, so that tool health and policy are not conflated.
81. As an admin, I want tool policy edits to be allowlist-based and deny-by-default, so that ADR-005 deny-wins behavior is visible.
82. As an admin, I want standard agents to deny runtime execution and filesystem mutation by default, so that ordinary channel/customer agents cannot get code-execution tools through a tool connection.
83. As an admin, I want exec-capable MCP tools to show approval-gated status, so that dangerous tools are not presented as ordinary connected services.
84. As an admin, I want MCP tools projected into Codex only with the same effective policy, so that local clients cannot bypass Gateway policy.
85. As an admin, I want Add MCP server and Edit allow/deny rules to require the appropriate admin policy, so that ordinary users cannot expand capability.
86. As an admin, I want the tool catalog to show available and effective tools separately, so that catalog availability is not mistaken for runtime permission.
87. As an admin, I want skill catalog selection to happen through an Opzava curated catalog, so that tenants choose approved capabilities instead of arbitrary executable code.
88. As an admin, I want skill install/update/upload to run through audited admin/provisioning jobs, so that the hot-path broker token and browser never get `operator.admin`.
89. As an admin, I want `security.installPolicy` verification to fail closed, so that missing or incompatible skill policy cannot be treated as a warning.
90. As an admin, I want skill install receipts to update the tool catalog/effective policy view, so that runtime capability drift is visible.
91. As a security reviewer, I want all channel, provider, MCP, tool, and skill changes to use `AuthorizationPort`, plan checks, idempotency, and audit, so that integration authority is explainable.
92. As a security reviewer, I want channel and provider secret read requests to require explicit approval where policy allows any reveal, so that secrets are not casually exposed.
93. As a security reviewer, I want ordinary UI to show SecretRef labels and health only, so that secret values never appear in tables, logs, setup commands, exports, or notifications.
94. As a support agent manager, I want channel bindings to determine which AI employees can read or send on Slack, WhatsApp, or Gmail, so that external communication is least-privilege.
95. As a support agent manager, I want inbound channel events to create or update CRM/support projections without starting autonomous sends, so that customer messages cannot trigger unapproved side effects.
96. As a support agent manager, I want send-on-behalf and proactive external sends to respect approval rows, autonomy tiers, standing orders, rate caps, and audit, so that connected channels remain governed.
97. As a billing admin, I want plan limits to block connecting more channels or tools than the plan permits, so that entitlement is enforced before runtime work exists.
98. As a billing admin, I want suspended tenants to keep connection metadata visible but block Gateway starts, channel sends, tool calls, provider changes, and new runtime provisioning, so that grace-period data is readable but spend is stopped.
99. As an operator, I want every connection surface to render loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, conflict, approval required, plan limit, and retry states, so that async runtime reality is normal UX.
100. As a screen-reader user, I want connection tables, tool rows, wizard steps, status badges, details disclosures, and setup commands to have semantic labels, so that I can operate integration workflows without visual scanning.
101. As a keyboard user, I want tabs, filters, Connect, Reconnect, Copy, disclosures, radio choices, switches, and admin actions to work without a mouse, so that setup and repair are accessible.
102. As a mobile user, I want Connections, Your tools, and the connect wizard to preserve status, primary actions, and warning text without overlap, so that integration repair works on narrow screens.
103. As a developer, I want tests at application ports, command handlers, authorization seams, projection writers, route/server-action seams, and UI composition, so that product behavior is protected without coupling to OpenClaw internals.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `connections.html` | **As-built migration input, not target IA.** Its Gateway/provider/channel/tool facts, health classifications, actions, freshness, status labels, redaction, and security behavior remain evidence to migrate. Its single Connections container, group placement, shell chrome, and summary composition are superseded by the focused destinations in PRD-020. |
| `essential-connect-wizard.html` | Single modal wizard rendered as four steps: Step 1 Pick a tool with Claude Code, OpenCode, Codex CLI, Codex Desktop, and Claude Desktop choices; Step 2 Method with MCP recommended and Live agent options where available; Step 3 Copy command with Run it yourself and Let the assistant wire itself tabs, a generated copyable setup command, plain explanation, and no long-lived raw secrets; Step 4 Verify with live waiting state, connected outcome, manual MCP confirmation guidance, and troubleshooting disclosure. Closing or expiring the wizard revokes unused setup tokens. |
| `essential-tools.html` | Essential shell page titled `Your tools` with breadcrumb, Connect another, subtitle explaining terminal/desktop tools linked to the account, health pill such as `5 of 5 local tools` with reconnect note, linked tool list for Claude Code, OpenCode, Codex CLI, Codex Desktop, and Claude Desktop, statuses Active/Connected/Degraded/Disconnected with reason text, Reconnect action for disconnected tools, Technical details disclosure with copyable reconnect command, action feedback live region, and legend for glyph meanings. |
| `essential-tools-empty.html` | Empty `Your tools` page with title/subtitle, primary empty hero `Connect your first tool`, explanation that Claude Code, Codex, OpenCode, or another tool can execute work assigned from an owning `pm.Card` or DevTicket and report evidence to Opzava, primary Connect a tool action to the wizard, effort hint, and ghost preview of future linked tools such as Claude Code, Claude Desktop, and a Gateway-backed fleet tool. |
| `settings.html` | Settings page with left nav for General, Agents, Connections, Security, Notifications, Billing, Advanced, Config, and Deployment. This PRD consumes: General default model; Agents default model/region/concurrency/timeouts and agent governance switches; Connections health summary, connected systems, OAuth approval policy, connection timeout, webhook-secret reference, allowed domains, save/open logs actions, and warning banner; Security secret-read approval control and recent security events; Billing spend cap and pause-at-budget-cap controls; Advanced config export/import and token rotation danger actions; Config & schema validation, SecretRef state, restart impact, raw JSON5 escape hatch; Deployment private Gateway exposure and health check controls. Settings is policy/config adjacency; Connections remains the primary operational surface. |

Net-new screens to design:

- Customer channel connect wizard for Slack, WhatsApp, Gmail, and future customer channels, including OAuth/start, Gateway/provisioning handoff, scope review, webhook check, test event, and completion.
- Channel detail drawer/page for account identity, scopes, channel bindings, webhook health, send/receive policy, consent/approval posture, last events, reconnect, pause, remove, and audit.
- Provider/model detail drawer/page for auth method, SecretRef health, model catalog, routing rules, usage/limits, default model eligibility, reload impact, and audit.
- Tool detail drawer/page for linked user, client type, connection mode, last seen, sessions/runs using the tool, effective policy, revoke/reconnect, and audit.
- MCP server detail/admin editor for transport, auth ref, declared tools, policy decision, sandbox/approval posture, status history, and add/edit flow.
- Curated skill catalog selection/detail screen adjacent to PRD-007 Memory & Skills, showing approved versions, verification, install policy, allowed scopes, runtime drift, and provisioning receipts.
- Connection audit/history screen scoped to integration events, reconnect attempts, failed health checks, policy decisions, and actor attribution.
- Plan-limit/upgrade interstitial for channel/tool/provider limits when ADR-014 entitlement blocks a connection.

## Functional requirements

### Connection inventory and status

- The Connections product slice must own tenant-visible connection inventory projections, status summaries, connect intents, reconnect intents, tool-link records, policy selections, audit refs, and UI state.
- Connection inventory must include connection kind, display name, account/provider label, owning tenant, optional actor/user owner, optional Gateway ref, optional external account label, enabled scopes, status, last checked, last seen, last sync, needs-attention reason, policy refs, entitlement refs, and audit metadata.
- Connection kinds must include Gateway, model provider, customer channel, publishing/service integration, operator tool, MCP server, and curated skill capability.
- Status vocabulary must include Connected, Active, Degraded, Disconnected, Not linked, Needs reconnect, Auth expired, Near limit, Quota exceeded, Webhook failing, Scope denied, Approval required, Policy denied, Suspended, Gateway unavailable, Circuit open, Provisioning, Verifying, Unknown, and Stale where applicable.
- Status projections must include freshness. A stale status must not render as healthy.
- Run health check must fan out to bounded status reads through application services and broker ACL ports, then update projections and Activity/audit where appropriate.
- Health checks must be idempotent and bounded by per-tenant rate limits, timeouts, and circuit breakers.
- Add connection must route to the appropriate flow by connection kind: provider account, customer channel, local/operator tool, MCP server, or curated skill selection.
- Browser-supplied tenant ids, Gateway refs, provider refs, channel refs, tool refs, MCP refs, and runtime refs are hints only; server code must reload authoritative state and authorization.
- Missing or mismatched tenant context must return 403, not a healthy empty list.

### Tenant Gateway status and configuration

- Gateway status must read through the ADR-003 broker ACL and Tenant Provisioning/Platform-Ops read models.
- Gateway status must show lifecycle/routability states from the tenant runtime path without letting users select arbitrary Gateway routes.
- Gateway summary must include tenant Gateway active/degraded state, last heartbeat, region/host label, protocol compatibility state, route health, and last full health check.
- Gateway status must reflect ADR-014 suspension and entitlement state; suspended tenants can view metadata but cannot start runtime, send channel messages, run tool calls, or apply Gateway config changes.
- Gateway configuration summaries must show exposure, auth mode, reload mode, bind host, TLS posture, enabled endpoints, and change queue impact as safe product labels.
- Gateway configuration changes that require admin authority must run through audited provisioning/platform-ops jobs with short-lived `operator.admin`, not through the browser or hot-path broker token.
- Gateway token rotation, auth mode changes, endpoint exposure changes, and restart-gated changes must require owner/admin authorization, policy checks, approval where required, idempotency, and audit.
- Config drafts must preserve base snapshot/hash and fail on stale base, unknown keys, unresolved SecretRefs, schema errors, forbidden fields, or incompatible protocol/config versions.
- Raw JSON5 config must be read-only or edit-gated as an escape hatch and must be redacted. Ordinary users should use schema-backed forms.
- Deployment settings must keep Gateway exposure private and must not provide public Gateway URLs or shared-secret credentials.

### Provider and model settings

- Provider/model settings must be represented as Gateway-owned runtime configuration and Opzava-owned metadata/projections.
- Provider inventory must show provider, auth method, current models, lead/subagent role, status, row actions, last check, and policy/routing state.
- Supported provider catalog entries must include at least OpenAI/GPT Plus, Anthropic/Claude Max, GLM, KIMI, MiniMax, and OpenRouter as product catalog labels where configured.
- Provider auth methods must support OAuth, SecretRef API key, disabled/unconfigured, and policy-denied states.
- Provider credentials, OAuth tokens, API keys, refresh tokens, and provider SDK payloads must never be stored in Opzava product tables or sent to browser clients.
- Opzava may store opaque provider refs, SecretRef names or health labels, catalog ids, status, routing policy, usage summaries, and audit receipts.
- Provider auth order must prefer OAuth where available and allow API-key SecretRef fallback only where tenant/admin policy permits.
- Provider routing must support defaults for lead orchestrator, content workers, research workers, local CLI workers, and future model classes without hardcoding provider-specific behavior into product code.
- Setting a connected provider as main orchestrator must move the visible lead/subagent badges immediately after the successful mutation response, reconcile from the next Gateway snapshot, and leave the badges unchanged when the mutation fails.
- Default model choices in Settings General and Agents must validate against provider availability, entitlement, tenant policy, and model catalog compatibility.
- Provider usage states must consume ADR-014 metering and plan limit projections where available, and Gateway/provider runtime status where required.
- Near-limit or quota-exceeded provider states must block or degrade new work according to plan/routing policy and explain the affected provider/model in Opzava terms.
- Provider setting changes must be audited and emit Activity/notification events where they affect runtime availability, spend, or safety.

### Customer channels and services

- Customer channel connections must include Slack, WhatsApp, Gmail, and future customer-facing channels.
- Channel connection writes must use Gateway/provisioning flows through ADR-003 ACL/admin paths. Opzava must not directly write Gateway storage or call OpenClaw from browser code.
- Channel secrets, OAuth material, refresh tokens, webhooks secrets, provider/channel credentials, and Talk secrets must live inside the tenant Gateway and its configured SecretRef/auth stores.
- Opzava must store only channel connection metadata: channel kind, display name, external account label, opaque Gateway channel ref, enabled scopes, status, health, binding summaries, policy refs, and audit/provisioning receipts.
- Channel connect flow must create an Opzava connect intent with actor, tenant, channel kind, requested scopes, idempotency key, expiry, policy decision, entitlement decision, and audit refs.
- Channel connect flow must hand off to the Gateway/provisioning path for OAuth or secret capture and return only success/failure/status refs to Opzava.
- Channel reconnect must create a new reconnect intent rather than exposing or reusing old secrets in browser state.
- Channel pause must immediately block sends through Opzava admission and Gateway/tool policy before any deferred deletion work runs.
- Channel remove must revoke or delete Gateway-side channel configuration through the appropriate admin/provisioning job and then mark Opzava projections as removed.
- Channel Test must validate receive and/or send health according to the channel's allowed operations without sending real customer content unless the admin explicitly uses a safe test destination.
- Slack, WhatsApp, and Gmail channel status must expose account/mailbox/phone/workspace identity labels, webhook health, auth expiry, scope health, last event, and send/receive availability where available.
- Channel bindings must determine which AI employees, departments, projects, workflows, or support queues may read or send through each channel.
- Inbound channel events must enter CRM/support projections through opaque conversation, sender, channel, and message refs; CRM remains the customer/contact/ticket source of truth.
- Autonomous sends through connected channels must respect ADR-005 tool policy, approval rows, channel bindings, autonomy tier, standing orders, consent, rate caps, and audit.
- Customer channel content, raw webhook payloads, provider headers, tokens, and secrets must be redacted before logs, incidents, notifications, or Activity display.
- Publishing/service integrations such as WordPress, Resend, LinkedIn, X, and future services must use the same status and policy model, with secrets stored through Gateway or approved secrets/config mechanisms according to ownership.

### Operator-linked tools and connect wizard

- Operator-linked tools must be scoped to a tenant, acting user, client type, connection mode, credential/pairing ref, status, last seen, last run/active state, policy refs, and audit metadata.
- Supported initial tools must include Claude Code, OpenCode, Codex CLI, Codex Desktop, and Claude Desktop.
- Tool connection modes must include MCP and Live agent where supported by the client.
- MCP mode must grant the local tool access only to the Opzava MCP/API surface authorized for that user, tenant, and policy. It must not give the client Gateway operator tokens.
- Live agent mode must connect to approved Gateway/session or app-server surfaces through the broker/app boundary and must preserve actor attribution.
- Operator-tool linking, MCP/API credentials, and Live agent mode authenticate a user/client request
  path only. They are not Runner Enrollment, do not authorize machine control, and cannot sign a
  Runner Receipt. OpenClaw Node/Device pairing and vendor-tool login are separate records as well.
- The connect wizard must create a short-lived setup session with selected tool, selected mode, actor, tenant, allowed scopes, idempotency key, expiry, and audit refs.
- Generated setup commands must not contain raw long-lived secrets. They must use short-lived setup tokens, pairing codes, redacted/masked values, or instructions that complete secret exchange server-side.
- Setup tokens must expire quickly, be single-use where possible, and be revoked on cancel, completion, role revocation, membership removal, or tenant suspension.
- The wizard must support auto-check-in verification where the selected mode can call back to Opzava.
- MCP links that cannot be auto-verified must support a manual confirmation path with clear instructions and audit.
- Connect/reconnect commands must include only safe URLs, client identifiers, and short-lived setup refs. They must not include raw Gateway endpoints, Gateway shared secrets, channel secrets, provider keys, or admin credentials.
- Your tools must show active/degraded/disconnected states based on last check-in, current run state, latency/failure reason, revocation state, and policy/entitlement state.
- Tool revoke must invalidate Opzava-issued credentials/pairing refs and block future MCP/API calls from the local client.
- User membership, role, MFA/session, tenant suspension, and policy revocation must invalidate or deny stale local tool calls on the server side.

### Dev Board local execution, review, and GitHub setup

- Admin must expose a first-class **Local machine** enrollment flow with owner, device identity, operating system, supported tool discovery, last heartbeat, lease state, Docker state, and revoke/re-enroll actions.
- Enrollment must require the user to choose exactly one default execution tool from Codex Desktop, Codex CLI, or Claude Code. The UI must not imply that a desktop client exists on operating systems where only a CLI is available.
- Runner Enrollment must use an Admin-authorized, short-lived, single-use setup grant and a
  locally generated public key with fingerprint confirmation. It must never reuse a copied MCP
  token, OpenClaw pairing code, vendor credential, or browser session as the long-lived Runner key.
- A runner is a location/capability endpoint, not an AI identity. Runner state must distinguish
  enrollment lifecycle, key/enrollment epoch, connection epoch, capability freshness/assurance,
  current execution state, and last-confirmed checkpoint rather than compressing all of them into
  one “connected” label. Self-reported or stale capability evidence cannot admit implementation.
- A local or cloud Runner must initiate a separately authenticated outbound WSS role/path through
  the existing broker ingress and expose no inbound machine-control port. Browser, MCP, OpenClaw,
  and Runner credentials and schemas are not interchangeable.
- Enrollment must install a purpose-scoped, versioned server command-key trust bundle with rotation,
  emergency revocation, and rollback protection. The local capability check must prove an
  OS-supervised Lease Enforcer outside the Runner daemon and vendor harness before execution is
  eligible; process supervision reported only by the daemon is insufficient.
- A Dev Board execution lease must be fenced, heartbeated, expiring, and bound to the selected machine/tool/worktree. Disconnect must pause work, revoke preview exposure, preserve the last confirmed checkpoint, and notify Slack; it must not trigger automatic cloud failover.
- Tool inventory may show every linked/discovered client, while Runner configuration selects only a
  platform/version/mode combination proved by the current capability policy. Unsupported Codex
  Desktop, Codex CLI, or Claude Code combinations render unavailable rather than silently healthy.
- Resume after reconnect must reconcile process identity, worktree/branch, locked commit, Docker state, GitHub state, and lease ownership before execution continues. Blind restart is forbidden.
- Admin must configure one shared local Docker review environment with stack command/profile, expected services, health checks, test fixtures, reset policy, preview port, and evidence capture. Secret values remain in the local keyring/vault; Opzava stores named references and health only.
- Preview exposure must use an authenticated, expiring tunnel that is created only for an active review/approval need and revoked on expiry, disconnect, completion, or explicit stop.
- Admin must select the independent local reviewer tool and model. Reviewer availability, model compatibility, last heartbeat, Docker access, and evidence-upload health must be visible before a card can enter Review.
- Admin must expose GitHub App connection health by capability: authentication, repository permission, webhook delivery freshness, outbox/replay lag, rate limits, and last successful bidirectional synchronization.
- GitHub writes must use a durable idempotent outbox and webhook deliveries must deduplicate by delivery/event id. Temporary failures block only capabilities requiring confirmed GitHub history; secret exposure and unhealthy or unverifiable GitHub integration are unbypassable stops.
- GitHub is authoritative for repository-native issue number/URL and PR, commit, check, and merge facts. Opzava is authoritative for Dev Board workflow, gates, approvals, plans, and execution policy. Shared content synchronizes deterministically under ADR-017.
- The Slack Personal Assistant is the only Admin assistant module in v1. It may notify, discuss, and collect version-bound workflow approvals for the enrolled Admin, but secrets, machine enrollment, security/integration changes, and raw credentials must remain in secure Opzava/local flows.
- Slack approval actions must be one-time, expiring, attributable to the enrolled Admin, and bound to the exact contract/plan/evidence version. Stale or replayed actions fail closed.
- Tool link and reconnect events must update Activity/notifications where useful and write immutable audit rows.

### MCP, tool catalog, and skill governance

- MCP server inventory must show server name, transport, auth kind/ref health, declared tools, effective status, and policy state.
- MCP server additions and edits must run through admin-authorized application services and, where they affect Gateway config, audited provisioning jobs.
- MCP tools must be projected into user tools such as Codex only when effective policy allows the same tools for that actor/tenant/client.
- Tool catalog reads must distinguish available tools from effective callable tools.
- Effective tool policy must enforce ADR-005 deny-wins behavior for standard agents and operator clients.
- Standard agents must not receive runtime execution, process/code_execution, write/edit/apply_patch, or filesystem mutation through default tool policy, MCP projection, skill install, channel binding, provider override, or wizard setup.
- Exec/process/code-capable tools must render as approval-gated or denied according to policy and must not be hidden as ordinary connected tools.
- Tool policy edits must carry actor, tenant, target scope, old/new policy, approval refs where needed, idempotency key, and audit.
- Curated skill catalog entries, approved versions, selection policy, verification metadata, allowed scopes, and install policy requirements remain Opzava-owned through `SkillCatalogPort`.
- Skill install/update/upload/repair/uninstall must run only through audited admin/provisioning jobs with short-lived `operator.admin`, as required by ADR-003 and ADR-010.
- Ordinary request handlers, assistant chats, employee sessions, operator-linked tools, and the hot-path broker token must not call `skills.install`, `skills.update`, or `skills.upload`.
- Missing, incompatible, expired, or denied `security.installPolicy` must fail closed.
- Skill install/update must validate or update effective ADR-005 tool policy before the skill becomes callable.
- Runtime installed-skill status may be projected from OpenClaw, but Opzava catalog/selection and provisioning receipts remain product authority.

### Settings touchpoints

- Settings General must validate default model against provider/model catalog, tenant policy, and entitlement.
- Settings Agents must validate default agent model, execution region, concurrency, timeout, follow-up card policy, approval policy, and memory access against owning contexts and plan limits.
- Settings Connections must show connected summary, webhook uptime, pending OAuth, connected systems, OAuth approval policy, connection timeout, webhook secret reference/health, allowed domains, save/open logs actions, and warning states.
- Settings Connections must not display raw webhook signing secret values. Existing mockup password-value behavior must be treated as a masked/ref health UI, not a product requirement to reveal secret material.
- Settings Security must expose secret-read approval policy and audit events without revealing SecretRef values.
- Settings Notifications may route alerts through connected Slack/email channels, but delivery destinations must reference configured connections or notification prefs rather than storing ad hoc secrets.
- Settings Billing must expose plan/spend controls consumed by connection admission, including pause-new-runs-at-budget-cap behavior.
- Settings Advanced actions such as token rotation, config export/import, archive, and developer mode must be authorization-gated, redacted, and audited.
- Settings Config & schema must show validation results and SecretRef resolution but must not make raw Gateway config the default editing surface.
- Settings Deployment must show public app/private Gateway posture and provide health/deployment checks without exposing private Gateway credentials.

### Authorization, billing, audit, and secrets

- Every read and mutation must run through active tenant authorization, resource-scoped roles, plan entitlement, and policy checks.
- Owner/admin-only actions must include connecting customer channels, changing provider auth/routing, editing MCP servers, changing tool policy, rotating Gateway tokens, changing Gateway config, installing/updating skills, revealing any approved secret diagnostic, and applying restart-gated changes.
- ADR-014 plan enforcement must apply before admitting provider enablement, channel connection, tool linking, MCP server addition, skill selection, runtime start, channel send, and high-cost provider/model use.
- Suspended tenants must block runtime starts, channel sends, provider model use, tool calls, skill provisioning, and Gateway config mutation while preserving safe read-only connection metadata during the grace period.
- Audit rows must cover connect intent create/expire/complete, channel connect/reconnect/pause/remove/test, provider auth/routing/model changes, Gateway health/config/token changes, tool link/reconnect/revoke/check-in, MCP add/edit/remove, tool policy changes, skill catalog selection/install/update/repair/uninstall, approval decisions, plan-limit denials, and secret/policy denials.
- Audit rows must include actor, actor type, tenant, target kind/ref, action, old/new safe summary, authorization decision, policy decision, entitlement decision, idempotency key, runtime/provisioning refs where allowed, result, and timestamp.
- No product DTO, log, notification, setup command, export, debug bundle, Activity row, audit row, or incident payload may contain raw channel secrets, provider API keys, OAuth refresh tokens, webhook signing secrets, Gateway shared secrets, broker device tokens, admin credentials, or raw provider payloads.
- Secret values must be represented only by SecretRef labels, opaque refs, health states, last-rotated metadata, expiry warnings, or redaction markers.

### Accessibility and responsive behavior

- Connection tables must include captions or accessible names and preserve service, use, status, and last sync on mobile.
- Tool rows must expose client name, connection path, status, reason, last seen, and actions semantically.
- Wizard radio choices, stepper state, copy command, verification status, troubleshooting disclosures, and close/cancel actions must be keyboard-operable.
- Copy actions must provide feedback within 400 ms and announce success/failure through a live region.
- Status must not rely on color alone; use text or glyph plus label.
- Loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, conflict, approval required, plan limit, and retry states must be rendered where applicable.
- Mobile layouts must preserve primary actions, warnings, status labels, and reconnect/copy actions without text overlap.

## Data and API touchpoints

| Touchpoint | Owning bounded context | Product data / behavior | Ports |
| --- | --- | --- | --- |
| Connection inventory | Tenant Provisioning/Platform-Ops with contributing contexts | Tenant connection projections, connection kind, status, freshness, needs-attention reasons, audit refs | Connection query/application service, `AuthorizationPort`, `EventBusPort` |
| Gateway route/status | Tenant Provisioning/Platform-Ops plus Runtime Control | GatewayInstance refs, lifecycle/routability, heartbeat, region, health, protocol compatibility, suspension state | `GatewayRuntimePort`, broker ACL / `OpenClawGatewayPort`, `AuthorizationPort` |
| Gateway config draft/apply | Tenant Provisioning/Platform-Ops | Schema-backed config drafts, base hash, validation, SecretRef state, reload/restart impact, admin job receipts | Config application service, `GatewayRuntimePort`, `SecretsVaultPort`, `AuthorizationPort`, `EventBusPort` |
| Provider catalog | Runtime Control plus Tenant Provisioning/Platform-Ops | Provider entries, model catalogs, auth methods, routing defaults, availability, status | Provider catalog service, broker ACL / `OpenClawGatewayPort`, `AuthorizationPort` |
| Provider credentials/auth | Tenant Provisioning/Platform-Ops | OAuth/SecretRef setup, credential health, auth order, no raw secret storage in Opzava | `SecretsVaultPort`, provisioning job service, broker ACL/admin path, `AuthorizationPort` |
| Provider usage and limits | Finance and Billing plus Runtime Control | Usage summaries, near-limit/quota-exceeded status, entitlement decisions | Metering service, `BillingPort`, broker ACL usage reader, `AuthorizationPort` |
| Customer channel connect | External Channels via ACL with Tenant Provisioning/Platform-Ops | Connect intents, requested scopes, OAuth/provisioning handoff, Gateway channel refs, status receipts | Channel connection service, broker ACL / `OpenClawGatewayPort`, provisioning job service, `AuthorizationPort`, `EventBusPort` |
| Slack channel | External Channels via ACL plus CRM/Support consumers | Workspace/team identity label, mention/listen/send health, bindings, opaque channel/conversation refs | Channel service, broker ACL channel RPCs, CRM projector, `AuthorizationPort` |
| WhatsApp channel | External Channels via ACL plus CRM/Support consumers | Business account/phone label, webhook/send health, template status where available, opaque conversation refs | Channel service, broker ACL channel RPCs, CRM projector, `AuthorizationPort` |
| Gmail channel | External Channels via ACL plus CRM/Support consumers | Mailbox label, send/sync/webhook health, auth expiry, opaque conversation/message refs | Channel service, broker ACL channel RPCs, CRM projector, `AuthorizationPort` |
| Channel bindings | AI Workforce plus External Channels | Which employees/departments/projects/workflows may read/send, scope filters, approval requirements | AI Workforce application service, Channel service, `AuthorizationPort`, `EventBusPort` |
| Channel events to CRM | CRM/Support plus External Channels | Contact identity resolution, ticket/activity projections, consent refs, conversation refs | CRM projector, Channel event projector, broker ACL event ingestion, `AuthorizationPort` |
| Operator tool links | Identity & Access plus Runtime Control | User-scoped tool link records, setup sessions, credentials/pairing refs, last seen, revoke state | Tool link service, `AuthPort`, `AuthorizationPort`, `RealtimeTransportPort`, `EventBusPort` |
| Connect wizard | Identity & Access plus Runtime Control | Tool/mode selection, short-lived setup token, generated command metadata, verification state, expiry | Tool link service, setup-token service, `AuthorizationPort`, `RealtimeTransportPort`, `EventBusPort` |
| MCP/API credential checks | Identity & Access plus Runtime Control | Local client calls, actor attribution, tenant scope, policy/entitlement decision, revocation | API credential service, `AuthorizationPort`, Runtime Control application service |
| Live agent mode | AI Workforce plus Runtime Control | Local/live agent check-in, session/run refs, assignment pickup, actor attribution | AI Workforce application service, broker ACL / `OpenClawGatewayPort`, `RealtimeTransportPort` |
| Dev Board local runner | Dev Board plus Tenant Provisioning/Platform-Ops | Enrolled machine/key epochs, capability manifest, explicit tool selection, connection epoch, delivery/receipt health, checkpoint, containment, and reconciliation projection | Runner Registry plus target `RunnerControlPort`, `AuthorizationPort`, and durable outbox/inbox; Execution Admission separately owns leases and workflow decisions |
| Local Docker review stack | Dev Board plus Platform-Ops | Stack profile, service health, preview tunnel, evidence capture, named secret-reference health | Local runner service, preview-tunnel service, `SecretsVaultPort`, `AuthorizationPort` |
| Reviewer configuration | Dev Board plus AI Workforce | Independent reviewer tool/model, availability, compatibility, heartbeat, Docker access | Reviewer configuration service, runner service, `AuthorizationPort` |
| GitHub App health and sync | Dev Board plus integration adapter | App installation/permissions, webhook freshness, durable outbox/replay, rate limit, capability health, last deterministic sync | Target GitHub App/sync ports under ADR-017, `AuthorizationPort`, `EventBusPort` |
| Slack Personal Assistant | Internal Collaboration plus Dev Board | Admin identity binding, notifications, one-time version-bound approvals, expiry/replay state | Slack adapter, approval service, `AuthorizationPort`, `EventBusPort` |
| MCP server inventory | Runtime Control plus Tenant Provisioning/Platform-Ops | Server definitions, transport, auth ref health, declared tools, status, policy state | MCP configuration service, broker ACL / `OpenClawGatewayPort`, `SecretsVaultPort`, `AuthorizationPort` |
| Tool catalog/effective policy | Runtime Control | Available tools, effective callable tools, deny/allow decisions, approval gates, Codex projection | Tool policy service, broker ACL / `OpenClawGatewayPort`, `AuthorizationPort`, `EventBusPort` |
| Skill catalog selection | Knowledge Management | Curated entries, approved versions, allowed scopes, verification metadata, selection policy | `SkillCatalogPort`, `AuthorizationPort`, `EventBusPort` |
| Skill install/update/repair | Knowledge Management plus Tenant Provisioning/Platform-Ops | Admin provisioning job, `security.installPolicy`, verification receipt, runtime installed/drift state | `SkillCatalogPort`, provisioning job service, broker ACL/admin path, `AuthorizationPort`, `EventBusPort` |
| Settings Connections | Tenant Provisioning/Platform-Ops | OAuth approval policy, connection timeout, webhook secret ref health, allowed domains, connected systems summary | Settings application service, `SecretsVaultPort`, `AuthorizationPort`, `EventBusPort` |
| Settings Config & schema | Tenant Provisioning/Platform-Ops | Config schema, draft validation, SecretRef health, reload impact, raw JSON5 redacted view | Config application service, `SecretsVaultPort`, `AuthorizationPort` |
| Settings Security | Identity & Access plus Security/Audit | Secret-read approval setting, recent security events, role/session controls | `AuthPort`, `AuthorizationPort`, audit service, approval service |
| Settings Billing | Finance and Billing | Plan, spend, budget cap, pause-new-runs policy, connection/tool/channel entitlement | `BillingPort`, entitlement service, `AuthorizationPort` |
| Notifications and Activity | Notifications/Admin-Observability plus Internal Collaboration | Connection health changes, reconnect needs, install receipts, plan denials, audit summaries | Notification service, Activity projector, `RealtimeTransportPort`, `PushNotificationPort`, `EventBusPort` |
| Connection logs/diagnostics | Notifications/Admin-Observability | Redacted logs, health check results, failure reasons, correlation to incidents | Log read service, broker ACL / `OpenClawGatewayPort`, `AuthorizationPort` |
| Audit | Security/Audit with contributing contexts | Immutable audit rows for connection, provider, channel, tool, MCP, skill, config, and policy changes | Audit log service, `AuthorizationPort`, `EventBusPort` |

## OpenClaw-parity notes

| Surface / capability | Classification | Native harnessed through OpenClaw | Opzava-owned product authority |
| --- | --- | --- | --- |
| Tenant Gateway status | Hybrid | `health`, heartbeat, diagnostics/status, protocol/scope state through broker ACL | Tenant-facing status projection, authorization, entitlement gating, stale/degraded UI, audit |
| Gateway routing | Hybrid | Gateway endpoint and runtime identity are reached only by broker/provisioning paths | Tenant-to-Gateway mapping, route authority, lifecycle/routability records, fail-closed admission |
| Gateway config | Hybrid | Runtime config/schema/apply and SecretRef resolution are Gateway-owned | Schema-backed drafts, validation UX, approval, provisioning job, audit, no raw browser mutation |
| Provider/model catalogs | Hybrid | Gateway/model provider capability, runtime auth health, model availability | Product catalog labels, defaults, routing policy, entitlement, usage display, audit |
| Provider credentials | OpenClaw/Gateway-owned secrets | OAuth/API-key material resolved by Gateway/SecretRef stores | Opaque refs, SecretRef health, policy, status, audit; no raw secret storage |
| Slack/WhatsApp/Gmail channels | OpenClaw-native (harness) | Channel plugins, OAuth/secret material, send/receive runtime, channel status | Connect intents, metadata/status projection, channel bindings, CRM/event projection, consent/approval policy |
| Channel events/transcripts | Hybrid | Gateway/channel runtime observes messages and conversations | CRM Contact/Ticket/Activity truth, opaque refs, authorization, audit, redaction |
| Channel sends | Hybrid | OpenClaw channel send capability through allowed tools/RPCs | Approval rows, autonomy/standing-order checks, channel bindings, rate caps, audit |
| Operator-linked tools | Opzava-owned with native runtime inputs | MCP/live clients may call runtime sessions/tools through approved ports | User-scoped tool links, setup tokens, credential revocation, status, authorization, audit |
| Connect wizard | Opzava-owned | Verification may use Gateway/session/tool check-in where relevant | Tool/mode selection, setup session, generated command safety, expiry/revocation, UX state |
| MCP server inventory | Hybrid | Gateway/runtime can expose MCP/tool state and effective tools | Admin config policy, displayed inventory, auth refs, deny/approval posture, audit |
| Tool catalog/effective policy | Hybrid | OpenClaw exposes `tools.catalog`/effective runtime policy where available | ADR-005 policy decisions, product presentation, approval mapping, Codex projection rules |
| Standard-agent tool restrictions | Opzava-governed native harness | Gateway enforces tool policy | Deny-wins product policy, role/autonomy/channel admission, audit |
| Exec/plugin approvals | Hybrid | OpenClaw runtime approval gates are native | Opzava business/admin approvals, policy conflict handling, Security & Audit projections |
| Curated skill catalog | Opzava-owned | Runtime installed status can be observed from Gateway | Approved entries/versions, allowed scopes, verification, selection policy, receipts |
| Skill install/update/upload | Opzava-governed native provisioning | OpenClaw executes admin-only skill install/update/upload | Admin-only provisioning job, `operator.admin`, install policy, verification, audit |
| Billing/plan limits | Opzava-owned | Runtime usage can inform metering | ADR-014 plans, entitlements, quota admission, overage/suspension handling |
| Connection logs | Hybrid | Gateway/broker logs and diagnostics are read through ACL | Redaction, correlation, tenant/platform visibility, retention, audit |

## Acceptance criteria

- `docs/prd/PRD-013-connections-tools.md` references ADR-003, ADR-005, ADR-010, and ADR-014 and covers the required mockups.
- The capabilities evidenced by the current Connections page remain available through the focused
  PRD-020 destinations, including health checks, connect/setup actions, freshness, Gateway,
  provider, channel, tool, and MCP detail, without requiring one monolithic Overview.
- Gateway status shows Active/degraded/offline/suspended/provisioning/stale states with heartbeat freshness and does not render stale status as healthy.
- Suspended tenants can view safe connection metadata but cannot start runtime, send channels, run tool calls, apply Gateway config, or provision skills.
- Gateway configuration changes that need admin authority create audited provisioning/platform-ops jobs and do not run from browser code or the hot-path broker token.
- Config drafts block on stale base hash, schema error, forbidden field, unresolved SecretRef, or restart/approval requirement.
- Provider/model table shows provider, auth, models, status, actions, lead/subagent role, and realtime main-orchestrator badge movement after a successful set-main mutation.
- Provider credentials and OAuth material are represented only by opaque refs, SecretRef labels/health, auth status, and audit metadata.
- Default model settings validate against enabled provider catalogs, tenant policy, and plan entitlement.
- Provider near-limit/quota-exceeded/auth-failed states block or degrade new work with clear Opzava terms.
- Slack, WhatsApp, and Gmail can be connected through scoped Gateway/provisioning flows with Opzava storing only metadata, opaque refs, health, policy, and audit receipts.
- Channel secrets, OAuth refresh tokens, webhook signing material, provider keys, Gateway shared secrets, broker tokens, and admin credentials never appear in Opzava product tables, browser DTOs, setup commands, logs, exports, notifications, or audit payloads.
- Channel reconnect creates a new reconnect intent and never reveals old secrets.
- Channel pause blocks sends immediately through Opzava admission and policy.
- Channel remove revokes/deletes Gateway-side config through an audited admin/provisioning path and updates Opzava projection state.
- Channel bindings control which AI employees/departments/projects/workflows may read or send through each connected channel.
- Inbound channel events project into CRM/support through opaque refs without making Gateway transcript storage CRM truth.
- Autonomous external sends respect approvals, autonomy tiers, standing orders, consent, rate caps, and audit.
- Your tools renders populated and empty states from the required mockups.
- Your tools distinguishes Active, Connected, Degraded, Disconnected, and Not linked with glyph plus label and reason text.
- Connect wizard supports the four named steps, supported clients, MCP/Live choices, generated command, verification, manual MCP confirmation, cancel, and timeout/expiry.
- Generated setup commands contain no long-lived raw secrets and no Gateway/admin/channel/provider credentials.
- Setup tokens are scoped, short-lived, revoked on cancel/expiry/completion/revocation, and single-use where possible.
- Successful tool check-in creates/updates a user-scoped tool link and appears in Your tools and relevant Connections summaries.
- Revoke invalidates local-client credentials and denies future calls from the tool.
- Role/membership/session/MFA revocation and tenant suspension deny stale local tool calls server-side.
- Admin can enroll one local machine, select Codex Desktop/Codex CLI/Claude Code explicitly, and see runner lease/heartbeat/reconcile state without conflating the runner with an AI identity.
- Runner enrollment proves the locally generated key and fingerprint through a single-use setup
  grant; MCP/tool links, OpenClaw pairing, vendor login, and process identity remain visibly
  distinct. Capability assurance/freshness and supported platform/version/mode determine whether a
  tool can be selected for execution.
- Local runner disconnect fences and pauses work, preserves a checkpoint, revokes preview exposure, and notifies Slack; it never silently fails over to cloud.
- Admin can configure and health-check the local Docker review stack, expiring preview tunnel, and independent reviewer tool/model without exposing raw secrets.
- GitHub App health reports authentication, permissions, webhook freshness, outbox/replay lag, rate limits, and last synchronization; unhealthy or unverifiable integration and secret exposure fail closed.
- Slack Personal Assistant actions are attributable, one-time, expiring, and bound to an exact workflow version; machine enrollment, security/integration changes, and secrets remain in secure Opzava/local flows.
- MCP server inventory shows server, transport, auth, tools, status, default policy, sandbox/approval posture, and Codex projection where configured.
- Tool catalog views distinguish available tools from effective callable tools.
- ADR-005 deny-wins policy prevents standard agents and local clients from gaining denied runtime/filesystem tools through MCP projection, skill selection, provider overrides, or wizard setup.
- Exec-capable tools render as approval-gated or denied according to policy.
- Skill catalog selection is admin-only and tenant-scoped.
- Skill install/update/upload/repair/uninstall creates audited admin/provisioning jobs and never executes from ordinary chat, employee sessions, browser handlers, or the hot-path broker token.
- Missing or incompatible `security.installPolicy` fails closed.
- Skill install/update validates or updates effective tool policy before runtime use.
- ADR-014 plan limits block excess channels, providers, tools, MCP servers, skill capabilities, runtime starts, and channel sends according to entitlement.
- Settings Connections, Config & schema, Deployment, Security, Billing, Advanced, and General/Agents model fields reflect this PRD's policy and secret-handling rules.
- Settings Connections treats webhook signing secret as a masked ref/health field, not a revealable raw password value.
- Secret read requests require configured approval and audit; ordinary connection UI never reveals secret values.
- All connection mutations write immutable audit rows with actor, tenant, target, policy, entitlement, idempotency, and result metadata.
- Missing tenant context, cross-tenant refs, or unauthorized roles return 403 rather than `200` empty or partial results.
- Every relevant screen includes loading, empty, no-match, forbidden, stale, offline/reconnecting, Gateway unavailable, validation error, conflict, approval required, plan limit, and retry states.
- Statuses use text labels or glyph plus label and do not rely on color alone.
- Keyboard and screen-reader users can operate connection tables, wizard steps, radio options, copy buttons, disclosures, reconnect actions, switches, and admin actions.
- Mobile layouts preserve status, warning, primary action, and reconnect/copy detail without overlap.

## Testing decisions

- Test external product behavior and policy outcomes, not OpenClaw storage, provider SDKs, raw Gateway DTOs, or channel plugin internals.
- Prefer the highest stable seams: application services/command handlers, route/server-action authorization seams, projection writers, port adapters with fakes, and UI composition for named mockups.
- Connection inventory tests must cover kind/status/freshness projection, summary counts, needs-attention reasons, stale health, Run health check, and no-match/empty/forbidden states.
- Authorization tests must cover owner/admin/member differences, missing tenant context returning 403, cross-tenant refs denied, browser-supplied Gateway/channel/tool refs treated as hints, role revocation, and suspended tenant read-only behavior.
- Secrets tests must assert no raw channel/provider/OAuth/webhook/Gateway/broker/admin secret values appear in DTOs, setup commands, logs, audit rows, notifications, exports, or rendered UI.
- Gateway tests must use fake `GatewayRuntimePort` and broker ACL ports to cover Active/Degraded/Unavailable/CircuitOpen/Suspended/Provisioning/Stale, config draft validation, unresolved SecretRef, restart-gated changes, token rotation approval, and idempotent admin jobs.
- Provider/model tests must cover catalog availability, default model validation, auth order, SecretRef health, near-limit/quota-exceeded states, ADR-014 entitlement denial, routing policy changes, and audit.
- Channel tests must cover Slack, WhatsApp, and Gmail connect intent creation, OAuth/provisioning handoff, reconnect intent, pause, remove, test, opaque refs, binding enforcement, GatewayUnavailable, ScopeDenied, AuthExpired, WebhookFailing, and no direct secret storage.
- CRM projection tests must cover inbound channel events mapping to opaque channel/conversation/sender refs and not trusting Gateway payload tenant ids as authority.
- Channel send admission tests must cover channel bindings, autonomy tier, approval rows, standing orders, consent, rate caps, plan limits, paused channel, suspended tenant, and audit.
- Tool link tests must cover wizard setup session creation, tool/mode selection, setup-token expiry/revocation, generated command safety, auto check-in, manual MCP confirmation, reconnect, revoke, duplicate submit idempotency, and last-seen updates.
- Local tool authorization tests must cover stale session, role removal, tenant removal, MFA/session revocation, plan suspension, policy denial, and no Gateway operator/admin credential exposure.
- Runner setup tests must cover grant replay/collision/expiry, fingerprint confirmation, key
  rotation/revocation, connection supersession, stale/self-reported capability, unsupported
  platform/version/mode, server command-key rotation/revoke/rollback, independent Lease Enforcer
  failure, cross-tenant denial, and proof that MCP/OpenClaw/vendor credentials cannot substitute
  for Runner Enrollment. Protocol execution behavior remains owned and tested under
  PRD-019/ADR-017 and `wf232-runner-control-protocol.md`.
- UI tests for `essential-tools.html` must cover populated list statuses, reconnect action, technical details disclosure, copy feedback live region, legend, and mobile-preserved status.
- UI tests for `essential-tools-empty.html` must cover first-tool CTA, effort hint, ghost preview, and keyboard navigation to the wizard.
- Wizard UI tests must cover four-step progression, radio choices, MCP/Live availability, back/continue/cancel, copy command, verification waiting state, success/manual confirmation alternatives, timeout/help state, focus trap, and focus return.
- MCP/tool policy tests must cover available versus effective tools, deny-wins behavior, approval-gated exec tools, policy edit authorization, Codex projection, and policy audit.
- Skill governance tests must cover admin-only catalog reads, allowed scopes, install policy fail-closed behavior, provisioning job creation, verification receipt, tool-policy impact, runtime drift projection, and unauthorized install denial.
- Billing/entitlement tests must cover channel/tool/provider/MCP/skill plan limits, budget cap pause-new-runs behavior, suspended tenant denials, overage policy, and clear user-facing denial reasons.
- Settings tests must cover General/Agents model validation, Connections policy fields, masked webhook secret ref behavior, Security secret-read approval toggle, Billing budget cap consumption, Config & schema validation states, and Deployment private Gateway posture.
- Realtime/projection tests must cover health updates, tool check-ins, channel reconnect completion, provider usage changes, duplicate/out-of-order broker events, reconnect backfill, and stale projection labels.
- Audit tests must cover all connection/provider/channel/tool/MCP/skill/config mutations with actor, target, policy, entitlement, idempotency, and result metadata.
- Accessibility tests must cover semantic tables, status text/glyph labels, wizard dialog semantics, radio groups, copy feedback live region, details disclosures, keyboard-only setup/reconnect, and mobile text containment.

## Dependencies

- ADR-003 for gateway-broker ACL, tenant-to-Gateway routing, opaque refs, WS-first runtime access, two-token model, admin/provisioning credential, and the rule that channel/provider secrets stay out of Opzava product storage.
- ADR-005 for tool-policy-first security, approval gates, deny-wins behavior, standard-agent tool restrictions, sandbox posture, data-flow security, and tool invocation audit.
- ADR-010 for Knowledge Management and admin-only curated skill catalog governance, `SkillCatalogPort`, `security.installPolicy`, and audited skill provisioning.
- ADR-014 for plan limits, usage metering, entitlement decisions, suspended tenant behavior, quota middleware, and budget/overage states.
- Locked Q3/Q4/Q4b/Q4c decisions in `docs/plan/grilling-decisions.md` for broker ACL, channel credential placement, OpenClaw capability parity, bounded contexts, and admin-only skill install.
- `docs/plan/capability-parity.md` classifications for Settings/Connections, tools, connect wizard, provider/model status, and external channels.
- PRD-001 for authentication, setup, organization membership, session revocation, MFA, and workspace onboarding.
- PRD-002 for shared authenticated shell infrastructure, Essential shell, command/search patterns,
  notification plumbing, route admission, and responsive state vocabulary.
- PRD-020 for Admin Control Center shell/navigation/Overview composition, target placement of the
  control-plane destinations, platform/readiness health, and the separate attention feed.
- PRD-004 for internal collaboration, Slack-grade internal chat, notifications, and Web Push behavior.
- PRD-005 for Ask Opzava and runtime sessions that consume provider/model routing, tool policy, and channel bindings.
- PRD-006 for AI employee roster, agent detail, automation, channel bindings, tool effective state, and assignment/workload plus run-evidence projections that deep-link to the owning `pm.Card` or DevTicket.
- PRD-007 for Memory & Skills, curated skill catalog, artifacts, knowledge source governance, and skill install receipts.
- The deferred user-side CRM/support surface for CRM/support contacts, tickets, channel identities, customer conversation refs, consent, and support-channel projections.
- PRD-012 for monitoring, logs, Incidents, security audit, debug, redaction, connection logs, Incident correlation, and admin remediation.
- The deferred Billing settings surface and ADR-014 for billing/cost limits, plan enforcement, budget caps, invoices, and usage/metering inputs.
- Mockup implementation conventions from `connections.html`, `essential-connect-wizard.html`, `essential-tools.html`, `essential-tools-empty.html`, and `settings.html`.
- No `CLAUDE.md`, `CONTEXT.md`, or in-repo `docs/agents/` conventions were present in the repository file list during discovery.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
