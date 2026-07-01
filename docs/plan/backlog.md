# Opzava ADR / PRD Backlog

Proposed priority-ordered backlog derived from the capability-parity map and the locked grilling decisions. Foundation ADRs come first because later PRDs depend on their boundaries, ports, and invariants.

## Priority Tiers

| Tier | Meaning |
| --- | --- |
| P0 | Architectural foundations and irreversible boundaries. |
| P1 | Core product domains needed for the AI-staffed company-in-a-box loop. |
| P2 | Domain systems and revenue/ops workflows after the core loop exists. |
| P3 | Per-screen feature PRDs and implementation slices. |
| P4 | Polish, hardening, and design-system completeness. |

## P0 - Foundation ADRs First

| Id | Title | Covers decisions / contexts | Dependencies | Tier | Effort |
| --- | --- | --- | --- | --- | --- |
| ADR-001 | Monorepo, DDD module structure, and locked stack | Q1, Q1b; all bounded contexts; Next.js App Router, TypeScript, Postgres, Prisma/Drizzle TBD, shadcn/ui, Tailwind | None | P0 | M |
| ADR-002 | Pure-B tenancy, `GatewayRuntimePort`, and provisioning saga contract | Q2, Q12; Tenant Provisioning/Platform-Ops; one Gateway per tenant, lifecycle states, container/bin-pack path | ADR-001 | P0 | L |
| ADR-003 | `gateway-broker` ACL, two-token model, and WS protocol client | Q3, Q4, Q4b; AI Workforce, External Channels via ACL, Platform-Ops; tenant routing table, scoped write+approvals token, JIT admin token | ADR-002 | P0 | L |
| ADR-004 | Data model boundary, hybrid CQRS, outbox, and projections | Q4, Q7, Q9, Q12; PM, CRM, Marketing, Admin-Observability, Billing; Postgres read models, projections, event bus port | ADR-001, ADR-003 | P0 | L |
| ADR-005 | Tool-policy-first security, approval gates, and sandbox posture | Q4c, Q8, Q11; AI Workforce, Knowledge Mgmt, External Channels; deny runtime/fs mutation by default, egress audit, rare sandbox exception | ADR-003, ADR-004 | P0 | M |
| ADR-006 | Better Auth, revocable sessions, MFA/passkeys, and PWA auth | Q6, Q5, Q7; Identity&Access; DB sessions, TOTP/recovery, passkeys, session revocation, Web Push binding | ADR-001 | P0 | M |
| ADR-007 | Resource RBAC, roles-as-data, and Postgres RLS | Q5; Identity&Access, Project Mgmt, CRM; `AuthorizationPort`, tenant tx wrapper, org/project grants, external guest isolation | ADR-004, ADR-006 | P0 | L |

## P1 - Core Domain ADRs

| Id | Title | Covers decisions / contexts | Dependencies | Tier | Effort |
| --- | --- | --- | --- | --- | --- |
| ADR-008 | AI Workforce, delegate agents, personas, and `AgentDispatch` | Q8, Q4, Q11; AI Workforce; `AgentEmployee`, `Persona`, `Department`, `Assignment`, `AgentDispatch`, OpenClaw opaque refs | ADR-003, ADR-005, ADR-007 | P1 | L |
| ADR-009 | Realtime WS hub, internal chat, assistants-in-chat, PWA/Web Push | Q7, Q8; Internal Collaboration, Notifications/Admin-Observability; WS hub, Redis backplane, outbox, message seq, push | ADR-004, ADR-006, ADR-008 | P1 | L |
| ADR-010 | Knowledge Mgmt SoT, OKF ingestion, memory/wiki/vector indexes, skill catalog | Q4b, Q8; Knowledge Mgmt; Opzava KB source, OKF bundles, memory-wiki/lancedb derived indexes, admin-only skills | ADR-003, ADR-005, ADR-007 | P1 | L |

## P2 - Domain ADRs

| Id | Title | Covers decisions / contexts | Dependencies | Tier | Effort |
| --- | --- | --- | --- | --- | --- |
| ADR-011 | CRM, external channel ACL, and contact identity resolution | Q10, Q7, Q8; CRM, External Channels via ACL; `Contact`, `Ticket`, `ChannelIdentity`, shell contacts, consent, GDPR purge | ADR-003, ADR-008, ADR-010 | P2 | L |
| ADR-012 | Department workflow engine, approvals, content pipeline, reports | Q11, Q8; Marketing/Dept-Workflows, Finance, CRM; `Workflow`, `Mechanism`, `Approval`, cron/TaskFlow/standing-orders | ADR-008, ADR-009, ADR-010 | P2 | L |
| ADR-013 | Error-to-admin-card incident pipeline and remediation loop | Q9, Q4, Q7; Notifications/Admin-Observability; `ErrorGroup`, redaction, deadletter, watchdog, Ask Admin remediation approvals | ADR-003, ADR-004, ADR-009 | P2 | L |
| ADR-014 | Billing, usage metering, plan enforcement, and dunning lifecycle | Q12; Billing, Tenant Provisioning/Platform-Ops; Stripe port, `MeterEvent`, plan limits, suspension/deprovision coupling | ADR-002, ADR-004, ADR-013 | P2 | L |

## P3 - Product PRDs

| Id | Title | Covers decisions / contexts | Dependencies | Tier | Effort |
| --- | --- | --- | --- | --- | --- |
| PRD-001 | Auth, invitation, profile security, and first workspace setup | Q5, Q6, Q12; Identity&Access, Tenant Provisioning/Platform-Ops; screens: auth, 2FA, invite, setup, profile, signout | ADR-002, ADR-006, ADR-007 | P3 | L |
| PRD-002 | App shell, navigation, command palette, search, and project switcher | Q4, Q7; Project Mgmt, Notifications/Admin-Observability; screens: shell overview, home, projects, find, switcher | ADR-004, ADR-007, ADR-009 | P3 | M |
| PRD-003 | Projects, boards, cards, goals, to-dos, schedules, docs, discovery | Q4, Q4b, Q8; Project Mgmt, Knowledge Mgmt, AI Workforce; screens: project, boards, cards, goals, todos, docs, discovery | ADR-004, ADR-008, ADR-010 | P3 | L |
| PRD-004 | Internal chat, DMs, project team rooms, mentions, activity, notifications | Q7, Q8; Internal Collaboration, Notifications/Admin-Observability; screens: messages, Slack view, team room, compose, mention inbox, activity | ADR-009 | P3 | L |
| PRD-005 | Ask Opzava and Ask Admin Opzava conversations | Q3, Q7, Q8, Q9; AI Workforce, Admin-Observability; screens: orchestrator chat, essential Ask Opzava, project assistant | ADR-003, ADR-008, ADR-009, ADR-013 | P3 | L |
| PRD-006 | AI assistant roster, agent detail, task board, run trace, automation | Q8, Q11; AI Workforce; screens: agents, agent-detail, task-board, automation | ADR-008, ADR-012 | P3 | L |
| PRD-007 | Knowledge, skills, docs/files, artifacts, and governed skill install | Q4b, Q8; Knowledge Mgmt; screens: memory-skills, docs, upload, card evidence | ADR-010 | P3 | L |
| PRD-008 | Marketing campaign suite and content production loop | Q11, Q8; Marketing/Dept-Workflows; screens: marketing home, campaigns, new campaign, content pipeline, calendar, event-new | ADR-012, ADR-010 | P3 | L |
| PRD-009 | Marketing approvals, assets, upload, send-review, reports, performance | Q11; Marketing/Dept-Workflows; screens: approvals, send-review, assets, upload, performance, ads/email/blog reports | ADR-012, PRD-008 | P3 | L |
| PRD-010 | CRM and customer support workflows | Q10, Q8; CRM, External Channels via ACL, Project Mgmt; screens: customer support boards/cards, reply review, external ticket links | ADR-011, PRD-003, PRD-005 | P3 | L |
| PRD-011 | Finance expense ledger and money-risk approval UX | Q8, Q11; Finance; screens: costs, security approvals for spend/refunds | ADR-005, ADR-012, ADR-014 | P3 | M |
| PRD-012 | Admin monitoring, logs, issues, security/audit, alerts, debug | Q5, Q9, Q12; Identity&Access, Notifications/Admin-Observability, Platform-Ops; screens: monitoring, logs, issues, security-audit, alerts, debug | ADR-007, ADR-013, ADR-014 | P3 | L |
| PRD-013 | Connections, providers, channels, tools, MCP, and connect wizard | Q3, Q4b, Q8, Q12; External Channels via ACL, Platform-Ops; screens: connections, settings connections, tools, connect wizard | ADR-003, ADR-005, ADR-010, ADR-014 | P3 | L |
| PRD-014 | Billing settings, plan limits, usage budgets, onboarding completion | Q12, Q11; Billing, Platform-Ops; screens: settings billing, costs budget signals, setup completion | ADR-014, PRD-001, PRD-013 | P3 | L |

## P4 - Completeness / Hardening PRDs

| Id | Title | Covers decisions / contexts | Dependencies | Tier | Effort |
| --- | --- | --- | --- | --- | --- |
| PRD-015 | External guest-client portal and project-scoped magic links | Q5, Q6, Q10; Identity&Access, CRM, Project Mgmt; guest support-ticket access without org membership | ADR-006, ADR-007, ADR-011 | P4 | M |
| PRD-016 | PWA install/offline behavior and Web Push preferences | Q6, Q7; Identity&Access, Internal Collaboration, Notifications/Admin-Observability; service worker auth probe, push privacy, offline gates | ADR-006, ADR-009 | P4 | M |
| PRD-017 | Design system, async states, blank states, and accessibility acceptance rules | Q13 parity surface; all UI contexts; screens: style-guide, blank-slates, index, loading/error variants | PRD-002 | P4 | M |
| PRD-018 | Admin remediation actions and one-tenant blast-radius controls | Q9, Q12; Notifications/Admin-Observability, Platform-Ops; dry-run, approval, re-dispatch, restart, reprovision, audit | ADR-013, ADR-014, PRD-012 | P4 | L |

## Top Dependency Chain

| Rank | Item | Tier | Depends on |
| --- | --- | --- | --- |
| 1 | ADR-001 Monorepo, DDD module structure, and locked stack | P0 | None |
| 2 | ADR-002 Pure-B tenancy, `GatewayRuntimePort`, and provisioning saga contract | P0 | ADR-001 |
| 3 | ADR-003 `gateway-broker` ACL, two-token model, and WS protocol client | P0 | ADR-002 |
| 4 | ADR-004 Data model boundary, hybrid CQRS, outbox, and projections | P0 | ADR-001, ADR-003 |
| 5 | ADR-005 Tool-policy-first security, approval gates, and sandbox posture | P0 | ADR-003, ADR-004 |
| 6 | ADR-006 Better Auth, revocable sessions, MFA/passkeys, and PWA auth | P0 | ADR-001 |
| 7 | ADR-007 Resource RBAC, roles-as-data, and Postgres RLS | P0 | ADR-004, ADR-006 |
| 8 | ADR-008 AI Workforce, delegate agents, personas, and `AgentDispatch` | P1 | ADR-003, ADR-005, ADR-007 |
| 9 | ADR-009 Realtime WS hub, internal chat, assistants-in-chat, PWA/Web Push | P1 | ADR-004, ADR-006, ADR-008 |
| 10 | ADR-010 Knowledge Mgmt SoT, OKF ingestion, memory/wiki/vector indexes, skill catalog | P1 | ADR-003, ADR-005, ADR-007 |
| 11 | ADR-011 CRM, external channel ACL, and contact identity resolution | P2 | ADR-003, ADR-008, ADR-010 |
| 12 | ADR-012 Department workflow engine, approvals, content pipeline, reports | P2 | ADR-008, ADR-009, ADR-010 |
