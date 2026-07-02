> HISTORICAL: Superseded by `docs/plan/backlog.md`; old PRD-019..028 / ADR-016 ids were renumbered and do not exist. See `docs/plan/consensus/README.md`.

| id | title | tier | depends-on | effort |
|---|---|---|---|---|
| ADR-001 | Monorepo + DDD module boundaries + stack lock (Next.js App Router, TS, Postgres, pnpm/turbo) | P0 | — | S |
| ADR-002 | Pure per-tenant BFF + OpenClawGatewayPort + provisioning saga (tenant as Bounded Context root) | P0 | ADR-001 | M |
| ADR-003 | Broker/ACL + two-token auth model (tenant JWT + delegation JWT) + WS contract | P0 | ADR-001 | M |
| ADR-004 | Data model + hybrid-CQRS projections + transactional outbox | P0 | ADR-002 | L |
| ADR-005 | Tool-policy-first security (policy gate before every agent/tool call) | P0 | ADR-003, ADR-004 | M |
| ADR-006 | Better Auth: sessions, 2FA, invites, password reset | P0 | ADR-003 | S |
| ADR-007 | RBAC + Postgres RLS + per-tenant row isolation | P0 | ADR-004, ADR-006 | M |
| ADR-008 | Realtime WS-hub + Redis pub/sub + presence/typing | P1 | ADR-003, ADR-004 | M |
| ADR-009 | AI-Workforce bounded context: delegate agent = employee (identity, role, quota, audit) | P1 | ADR-002, ADR-005, ADR-007 | L |
| ADR-010 | Knowledge-Mgmt + OpenClawKnowledgeIndex port (OKF) | P1 | ADR-002, ADR-005 | M |
| ADR-011 | Notifications + Admin-Observability (error→card pipeline) | P1 | ADR-008 | M |
| ADR-012 | CRM bounded context (contacts, deals, pipeline, activities) | P2 | ADR-004, ADR-007 | L |
| ADR-013 | Dept-Workflow engine + approvals + content pipeline | P2 | ADR-004, ADR-005, ADR-009 | L |
| ADR-014 | Billing bounded context + External-Channels (ACL) + onboarding saga | P3 | ADR-002, ADR-007 | M |
| PRD-015 | AUTH screens: login, 2fa-setup, accept-invite, forgot/reset, signout, profile | P0 | ADR-006, ADR-007 | M |
| PRD-016 | SHELL/NAV: shell-overview, home, nav/project-switcher, notifications, my-stuff, find, blank-slates | P0 | ADR-001, ADR-008 | M |
| PRD-017 | Project-Management: projects, project, boards, task-board, card, table, status-table, goals, schedule, todos, events, issues | P1 | ADR-004, ADR-007, ADR-008 | XL |
| PRD-018 | Internal-Collaboration (chat): messages, team-room, mentions, compose, updates, slack-style | P1 | ADR-008, ADR-009, ADR-011 | L |
| PRD-019 | AI-Workforce UX: orchestrator-chat, ask-opzava, project-assistant, agents list/detail, automation, tools catalog | P1 | ADR-009, ADR-010 | L |
| PRD-020 | Knowledge UX: memory/skills, docs, upload, ideas | P1 | ADR-010 | M |
| PRD-021 | CRM screens: pipeline, contact, deal, activity timeline | P2 | ADR-012 | M |
| PRD-022 | Marketing: campaigns, campaign-new, content-pipeline, calendar, approvals, assets, performance, ads/email/blog reports, send-review | P2 | ADR-013 | XL |
| PRD-023 | Admin/Ops: activity, logs, monitoring-health, security-audit, costs, debug, notifications-alerts | P2 | ADR-011, ADR-007 | M |
| PRD-024 | Settings + Connections (connect-wizard) + External-Channel binding | P3 | ADR-003, ADR-014 | M |
| PRD-025 | Billing + onboarding + tenant setup wizard | P3 | ADR-002, ADR-014 | M |
| PRD-026 | PWA + WebPush + offline shell | P3 | ADR-006, ADR-008, ADR-011 | M |
| PRD-027 | Discovery surfaces (find people/files/projects) + cross-area search via KnowledgeIndex | P4 | ADR-010, ADR-016 | M |
| PRD-028 | Goal-create + advanced PM (dependencies, SLOs) | P4 | PRD-017 | M |

**Sequencing rules applied**
- P0 = unblock everything (tenancy, auth, data plane, ports).
- P1 = product spine (PM, chat, agents, knowledge) — requires P0 done.
- P2 = revenue-adjacent domains (CRM, marketing) — need projections stable.
- P3 = monetization + channel surface (billing, PWA, integrations).
- P4 = polish/discovery layered last to avoid scope drift.
