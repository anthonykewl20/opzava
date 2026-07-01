**1) Bounded Contexts**
- Opzava Core (Postgres, SoR): Identity & Access, Tenant Onboarding, Project Management, CRM, Marketing, Notifications.
- OpenClaw Runtime (ACL in Node broker): Agent Sessions, Agent Runs & Streaming, Channels, Cron/Automation, Workboard (agent-work), Logs, Usage/Cost.
- Anti-Corruption Layer: `gateway-broker` translates OpenClaw RPC/WS into domain events/commands; never leaks OpenClaw types past it.

**2) Source-of-Truth Split: AGREE.**
Opzava owns human workflows and identity. OpenClaw owns agent execution and its secrets. Lease the Workboard via ACL, don't migrate it.

**3) Two Cards: SEPARATE aggregates, bridged.**
- `pm.Card` (Opzava) — human work, SoR in Postgres.
- `workboard.Card` (OpenClaw) — agent work, SoR in OpenClaw SQLite.
- Bridge: `AgentDispatch` domain service in Opzava calls broker → emits `WorkItemLifecycle` integration events → projected back into Opzava read models for unified UI. Card IDs are cross-referenced, not unified.

**4) Data Flow: HYBRID CQRS.**
- **Read models (event-projected into Postgres)**: agent-run summaries, activity feed, errors, usage/cost, session index, Workboard card lifecycle. Delivered via gateway event stream.
- **Live read-through (broker)**: token streaming, live run tail, real-time logs. Ephemeral, WS-only.
- **Never** live-query OpenClaw DB; broker is the only seam.

**Biggest risk:** Cross-context identity drift. A `workboard.Card` references a session whose owning human user/tenant must round-trip through Identity BC; if Card IDs leak into PM aggregates as primary keys, you re-couple contexts and the modular DDD promise collapses. Treat Workboard card IDs as opaque external references stored in a value object on an Opzava `AgentDispatch` aggregate.

**Scale-ready:** Contexts own their data, communicate only via events or the ACL broker, and can be deployed/scaled independently per tenant.
