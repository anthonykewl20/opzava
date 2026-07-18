# WF-246 — Admin Control Center final delivery graph

**schema owner: #237 / adopter: #246** — this graph **conforms to the #237 canonical tracer-bullet
schema** (format, audit criteria, assembly rules). #237 has not yet published its frozen schema
artifact ([#246 readiness review, 2026-07-18](https://github.com/anthonykewl20/opzava/issues/246#issuecomment-5010329366);
[#237↔#246 layered-ownership resolution](https://github.com/anthonykewl20/opzava/issues/246#issuecomment-5010325348)),
so the **adopted shape** is the slice contract #237's own body requires: each bounded slice carries
authoritative owners and seams, dependency state, sad paths, edge cases, acceptance criteria,
user-level E2E expectations, and a final behavioral contract; the slices wire into an **acyclic
blocker graph with a safe executable frontier**, and cover every PRD-020 destination exactly once or
by explicit shared ownership ([#237 body](https://github.com/anthonykewl20/opzava/issues/237)). If
#237 later freezes a stricter schema, this graph is re-serialized against it; #246 does not compete
for schema authority.

Status: **READ-ONLY synthesis for [#246](https://github.com/anthonykewl20/opzava/issues/246)**, map
[#241](https://github.com/anthonykewl20/opzava/issues/241). No git, no GitHub writes, no tickets
created. Date: 2026-07-18. Every claim carries a citation.

> Refreshed 2026-07-18 to consume the reconciled/enriched source memos (no locked decision changed).

Scope fence (restated from [#241 body](https://github.com/anthonykewl20/opzava/issues/241) and
[PRD-020:239-247](../../prd/PRD-020-admin-control-center.md#L239-L247)): this graph resolves
**placement, composition, setup UX, and route migration only**. It preserves — and never redefines —
domain authority owned by **PRD-020** (shell/composition), **ADR-017 / PRD-019** (Dev Board, Runner,
Review, GitHub sync), **PRD-013** (connections/tools/MCP/secrets setup), **PRD-012 / PRD-018**
(observability/remediation), **PRD-006 / PRD-007** (agents/skills), and **PRD-001** (identity/account)
([ACC-005](../../plan/admin-control-center-foundation-decisions.md#L24)). Open domain semantics are
**deferrals**, not blanks this graph fills.

---

## 1. Adopted tracer-bullet schema (conforms to #237)

Each tracer bullet (TB) below is an independently-grabbable implementation slice. A TB is ready to
grab only when every `blockedBy` edge is resolved. Every TB states:

- **ID, title, owning destination(s), authoritative owner(s) & seams** — the PRD/ADR/ACC + the named
  application port/projection that owns behavior; the shell owns placement only
  ([PRD-020:239-247](../../prd/PRD-020-admin-control-center.md#L239-L247)).
- **Dependency state** — `blockedBy` (internal TBs, external sibling issues, or owner-amendment
  gates) and `blocks`.
- **Sad paths** — the failure cases the slice must handle (sourced from the per-family memo).
- **Edge cases** — boundary/identity/conflict cases that distinguish this slice from neighbors.
- **Acceptance criteria** — what must be proven true on the real local Docker stack
  (`http://web.opzava.localhost:18088`, real Owner login, real seeded data) before the slice closes
  ([ACC-088](../../plan/admin-control-center-foundation-decisions.md#L182);
  [PRD-020:461-538](../../prd/PRD-020-admin-control-center.md#L461-L538)).
- **User-level E2E** — the human-observable behavior a real browser drive proves.
- **Behavioral contract** — the precise postcondition; violation is a defect.

**Graph rules (acyclic, safe frontier).** Edges point `blockedBy → blocker`. No TB may depend on a
later-wave TB. The **safe executable frontier** is the set of TBs whose `blockedBy` contains only
*external* blockers (open sibling issues `#229/#233/#210/#216/#218/#219/#220`, `#192/#193`, or named
PRD amendments) — never an unmerged internal TB. A TB marked `BLOCKED` carries an owner-gate and must
not be implemented until that gate is lifted; it is listed in the frontier only to make the blocker
visible, not to authorize work
([#246 readiness review](https://github.com/anthonykewl20/opzava/issues/246#issuecomment-5010329366)).

**Coverage invariant.** Every PRD-020 destination appears exactly once as an owning TB, or is
declared *reserved* (Automations) / *composition-only* (Overview rows) / *utility-surface*
(Notification Center, Profile & Account) by explicit decision
([PRD-020:251-286 leaf-owner matrix](../../prd/PRD-020-admin-control-center.md#L251-L286);
[ACC-011..014](../../plan/admin-control-center-foundation-decisions.md#L31-L38)).

---

## 2. Folded Admin Control Center contract (the coherent whole)

This section consolidates the resolved decisions across all seven map-#241 memos (wf242, wf243,
wf244, wf245, wf247, wf249, wf250) plus PRD-020 and the ACC ledger into one contract. The TBs in §4
operationalize it; nothing in §4 may contradict §2.

### 2.1 Information architecture (locked, not re-derived)

One pinned **Ask Admin Opzava** + four groups, ≤2 visible levels, exact order
([PRD-020:288-307](../../prd/PRD-020-admin-control-center.md#L288-L307);
[ACC-009..020](../../plan/admin-control-center-foundation-decisions.md#L31-L44)):

- **Develop:** Overview · Dev Board · Runners · Environments
- **AI Runtime:** Gateway · Models & Providers · Agents · Runtime Skills · Sessions & Runs · Automations
- **Operate:** Health · Incidents · Logs · Usage & Costs
- **Configure:** Integrations · Engineering Skills · MCP Servers · Secrets · Security & Audit · Settings

Top bar order: sidebar trigger · global search · readiness Health · adjacent Attention/notifications ·
Theme · Profile ([PRD-020:425-426](../../prd/PRD-020-admin-control-center.md#L425-L426);
[ACC-027](../../plan/admin-control-center-foundation-decisions.md#L56)). CRM/Marketing/Finance are
intentionally absent ([ACC-003](../../plan/admin-control-center-foundation-decisions.md#L22);
[PRD-020:300-303](../../prd/PRD-020-admin-control-center.md#L300-L303)).

### 2.2 Authority boundary (no duplicate authority)

PRD-020 owns **shell, route admission, placement, and read-only composition only**. It acquires no
leaf's data, command, workflow, runtime, integration, security, or durable-data semantics
([PRD-020:239-247](../../prd/PRD-020-admin-control-center.md#L239-L247);
[ACC-004](../../plan/admin-control-center-foundation-decisions.md#L23)). Every projected row keeps its
source owner; presentation transfers no authority
([PRD-020:243-245](../../prd/PRD-020-admin-control-center.md#L243-L245)). The full per-leaf authority
map is §3.

### 2.3 Composition & evidence contract (cross-cutting — every leaf obeys)

Every composed/admitted result carries a **shared freshness/provenance envelope**: source owner + id,
provenance, source version/checkpoint, source timestamp (nullable), `observedAt`, `staleAfter`,
availability state (`live | stale | unknown | unavailable | not-configured`), and last-known-good
marker ([PRD-020:338-360](../../prd/PRD-020-admin-control-center.md#L338-L360);
[ACC-074](../../plan/admin-control-center-foundation-decisions.md#L158)). The deterministic,
role-coupled envelope, server-issued monotonic `observationGeneration` CAS, stale-completion
rejection, per-item (not per-page) freshness budgets, and the current-failure-vs-LKG cardinality rule
are adopted verbatim from **wf249** ([wf249 §Deterministic evidence and freshness](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
Default maximum budgets: Gateway/session state 60s; agent reconciliation 2m; provider auth+skill
5m; usage 15m; Opzava records/receipts 5m ([wf249 freshness table](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).

**Iron rules (violation = defect):**

- `stale | unknown | unavailable | not-configured` never degrades to `live / healthy / zero` by
  fallback ([PRD-020:348-351](../../prd/PRD-020-admin-control-center.md#L348-L351);
  [ACC-042](../../plan/admin-control-center-foundation-decisions.md#L76)).
- A section renders verified rows while sibling sources fail; no synthetic global state
  ([PRD-020:361-363](../../prd/PRD-020-admin-control-center.md#L361-L363);
  [ACC-040](../../plan/admin-control-center-foundation-decisions.md#L74)).
- Job acceptance is `pending`, never `configured/effective/healthy`; a fresh authoritative readback
  must prove the result ([wf249 shared command lifecycle](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).

### 2.4 Authorization & disclosure contract (cross-cutting)

- Root admission = `admin_control_center:view`; Owner-granted, Admin-role compatible during
  migration, designed for later modular RBAC
  ([PRD-020:309-323](../../prd/PRD-020-admin-control-center.md#L309-L323);
  [ACC-D02](../../plan/admin-control-center-foundation-decisions.md#L190)).
- Each leaf + every source query applies its own current authorization, tenant scope, ACL/RLS,
  broker ACL, and redaction ([PRD-020:315-317](../../prd/PRD-020-admin-control-center.md#L315-L317)).
- Expected denial is decided **before fan-out**; the denied source is not queried; a directly
  requested denied leaf/record returns **hard 403** with no existence/count/timestamp/LKG/deep-link
  leak ([PRD-020:318-323, 352-360](../../prd/PRD-020-admin-control-center.md#L318-L323);
  [wf247 §Sensitive-record anti-enumeration](../../plan/research/wf247-admin-security-settings-notifications-account.md)):
  foreign-existing and random IDs use an indistinguishable disclosed body + bounded timing class.
- Uniform hard 403 (not owner-specific 404) is the target admission/resource contract selected by
  #249 from PRD-020's denied-deep-link rule; adopt canonically before implementation
  ([wf249 §Shared authorization](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- Composition caches keyed by tenant/user/`authorizationVersion`/schema-version; authorization change
  = cache miss ([PRD-020:367-373](../../prd/PRD-020-admin-control-center.md#L367-L373)).
- **Display authorizes nothing.** Every mutation reauthorizes in the owning command with fresh
  step-up where PRD-001 requires it
  ([PRD-020:382-383](../../prd/PRD-020-admin-control-center.md#L382-L383);
  [wf247 §Safe owner-action boundary](../../plan/research/wf247-admin-security-settings-notifications-account.md)).

### 2.5 Secret & redaction contract (cross-cutting)

- Persist opaque SecretRefs + safe metadata only; resolve values only inside the authorized
  consumer/provisioning boundary; **never** return values in DTOs, setup JSON, CLI snippets, errors,
  logs, audit, notifications, Slack, exports, screenshots, or browser state
  ([wf247 §Secrets](../../plan/research/wf247-admin-security-settings-notifications-account.md);
  [ACC-059](../../plan/admin-control-center-foundation-decisions.md#L133)).
- Provider API keys / setup tokens are **write-only browser ingress**; server never echoes them;
  client clears input after submit. OAuth device **user code**/verification URL are displayable,
  short-lived, non-secret flow instructions only ([wf249 §Shared authorization](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- Browser code, page services, and the hot broker never hold `operator.admin`; only the provisioning
  worker acquires job-scoped short-lived admin
  ([wf249 §Shared command lifecycle](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- Raw Platform Gateway DTOs, Mainframe config, session keys, paths, prompts, transcripts, tool
  args/outputs, and hidden reasoning never enter browser contracts
  ([PRD-020:378-381](../../prd/PRD-020-admin-control-center.md#L378-L381);
  [wf249 resolution #5](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).

### 2.6 Health / attention separation (cross-cutting)

Health = readiness + evidence freshness (top-bar pill, four labels Healthy/Degraded/Unhealthy/Unknown,
Unknown never Healthy). Attention = the authorized actionable human queue. They are separate controls,
names, state calculations, and deep-link destinations; all four combinations
(healthy+attention, healthy+empty, degraded+empty, unhealthy+attention) are legal and rendered
independently. Bridge rule: an unhealthy fact / incident-awaiting-action / breached threshold creates
an attention item **only when the source owner declares a human decision required**; the source state
is never the count ([PRD-020:385-403, 497-501](../../prd/PRD-020-admin-control-center.md#L385-L403);
[ACC-007, ACC-028-029](../../plan/admin-control-center-foundation-decisions.md#L26);
[wf250 D2-D3](../../plan/research/wf250-operate-overview-attention-composition.md);
[wf247 §Attention is not unread delivery](../../plan/research/wf247-admin-security-settings-notifications-account.md)).

### 2.7 Internal Control UI boundary

The Mainframe/OpenClaw Control UI is internal SSH break-glass only. Opzava never publishes product
navigation, launch, iframe, proxy, or deep link to it; Gateway leaf may show safe break-glass
readiness + link to an authorized Opzava runbook/receipt only
([wf249 §Gateway drill-down boundary](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md);
[wf242:33-40, 329-331](../../plan/research/wf242-admin-route-ownership-migration-audit.md);
[ADR-016:36-65](../../adr/ADR-016-mainframe-tracked-fork.md)).

---

## 3. Destination authority matrix (every leaf, resolved seams)

| Destination | Group | Placement/behavior owner | Data/command owner(s) (not redefined) | Resolved seam (memo) |
| --- | --- | --- | --- | --- |
| Ask Admin Opzava | Pinned | PRD-020 placement | PRD-005 / [#210](https://github.com/anthonykewl20/opzava/issues/210); #219 skill content | route/name deferred → #210 ([wf242:86](../../plan/research/wf242-admin-route-ownership-migration-audit.md)) |
| Overview | Develop | PRD-020 composition | every source row keeps its owner | Variant A 4-section composition ([wf250 D1](../../plan/research/wf250-operate-overview-attention-composition.md)) |
| Dev Board | Develop | PRD-020 placement | PRD-019 / ADR-017; GitHub native facts | record-aware redirect → #228/#237 ([wf242:87-89](../../plan/research/wf242-admin-route-ownership-migration-audit.md)) |
| Runners | Develop | PRD-013 setup placement | PRD-019/ADR-017 leases/execution; #232 ceremony | enrollment + capacity projection ([wf244 Q1-Q4](../../plan/research/wf244-runner-environment-docker-reviewer-setup.md)) |
| Environments | Develop | PRD-013 setup | Runtime Control/Platform Ops; #229 Review | Docker Review stack + reviewer compat ([wf244 Q3](../../plan/research/wf244-runner-environment-docker-reviewer-setup.md)) |
| Gateway | AI Runtime | PRD-020 placement | PRD-013 / Runtime Control; PRD-018 remediation | readiness/config projection, ≠Health ([wf249 Gateway](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)) |
| Models & Providers | AI Runtime | PRD-013 Runtime Control | PRD-006 consumes; ACC-058 Reviewer stays Environments | catalog/routability only; set-main stays PRD-013 ([wf249 Models](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)) |
| Agents | AI Runtime | PRD-006 | PRD-007 projections | roster+reconciliation; v1 scope amendment gate ([wf249 Agents](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)) |
| Runtime Skills | AI Runtime | PRD-007 + PRD-013 | Platform Gateway observed | installed/effective axes ([wf249 Runtime Skills](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md); [wf243](../../plan/research/wf243-admin-skills-runtime-mcp.md)) |
| Sessions & Runs | AI Runtime | PRD-006 + Runtime Control | PRD-019 DevTicket assoc. | Run Trace + bounded session evidence ([wf249 Sessions & Runs](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)) |
| Automations | AI Runtime | PRD-006 (reserved) | none queried in v1 | **reserved/unavailable all v1** ([wf249 Automations](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md); [ACC-D07](../../plan/admin-control-center-foundation-decisions.md#L195)) |
| Health | Operate | PRD-012/018 + contributors | each contributing owner | readiness aggregation, ≠attention ([wf250 D1](../../plan/research/wf250-operate-overview-attention-composition.md)) |
| Incidents | Operate | PRD-012/018 | PRD-019 linked fixes | ≠DevTicket type; attention predicate ([wf250 D5](../../plan/research/wf250-operate-overview-attention-composition.md)) |
| Logs | Operate | PRD-012/018 | source redaction owners | correlation only; Runtime Activity ≠ Logs ([wf247 §two audit sources](../../plan/research/wf247-admin-security-settings-notifications-account.md)) |
| Usage & Costs | Operate | Runtime Control + entitlement | PRD-012/ADR-014 | operational only, no Finance ([wf250 D1/O2](../../plan/research/wf250-operate-overview-attention-composition.md)) |
| Integrations | Configure | PRD-013 setup | PRD-019/ADR-017 GitHub sync | GitHub App enrollment; ≠sync ledger ([wf245](../../plan/research/wf245-github-integration-connections-migration.md)) |
| Engineering Skills | Configure | PRD-007/013 catalog | platform fork bootstrap | single canonical Opzava fork ([wf243](../../plan/research/wf243-admin-skills-runtime-mcp.md)) |
| MCP Servers | Configure | PRD-013 | policy/secret owners | per-consumer bindings; SecretRef-safe gap ([wf243 MCP](../../plan/research/wf243-admin-skills-runtime-mcp.md)) |
| Secrets | Configure | PRD-013 + PRD-001 step-up | Platform Ops vault | write-only ingress; no reveal ([wf247 Secrets](../../plan/research/wf247-admin-security-settings-notifications-account.md)) |
| Security & Audit | Configure | PRD-001/012/018 + Platform Ops | each audit producer | federated Governance Audit + Runtime Activity ([wf247](../../plan/research/wf247-admin-security-settings-notifications-account.md)) |
| Settings | Configure | PRD-001 + each domain owner | typed owner commands | federation, no junk drawer ([wf247 Settings](../../plan/research/wf247-admin-security-settings-notifications-account.md)) |

---

## 4. Tracer-bullet delivery graph

Notation: `blockedBy: [internal TBs] / [external]`. Wave order guarantees acyclicity (a TB only blocks
same-or-later waves). **Safe frontier** = all Wave-0 TBs plus any Wave-N TB once its internal
`blockedBy` set is fully merged; `BLOCKED` marks an owner-gate that must lift before implementation.

### Wave 0 — Shared foundation (safe executable frontier; no internal blockers)

#### TB-F1 · Admin destination & admission registry + capability gate + hard-403
- **Owners/seams:** PRD-020 placement/admission ([PRD-020:309-323](../../prd/PRD-020-admin-control-center.md#L309-L323)); deep module `listDestinations(principal, route)` ([wf247 §deep-module](../../plan/research/wf247-admin-security-settings-notifications-account.md)); registry replaces hard-coded nav/palette ([wf242 Seam 1, :335-343](../../plan/research/wf242-admin-route-ownership-migration-audit.md)).
- **blockedBy:** none internal.
- **blocks:** F4, X1, R2, every leaf TB.
- **Sad paths:** root capability denied → hard 403 (no empty shell/redirect-to-`/`/zero); leaf denied → 403 no existence leak; grant revoked while warm → authorization-version cache invalidation ([wf242 sad-path table](../../plan/research/wf242-admin-route-ownership-migration-audit.md)).
- **Edge cases:** legacy Owner/Admin compatibility preserved during migration; remembered UI state cannot admit a revoked route ([PRD-020:306-307](../../prd/PRD-020-admin-control-center.md#L306-L307)).
- **Acceptance:** registry drives sidebar + palette + topbar + route guards; denied deep link returns 403 with indistinguishable body for foreign-existing vs random ID; `admin_control_center:view` admitted for Owner.
- **E2E:** keyboard-navigate sidebar (expanded/compact/mobile Sheet); direct deep link to a revoked route → 403 page, not empty.
- **Contract:** navigation visibility is never authorization; one registry is the single IA source.

#### TB-F2 · Shared evidence/freshness envelope + composition cache + observation-generation CAS
- **Owners/seams:** PRD-020 composition ([PRD-020:325-369](../../prd/PRD-020-admin-control-center.md#L325-L369)); envelope + CAS + budgets from ([wf249 §Deterministic evidence](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- **blockedBy:** F1.
- **blocks:** R1, R2, every data-bearing leaf TB.
- **Sad paths:** stale/unknown/unavailable/not-configured never → live/healthy/zero; LKG older than budget → `stale` separate envelope; older slow completion loses CAS even if wall-clock newer; `observedAt > evaluatedAt` → unknown ([wf249 degraded table](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- **Edge cases:** nullable `sourceTimestamp` accepted without invention; audit timestamp ≠ freshness probe; WS event is hint only (invalidates, never orders).
- **Acceptance:** every admitted result shape carries the full envelope; overlapping reads complete older-last and the CAS rejects it; composite summary `live` only if every required fact live (strictest budget).
- **E2E:** drive a source stale → label flips stale without value change; remove a required source → Unknown, not zero; verified siblings remain usable.
- **Contract:** state is derived server-side post-cache, immediately before serialization; cached derived state is never reused.

#### TB-F3 · Shared command lifecycle + receipt vocabulary
- **Owners/seams:** ([wf249 §Shared command lifecycle](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)); used by every mutation-capable leaf.
- **blockedBy:** F1.
- **blocks:** every mutation TB (C1, C3, C4, A1, A2, A4, D2, D3, O4, etc.).
- **Sad paths:** acceptance ≠ success; restart/ambiguous timeout → pending/indeterminate; concurrent commands → expected base-hash CAS, last-writer-wins forbidden; partial multi-target → aggregate `partial`.
- **Edge cases:** idempotent replay may reuse receipt only for identical payload; conflicting second intent → safe conflict + fresh state.
- **Acceptance:** every typed mutation returns durable pending receipt → reconciled outcome with readback; receipt has browser-safe op id + audit link, never a credential.
- **E2E:** submit a configure op, kill worker mid-flight → UI shows pending, then reconciled; concurrent edit by another actor → conflict shown.
- **Contract:** job acceptance never displayed as final success.

#### TB-F4 · Shell parallel adoption (registry-driven, legacy preserved)
- **Owners/seams:** ([wf242 Seam 2, :345-350](../../plan/research/wf242-admin-route-ownership-migration-audit.md)); PRD-020 shell contract ([PRD-020:405-428](../../prd/PRD-020-admin-control-center.md#L405-L428)).
- **blockedBy:** F1.
- **blocks:** M1, M3.
- **Sad paths:** legacy counts must not become PRD-020 attention badges; unknown state must not become healthy.
- **Edge cases:** `/` placeholder remains authenticated landing during rollout; Ask status stays owned by its admitted Ask surface.
- **Acceptance:** shared shell renders around existing pages without changing their semantics; nav/palette/health destination lists come from the registry.
- **E2E:** legacy `/connections` still loads inside the new shell; no nav jump during cross-context loads ([PRD-020 US17](../../prd/PRD-020-admin-control-center.md)).
- **Contract:** shell adoption changes chrome, not domain behavior.

### Wave 1 — Cross-cutting hardening (blockedBy F1)

#### TB-X1 · Authorization versioning + step-up + sensitive-record anti-enumeration
- **Owners/seams:** Identity & Access (`AuthorizationPort`, `authorizationVersion`) ([PRD-020:367-373](../../prd/PRD-020-admin-control-center.md#L367-L373)); PRD-001 step-up; anti-enumeration ([wf247 §Sensitive-record anti-enumeration](../../plan/research/wf247-admin-security-settings-notifications-account.md)).
- **blockedBy:** F1.
- **blocks:** C4, C5, X2, every sensitive-record TB.
- **Sad paths:** step-up expired after render → submit rejected; proof reused against different tenant/session/target/version → denied; membership/authVersion change → cache miss.
- **Edge cases:** step-up proof is single-use, bound to actor/session/tenant/action/target/version/nonce; approval ≠ step-up.
- **Acceptance:** `authorizationVersion` changes atomically with membership/role/grant; foreign-existing vs random-ID denial indistinguishable in status/body/size/headers/timing under load.
- **E2E:** expire step-up, submit high-risk action → routed to fresh MFA; revoke membership mid-session → next request denied, no stale-row leak.
- **Contract:** a step-up proof is not a reusable boolean.

#### TB-X2 · Secret storage/ingress hardening + browser-safe Secret Reference Inventory projection
- **Owners/seams:** Platform Ops vault/provisioning; PRD-001 step-up; PRD-013 SecretRef ([wf247 §Secrets](../../plan/research/wf247-admin-security-settings-notifications-account.md)); current `LocalFileSecretsVault` 0644 dev adapter is a gap, not baseline ([wf247 §current implementation warning](../../plan/research/wf247-admin-security-settings-notifications-account.md)).
- **blockedBy:** F1, X1.
- **blocks:** C4 (Secrets leaf), C3 (MCP SecretRef-safe provisioning).
- **Sad paths:** unresolved/expired/unavailable SecretRef → blocks every dependent write; rotation fails pre-cutover → keep last-confirmed; ambiguous cutover → show desired vs last-confirmed, block high-risk; suspected exposure → security stop.
- **Edge cases:** no Reveal action in v1; local-only credential never transits Opzava browser/server.
- **Acceptance:** sentinel secret through every flow → not present in HTML/RSC/JSON/URL/logs/audit/notifications/Slack/exports/screenshots; safe metadata only.
- **E2E:** enter sentinel API key → after submit input cleared, no echo; rotate → consumers re-resolve; attempt reveal → no capability.
- **Contract:** secrets are write-only; values never cross the server seam into a browser contract.

#### TB-X3 · JIT-admin / shared-token remediation
- **Owners/seams:** ADR-003 (or successor) short-lived job-scoped audited JIT admin vs current durable admin device + shared-token fallback ([wf249 §Shared command lifecycle / contract violation](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- **blockedBy:** F1. **BLOCKED-on:** ADR-003 owner amendment landing the JIT lifecycle.
- **blocks:** A1 (Gateway mutation), A2, A4, C3, any privileged runtime mutation TB.
- **Sad paths:** admin device/scopes/JIT unverifiable → fail closed, no shared-token fallback; reads fail closed rather than broaden scopes.
- **Edge cases:** browser/page services/worker internal route must not rely on shared bearer caller trust alone — defense-in-depth.
- **Acceptance:** no durable admin device/shared-token fallback path remains for new mutations; job-scoped admin acquired only by provisioning worker.
- **E2E:** trigger a Gateway configure mutation → worker acquires short-lived admin, readback proves result, authority released.
- **Contract:** only the provisioning worker holds `operator.admin`, job-scoped and audited.

#### TB-X4 · Governance Audit owner-contract + federated read/index
- **Owners/seams:** PRD-013 required old/new safe-summary vs #192 config-version-ref proposal — **owner-contract blocker** ([wf247 §Audit owner-contract blocker](../../plan/research/wf247-admin-security-settings-notifications-account.md)); federated query/index, no universal write aggregate.
- **blockedBy:** F1, X1. **BLOCKED-on:** PRD-013 owner + #192 amendment choosing structurally-defined old/new summaries **or** immutable config-version refs.
- **blocks:** C5 (Security & Audit Governance Audit view); also gates moving any mutation that would otherwise succeed unaudited.
- **Sad paths:** required audit append unavailable → governed mutation fails/pending (never silently succeeds unaudited); one producer unavailable → others remain, affected range marked partial (missing index row ≠ proof action didn't occur).
- **Edge cases:** idempotency before append (never upsert audit by key); remote Platform Gateway writes → requested/completed/failed events, not mutable outcome; `system` actor + causal `triggeredBy` for reconcilers.
- **Acceptance:** one config command + one runtime action → separate Governance Audit and Runtime Activity rows with own source IDs/clocks/sequences; either source unavailable without forging the other.
- **E2E:** interrupt owner command after request before remote confirm → Audit shows requested/pending then completed/failed/reconciled, never rewrites history.
- **Contract:** Security & Audit is a federated read/index/export, never a universal write aggregate or synthetic event merger.

### Wave 1 — Owner read projections (blockedBy F1/F2; enable leaves + cutover)

#### TB-R1 · Connections decomposition: Health / Gateway / Models / Integrations read projections
- **Owners/seams:** extract per-owner typed projections from the coarse `ConnectionsSnapshot` ([wf249 §Upstream parity table](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md); [wf242 Seam 3, :352-360](../../plan/research/wf242-admin-route-ownership-migration-audit.md)). Legacy page + new leaf read the same projection during overlap.
- **blockedBy:** F1, F2.
- **blocks:** A1, A2, O1, C1, M1.
- **Sad paths:** provisioning worker unavailable → explicit unavailable snapshot + retry/owner route, no Gateway direct call, no zeroing ([wf242:357-360](../../plan/research/wf242-admin-route-ownership-migration-audit.md)).
- **Edge cases:** no destination-specific DB/store; never fetch Gateway directly; never persist Overview composition.
- **Acceptance:** each owner projection typed + browser-safe + envelope-bearing; legacy + target dual-read identical projection.
- **E2E:** legacy `/connections` and the new Gateway leaf show the same readiness facts during overlap.
- **Contract:** one owner projection per fact family; the monolith becomes a compatibility consumer.

#### TB-R2 · Overview composition query (Variant A four sections)
- **Owners/seams:** PRD-020 composition-only ([PRD-020:325-383](../../prd/PRD-020-admin-control-center.md#L325-L383)); [wf250 D1-D5](../../plan/research/wf250-operate-overview-attention-composition.md).
- **blockedBy:** F1, F2, R1 (and per-section owner projections as they land).
- **blocks:** M1.
- **Sad paths:** one section unavailable → others render, partial status exposed; no synthetic global aggregate.
- **Edge cases:** Overview ≠ Dev Board Summary ([ACC-026](../../plan/admin-control-center-foundation-decisions.md#L55)); cross-source ordering by source event time + deterministic tie-breaker; Active Delivery keeps agent/assignee/runner/tool/branch/Review-lease distinct ([ACC-065](../../plan/admin-control-center-foundation-decisions.md#L144)).
- **Acceptance:** exact Variant A order (Needs Your Attention → Active Delivery → Development Readiness → Recent Activity); every row carries envelope + owner deep link; actions route to owning command.
- **E2E:** seed approvals/sprint/runner/Gateway facts → Overview composes them in order with provenance; partial failure leaves verified sections visible.
- **Contract:** Overview is a rebuildable request-scoped query, not durable truth.

#### TB-R3 · Health/attention top-bar split + bridge
- **Owners/seams:** ([PRD-020:385-403](../../prd/PRD-020-admin-control-center.md#L385-L403); [wf250 D2-D3](../../plan/research/wf250-operate-overview-attention-composition.md); [wf247 §Attention](../../plan/research/wf247-admin-security-settings-notifications-account.md)).
- **blockedBy:** F1, F2.
- **blocks:** M3, O1.
- **Sad paths:** see §2.6 four combinations; attention source unavailable → partial/unknown feed, never zero/clear as verified.
- **Edge cases:** correlation clusters by authorized tenant-scoped `(rootAuthorityNamespace, opaqueRootId)` only; count = actionable items, not clusters; cross-tenant/unauthorized root refs never cluster.
- **Acceptance:** two controls with separate accessible names/destinations; all four state combinations driven; unknown health never green.
- **E2E:** degrade a capability with no human action needed → Degraded + zero attention; add an approval → attention increments without health change.
- **Contract:** health never counts attention; attention never asserts health.

#### TB-R4 · Notification/attention delivery + dedupe + Notification Center + alert rules
- **Owners/seams:** Notifications/Admin-Observability (PRD-012); PRD-018; delivery + alert-rule placement ([wf247 §Notifications/Attention/Slack](../../plan/research/wf247-admin-security-settings-notifications-account.md)). **BLOCKED-on:** PRD-012 mockup/vocabulary amendment (split Notification Center from alert rules; `Success/Done` → `Done`) + reciprocal #193 link ([wf247 §Placement amendments required](../../plan/research/wf247-admin-security-settings-notifications-account.md)).
- **blockedBy:** F1, X1. External gate: PRD-012/#193 amendment.
- **blocks:** M3.
- **Sad paths:** duplicate/out-of-order/stale-version/sequence-gapped events → stable identity retained, current actionability never regresses, partial history reconciled; Slack replay/stale/cross-tenant → fail closed; mark-read/dismiss changes delivery only, never resolves source.
- **Edge cases:** Notification Center is a top-bar utility, not a sidebar leaf; alert rules live in Settings → Notifications & alerts; personal prefs stay Profile.
- **Acceptance:** replay same outbox/WS/push/Slack event → one notification + one source action; delivery-attempt evidence inspectable; read≠resolve.
- **E2E:** mark an approval notification read → it stays actionable in Attention until the owner resolves it; Slack approval replay → stale, no state change.
- **Contract:** notification durability ≠ current actionability; delivery dedupe by exact identity tuple.

### Wave 2 — Develop leaves

#### TB-D1 · Overview leaf destination
- **Owners/seams:** PRD-020 composition (consumes TB-R2); no new authority.
- **blockedBy:** R2.
- **blocks:** M1 (Overview route is the `/` target family).
- **Sad paths/edge:** covered by R2; `/` may remain canonical Overview or be reselected in M1 ([wf242:85](../../plan/research/wf242-admin-route-ownership-migration-audit.md)).
- **Contract:** Overview is admitted, composed, and rendered; never persisted.

#### TB-D2 · Runners leaf
- **Owners/seams:** PRD-013 setup placement ([ACC-061](../../plan/admin-control-center-foundation-decisions.md#L140)); #232 closed enrollment ceremony/lifecycle ([wf244 Q2](../../plan/research/wf244-runner-environment-docker-reviewer-setup.md)); ADR-017 leases/execution. **External:** #229 (Review lease), #233 (scheduling) remain OPEN and gate execution semantics ([wf244 ready-state](../../plan/research/wf244-runner-environment-docker-reviewer-setup.md)).
- **blockedBy:** F1, F2, F3, R1. **External:** #229/#233 for selector/capacity mutation; #232 trust contract for attestation presentation.
- **blocks:** — (capacity projection feeds R2).
- **Sad paths:** enrollment grant replay/mismatch → conflict, no Active; challenge expiry/cancel/role-loss/tenant-suspension/unconfirmed fingerprint → no Active; platform/tool mismatch excluded; reconnect ≠ resurrect old lease ([wf244 §sad paths](../../plan/research/wf244-runner-environment-docker-reviewer-setup.md)).
- **Edge cases:** cloud enrollment fail-closed/reserved absent issuer policy; capacity projected read-only, selector mutability deferred to #233; free lease slot ≠ Docker Review available.
- **Acceptance:** enrollment wizard maps to grant→challenge→fingerprint confirm; lifecycle `Pending→Awaiting Fingerprint→Active↔Suspended→Revoked`; capacity shown as Sprint/ordinary/Review distinct facts.
- **E2E:** enroll a local runner end-to-end; show it Active; project Balanced capacity (1 sprint + ≤1 ordinary or ≤2 ordinary).
- **Contract:** Runners owns local executable + enrollment presentation; never Review identity/selection (#229).

#### TB-D3 · Environments leaf
- **Owners/seams:** PRD-013 setup ([ACC-063](../../plan/admin-control-center-foundation-decisions.md#L142)); #229 Review identity/lease; Docker Review = evidence only, not release/staging ([wf236:13-14,20](../../plan/research/wf236-releases-gate-contract.md); [wf244 Q3](../../plan/research/wf244-runner-environment-docker-reviewer-setup.md)). **External:** #229.
- **blockedBy:** F1, F2, F3, R1. **External:** #229.
- **Sad paths:** stack/evidence-upload unhealthy → Review cannot run; model not routable → Review cannot run; states `not-configured→provisioning→ready↔degraded/unavailable` + `exclusive-occupied` projection from Review lease.
- **Edge cases:** a local Runner reporting `local_review_transport` does not authorize Review; cloud Runner `local_review_transport=false`.
- **Acceptance:** shared Docker Review stack health/readiness/reset/fixtures/preview + reviewer compatibility reporting; compatibility read-only while #229 defines selector.
- **E2E:** degrade Docker stack → Environments shows degraded + Review blocked; restore → ready.
- **Contract:** Environments owns review compatibility + Docker access; Review truth stays #229/ADR-017.

### Wave 2 — AI Runtime leaves

#### TB-A1 · Gateway leaf
- **Owners/seams:** PRD-013/Runtime Control; PRD-018 remediation ([wf249 Gateway](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)). **External/BLOCKED-on:** TB-X3 (JIT admin) for configure/repair mutation.
- **blockedBy:** F1, F2, F3, R1, X3.
- **Sad paths:** socket connected but protocol/health unknown → `unknown` never healthy; unreachable/circuit-open/mismatch → current unavailable + separate LKG; break-glass unverifiable → safe unknown + runbook, no product launch.
- **Edge cases:** Gateway ≠ Health (Gateway = can-use-now + safe config; Health = cross-component topology/incidents); never reuse poisoned `/connections/gateway` permanent-redirect path as canonical.
- **Acceptance:** readiness + redacted effective config + drift + repair receipts; configure/repair pending until readback; no Control UI navigation.
- **E2E:** protocol-mismatch the Gateway → unavailable envelope + separate LKG; run diagnosis → pending→reconciled.
- **Contract:** Gateway owns usability-now; never owns cross-component health.

#### TB-A2 · Models & Providers leaf
- **Owners/seams:** PRD-013 Runtime Control; consumes PRD-006; ACC-058 Reviewer stays Environments ([wf249 Models](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md); [wf244 reviewer boundary](../../plan/research/wf244-runner-environment-docker-reviewer-setup.md)).
- **blockedBy:** F1, F2, F3, R1, X2, X3.
- **Sad paths:** provider auth sources disagree → source-scoped conflict/unknown, block readiness; setup accepted but readback fails → pending/indeterminate; token echoed/retained → absolute security failure.
- **Edge cases:** lead-orchestrator `set-main` stays PRD-013 legacy until explicit PRD-005/006/013 alignment — Models exposes no replacement mutation meanwhile; catalog row ≠ auth ≠ routable ≠ per-agent-usable; Models cannot select a Reviewer.
- **Acceptance:** provider catalog + credential health + enabled/routable + per-agent effective + entitlement; write-only secrets cleared post-submit; OAuth user code short-lived.
- **E2E:** complete each setup method; sentinel key not retained; force auth conflict → fresh readback/leak check.
- **Contract:** Models supplies catalog/routability evidence only; no Ask Admin/Agent model-policy mutation, no Reviewer selection.

#### TB-A3 · Agents leaf
- **Owners/seams:** PRD-006 AI Workforce ([wf249 Agents](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)). **BLOCKED-on:** canonical PRD-006 v1 operating-scope amendment (Admin v1 shows only Opzava/platform-development scope; future business department values preserved but deferred).
- **blockedBy:** F1, F2, R1. **External/BLOCKED-on:** PRD-006 amendment.
- **Sad paths:** runtime artifact missing → `runtime missing`; duplicate-link/orphan → conflict, never auto-import; unmapped artifact → authorized `unmanaged runtime orphan` only.
- **Edge cases:** Ask Admin orchestrator rows are one managed config, not the roster; current `agent` RPC snapshots are runtime evidence only.
- **Acceptance:** AgentEmployee roster + reconciliation states (product-only/managed/missing/drifted/duplicate/orphan/unknown); lifecycle via worker, never native browser CRUD.
- **E2E:** orphan visible to operator, cannot be edited/imported; deferred business departments absent from rows/search/filters/counts/links while future domain values preserved.
- **Contract:** an orphan never auto-promotes to AgentEmployee.

#### TB-A4 · Runtime Skills leaf
- **Owners/seams:** PRD-007 + PRD-013 ([ACC-047](../../plan/admin-control-center-foundation-decisions.md#L116); [wf249 Runtime Skills](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md); [wf243](../../plan/research/wf243-admin-skills-runtime-mcp.md)).
- **blockedBy:** F1, F2, F3, R1, X3.
- **Sad paths:** installed but unapproved/ineligible → drift/blocked, not effective; verification/install-policy/admin unavailable → fail closed; session retains older snapshot → shown separately from current.
- **Edge cases:** installation never grants tools; Ask Admin `skills: []` is intended state, not tenant inventory; native uncataloged skill → read-only candidate until `SkillCatalogPort` approves.
- **Acceptance:** approved catalog joined to installed version/scope/eligibility/per-agent/per-session/effective; install/update/disable/uninstall supply-chain-gated jobs.
- **E2E:** approve→install→deny a tool the skill names → skill not effective.
- **Contract:** Runtime Skills projects observed state; catalog approval is sole authority.

#### TB-A5 · Sessions & Runs leaf
- **Owners/seams:** PRD-006 + Runtime Control; PRD-019 DevTicket association ([wf249 Sessions & Runs](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- **blockedBy:** F1, F2, R1.
- **Sad paths:** stored session no active run → inactive/unknown, never "running"; native detail pruned → durable Run Trace + `pruned`/`unavailable`; redaction unclassifiable → fail closed, omit.
- **Edge cases:** no generic run RPC assumed; no abort/retry/steer/session-patch/delete without a typed owner operation; Automation-owned executions excluded (ACC-D07).
- **Acceptance:** Run Trace index + bounded session context + detail with sanitized milestones + owner links; browser IDs are Opzava projections.
- **E2E:** link a real owner record to a Run Trace; revoke resource access → 403; no raw transcript.
- **Contract:** runtime sessions, task rows, Run Traces, DevTickets never share one generic identity.

#### TB-A6 · Automations leaf (reserved/unavailable, all v1)
- **Owners/seams:** PRD-006 reserved; ACC-D07 ([wf249 Automations](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- **blockedBy:** F1.
- **Sad paths/edge:** page performs **no** source fanout regardless of adapter/native artifact existence; never `not-configured`/empty/healthy/stale/unavailable-runtime.
- **Acceptance:** admitted navigation renders reserved/unavailable-in-this-version heading + explanation; no inventory/count/attention/state badge/refresh/action.
- **E2E:** prove page admission makes no Automation source call whether or not an adapter exists.
- **Contract:** Automations is policy-reserved for all of v1; activation requires a later contract superseding ACC-D07.

### Wave 2 — Operate leaves

#### TB-O1 · Health leaf
- **Owners/seams:** PRD-012/018 + contributing owners ([ACC-068](../../plan/admin-control-center-foundation-decisions.md#L152); [wf250 D1/D4/O1](../../plan/research/wf250-operate-overview-attention-composition.md)). Consumes R1 health projection + R3 top-bar.
- **blockedBy:** F1, F2, R1, R3. **External/O-open:** PRD-012 health vocabulary tiers + roll-up algorithm (O1 recommendation) — composition publishable now, exact tiers may tighten.
- **Sad paths:** one source unavailable → others render; stale/unknown → never healthy at affected scope.
- **Edge cases:** Health aggregates projections without owning Gateway/GitHub/Runner/Docker/provider/skill/MCP state.
- **Acceptance:** evidence-rich readiness with per-source envelope + drill-downs; top-bar pill rolls up per PRD-012 vocabulary.
- **E2E:** fail one health source → verified siblings remain; unknown source → Unknown label.
- **Contract:** Health is the readiness destination; never the attention count.

#### TB-O2 · Incidents leaf
- **Owners/seams:** PRD-012/018 ([ACC-069](../../plan/admin-control-center-foundation-decisions.md#L153); [wf250 D5](../../plan/research/wf250-operate-overview-attention-composition.md)).
- **blockedBy:** F1, F2. **External/O-open:** incident actionability predicate for attention (O3).
- **Sad paths:** non-actionable incident → not in Attention; release operational failure stays Dev Board Releases authority, correlated not merged with Incident.
- **Edge cases:** Incident ≠ DevTicket type; governed Sprint interruption = split facts (paused Sprint + Incident) with visual correlation only.
- **Acceptance:** incident lifecycle projected; lasting fixes link to PRD-019 DevTickets; actionability predicate gates attention inclusion.
- **E2E:** create an incident needing a decision → appears in Attention; resolve → leaves Attention, may remain in Recent Activity.
- **Contract:** resolving an Incident ≠ deployment success.

#### TB-O3 · Logs leaf
- **Owners/seams:** PRD-012/018 + source redaction owners ([ACC-070](../../plan/admin-control-center-foundation-decisions.md#L154)). **External:** #193 (Runtime Activity ledger) for authorized correlation link.
- **blockedBy:** F1, F2. **External:** #193 for runtime-activity deep-link.
- **Sad paths:** raw provider payload/prompt-with-secret/Gateway token/config/Docker socket/credential never exposed.
- **Edge cases:** Logs may correlate/deep-link to an authorized Runtime Activity row but is not the canonical native-ledger view (that lives in Security & Audit).
- **Acceptance:** redacted operational evidence + correlation + retention; no raw payloads.
- **E2E:** inspect rendered output → no secrets/raw DTOs.
- **Contract:** Logs never becomes the Runtime Activity authority.

#### TB-O4 · Usage & Costs leaf
- **Owners/seams:** Runtime Control + entitlement owner (PRD-012/ADR-014) ([ACC-071](../../plan/admin-control-center-foundation-decisions.md#L155); [wf250 O2](../../plan/research/wf250-operate-overview-attention-composition.md)).
- **blockedBy:** F1, F2. **External/O-open:** Usage command/lifecycle split model (O2 recommendation: entitlement/quota → Dev Readiness; actionable threshold → Attention; spend totals → drill-down).
- **Sad paths:** usage data never proves auth/routing health.
- **Edge cases:** no Finance authority transfer; placement ≠ billing/plan/quota semantics.
- **Acceptance:** operational consumption/quota/spend + actionable thresholds; three-way split per O2.
- **E2E:** breach a budget threshold → Attention item; spend total → drill-down only.
- **Contract:** Usage is operational visibility, not a Finance workspace.

### Wave 2 — Configure leaves

#### TB-C1 · Integrations leaf (GitHub App + Slack)
- **Owners/seams:** PRD-013 setup; PRD-019/ADR-017 GitHub sync authority retained ([ACC-053-055](../../plan/admin-control-center-foundation-decisions.md#L127-L129); [wf245](../../plan/research/wf245-github-integration-connections-migration.md)).
- **blockedBy:** F1, F2, F3, R1, X2.
- **Sad paths:** unhealthy/unverifiable GitHub integration → unbypassable closed state (ACC-074), repair surfaced via Integrations, sync/work control stays PRD-019/ADR-017; OAuth→GitHub-App overlap must not clone sync state.
- **Edge cases:** Integrations placement ≠ sync/workflow ownership transfer; `/connections/add` stays compatibility, not a generic setup bucket; `/api/connections/device-flow` remains facade until atomic consumer migration.
- **Acceptance:** GitHub App enrollment + health dimensions + repair + integration history; sync state never cloned; post-disconnect flow migrates atomically.
- **E2E:** enroll GitHub App; show health; break webhook → unhealthy + Overview readiness reflects it; repair → reconciled.
- **Contract:** Integrations owns setup/health/repair; Dev Board owns sync/work — neither implements a second ledger.

#### TB-C2 · Engineering Skills leaf
- **Owners/seams:** PRD-007/013 catalog + provisioning ([ACC-044-046](../../plan/admin-control-center-foundation-decisions.md#L113-L115); [wf243 Engineering Skills contract](../../plan/research/wf243-admin-skills-runtime-mcp.md)).
- **blockedBy:** F1, F2, F3, X3.
- **Sad paths:** upstream unreachable/deleted/rewritten → preserve approved revision, block new candidate; fork diverges → explicit conflict, no auto-merge; two sources same canonical name → quarantine; checksum/license/manifest/dep/tool/install-policy fail → fail closed.
- **Edge cases:** single platform-owned canonical Opzava fork (no per-tenant fork); upstream change = candidate only, never silent activation; user-approved names absent from upstream (`grilling`, `qa`, `to-issues`) modeled as fork-derived/Opzava-authored, not aliased.
- **Acceptance:** source/provenance + approved versions + rollout target + compatibility/verification/policy/drift; immutable Skill Set Revision + per-target receipts.
- **E2E:** detect upstream change → candidate with diff; approve → new revision affects new executions only; roll back eligible target without deleting history.
- **Contract:** Engineering Skills is Opzava's governed catalog; upstream detection never activates.

#### TB-C3 · MCP Servers leaf
- **Owners/seams:** PRD-013; policy/secret owners ([ACC-049-050](../../plan/admin-control-center-foundation-decisions.md#L118-L119); [wf243 MCP Servers contract](../../plan/research/wf243-admin-skills-runtime-mcp.md)). **BLOCKED-on:** SecretRef-safe adapter gap (X2) — fail closed for authenticated core MCP provisioning until SecretRefs resolve at consumer boundary or consumer-native secure OAuth store.
- **blockedBy:** F1, F2, F3, R1, X2, X3.
- **Sad paths:** SecretRef missing/expired/unsupported → fail closed, no literal fallback; URL private/loopback/metadata/redirect/TLS fail → reject/quarantine; stdio missing/changed/not-allowlisted → block (treat as code execution); server adds/removes/changes tool mid-run → deny immediately under pinned manifest.
- **Edge cases:** one definition → many consumer bindings, each own SecretRefs/policy/receipt/health; orchestrator healthy ≠ local healthy; hosted-MCP #151 retired; `openclaw mcp serve` ≠ registry; legacy `apps/mcp-server` is Dev Board mapping #237 evidence.
- **Acceptance:** definition + per-consumer binding plan + validate + dry-run + apply + probe + activate; six-dimension health; teardown state machine (disable/revoke/logout/remove/reconcile).
- **E2E:** target orchestrator + local harness from one definition with different SecretRefs/health; deny an added tool mid-session.
- **Contract:** MCP exposes tools; neither skills nor authority; deny-wins, per-consumer.

#### TB-C4 · Secrets leaf
- **Owners/seams:** PRD-013 + PRD-001 step-up; Platform Ops vault ([ACC-059](../../plan/admin-control-center-foundation-decisions.md#L133); [wf247 Secrets](../../plan/research/wf247-admin-security-settings-notifications-account.md)). Consumes X2.
- **blockedBy:** F1, X1, X2.
- **Sad paths:** see X2; revoke with active dependents → reject or owner-defined containment path; delete metadata → destructive authority + single-use proof, never erases lifecycle evidence.
- **Edge cases:** no Reveal in v1; multiple storage authorities never centralize plaintext; Identity/session material stays Profile, not Secrets.
- **Acceptance:** reference inventory + scope/consumer + storage class + resolution health + rotation/expiry + blocked dependents; write-only add/replace/rotate/revoke/validate.
- **E2E:** add sentinel secret → metadata only, no value anywhere; rotate → consumers re-resolve; attempt reveal → unsupported.
- **Contract:** Secrets is a metadata/control surface; values never return to the browser.

#### TB-C5 · Security & Audit leaf
- **Owners/seams:** PRD-001/012/018 + Platform Ops ([ACC-072](../../plan/admin-control-center-foundation-decisions.md#L156); [wf247 Security & Audit](../../plan/research/wf247-admin-security-settings-notifications-account.md)). Consumes X4.
- **blockedBy:** F1, X1, X4. **External:** #193 for Runtime Activity ledger view; #192 for Connections-mutation audit coverage.
- **Sad paths:** Governance Audit producer/index unavailable → partial range; Runtime Activity unsupported/unavailable/stale/cursor-gap/partial-history/reconciled states; governance vs runtime rows disagree → separate identities + correlation warning.
- **Edge cases:** five local views (Approvals, Governance Audit, Runtime Activity, Access & Sessions, Security Policy); approvals reload target/version/expiry; destructive remediation needs separate PRD-018 confirmation.
- **Acceptance:** federated Governance Audit + separately labeled Runtime Activity + approvals + roles/sessions + policy; no synthetic event merger; export audited + field-level redacted.
- **E2E:** one config command + one runtime action → two separate rows; one source unavailable → other intact.
- **Contract:** Security & Audit is a read composition, never a universal write aggregate.

#### TB-C6 · Settings leaf (federation)
- **Owners/seams:** PRD-001 + each domain owner ([wf247 Settings](../../plan/research/wf247-admin-security-settings-notifications-account.md); PRD-013 legacy touchpoint migration table).
- **blockedBy:** F1, R4 (alert-rule section consumes Notifications owner).
- **Sad paths:** owner source unavailable → descriptor labeled unavailable/stale, no generic fallback editor.
- **Edge cases:** no `updateSetting(key,value)` / `getAllConfig` / generic JSON editor; deletion test: removing federation repeats discovery but removes no domain setting; alert-rule management lives here (Create/edit/enable/disable/test/archive) via typed Notifications commands.
- **Acceptance:** Workspace defaults + Notifications & alerts + Appearance shortcut + owner-setting index; every mutation routes to its owner command.
- **E2E:** change a workspace default from Settings vs a provider/Gateway/MCP/Runner/Secret setting from its leaf → all typed owner commands; no generic endpoint mutates the latter.
- **Contract:** Settings is a federation/index, not a store or command bus.

### Wave 3 — Route migration & cutover (#246-owned synthesis; blockedBy parity)

#### TB-M1 · Canonical routes, aliases, query/fragment mapping, redirect traps
- **Owners/seams:** #246 route synthesis ([wf242 §migration seams 1-7](../../plan/research/wf242-admin-route-ownership-migration-audit.md); [wf245 §1.3-1.5](../../plan/research/wf245-github-integration-connections-migration.md); [wf249 route disposition](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- **blockedBy:** F4, R1, R2, D1, and each leaf whose target route is being chosen (A1, A2, O1, C1 at minimum) — cutover only after real-stack parity per Seam 6.
- **blocks:** M4.
- **Sad paths:** `/connections/gateway` permanent-redirect cache trap → distinct target or cache-aware transition, no chain; unknown fragment → preserve safe state or explicit destination root, no loop, never forward secrets; redirect target forbidden → 403 at target, redirect confers no access.
- **Edge cases:** `/connections` → Integrations only when all sections proven-to-parity; `/connections/providers` → Models after parity; `/connections/system` split anchor-by-anchor (#245 channels→Integrations; #249 agents→Agents; system-core mixed Gateway/Health preserved until both mappings exist); `notice`/`provider` translated only allowlisted owner outcomes; expand/contract via owner ports, UI route can move while server command stable. **Recommended target route family (owner decision, not locked — canonical path still deferred to #246):** from wf245 §1.3/O1, `/integrations`, `/integrations/github`, `/integrations/github/history` with semantic IDs `configure.integrations`, `configure.integrations.github`, `configure.integrations.github.history`; only `configure.integrations` is a shell destination and the nested IDs name page-local views (detail, history) within PRD-020's two-level sidebar limit; final paths may be ratified differently provided the three distinct semantic roles (inventory leaf, GitHub detail, GitHub history) and direct old-route mappings survive.
- **Acceptance:** each legacy route resolves once to canonical destination; back/forward + deep-link + palette/sidebar/topbar links updated in same cutover; CI checks 403-deny, revoked-auth cache-miss, redirect-chain safety, rollback switchback.
- **E2E:** bookmarked `/connections/github` post-parity → Integrations GitHub; `/connections/gateway` cached client → not stranded.
- **Contract:** redirect never bypasses authorization; one canonical destination per legacy route.

#### TB-M2 · Legacy Tasks/Issues → Dev Board record-aware redirect
- **Owners/seams:** cross-map → #228 (record-aware DevTicket mapping) and #237 (reciprocal mapping); ADR-017 expand/contract ([wf242 Seam 5, :370-377](../../plan/research/wf242-admin-route-ownership-migration-audit.md); [dev-board-migration-manifest:311-334](../../plan/dev-board-migration-manifest.md)). **External/BLOCKED-on:** #228/#237 mapping artifact.
- **blockedBy:** M1. **External:** #228/#237.
- **Sad paths:** legacy task ID with no DevTicket mapping → explicit not-migrated/quarantined/not-found, never an unrelated record; GitHub record not a DevTicket → preserve native URL + explain disposition.
- **Edge cases:** move every consumer atomically (palette result, board detail nav, copy-link, breadcrumb, Ask Admin "View tasks", action cache invalidation, Ask Admin turn revalidate, GitHub sync/create invalidation) — see [wf242 consumer register](../../plan/research/wf242-admin-route-ownership-migration-audit.md).
- **Acceptance:** `/dev-board` target family served; record-aware resolver; all 10 consumer edges moved in one cutover; `/issues?filter&page` mapped atomically with normalized unsupported state.
- **E2E:** copied legacy `/tasks/<card>` URL resolves to mapped DevTicket; unmapped ID → explicit retained/not-found result.
- **Contract:** no blanket redirect; identity/backfill/reconciliation verified first.

#### TB-M3 · Top-bar utility + Profile & Account + appearance migration
- **Owners/seams:** PRD-001 (account/session/profile/security); PRD-020 placement; appearance two-scope model + sign-out recovery ([wf247 §Settings/Profile/Appearance + session](../../plan/research/wf247-admin-security-settings-notifications-account.md)). Consumes R3, R4.
- **blockedBy:** F4, R3, R4, X1.
- **Sad paths:** current-device sign-out revoke/probe failed/ambiguous → preserve cookies + "Could not confirm sign out" + idempotent Retry, never false signed-out confirmation; `AuthPort.listSessions()` returns live `sessionToken` → must use browser-safe projection (token cannot cross seam, proven by sentinel test); account/source unavailable → last-confirmed cached default + stale indicator.
- **Edge cases:** two appearance scopes locked in v1 — `setAccountAppearanceDefault` vs `setCurrentDeviceAppearance` (InheritAccount/Light/Dark/System); effective = explicit device → account → System; `opzava-mock-theme` one-time versioned conversion (light→Light, dark→Dark, missing→InheritAccount), new-value-wins, legacy key retained for rollback window.
- **Acceptance:** Profile & Account utility surface + session-safe views + appearance precedence/inheritance/offline + Notification Center; menu contains only identity/Profile/Appearance/Sign-out (no inline security actions).
- **E2E:** set Account default + device override from both entry points; revoke other session from two contexts → denied on next request; sentinel session token not in any DTO.
- **Contract:** two controls, one device store; signed-out confirmation only after confirmed server revocation.

#### TB-M4 · Retirement gates (telemetry, rollback, remove legacy presentation)
- **Owners/seams:** ([wf242 Seam 7, :400-407](../../plan/research/wf242-admin-route-ownership-migration-audit.md); [wf245 §1.5](../../plan/research/wf245-github-integration-connections-migration.md)).
- **blockedBy:** M1, M2, M3 + every leaf at verified parity.
- **Sad paths:** remove only after compatibility window + telemetry + rollback approved + all target consumers verified; delete duplicate presentation code, never owner ports or audit/history.
- **Edge cases:** frozen historical ledgers/execution records untouched ([ACC-082, ACC-089](../../plan/admin-control-center-foundation-decisions.md#L176)); `/api/connections/*` renamed/retired only after atomic consumer migration + zero unsupported consumers.
- **Acceptance:** real-stack parity evidence (old capability exists on target page) before redirect/removal; acceptance gate = real auth + seeded data + side-by-side visual evidence, not fixture screenshots ([ACC-088](../../plan/admin-control-center-foundation-decisions.md#L182)).
- **E2E:** post-removal, all legacy deep links resolve or 403 safely; no orphan Gateway/route.
- **Contract:** a sidebar placeholder is not parity and is not grounds for a redirect.

---

## 5. Acyclic graph — edges & safe frontier

Edges (blockedBy → blocker). Waves strictly increase, so the graph is acyclic by construction.

```
Wave 0 (FRONTIER):  F1
Wave 0/1:           F2, F3, F4        blockedBy F1
Wave 1 hardening:   X1 blockedBy F1
                    X2 blockedBy F1,X1
                    X3 blockedBy F1            [BLOCKED: ADR-003 JIT amendment]
                    X4 blockedBy F1,X1         [BLOCKED: PRD-013/#192 audit-field amendment]
Wave 1 projection:  R1 blockedBy F1,F2
                    R2 blockedBy F1,F2,R1
                    R3 blockedBy F1,F2
                    R4 blockedBy F1,X1         [BLOCKED: PRD-012/#193 split amendment]
Wave 2 Develop:     D1 blockedBy R2
                    D2 blockedBy F1,F2,F3,R1   [ext: #229,#233; trust #232]
                    D3 blockedBy F1,F2,F3,R1   [ext: #229]
Wave 2 AI Runtime:  A1 blockedBy F1,F2,F3,R1,X3
                    A2 blockedBy F1,F2,F3,R1,X2,X3
                    A3 blockedBy F1,F2,R1      [BLOCKED: PRD-006 v1 scope amendment]
                    A4 blockedBy F1,F2,F3,R1,X3
                    A5 blockedBy F1,F2,R1
                    A6 blockedBy F1            (reserved; grabbable now)
Wave 2 Operate:     O1 blockedBy F1,F2,R1,R3   [O-open: PRD-012 tiers]
                    O2 blockedBy F1,F2         [O-open: actionability predicate]
                    O3 blockedBy F1,F2         [ext: #193]
                    O4 blockedBy F1,F2         [O-open: Usage split model]
Wave 2 Configure:   C1 blockedBy F1,F2,F3,R1,X2
                    C2 blockedBy F1,F2,F3,X3
                    C3 blockedBy F1,F2,F3,R1,X2,X3   [BLOCKED: SecretRef-safe adapter gap=X2]
                    C4 blockedBy F1,X1,X2
                    C5 blockedBy F1,X1,X4      [ext: #192,#193]
                    C6 blockedBy F1,R4
Wave 3 migration:   M1 blockedBy F4,R1,R2,D1,(A1,A2,O1,C1)
                    M2 blockedBy M1            [ext: #228,#237]
                    M3 blockedBy F4,R3,R4,X1
                    M4 blockedBy M1,M2,M3 (+ all leaves at parity)
```

**Safe executable frontier (no unmerged internal blocker):** **F1** immediately; then **F2, F3, F4, X1,
R1, R3, A6** as soon as F1 merges. TBs marked `[BLOCKED]` (X3, X4, R4, A3, C3-until-X2) are **owner-gated**:
they sit in the frontier only to expose the blocker; implementation must wait for the named
amendment/external issue. TBs marked `[ext]` or `[O-open]` are externally/owner gated on execution
semantics but their placement/composition contract is publishable now (per [wf250 O7](../../plan/research/wf250-operate-overview-attention-composition.md)).

**Parallelism note (no internal barrier wasted):** the five leaf families (Develop / AI Runtime /
Operate / Configure / migration) depend only on shared Wave-0/1 inputs, so once F1/F2/F3 and the
relevant X/R TBs merge, **leaf families can be grabbed concurrently by different engineers**. The only
true barriers are X3 (gates all privileged runtime mutations: A1/A2/A4/C2/C3) and X2 (gates C3/C4 and
A2 secret handling) — surface these early.

---

## 6. Owner decisions to lock (consolidated open decisions)

Carried from #244/#245/#250 plus wf242/243/247/249. Each is a **recommendation, not an owner-lock**;
the named owner must lock it before the dependent TB leaves the frontier. Citations are the memo that
carried the recommendation.

### Domain-authority amendments (block TBs; highest priority)
1. **ADR-003 JIT admin lifecycle** vs durable admin device/shared-token fallback — locks X3, unblocks A1/A2/A4/C2/C3 ([wf249 §contract violation](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
2. **PRD-013 audit field**: structurally-defined old/new safe summaries **or** immutable config-version refs — locks X4, gates C5 + every audited mutation ([wf247 §Audit owner-contract blocker](../../plan/research/wf247-admin-security-settings-notifications-account.md); #192).
3. **PRD-006 v1 Agents operating-scope** amendment (Opzava/platform-development only; future business departments preserved but deferred) — locks A3 ([wf249 Agents / proposed amendment 1](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
4. **PRD-005/006/013 alignment** to split legacy `set-main`/model-policy authority to Ask Admin (PRD-005) and AgentEmployee (PRD-006) — blocks the Models owner-split; until then Models exposes no replacement mutation and PRD-013 `set-main` stays canonical ([wf249 Models](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
5. **PRD-012 mockup/vocabulary** amendment: split Notification Center from alert rules; terminal severity label `Done`; reciprocal **#193** link pointing Runtime Activity to Security & Audit — locks R4 ([wf247 §Placement amendments required](../../plan/research/wf247-admin-security-settings-notifications-account.md)).
6. **#192 / #193** remain external: Connections-mutation audit coverage (#192) and Mainframe bump + Platform Gateway rebuild + broker harness of native audit ledger (#193) gate C5/Runtime Activity and O3 correlation ([wf247](../../plan/research/wf247-admin-security-settings-notifications-account.md)).

### Placement/setup-UX decisions (from #244/#245 — composition-only, low-risk)
7. **Runner enrollment UX shape** (#244-O1): in-Runners multi-step secure wizard mapping to grant→challenge→fingerprint confirm. Owner: PRD-013 + #232.
8. **Reviewer selector before #229** (#244-O2): present compatibility/read-only while #229 defines selector; mark "awaiting Review Gate contract". Owner: #229 + PRD-013.
9. **Environment state enum + checkpoint visibility** (#244-O3): adopt `not-configured|live|stale|unavailable|unknown|pending` with safe denied/unknown handling + checkpoint-reconcile provenance.
10. **V1 access model** (#244-O4): enforce `Owner + existing admin-compatible`; defer broader roles.
11. **Cloud enrollment v1** (#244-O6): expose local as primary; cloud reserved/unavailable absent issuer policy.
12. **Capacity preset selector** (#244-O7): read-only effective-capacity projection; selector mutability → #233 close.
13. **Integrations GitHub leaf model** (#245-O1): four-part contract (enrollment, health dimensions, repair, integration history); #246 chooses destination path names + return encoding. **Recommended route family (owner decision, not locked — canonical path deferred to #246):** `/integrations`, `/integrations/github`, `/integrations/github/history` (semantic IDs `configure.integrations(.github(.history))`); only `configure.integrations` is a shell destination and nested IDs name page-local views within PRD-020's two-level sidebar limit; final paths remain a #246 owner decision and may be ratified differently so long as the three distinct semantic roles (inventory leaf, GitHub detail, GitHub history) survive ([wf245 §1.3, §3-O1](../../plan/research/wf245-github-integration-connections-migration.md)).
14. **`/api/connections/*` namespace** (#245-O2): keep `device-flow` as compatibility facade until atomic consumer migration; rename/retire only after telemetry + zero unsupported consumers.
15. **Compatibility duration / redirect retirement** (#245-O3): retain legacy ≥ one full release after verified parity + telemetry + rollback gates.
16. **`/connections/system` mixed-owner anchors** (#245-O4): preserve `#system-group-channels`→Integrations; don't invent destinations for unknown anchors; finalize bare-route only after #249/#250 anchor matrices.
17. **OAuth→GitHub-App migration** (#245-O5): fresh GitHub App enrollment, no cloned OAuth sync state.

### Composition decisions (from #250)
18. **Health source inventory / criticality tiers / freshness windows / roll-up** (#250-O1): PRD-012 vocabulary (Operational/Slow/Degraded/Offline/Unknown/Stale/Forbidden); top-bar roll-up Healthy/Degraded/Unhealthy/Unknown (Unknown fails closed); Gateway/database/event-queue/Runner/Docker-Review required, provider/MCP/skill optional.
19. **Usage & Costs split** (#250-O2): entitlement/quota → Dev Readiness; actionable budget threshold → Attention; spend totals → drill-down. Owner: Finance/entitlement.
20. **Incident actionability predicate** (#250-O3): include in Attention only when owner states a human decision/action currently required.
21. **Health vs attention destination registries** (#250-O4): separate families, owner-authenticated deep links, no path alias collapsing.
22. **Deprecated `/overview` / legacy compatibility** (#250-O5): `/overview` not authoritative; route via #246 compatibility mapping.
23. **Health drill-down destination** (#250-O6): single owner-authenticated Health destination now; legacy fragments as compatibility wrappers until #246 publishes aliases.
24. **Composition-publish-vs-implement gating** (#250-O7): publish composition graph now; keep Active Delivery/Dev Readiness execution dependent on closed upstream contracts (#229/#233).

### Provisional vocabulary (wf243/wf249 — promote or replace via CONTEXT.md)
25. wf243 working subterms (Skill Catalog Entry, Skill Version, Skill Set Revision, Skill Deployment, Managed Harness Profile, MCP Server Definition, MCP Consumer Binding, Capability Probe Receipt, Effective Capability Set, Capability Admission Manifest, Skill/Tool Digest Fields, Managed Harness Enforcement Adapter, Update Candidate) and wf249 relationship vocabulary (AgentEmployee, Runtime Session, Run Trace, Runtime Automation Artifact, Managed Runtime Artifact, Unmanaged Runtime Orphan, Reconciliation State) are **provisional, non-canonical** until promoted through normal domain-modeling or replaced with equally precise canonical terms ([wf243 §Provisional vocabulary](../../plan/research/wf243-admin-skills-runtime-mcp.md); [wf249 §Proposed relationship vocabulary](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).

---

## 7. Cross-map deferrals (explicitly NOT owned by #246)

- **Ask Admin route/name/session migration → [#210](https://github.com/anthonykewl20/opzava/issues/210).** `/ask-opzava` canonical path, deprecation duration, and assistant/session identity (`ask-admin-opzava`) survive any rename; #246 only preserves the pinned placement and a temporary alias/redirect hook. Ask Admin skill membership/content → [#219](https://github.com/anthonykewl20/opzava/issues/219); delegation orchestration → [#216](https://github.com/anthonykewl20/opzava/issues/216) ([wf242:86](../../plan/research/wf242-admin-route-ownership-migration-audit.md); [wf243:55-58,603-605](../../plan/research/wf243-admin-skills-runtime-mcp.md); [wf250 tension #3](../../plan/research/wf250-operate-overview-attention-composition.md)).
- **Dev Board overlap → [#228](https://github.com/anthonykewl20/opzava/issues/228) (record-aware DevTicket mapping) and [#237](https://github.com/anthonykewl20/opzava/issues/237) (reciprocal #147–#157 mapping + Dev Board program graph).** `/tasks`, `/tasks/[cardId]`, `/issues` redirects, DevTicket identity/reconciliation, and the legacy Task MCP disposition are TB-M2 and **externally blocked** on #228/#237; `/workboard` is runtime evidence only, never Dev Board authority ([wf242:87-89,298-306](../../plan/research/wf242-admin-route-ownership-migration-audit.md); [wf250 D5/tension #2](../../plan/research/wf250-operate-overview-attention-composition.md); [ADR-017:265-269](../../adr/ADR-017-dev-board-authority-sync-execution.md)).
- **Releases / staging-prod → separate Releases contract** (ACC-D08; wf236 is current #228 input). Operate Incidents correlate but never merge with Releases recovery ([wf250 D5](../../plan/research/wf250-operate-overview-attention-composition.md)).
- **Automations deeper Workflow/Node modeling → separate grilling** (ACC-D07); TB-A6 is reserved-only for all v1 regardless of adapter existence ([wf249 Automations](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)).
- **Schema authority → [#237](https://github.com/anthonykewl20/opzava/issues/237).** #246 adopts; it does not define an independent tracer-bullet schema (see header + §1).

---

## 8. Freeze-on-consume note

On #246 closure, the seven map-#241 memos (wf242, wf243, wf244, wf245, wf247, wf249, wf250) transition
from **current input** to **frozen evidence** per [#241 body](https://github.com/anthonykewl20/opzava/issues/241)
and [CLAUDE.md](../../CLAUDE.md): *"A resolved Wayfinder memo remains current only when an active map
or migration manifest explicitly designates it current input until a named synthesis consumes it."* A
link alone never revives them; only an explicit active-map redesignation can. This graph is the named
synthesis; once it is accepted, downstream implementation TBs cite the canonical PRDs/ADRs/ACC ledger
directly, not the frozen memos.

---

## Evidence index (primary)

- [PRD-020 — Admin Control Center](../../prd/PRD-020-admin-control-center.md)
- [Admin Control Center foundation decisions (ACC-001..089, ACC-D01..D09)](../../plan/admin-control-center-foundation-decisions.md)
- [wf242 — Admin route ownership and migration audit](../../plan/research/wf242-admin-route-ownership-migration-audit.md)
- [wf243 — Engineering Skills, Runtime Skills, Ask Admin subset, MCP](../../plan/research/wf243-admin-skills-runtime-mcp.md)
- [wf244 — Runner/Environment/Docker/reviewer setup UX](../../plan/research/wf244-runner-environment-docker-reviewer-setup.md)
- [wf245 — GitHub integration placement + Connections migration](../../plan/research/wf245-github-integration-connections-migration.md)
- [wf247 — Security/Settings/Notifications/Account placement](../../plan/research/wf247-admin-security-settings-notifications-account.md)
- [wf249 — AI Runtime + OpenClaw parity](../../plan/research/wf249-admin-ai-runtime-openclaw-parity.md)
- [wf250 — Operate pages + Overview attention composition](../../plan/research/wf250-operate-overview-attention-composition.md)
- [wf236 — Releases gate contract](../../plan/research/wf236-releases-gate-contract.md) (current #228 input per CLAUDE.md)
- [ADR-017 — Dev Board authority/sync/execution](../../adr/ADR-017-dev-board-authority-sync-execution.md); [ADR-016 — Mainframe fork](../../adr/ADR-016-mainframe-tracked-fork.md); [ADR-003 — Gateway broker ACL/two-token](../../adr/ADR-003-gateway-broker-acl-two-token.md)
- Issues: [#246](https://github.com/anthonykewl20/opzava/issues/246), [#241](https://github.com/anthonykewl20/opzava/issues/241), [#237](https://github.com/anthonykewl20/opzava/issues/237), [#228](https://github.com/anthonykewl20/opzava/issues/228), [#210](https://github.com/anthonykewl20/opzava/issues/210), [#216](https://github.com/anthonykewl20/opzava/issues/216), [#219](https://github.com/anthonykewl20/opzava/issues/219), [#229](https://github.com/anthonykewl20/opzava/issues/229), [#233](https://github.com/anthonykewl20/opzava/issues/233), [#192](https://github.com/anthonykewl20/opzava/issues/192), [#193](https://github.com/anthonykewl20/opzava/issues/193)

No product code, canonical PRD/ADR, glossary, or tracker state is changed by this synthesis.
