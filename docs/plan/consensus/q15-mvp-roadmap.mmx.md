> HISTORICAL: Superseded by `docs/plan/EXECUTION.md`; the admin-Tasks MVP replaced this walking-skeleton MVP. See `docs/plan/consensus/README.md`.

```
WALKING-SKELETON MVP
IN  ▸ docker-compose: traefik, postgres, redis(min), BFF(next), gateway-broker(node+ws), ONE per-tenant opclgw container (docker-socket-proxy sidecar provisions), mailcatcher.
   ▸ Better Auth sign-up+login (ADR-006), single default tenant created at sign-up via Tenant-Provisioning worker (ADR-002), RBAC seed owner/admin/member (ADR-007), Postgres+RLS tenant_id (ADR-004/007).
   ▸ Broker: two-token ACL (user JWT + gw API key), WS hub rooms by tenantId (ADR-003/005).
   ▸ App shell: tenant switcher, sidebar, empty states.
   ▸ Projects: list + create + open (ADR-001 bounded ctx).
   ▸ Ask Opzava chat: 1 default OpenClaw agent (claude-sonnet), streamed tokens over WS, persisted to messages table (ADR-008 thin, ADR-009 ws).
   ▸ PM card CRUD: title/desc/status/assignee within a project (PRD PM-01).
OUT ▸ Knowledge/RAG, CRM, marketing workflows, finance, billing, notifications fan-out, external channels, PWA/offline, error pipeline (013), dept-workflows (012), tool policy UI, multi-region.

Usable signal: new signup → email confirm → tenant URL resolves via Traefik → login → create project → chat returns streamed answer → create a card → reload persists.

PHASES (after skeleton) — each ships usable.
P1 AI Workforce core        ADR-008      D1 tool registry + per-agent policy (ADR-005) D2 delegate/run/background tasks D3 scheduled tasks D4 multi-agent with shared scratchpad.       Usable: schedule + delegate a job, results persisted, audit log visible.
P2 Realtime + PWA           ADR-009      D1 presence/typing/reactions D2 channels + threads D3 file upload to S3-compatible D4 PWA install + offline shell + push.                              Usable: two users chat live, offline still loads.
P3 Knowledge                ADR-010      D1 doc ingestion (txt/md/pdf) D2 hybrid search (pgvector + bm25) D3 per-agent KB binding D4 citations in chat.                                  Usable: upload doc → ask → answer cites source.
P4 CRM                      ADR-011/PRD-CRM D1 contacts+companies D2 deals+stages D3 activities+timeline D4 AI lead-scoring agent.                                            Usable: import 10 contacts → move deal → score updates.
P5 Dept Workflows + Marketing ADR-012     D1 workflow engine (trigger→steps→actions) D2 email/SMS templates D3 campaign send via ACL D4 approval gates.                              Usable: "new lead" trigger fires Slack+email via ACL.
P6 Finance + Billing        ADR-014/PRD-FIN D1 invoices/quotes D2 Stripe sub via ACL D3 usage metering per token/job D4 dunning.                                              Usable: upgrade plan → quota enforced → invoice issued.
P7 Notifications + Admin    ADR-013+Admin D1 in-app/email/push fan-out D2 error pipeline (sentry+DLQ) D3 admin observability (tenants, gw health, audit, kill-switch).                        Usable: gateway down → alert + DLQ replay.
P8 External Channels + Polish ADR-003 ext  D1 WhatsApp/email gateway adapters D2 inbound routing D3 rate limits D4 perf pass + Dokploy parity CI.                                  Usable: DM the bot, ticket appears in app.

FIRST TO DE-RISK (week 0, before skeleton commit):
docker-socket-proxy + provisioning worker spawns opclgw{N} → Traefik dynamic router picks up container labels → broker WS dial to gw wss://gw.opzava.local → handshake carries JWT+API-key → first streaming token round-trip. Without this loop, every later phase is blocked. Spiked as a 2-service throwaway (broker + one gw + traefik + dsp) before touching Next.js or Better Auth. ADR-002/003/005 validated here.
```
