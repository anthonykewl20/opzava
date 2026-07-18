# WF-245 Research Memo — GitHub integration setup placement and Connections migration

Dual-provider research (GLM + Codex-spark), converged; open decisions carried to #246.

Status: Wayfinder research evidence for [#245](https://github.com/anthonykewl20/opzava/issues/245), map [#241](https://github.com/anthonykewl20/opzava/issues/241), no code changes. Every claim includes a citation to files or issue discussion.

## Scope guard

#245 owns Admin placement + migration contract for GitHub enrollment, health, repair, and integration history, and the migration split for current Connections sections into semantically owned destinations with routing and compatibility behavior. It does not redefine authoritative semantics already fixed in PRD-019/ADR-017 (GitHub sync/work), PRD-013 (integrations health/connector surfaces), PRD-012/PRD-018 (health/remediation), or PRD-020 (Admin Control Center placement constraints) (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:432-433`; `docs/prd/PRD-013-connections-tools.md:338-340`; `docs/prd/PRD-020-admin-control-center.md:239-246`; `docs/prd/PRD-020-admin-control-center.md:253-267`; `docs/plan/admin-control-center-foundation-decisions.md:176`).

The canonical owner split is already captured by the #245 owner comment: Integrations is placement/setup boundary; `DevBoard.GitHubIntegration` retains synchronization and workflow authority (`[#245 comment](https://github.com/anthonykewl20/opzava/issues/245#issuecomment-4997467420)`).

## 1) Consolidated decision record

### 1.1 GitHub integration placement and authority

**Decision:** GitHub setup, health status projection, repair actions, and integration history UI belong under `Configure → Integrations`, but GitHub sync/workflow authority and conflict/remediation remain in Dev Board contracts (`PRD-019/ADR-017`) and are not migrated into an Integrations-owned ledger. \
Rationale: ACC-054 and ACC-055 define Integrations as the health/repair/operations surface while keeping work authority with Dev Board; ACC-074 is the unbypassable stop-invariant for unhealthy/unverifiable integration states, and PRD-013 lineages frame GitHub as authoritative for repository-native facts while Opzava owns workflow policy/execution. (`docs/plan/admin-control-center-foundation-decisions.md:102`; `docs/plan/admin-control-center-foundation-decisions.md:128`; `docs/plan/admin-control-center-foundation-decisions.md:129`; `docs/plan/admin-control-center-foundation-decisions.md:158`; `docs/prd/PRD-013-connections-tools.md:338-340`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:441`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:306-309`).

### 1.2 Target setup model for GitHub enrollment

**Decision:** migrate from OAuth App device-flow `/connections/github` implementation to GitHub App-based setup in Integrations, preserving no cloned sync state during cutover and keeping OAuth route functional until parity before redirecting. (`apps/web/app/(app)/connections/github/page.tsx:14`; `docs/prd/PRD-013-connections-tools.md:8`; `docs/prd/PRD-013-connections-tools.md:338-340`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:93`).

### 1.3 Connections monolith split and destination ownership

**Decision:** `/connections` is not a monolithic canonical leaf. It splits by semantic owner into:
- **Operate → Health**,
- **AI Runtime → Gateway**,
- **AI Runtime → Models & Providers**,
- **Configure → Integrations**,
with no blanket redirect of all `/connections/*` to one page until every section reaches verified destination parity. (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:90`; `docs/plan/admin-control-center-foundation-decisions.md:127`; `docs/plan/admin-control-center-foundation-decisions.md:79-108`).

**Decision:** destination path names are deferred under ACC-D09; only `/dev-board` is currently contracted as a canonical target family. (`docs/plan/admin-control-center-foundation-decisions.md:82-83`; `docs/plan/admin-control-center-foundation-decisions.md:197`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:432-433`).

### 1.4 Redirect and alias behavior (including query/fragment dispatch)

**Decision:** redirects are owner-dispatched per route and preserve safe state; legacy deep links transition only when destination parity is verified. (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:90-94`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:369-377`).

- `/connections` → Integrations only when all sections are proven-to-parity (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:90`).
- `/connections/github` and `/connections/add` transition into Integrations ownership after parity (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:93`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:94`).
- `/connections/providers` → Models & Providers after leaf parity (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:92`; `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:761`).
- `/connections/system` keeps current live route until its mixed-owner anchor semantics are formally mapped (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:91`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:184`).
- `/connections/gateway` remains a permanent redirect trap and must not become a live canonical Gateway page without cache-safe migration planning (`apps/web/next.config.ts:8-15`; `apps/web/test/next-config.test.ts:5-15`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:183`).
- `#system-group-channels` maps to Integrations-owned surface, while unknown or mixed fragments remain owner-specific and must not silently remap (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:91`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:203-209`).
- Query/fragment notices are owner routed: `github-not-configured` and GitHub return-state are #245 scope; health/step-up notices and provider outcomes map to other owners (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:202`; `docs/prd/PRD-020-admin-control-center.md:318-321`; `apps/web/app/(app)/connections/_components/page-notice.tsx:3-44`).

### 1.5 Permissions, rollback, and URL compatibility posture

**Decision:** redirection cannot bypass authorization; forbidden access remains explicit hard 403 and does not grant capabilities at destination. (`docs/prd/PRD-020-admin-control-center.md:318-321`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:348-353`; `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:350-364`).

**Decision:** expand/contract migration is owner-port driven. UI route can move while server command contracts remain stable; keep rollback possible until telemetry and owner reconciliation validate no unsupported consumers.

**Decision:** `/api/connections/device-flow` can remain compatibility facade during overlap; broader `/api/connections/*` is renamed/retired only after atomic consumer migration, preserving idempotency and audit history. (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:155`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:362-368`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:400-407`).

**Decision:** do not remove legacy capability pages before target parity and explicit rollback criteria are met; frozen historical ledgers and execution records remain untouched. (`docs/plan/admin-control-center-foundation-decisions.md:176`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:400-407`).

## 2) Decision tensions and cross-ticket dependencies

1. **Authority split vs. implementation temptation** remains active: Integrations placement must not imply sync/workflow ownership transfer; PRD-020 and ACC repeatedly separate shell ownership from operation authority. (`docs/prd/PRD-020-admin-control-center.md:239-246`; `docs/plan/admin-control-center-foundation-decisions.md:102`; `docs/plan/admin-control-center-foundation-decisions.md:104-105`; `docs/plan/admin-control-center-foundation-decisions.md:127-129`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:441`).
2. **URL certainty vs. deferred synthesis:** no authoritative doc currently provides canonical destination paths for the split; concrete URLs remain a #246 decision. (`docs/plan/admin-control-center-foundation-decisions.md:79-83`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:480-483`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:509-511`; `https://github.com/anthonykewl20/opzava/issues/245#issuecomment-5010329309`).
3. **Task/issue identity coupling:** closing `/tasks` and `/issues` aliases is blocked until #228-anchored record-aware mapping and session preservation are finalized. (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:298-304`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:505-509`; `https://github.com/anthonykewl20/opzava/issues/228`).
4. **Ask Admin overlap:** /ask-opzava cannot be reinterpreted by #245; canonical path and session identity remain with #210. (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:304-306`; `https://github.com/anthonykewl20/opzava/issues/210`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:505-509`).
5. **AI Runtime boundary:** #249 controls AI Runtime/control-plane paths and forbids publishing Control-UI style surfaces prematurely; Connections fragments with runtime semantics must align with that boundary. (`docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:1-8`; `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:762-763`).
6. **Security/setup boundary:** #247 controls settings/security/notifications/account and forbids generic secret/config disclosure by alias; routing must not move those responsibilities into Connections compatibility defaults. (`docs/plan/research/wf247-admin-security-settings-notifications-account.md`; `docs/plan/admin-control-center-foundation-decisions.md:123-134`).

## 3) Open decisions for owner

1. **Canonical production path for the Integrations GitHub leaf and section/tab routing (`#246`).**
   - **Recommendation carried to synthesis #246 (not an owner-lock):** define a local four-part Integrations GitHub contract (enrollment, health dimensions, repair, integration history), keep owner-port-projected state, and let #246 choose destination path names and final query return encoding after migration sequence.
   - Evidence and scope: `wf242` leaves local section model as #245 work and defers canonical URL to #246 (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:492-493`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:202`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:204`).
2. **`/api/connections/*` namespace retention and eventual rename/retirement (`#246`, with PRD-013 + runtime ownership review).**
   - **Recommendation carried to synthesis #246 (not an owner-lock):** keep `/api/connections/device-flow` as a compatibility facade until atomic consumer migration occurs; remove/rename broader compatibility namespace only after telemetry and zero unsupported consumer checks pass (`wf242` seam criteria).
   - Evidence: compatibility retention vs retirement is not finalized (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:490-491`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:155`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:362-368`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:369-377`).
3. **Compatibility duration and redirect retirement policy (`#246`).**
   - **Recommendation carried to synthesis #246 (not an owner-lock):** retain legacy compatibility routes/redirects through at least one full release after verified parity, with telemetry and rollback gates before removal.
   - Evidence: rollback and compatibility-window requirement appears in seam guidance and does not currently define exact duration (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:379-398`; `docs/plan/admin-control-center-foundation-decisions.md:176`).
4. **Final destination for `/connections/system` mixed-owner anchors and any fabricated fragment behavior (`#245` + #249/#250 + #246).**
   - **Recommendation carried to synthesis #246 (not an owner-lock):** preserve existing `#system-group-channels` → Integrations mapping, avoid inventing destinations for unknown anchors, and finalize bare-route destination only after AI Runtime/runtime-health/security owners provide anchor matrices.
   - Evidence: #245 owns channels anchor only; other anchors remain owner-specific (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:204`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:207-209`).
5. **OAuth App legacy state during GitHub App migration (`#245` implementation scope, with PRD-013/PRD-019).**
   - **Recommendation carried to synthesis #246 (not an owner-lock):** use a fresh GitHub App enrollment path in Integrations and do not clone OAuth App sync state when redirecting `/connections/github` after parity (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:93`).
6. **Integrations “Add integration” UX pattern (`#245`, PRD-013/ACC-053).**
   - **Recommendation carried to synthesis #246 (not an owner-lock):** keep `/connections/add` behavior owner-dispatched, not a generic integration bucket: one add action for Integrations-owned services (GitHub/Slack Personal Assistant), with Gateway/MCP/Runner/Environment/Secret setup remaining in their destinations.
   - Evidence: ACC-053 and migration table explicitly warn `/connections/add` is a compatibility entry, not an owning setup monolith (`docs/plan/admin-control-center-foundation-decisions.md:127`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:94`; `docs/plan/admin-control-center-foundation-decisions.md:79-108`).
7. **`/tasks`, `/issues`, `/ask-opzava`, and security/settings anchors remain open to upstream owners (`#228`, `#210`, `#247`).**
   - **Recommendation carried to synthesis #246 (not an owner-lock):** keep these routes as evidence-only migration surfaces until upstream owners publish canonical paths and reconciliations (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:298-306`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:480-483`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:505-509`; `https://github.com/anthonykewl20/opzava/issues/245#issuecomment-5010329309`; `https://github.com/anthonykewl20/opzava/issues/210`).
8. **Implementation guardrails for migration CI and fallback behavior (`#245`).**
   - **Recommendation carried to synthesis #246 (not an owner-lock):** require CI/smoke checks for 403-deny responses, revoked-auth cache-miss behavior, redirect-chain safety, permanent redirect trap handling, and rollback switchback criteria before removing legacy routes.
   - Evidence: denied-redirection and rollback/sad-path contracts are explicit in PRD-020 and wf242 (`docs/prd/PRD-020-admin-control-center.md:318-321`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:413-417`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:394-396`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:379-398`).

## 4) Known sad-path requirements retained in scope

- Unbypassable closed state for unhealthy/unverifiable GitHub integration, with repair surfaced honestly through Integrations while sync/work control remains with PRD-019/ADR-017 (`docs/plan/admin-control-center-foundation-decisions.md:129`; `docs/plan/admin-control-center-foundation-decisions.md:158`; `docs/prd/PRD-013-connections-tools.md:338-340`).
- `/connections/gateway` cache trap behavior is non-negotiable: avoid chain updates and preserve tests that account for permanent redirect caching behavior (`apps/web/next.config.ts:8-15`; `apps/web/test/next-config.test.ts:5-15`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:183`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:394-396`).
- Unknown redirect notices/fragments must be preserved safely or rejected explicitly, never forwarding credentials/setup codes in URL state (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:420`; `apps/web/app/(app)/connections/_components/page-notice.tsx:3-44`).
- Command endpoints under ownership transition must keep re-authorization, audit, validation, and idempotency where required; provisioning unavailable states remain explicit and safe (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:357-360`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:362-368`).
- Legacy route remains active while destination is incomplete; placeholder pages are not migration signals to redirect (`docs/plan/admin-control-center-foundation-decisions.md:176`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:422`).
- OAuth→GitHub-App overlap must preserve source-of-truth and mismatch visibility; sync-state cloning is disallowed (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:93`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:421`).
- Post-disconnect legacy return to `/connections/add` must transition atomically with migration destination (`apps/web/app/(app)/connections/actions.ts:86-126`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:94`).
- Historic records and external-native GitHub references (issue/PR/commit/check/merge) remain product-facing source authority where required and are not conflated into local issue numbering (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:340`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:419`).

## 5) What #245 hands to #246

#245 finalizes the semantic ownership, migration split, and compatibility model; #246 decides canonical public route IDs and release implementation sequencing across split leaves.

- owner split and authority (Integrations placement vs Dev Board sync/work authority) are fixed (`docs/plan/admin-control-center-foundation-decisions.md:102`; `docs/plan/admin-control-center-foundation-decisions.md:128`; `docs/prd/PRD-013-connections-tools.md:338-340`);
- route split, alias rules, and rollback window are fixed (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:90-94`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:362-407`; `docs/plan/admin-control-center-foundation-decisions.md:176`);
- the unresolved canonical URL / namespace / timing choices remain in #246 and this memo's open decision list (`docs/plan/admin-control-center-foundation-decisions.md:82-83`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:480-491`; `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:509-511`).
