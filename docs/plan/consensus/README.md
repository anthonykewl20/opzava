# Consensus Memo Index

These memos are FROZEN historical evidence from codex, mmx, and spark review runs. Shorthand vendored-doc paths inside the memos resolve under `docs/openclaw/**` unless already fully qualified. Never treat memo content as current truth: accepted ADRs, PRDs, and `docs/plan/EXECUTION.md` control.

Two explicit supersession rules:

- `q13-backlog.mmx.md` is superseded by `docs/plan/backlog.md`; its PRD-019..028 and ADR-016 ids were renumbered into ADR-001..015 plus PRD-001..018 and do not exist.
- `q15-mvp-roadmap.mmx.md` is superseded by `docs/plan/EXECUTION.md`; the admin-Tasks MVP replaced the walking-skeleton MVP. Its two-token wording is also superseded by ADR-003: paired device token plus JIT `operator.admin`, not JWTs.

| File | Evidence | Status |
| --- | --- | --- |
| `q2-tenancy-topology.codex.md` | Q2 tenancy topology review: pure per-tenant Gateway versus shared/hybrid options. | Historical evidence consumed by ADR-002. |
| `q2-tenancy-topology.mmx.md` | Q2 adversarial tenancy topology notes and operational-risk framing. | Historical evidence consumed by ADR-002. |
| `q3-rpc-broker-auth.codex.md` | Q3 broker transport, ACL, credential split, and long-lived broker service. | Historical evidence consumed by ADR-003. |
| `q3-rpc-broker-auth.mmx.md` | Q3 alternate broker/auth framing and WS deployment notes. | Historical evidence consumed by ADR-003; ADR-003 controls token terminology. |
| `q4-data-boundary-contexts.codex.md` | Q4 data-boundary, OpenClaw ACL, hybrid CQRS, and projection guidance. | Historical evidence consumed by ADR-004. |
| `q4-data-boundary-contexts.mmx.md` | Q4 data-boundary and sad-path notes from mmx. | Historical evidence consumed by ADR-004. |
| `q4b-knowledge-credentials.codex.md` | Q4b knowledge, credential, workspace, and project-corpus reasoning. | Historical evidence partly revised by Q8 and consumed by ADR-010. |
| `q4b-knowledge-credentials.mmx.md` | Q4b knowledge/source-of-truth and credential-risk notes. | Historical evidence partly revised by Q8 and consumed by ADR-010. |
| `q4c-sandbox-efficiency.codex.md` | Q4c tool-policy-first security and sandbox efficiency reasoning. | Historical evidence consumed by ADR-005. |
| `q4c-sandbox-efficiency.mmx.md` | Q4c sandbox/tool-policy adversarial notes. | Historical evidence consumed by ADR-005. |
| `q5-tenancy-rbac.codex.md` | Q5 resource-scoped RBAC, RLS, and tenant-context invariant. | Historical evidence consumed by ADR-007. |
| `q5-tenancy-rbac.mmx.md` | Q5 RBAC/RLS red-team and fail-closed isolation notes. | Historical evidence consumed by ADR-007. |
| `q6-auth.codex.md` | Q6 Better Auth, AuthPort, sessions, MFA/passkeys, and invite sad paths. | Historical evidence consumed by ADR-006. |
| `q6-auth.mmx.md` | Q6 auth-stack challenge memo and session/invite constraints. | Historical evidence consumed by ADR-006. |
| `q7-realtime-messaging.codex.md` | Q7 realtime, chat, WS hub, PWA, and Web Push design. | Historical evidence consumed by ADR-009. |
| `q7-realtime-messaging.mmx.md` | Q7 realtime and PWA notes from mmx. | Historical evidence consumed by ADR-009. |
| `q8-ai-workforce.codex.md` | Q8 AI Workforce aggregate, employee workspace, delegation, and governance defaults. | Historical evidence consumed by ADR-008; shorthand OpenClaw paths resolve under `docs/openclaw/**`. |
| `q8-ai-workforce.mmx.md` | Q8 AI Workforce persona/department/autonomy notes. | Historical evidence consumed by ADR-008. |
| `q9-error-pipeline.codex.md` | Q9 error-to-admin-card incident pipeline, projections, and Ask Admin remediation. | Historical evidence consumed by ADR-013; shorthand OpenClaw paths resolve under `docs/openclaw/**`. |
| `q9-error-pipeline.mmx.md` | Q9 incident dedup, visibility, and remediation guardrails. | Historical evidence consumed by ADR-013. |
| `q10-crm.codex.md` | Q10 CRM aggregate model, channel identity, support, marketing, and erasure. | Historical evidence consumed by ADR-011. |
| `q10-crm.mmx.md` | Q10 CRM/contact/deal/ticket/channel identity notes. | Historical evidence consumed by ADR-011. |
| `q11-dept-workflows.codex.md` | Q11 department workflow engine, approvals, reports, and OpenClaw mechanism mapping. | Historical evidence consumed by ADR-012; brace-form OpenClaw paths are shorthand for concrete files under `docs/openclaw/automation/`. |
| `q11-dept-workflows.mmx.md` | Q11 workflow, marketing pipeline, approvals, and report notes. | Historical evidence consumed by ADR-012. |
| `q12-billing-provisioning.codex.md` | Q12 billing plus Gateway provisioning lifecycle and anti-orphan invariant. | Historical evidence consumed by ADR-002 and ADR-014; billing-provider language is superseded by deferred billing/null-adapter reality. |
| `q12-billing-provisioning.mmx.md` | Q12 provisioning saga, Docker-per-tenant, billing, and orphan Gateway notes. | Historical evidence consumed by ADR-002 and ADR-014; billing-provider language is superseded by deferred billing/null-adapter reality. |
| `q13-backlog.mmx.md` | Q13 priority backlog synthesis with old ids. | Superseded by `docs/plan/backlog.md`; PRD-019..028 and ADR-016 do not exist. |
| `q14-local-dokploy-parity.codex.md` | Q14 Compose/Dokploy/Traefik parity and socket-proxy decisions. | Historical evidence consumed by ADR-015. |
| `q14-local-dokploy-parity.mmx.md` | Q14 local/live parity and Traefik service-list notes. | Historical evidence consumed by ADR-015. |
| `q15-mvp-roadmap.mmx.md` | Q15 walking-skeleton MVP and P1-P8 roadmap sketch. | Superseded by `docs/plan/EXECUTION.md`; admin-Tasks MVP replaced the walking-skeleton MVP. |
| `slice0-spike.mmx.md` | Slice 0 spike plan/review evidence around Docker proxy, Gateway routing, and broker stream. | Historical implementation evidence consumed by EXECUTION worklog and ADR-015 refinements. |
| `slice0-review.codex.md` | Slice 0 codex review with ADR-015 refinements and follow-up risks. | Historical review evidence consumed by EXECUTION worklog and ADR-015. |
| `slice0-review.mmx.md` | Slice 0 mmx review of runtime spike and remaining risk. | Historical review evidence consumed by EXECUTION worklog and ADR-015. |
| `slice1a-review.spark.md` | Slice 1a foundation scaffold adversarial review. | Historical review evidence; fixes recorded in EXECUTION worklog. |
| `slice1b-rls-redteam.mmx.md` | Slice 1b RLS red-team for tenant isolation and GUC behavior. | Historical review evidence consumed by Slice 1b implementation. |
| `slice1b-review.spark.md` | Slice 1b Postgres tenant-isolation review. | Historical review evidence; fixes recorded in EXECUTION worklog. |
| `slice1c-auth-redteam.mmx.md` | Slice 1c auth/RLS red-team for identity discovery and membership policies. | Historical review evidence consumed by Slice 1c implementation. |
| `slice1c-review.spark.md` | Slice 1c Better Auth + auth RLS review. | Historical review evidence; SOUND result recorded in EXECUTION worklog. |
| `slice1d-review.spark.md` | Slice 1d auth shell/session/tenant review. | Historical review evidence; findings were fixed according to EXECUTION worklog. |
| `slice1e-review.spark.md` | Slice 1e Task aggregate/admin Tasks board/RLS review. | Historical review evidence; findings and residual risks recorded for Slice 1e. |
