# WF-244 research — Reconcile Runner, Environment, Docker, and reviewer setup UX

Dual-provider research (GLM + Codex-spark), converged; open decisions carried to #246.

Status: **READ-ONLY spec-grade research evidence for [#244](https://github.com/anthonykewl20/opzava/issues/244)**.
Date: 2026-07-18.
Author context: merge of delegated GLM + Codex-spark findings. No git, no GitHub writes. Every claim keeps a source citation.

## Question and scope discipline

#244 asks about the Admin setup and status journey for Runner enrollment, tool and reviewer setup, local Docker Review shared stack readiness, and capacity/lease visibility—without resetting upstream review, trust, or scheduling contracts.

Map #241 confines this to placement, composition, setup UX, and route migration, consuming PRD-020/ADR-017/PRD-013/PRD-019/PRD-012/PRD-018 authority rather than redefining contracts (`docs/prd/PRD-020-admin-control-center.md:256-283`, `:430-447`, `:540-570`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md`; `docs/prd/PRD-013-connections-tools.md`; `docs/prd/PRD-019-dev-board.md`; `docs/prd/PRD-012-dev-board.md`; `docs/prd/PRD-018-operations-readiness.md`).

Ready-state statement and blocking posture:

- `#229` is OPEN and owns reviewer identity/selection/verification and exclusive Review lease semantics (`[ #229](https://github.com/anthonykewl20/opzava/issues/229)`, `docs/plan/research/wf232-runner-control-protocol.md:2912-2917`).
- `#233` is OPEN and owns scheduling/capacity preset policy (`[#233](https://github.com/anthonykewl20/opzava/issues/233)`, `docs/plan/research/wf232-runner-control-protocol.md:2936-2941`).
- `#232` is CLOSED and is the resolved enrollment/lifecycle authority this memo projects (`[#232](https://github.com/anthonykewl20/opzava/issues/232)`, `docs/plan/research/wf232-runner-control-protocol.md:1-67`, `:268-430`, `:2905-2941`).
- This yields **placement/setup UX ready now**, with execution blocked where contract seams are owned by open tickets (`#244 comment, 2026-07-18`, `docs/plan/research/wf232-runner-control-protocol.md:2905-2941`).

## 1. Resolved decisions (base structure)

### Q1 — Where each setup surface lives

**Decision.** #244 surfaces are split by owner leaf, not aggregated under `/connections`.

| Surface | Placement | Setup owner | Contract owner (not redefined) |
| --- | --- | --- | --- |
| Local enrollment, selected executable tool, heartbeat, revoke/re-enroll | Develop → Runners | PRD-013 / ACC-061 (`docs/plan/admin-control-center-foundation-decisions.md:140`; `docs/prd/PRD-020-admin-control-center.md:261`) | PRD-019 / ADR-017 / #232 (`docs/prd/PRD-019-dev-board.md`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md`; `docs/plan/research/wf232-runner-control-protocol.md:268-430`) |
| Reviewer tool/model compatibility checks, local Docker access/readiness, evidence-upload health, fixtures/reset/preview and shared stack setup/reset/reseed | Develop → Environments | PRD-013 / ACC-063/ACC-067 (`docs/plan/admin-control-center-foundation-decisions.md:132`; `:142-143`; `:146`; `:163-167`) | PRD-019 / ADR-017 Review + #229 (`docs/prd/PRD-019-dev-board.md:303-306`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:120-121`; `docs/plan/research/wf232-runner-control-protocol.md:2909-2917`) |
| Model/provider catalog/routability reference | AI Runtime → Models & Providers | Runtime control/catalog leaf (`docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:517-531`; `docs/plan/admin-control-center-foundation-decisions.md:53`, `:128-129`; `:132`) | Catalog only; does not make Reviewer selection/identity decisions (`docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:525-528`) |
| GitHub/Slack adjacent setup | Configure → Integrations | PRD-013 ACC-053/054/057 (`docs/plan/admin-control-center-foundation-decisions.md:127-131`) | PRD-019/ADR-017 sync and issues (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:507`) |
| Lease/capacity visibility | Develop → Overview + Runners detail | PRD-020 composition (`docs/prd/PRD-020-admin-control-center.md:430-447`) | ADR-017 capacity contract + #233 (`docs/plan/research/wf232-runner-control-protocol.md:2936-2941`) |

### Q2 — Runner setup state machine and enrollment ceremony

**Decision.** Use the closed #232 ceremony and lifecycle projection in #244 UX.

- Admin requests enrollment from Runners; server issues one-time grant + local challenge; daemon creates Ed25519 key and redeems challenge over authenticated setup channel; admin confirms fingerprints and activates (`docs/plan/research/wf232-runner-control-protocol.md:291-339`).
- Tool selection is explicit and platform-aware: Codex Desktop, Codex CLI, and Claude Code are discrete choices (`docs/plan/admin-control-center-foundation-decisions.md:142`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:368-369`).
- Lifecycle machine is `Pending → Awaiting Fingerprint Confirmation → Active ↔ Suspended → Revoked`; re-enroll follows `Re-enroll Required → new epoch` (`docs/plan/research/wf232-runner-control-protocol.md:411-430`).
- Cloud enrollment remains a separate fail-closed ceremony requiring active issuer policy (`docs/plan/research/wf232-runner-control-protocol.md:341-409`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:375-378`).

### Q3 — Environment setup, Docker Review, and reviewer compatibility

**Decision.** Environments owns the local shared Docker Review stack UX, but Review truth remains #229/ADR-017.

- Setup includes stack service expectations, readiness checks, health/evidence-upload checks, reset and fixture handling, preview/tunnel posture, and compatibility reporting (`docs/plan/admin-control-center-foundation-decisions.md:142`; `:146`; `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:517-531`).
- A local Runner may report `local_review_transport`, but this does not authorize Review; the Reviewer identity/lease ownership is in #229 (`docs/plan/research/wf232-runner-control-protocol.md:2909-2917`).
- Cloud Runner remains `local_review_transport=false` and cannot run local Review (`docs/plan/research/wf232-runner-control-protocol.md:2918-2923`).
- Local Docker Review is evidence for review only, not release/staging production (`docs/adr/ADR-017-dev-board-authority-sync-execution.md:103`, `:120-121`; `docs/plan/research/wf236-releases-gate-contract.md:13-14`, `:20`; `docs/plan/admin-control-center-foundation-decisions.md:146`; `:196`).
- Recommended readiness states for this slice: `not-configured → provisioning → ready ↔ degraded/unavailable`, with an `exclusive-occupied` projection from Review lease (`docs/plan/admin-control-center-foundation-decisions.md:85-107`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:120-121`).

### Q4 — Lease/capacity visibility

**Decision.** Reflect capacity by contract, do not redefine it.

- Balanced defaults to two implementation leases with Active Sprint serialization: one Sprint lease plus one claimed Ready ordinary ticket max, and Review remains exclusive (`docs/prd/PRD-020-admin-control-center.md:432-442`; `docs/plan/admin-control-center-foundation-decisions.md:143`; `docs/prd/PRD-019-dev-board.md:422-440`).
- Sprint activation waits/reconciles instead of canceling running ordinary work (`docs/prd/PRD-020-admin-control-center.md:437-439`; `docs/prd/PRD-019-dev-board.md:437-439`).
- #244 exposes these as distinct facts: Sprint implementation, ordinary claimed work, and Review occupancy (`docs/prd/PRD-020-admin-control-center.md:440-442`; `docs/plan/admin-control-center-foundation-decisions.md:74`; `:143`).

### Q5 — Deferred vs v1 scope for #244

**Decision.** Scope stays in map #241 and ACC deferred ledger.

- Deferrals include: detailed leaf UX/forms (`ACC-D01`), multi-machine scheduling/migration (`ACC-D03`), multi-repo (`ACC-D04`), >1 sprint and cross-sprint scheduling (`ACC-D05`), auto cloud failover (`ACC-D06` + ADR-017), Workflow/Node and automation (`ACC-D07`), staging/production release management (`ACC-D08`), and production URLs/contracts (`ACC-D09` `docs/plan/admin-control-center-foundation-decisions.md:189`, `:191-197`).
- In-scope for #244 is placement, state-machine shape, owner boundaries, and deferred-seam tagging (`docs/plan/admin-control-center-foundation-decisions.md:189`).

## 2. Cross-ticket decision tensions and ordering dependencies

### Active decision tensions

1. **Route ownership overlap across migration children.** Runners/Environments setup placement must stay aligned with #242, #243, #247, and #249 or routing aliases and composition can diverge across leaves (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md`, `docs/plan/research/wf243-admin-skills-runtime-mcp.md`, `docs/plan/research/wf247-admin-security-settings-notifications-account.md`, `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md`, `[#246](https://github.com/anthonykewl20/opzava/issues/246)`).
2. **Health/attention split dependency.** #250 finalizes attention/health composition; #244 should not assume deep-link behavior for denials/degraded/safe state combinations before that closes (`docs/plan/research/wf247-admin-security-settings-notifications-account.md:103-104`, `[Issue #250](https://github.com/anthonykewl20/opzava/issues/250)`).
3. **Tool/reviewer ownership boundary tension.** Runners owns local executable and capabilities; Environments owns review compatibility; avoid collapsing model rows into Runner identity or vice versa (`docs/plan/admin-control-center-foundation-decisions.md:132`; `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:527-530`).
4. **Ask Admin remains pinned in shell.** Model/tool policy commands are governed by Ask Admin #210 and #243/#249, not a second Runner/Environment authority in #244 (`[#210](https://github.com/anthonykewl20/opzava/issues/210)`, `docs/plan/research/wf243-admin-skills-runtime-mcp.md:56`, `:834-836`, `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:718`).
5. **Legacy route compatibility sequencing.** `/` and `/connections` migration paths are compatibility evidence only until target anchors are parity-ready; local `/connections/add` must not absorb setup (retain compatibility-aware redirects) (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:202-205`; `:264-265`; `:480-482`; `docs/plan/research/wf243-admin-skills-runtime-mcp.md:103`; `docs/plan/admin-control-center-foundation-decisions.md:168-169`).
6. **Open trust-protocol inputs.** #228 outcome is still needed for full automation guarantees before any “auto-enrollment” or cross-endpoint trust claims are implemented (`docs/plan/research/wf243-admin-skills-runtime-mcp.md:834-836`).

### Ordering

1. Consume hard parent boundaries before implementation: #229, #233, #242, #243, #247, #249, and #250 (`[Issue #244 comment](https://github.com/anthonykewl20/opzava/issues/244#issuecomment-5010329248)`).
2. Resolve PRD-013/PRD-192/PRD-193 amendment mismatches noted in current migration/sema review before activating new setup mutations (`[#192](https://github.com/anthonykewl20/opzava/issues/192)`, `[#193](https://github.com/anthonykewl20/opzava/issues/193)`, `docs/plan/research/wf247-admin-security-settings-notifications-account.md:790-820`, `docs/plan/research/wf242-admin-route-ownership-migration-audit.md:509-513`).

## 3. Open decisions for owner

All decisions below include a recommended default and are **recommendation carried to synthesis #246 (not an owner-lock)**.

- **O1 — Enrollment UX shape in Runners (wizard/page/modal).** ACC-D01 defers concrete UX shape; #232 only locks the ceremony (`docs/plan/admin-control-center-foundation-decisions.md:189`; `docs/plan/research/wf232-runner-control-protocol.md:291-339`).
  **Recommendation carried to synthesis #246 (not an owner-lock):** use an in-Runners multi-step secure wizard that maps exactly to the grant → challenge → fingerprint confirm sequence, including expiry/cancel/conflict and completion confirmation.
  Owner context: PRD-013 setup placement + #232 protocol.

- **O2 — Reviewer selection control behavior before #229 closes.** Ownership is fixed to Environments, but selector semantics are not (`docs/plan/admin-control-center-foundation-decisions.md:132`; `docs/plan/research/wf232-runner-control-protocol.md:2912-2917`).
  **Recommendation carried to synthesis #246 (not an owner-lock):** present compatibility/readiness and model/catalog reference read-only while #229 defines active selector semantics; mark action state explicitly as "awaiting Review Gate contract".
  Owner context: #229 + PRD-013.

- **O3 — Exact environment state enum and checkpoint visibility.** Cross-check governance suggests `not configured|live|stale|unavailable|unknown|pending` and strict non-inference; #249 evidence envelope reinforces this (`docs/plan/admin-control-center-foundation-decisions.md:75`; `:157-159`; `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:182-247`, `:697-708`; `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:383-411`).
  **Recommendation carried to synthesis #246 (not an owner-lock):** adopt these state tokens for Runner and Environment rows with safe denied/unknown handling and checkpoint-reconcile provenance.
  Owner context: Environments + runtime command lifecycle (`docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:383-411`).

- **O4 — V1 access model details.** Owner/admin scope and single-repo assumptions are partly deferred in ACC-D02 and need explicit implementation wording (`docs/plan/admin-control-center-foundation-decisions.md:191`; PRD-020 owner matrix).
  **Recommendation carried to synthesis #246 (not an owner-lock):** enforce `Owner + existing admin-compatible` roles in #244 leaves and defer broader role models.
  Owner context: PRD-020 / ACC-D02 / map #241.

- **O5 — Route and URL synthesis order for legacy compatibility.** Migration order across legacy `/connections*` and target leaves is still a synthesis-order decision (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:202-205`; `docs/plan/admin-control-center-foundation-decisions.md:168-169`).
  **Recommendation carried to synthesis #246 (not an owner-lock):** retain legacy compatibility routes until target leaves are parity/contract-ready, then redirect with record-aware alias/rollback behavior.
  Owner context: #246 route synthesis.

- **O6 — Cloud enrollment UX in v1.** Cloud ceremony is documented but v1 may keep it hidden/fail-closed absent policy (`docs/plan/research/wf232-runner-control-protocol.md:341-409`; `docs/plan/admin-control-center-foundation-decisions.md:194`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:375-378`).
  **Recommendation carried to synthesis #246 (not an owner-lock):** expose local enrollment as v1 primary; display cloud enrollment as reserved/unavailable until an active issuer policy is configured.
  Owner context: ADR-017 + PRD-013.

- **O7 — Capacity preset selector visibility.** #233 controls scheduling; #244 can project but should not ship config surface yet (`docs/plan/research/wf232-runner-control-protocol.md:2936-2941`; `docs/prd/PRD-019-dev-board.md:422-440`).
  **Recommendation carried to synthesis #246 (not an owner-lock):** keep read-only effective-capacity projection in v1; defer selector mutability to #233 close.
  Owner context: #233.

- **O8 — Exact Environments verification action set and evidence ownership split.** PRD-019 references validation flows but command surface is not fully specified for v1 (`docs/prd/PRD-019-dev-board.md:305-306`, `:333`).
  **Recommendation carried to synthesis #246 (not an owner-lock):** keep stack health/check/reset/evidence-upload health as Environments owner commands with receipts/readback, while full Review package semantics remain #229.
  Owner context: #229 + Runtime Control.

- **O9 — Route migration and security policy coupling with `/connections/system` and secret/attention surfaces.** Cross-check identifies composition coupling risk with #250 and #247 (`docs/plan/research/wf242-admin-route-ownership-migration-audit.md:509-513`; `docs/plan/research/wf247-admin-security-settings-notifications-account.md:164-166`, `:790-820`, `:1012-1017`).
  **Recommendation carried to synthesis #246 (not an owner-lock):** keep setup mutations and secret-bearing fields out of generic health/attention/compliance shells until #250 finalizes separation.
  Owner context: #250 + #247.

## 4. Sad paths and invariants to preserve

- Enrollment grant replay/conflict returns original proof; mismatched key/nonce/payload triggers conflict and no Active enrollment (`docs/plan/research/wf232-runner-control-protocol.md:2962-2964`).
- Challenge expiry, cancellation, unapproved build, role loss, tenant suspension, or unconfirmed fingerprint leaves no Active state (`docs/plan/research/wf232-runner-control-protocol.md:336-339`).
- Platform/tool mismatch must be excluded from UI options (`docs/plan/admin-control-center-foundation-decisions.md:142`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:368-369`).
- Unknown is not healthy; denied/forbidden uses safe non-metadata state and no existence leak (`docs/prd/PRD-020-admin-control-center.md:316-323`, `:352-360`; `docs/plan/admin-control-center-foundation-decisions.md:42`; `:74`; `:157-159`; `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:786-787`).
- Setup actions return accepted/pending must not render configured until confirmed readback (`docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:383-411`).
- Secrets remain write-only; no retention/DOM leakage (`docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:366-376`; `docs/plan/admin-control-center-foundation-decisions.md:133`).
- Reconnect uploads reconciliation observations and claims fresh state; does not resurrect old leases (`docs/plan/research/wf232-runner-control-protocol.md:45-49`).
- Free implementation lease slots and Docker Review availability are distinct facts; one does not imply the other (`docs/prd/PRD-020-admin-control-center.md:440-442`; `docs/prd/PRD-019-dev-board.md:422-440`).
- Review cannot run when model not routable or Docker/evidence-upload unhealthy (`docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md:519-520`; `:525-528`; `docs/plan/admin-control-center-foundation-decisions.md:132`; `docs/plan/admin-control-center-foundation-decisions.md:146`).

## 5. What #244 hands to synthesis #246

1. Final placement graph: Runners, Environments, Models & Providers, Integrations, and capacity visibility split by owner.
2. Runner enrollment lifecycle and ceremony projection from closed #232.
3. Environments state shape with shared Docker Review ownership seam and #229 lease projection.
4. Capacity visibility rules with Balanced/Sprint/Review fact split and #233 scheduling dependency.
5. Explicit v1 deferral map plus open blocking preconditions (`#229`, `#233`).
6. Cross-ticket execution dependencies and migration/alias ordering risk register.
7. Clear open decisions and recommended defaults carried to #246.

## Primary evidence

- `docs/prd/PRD-020-admin-control-center.md` (leaf-owner matrix `:256-283`; IA: `:288-307`; capacity `:430-447`; auth/denial `:316-323`, `:352-360`; setup out-of-scope `:552-553`)
- `docs/plan/admin-control-center-foundation-decisions.md` (ACC-041/042/053-067; ACC-074/079; ACC-D01/D02-D09)
- `docs/plan/research/wf232-runner-control-protocol.md` (enrollment/ceremony: `:291-339`; cloud: `:341-409`; lifecycle: `:411-430`; boundaries: `:268-430`, `:2905-2941`; handoff ledger: `:2943-2956`)
- `docs/plan/research/wf249-admin-ai-runtime-openclaw-parity.md` (Reviewer boundary: `:517-531`; command lifecycle: `:383-411`; binding constraints 17-18: `:931-937`; state/stateful evidence envelope `:182-247`, `:697-708`)
- `docs/plan/research/wf242-admin-route-ownership-migration-audit.md` (Runners/Environments no current route: `:264-265`; migration seams: `:202-205`, `:480-482`, `:503-513`, `:509-510`, `:780`)
- `docs/plan/research/wf243-admin-skills-runtime-mcp.md` (cross-endpoint/runtime constraints in Ask/Admin and protocol overlap: `:56`, `:834-836`, `:103`, `:896-907`)
- `docs/plan/research/wf247-admin-security-settings-notifications-account.md` (attention/health split and security coupling: `:103-104`, `:164-166`, `:790-820`, `:1012-1017`)
- `docs/plan/research/wf236-releases-gate-contract.md` (review evidence vs release boundaries: `:13-14`, `:20`)
- `docs/adr/ADR-017-dev-board-authority-sync-execution.md` (no auto cloud failover `:68`; review evidence `:103`, `:120-121`; enrollment/tool `:368-378`, `:375-378`)
- `docs/prd/PRD-019-dev-board.md` (reviewer setup 112-114 `:303-306`; validation/preview 113-118 `:305-306`, `:314`, `:333`; presets 164-170 `:422-440`; pause behavior 134 `:354-355`; activation 169 `:437-439`)
- Issues: [#244](https://github.com/anthonykewl20/opzava/issues/244), [#241](https://github.com/anthonykewl20/opzava/issues/241), [#229](https://github.com/anthonykewl20/opzava/issues/229), [#232](https://github.com/anthonykewl20/opzava/issues/232), [#233](https://github.com/anthonykewl20/opzava/issues/233), [#246](https://github.com/anthonykewl20/opzava/issues/246), [#250](https://github.com/anthonykewl20/opzava/issues/250), [#210](https://github.com/anthonykewl20/opzava/issues/210), [#192](https://github.com/anthonykewl20/opzava/issues/192), [#193](https://github.com/anthonykewl20/opzava/issues/193).
