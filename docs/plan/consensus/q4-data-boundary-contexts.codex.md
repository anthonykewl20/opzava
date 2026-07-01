# Q4 Data Boundary Contexts

**Recommendation: strict split, separate card aggregates, hybrid CQRS read model.**

**1) Bounded-context map.**

Opzava-owned, Postgres system-of-record contexts:

- Identity & Access: users, orgs, tenant membership, RBAC, invites, sessions, audit principals.
- Tenant Admin: workspace lifecycle, billing/admin policy, tenant-to-Gateway binding, provisioning state.
- Project Management: human projects, boards, cards, comments, approvals, assignments, files, admin/error boards.
- CRM & Support: accounts, contacts, deals, tickets, customer timeline.
- Marketing: campaigns, segments, promotions, content calendar, attribution records.
- Product Notifications/Audit: human-visible notifications, immutable app audit, integration correlation records.

OpenClaw-owned contexts, accessed only through the **OpenClaw Gateway ACL** implemented by the Node broker:

- Gateway Runtime: agents, sessions, runs, task ledger, transcripts, artifacts, runtime logs, usage/cost summaries.
- Channel Runtime: Slack/Gmail/WhatsApp/etc. channel state and credentials.
- Automation Runtime: cron, wake/heartbeat, task flow execution.
- Workboard Runtime: optional Gateway-local agent-work boards and cards.

**2) Source of truth.**

Confirm the locked split. Opzava Postgres is authoritative for PM, CRM, Marketing, Identity, Admin, tenant policy, and human workflow history. OpenClaw is authoritative for agent execution, channel connectivity, cron/automation state, sessions, task ledger, Workboard, and Gateway-local secrets/config. Opzava may store external references and projected snapshots, but those are cache/read-model data, not ownership transfer.

**3) Cards.**

Keep two aggregates and bridge them. `PmCard` belongs to Opzava Project Management and models human commitments, ownership, SLA, customer impact, approvals, and board semantics. `WorkboardCard` belongs to OpenClaw Workboard and models agent-sized local operating work with Gateway task/run/session linkage. Unifying them would import Workboard's intentionally small, Gateway-local lifecycle into the human PM domain and turn an optional plugin into core product storage.

Bridge with an Opzava `AgentDispatch` aggregate: a human card/task requests agent work; the domain service issues an idempotent command through the OpenClaw Gateway ACL; the dispatch stores opaque Workboard card id, task id, run id, and session key; lifecycle events project back into Opzava as agent-work status on the human card, not as card identity.

**4) Runtime UI data.**

Use hybrid CQRS. Project durable UI lists into Postgres: agent-run summaries, task lifecycle, Workboard lifecycle, activity feed entries, sanitized errors, usage/cost aggregates, and the session index. Feed these from WS events where available (`session.*`, `sessions.changed`, `cron`, approvals), Workboard notification/event reads, and broker reconciliation calls to `tasks.list`, `sessions.list`, and usage RPCs. This makes tenant dashboards, search, audit, and error-to-admin-card creation independent of live Gateway latency.

Use live broker read-through only for ephemeral or high-volume views: token streaming, active run tail, transient logs, current transcript preview/detail, steering/abort, and immediate status waits. Never read OpenClaw SQLite files directly; the ACL is the only integration boundary.

**Biggest modeling risk:** identity drift between human work and runtime work. If Workboard IDs or statuses become primary PM fields, the bounded contexts collapse. Treat all OpenClaw IDs as opaque external references on `AgentDispatch`, with correlation ids and reconciliation.

**Scale-ready:** each context owns its data, each tenant has one Gateway route, broker connections can shard by tenant, and Postgres read models absorb dashboard load without turning Gateways into query backends.
