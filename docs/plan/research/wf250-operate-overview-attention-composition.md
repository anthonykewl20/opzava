# WF-250 — Reconcile Operate pages with Overview attention composition

Dual-provider research (GLM + Codex-spark), converged; open decisions carried to #246.

Status: **Research memo for [Admin Control Center Wayfinder #241](https://github.com/anthonykewl20/opzava/issues/241), child [#250](https://github.com/anthonykewl20/opzava/issues/250).** Planning evidence for final synthesis [#246](https://github.com/anthonykewl20/opzava/issues/246). READ-ONLY research; no git or GitHub writes; no implementation claim.

Authority note: this memo is current only because active map #241 designates its sibling child memos as current input until #246 consumes them. It binds every composition decision to PRD-020 and consumes — never redefines — PRD-012/018/019/ADR-017, the Releases contract, and related ACC decisions.

## Question

How should Overview attention, Health, Incidents, Logs, and Usage & Costs compose and disclose freshness and drill-downs without redefining incident lifecycle, remediation, or governed interruption semantics? ([#250 body](https://github.com/anthonykewl20/opzava/issues/250))

## Decisions (locked and composition decisions)

### D1 — Operate remains four separate leaves under source-owned behavior, composed read-only in Overview

The four Operate leaves are distinct destinations with distinct owners, and the Overview projects each as a rebuildable, request-scoped view model over that owner. Composition does not transfer behavior authority ([PRD-020 lines 269-272](../../../prd/PRD-020-admin-control-center.md#L269-L272), [57-59](../../../prd/PRD-020-admin-control-center.md#L57-L59); [ACC-013](../../../plan/admin-control-center-foundation-decisions.md#L22), [ACC-068-071](../../../plan/admin-control-center-foundation-decisions.md#L152-L155)).

| Operate leaf | Behavioral owner (precedence) | Overview composition role |
| --- | --- | --- |
| Health | PRD-012/PRD-018 + contributing owners (Gateway, GitHub, Runner, Docker, provider, skill, MCP) | Feeds top-bar health pill and Development Readiness; may indirectly seed attention if source declares actionability |
| Incidents | PRD-012/PRD-018 (Notifications/Admin-Observability) | Feeds Needs Your Attention actionable lifecycle states and Recent Activity transitions |
| Logs | PRD-012/PRD-018 + source-specific redaction owners | No direct attention/feed role; drill-down/correlation evidence for Health and Incidents |
| Usage & Costs | Runtime Control/Platform Ops + entitlement owner (PRD-012/ADR-014) | Feeds Needs Your Attention for actionable thresholds and Development Readiness for entitlement/quota gates |

Authority for each mapping is PRD-012/PRD-018 and/or PRD-020 as explicit composition source for Health/incident/log/remediation facts ([PRD-020 line 283](../../../prd/PRD-020-admin-control-center.md#L283); [PRD-020 325-336](../../../prd/PRD-020-admin-control-center.md#L325-L336)); Usage remains operational visibility with no Finance authority transfer ([PRD-020 272, 302-303](../../../prd/PRD-020-admin-control-center.md#L272-L273), [ACC-003/ACC-071](../../../plan/admin-control-center-foundation-decisions.md#L22)).

### D2 — Attention is a source-owned actionable queue; leaves never become the count

Needs Your Attention is bounded to human-actionable items: approvals, blocked work, unhealthy integrations requiring intervention, disconnected execution, review bottlenecks, security stops, incidents with decision needed, breached actionable thresholds ([ACC-022 line 51](../../../plan/admin-control-center-foundation-decisions.md#L51); [PRD-020 US2 lines 65-66](../../../prd/PRD-020-admin-control-center.md#L65-L66), [US54-55 lines 171-174](../../../prd/PRD-020-admin-control-center.md#L171-L174)).

Attention does not count unread notifications, every Incident, every degradation, every inventory total, all Activity events, or spend totals ([WF-247 lines 589-608](../../plan/research/wf247-admin-security-settings-notifications-account.md#L589-L608), [ACC-018 line 42](../../../plan/admin-control-center-foundation-decisions.md#L42)). Count is number of authorized source-owned actionable items only ([PRD-020 lines 393-398](../../../prd/PRD-020-admin-control-center.md#L393-L398)).

### D3 — Health and attention are independent top-bar states with a bridge, not a single control

The top-bar health pill reports readiness and evidence freshness only and never includes unread or approval counts ([PRD-020 lines 387-392](../../../prd/PRD-020-admin-control-center.md#L387-L392), [US50 lines 163-164](../../../prd/PRD-020-admin-control-center.md#L163-L164)).

Adjacent attention inbox and count is separate and represents authorized actionable work only ([PRD-020 lines 390-392](../../../prd/PRD-020-admin-control-center.md#L390-L392)).

The bridge rule remains: an unhealthy/degraded health fact, an incident awaiting action, or breached threshold may create an attention item only when the source owner declares a human decision is required; the source state itself is not the count ([WF-247 lines 930-934](../../plan/research/wf247-admin-security-settings-notifications-account.md#L930-L934); [PRD-020 lines 497-501](../../../prd/PRD-020-admin-control-center.md#L497-L501); [ACC-007](../../../plan/admin-control-center-foundation-decisions.md#L26), [ACC-028-029](../../../plan/admin-control-center-foundation-decisions.md#L57-L58)).

Healthy/empty vs degraded/non-empty are legal combinations and are rendered independently; this is codified at [PRD-020 lines 399-401](../../../prd/PRD-020-admin-control-center.md#L399-L401).

### D4 — Shared freshness/provenance envelope and partial-failure behavior are mandatory

Every composed item carries owner/id, provenance, source checkpoint/version, source timestamp, `observedAt`, `staleAfter`, state (`live`, `stale`, `unknown`, `unavailable`, `not-configured`), and last-known-good marker ([PRD-020 lines 338-347](../../../prd/PRD-020-admin-control-center.md#L338-L347); [ACC-074](../../../plan/admin-control-center-foundation-decisions.md#L76)); stale/unknown/unavailable/not-configured never degrade into `live/healthy/zero` by fallback ([PRD-020 lines 348-351](../../../prd/PRD-020-admin-control-center.md#L348-L351), [WF-247 lines 868-871](../../plan/research/wf247-admin-security-settings-notifications-account.md#L868-L871)).

Sections render verified rows independently while sibling sources fail ([PRD-020 lines 361-363](../../../prd/PRD-020-admin-control-center.md#L361-L363); [ACC-040 line 74](../../../plan/admin-control-center-foundation-decisions.md#L74); [ACC-021](../../../plan/admin-control-center-foundation-decisions.md#L21)).

This is the mechanism that supports `observedAt`-based freshness disclosure for Health while preventing conflation with counts ([WF-247 lines 43-45, 686-694](../../plan/research/wf247-admin-security-settings-notifications-account.md#L43-L45), and [WF-247 lines 691-694](../../plan/research/wf247-admin-security-settings-notifications-account.md#L691-L694) confirms audit timestamps do not substitute for freshness).

### D5 — Operate↔Dev Board overlap precedence is by source authority and route separation

- PRD-020 is composition/UI placement only for the shell ([PRD-020 lines 57-59](../../../prd/PRD-020-admin-control-center.md#L57-L59)).
- PRD-019/ADR-017 owns DevBoard/Sprint/Runner semantics; PRD-012/018 owns Incident/Health/Logs/Usage behavior ([ACC-005](../../../plan/admin-control-center-foundation-decisions.md#L24), [ACC-006](../../../plan/admin-control-center-foundation-decisions.md#L25), [ACC-068-071](../../../plan/admin-control-center-foundation-decisions.md#L152-L155)).
- Incidents are not DevTicket types and remain non-Sprint-eligible; DevBoard may show read-only projection only with links to authoritative Incident records ([PRD-012 lines 1-3, 244-251](../../../prd/PRD-012-admin-observability.md#L1-L3), [PRD-018 lines 357-376](../../../prd/PRD-018-admin-remediation.md#L357-L376), [ACC-069 line 153](../../../plan/admin-control-center-foundation-decisions.md#L153)).
- Release operational failure or rollback recovery stays within Dev Board Releases authority while operational incident records surface through Operate; they are correlated, not merged, and resolving an Incident does not imply deployment success ([WF-236 lines 676-689, 580-584](../../plan/research/wf236-releases-gate-contract.md#L676-L689); [PRD-020 lines 393-398](../../../prd/PRD-020-admin-control-center.md#L393-L398)).
- Governed interruption in Sprint via incident remains split facts: paused Sprint (Dev Board owner) and Incident (Operate owner), with visual correlation only ([#233 body](https://github.com/anthonykewl20/opzava/issues/233); [ACC-069 line 153](../../../plan/admin-control-center-foundation-decisions.md#L153)).

## Decision tensions and cross-check gaps (codex-spark + GLM convergence)

1. Implementation remains blocked on unresolved dependencies before #246 can finalize production routes and record ownership: #229 (Review Gate), #233 (governed interruption), #244, and #246 inputs. ([issue #250 owner comment](https://github.com/anthonykewl20/opzava/issues/250#issuecomment-5010329515), [#229](https://github.com/anthonykewl20/opzava/issues/229), [#233](https://github.com/anthonykewl20/opzava/issues/233), [#244](https://github.com/anthonykewl20/opzava/issues/244)).
2. Route collision with Dev Board identities (`/tasks`, `/issues`, `/workboard`) is still high-risk and must remain separated until canonical mapping and migration records are emitted in #246. ([WF-242 lines 298-303 and 457-463](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L298-L303), [wf242 lines 457-463](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L457-L463), [ACC-026](../../../plan/admin-control-center-foundation-decisions.md#L26), [ACC-073](../../../plan/admin-control-center-foundation-decisions.md#L73)).
3. Ask Admin naming/path overlap (including `/ask-opzava`, chat session keys, `/chat`) remains externally owned by #210 and should not be claimed by #250 composition logic. ([WF-242 lines 303-305](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L303-L305), [WF-243 lines 55-58, 603-605](../../plan/research/wf243-ask-admin-composition-and-policy.md#L55-L58), [#210](https://github.com/anthonykewl20/opzava/issues/210)).
4. Top-bar and legacy compatibility tension remains where some surfaces still collapse attention into health or mix compatibility states; these remain unresolved until #241/#246 migration mappings are complete. ([WF-247 lines 589-601](../../plan/research/wf247-admin-security-settings-notifications-account.md#L589-L601); [WF-242 risk #3 and risk #5](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L468-L470), [ACC-074](../../../plan/admin-control-center-foundation-decisions.md#L74)).
5. `Connections` decomposition and `/connections/system` split is prerequisite for stable composition, but final path assignments are deferred from PRD-020 scope. ([WF-242 lines 270-276, 436-439](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L270-L276), [WF-249 lines 760-768](../../plan/research/wf249-admin-composition-audit-notes.md#L760-L768), [WF-242 line 436](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L436-L439)).
6. Attention and health destination routing must remain separate registry entries with owner-authenticated deep links; collapsing them violates composition contracts. ([PRD-020 lines 385-403](../../../prd/PRD-020-admin-control-center.md#L385-L403), [ACC-007](../../../plan/admin-control-center-foundation-decisions.md#L26), [ACC-028](../../../plan/admin-control-center-foundation-decisions.md#L57), [WF-247 top-bar split](../../plan/research/wf247-admin-security-settings-notifications-account.md#L589-L601)).
7. Per-section failure handling must stay local: a source can be `unavailable`/`forbidden` while siblings render; no single global collapse should suppress verified sections. ([PRD-020 lines 361-365, 481-486](../../../prd/PRD-020-admin-control-center.md#L361-L365), [ACC-040](../../../plan/admin-control-center-foundation-decisions.md#L74), [ACC-074](../../../plan/admin-control-center-foundation-decisions.md#L74)).

## Resolved bindings inherited for #250 (not to re-decide)

- Health/attention separation and four independent state combinations are locked: PRD-020 US50-55 and ACC-007/ACC-028-029/ACC-074 ([PRD-020 lines 385-404](../../../prd/PRD-020-admin-control-center.md#L385-L404), [WF-247 lines 43-47, 665-694, 930-934](../../plan/research/wf247-admin-security-settings-notifications-account.md#L43-L47)).
- Operate leaf order and identity matrix remains Health, Incidents, Logs, Usage & Costs [ACC-013], [PRD-020 US21](../../../prd/PRD-020-admin-control-center.md#L269-L272).
- Incident/DevTicket boundary and remediation lifecycle stay with Observability/Remediation contexts [PRD-012/018].
- Release↔Incident boundary and rollback/failed-deploy incident behavior from WF-236 remain source authority for recovery semantics. ([WF-236 lines 676-689, 580-584](../../plan/research/wf236-releases-gate-contract.md#L676-L689), [ACC-067](../../../plan/admin-control-center-foundation-decisions.md#L67)).
- Composition envelope and anti-enumeration/403 behavior are inherited from PRD-020/ACC ([PRD-020 lines 338-360, 352-360, 451-459](../../../prd/PRD-020-admin-control-center.md#L338-L360), [ACC-039](../../../plan/admin-control-center-foundation-decisions.md#L39), [ACC-040](../../../plan/admin-control-center-foundation-decisions.md#L40), [ACC-042](../../../plan/admin-control-center-foundation-decisions.md#L42)).

## Open decisions for owner

All unresolved decisions below must be routed to synthesis #246. The following are **recommendation carried to synthesis #246 (not an owner-lock)**.

### O1 — Health source inventory, criticality tiers, freshness windows, and roll-up algorithm
- **Decision:** define required vs optional health owners, per-source `staleAfter`, and how the top-bar label rolls up source states.
- **Decision + citation:** WF-247 defers these to #250 ([WF-247 lines 102-105, 666-669](../../plan/research/wf247-admin-security-settings-notifications-account.md#L102-L105), [WF-247 lines 666-669](../../plan/research/wf247-admin-security-settings-notifications-account.md#L666-L669)).
- **Recommended default carried to synthesis #246 (not an owner-lock):** use PRD-012 health vocabulary (Operational, Slow, Degraded, Offline, Unknown, Stale, Forbidden) and top-bar roll-up [Healthy/Degraded/Unhealthy/Unknown, Unknown-fails-closed] while treating Gateway, database, event queue, and Runner/Docker-Review (where active) as required and provider/MCP/skill usage as owner-declared optional. ([PRD-012 lines 225-226](../../../prd/PRD-012-admin-observability.md#L225-L226); [WF-247 lines 673-684](../../plan/research/wf247-admin-security-settings-notifications-account.md#L673-L684); [PRD-020 lines 402-404](../../../prd/PRD-020-admin-control-center.md#L402-L404)).
- **Owner to raise:** #250 → #246 with PRD-012/018 and ACC-024/068 context.

### O2 — Usage & Costs command/lifecycle ownership and split model
- **Decision:** confirm command/action ownership and Overview split for Usage signals.
- **Decision + citation:** composition placement is visible but command/lifecycle authority is excluded from PRD-020 ownership; usage is operational posture and not finance semantics. ([PRD-020 lines 111-112, 272, 302-303](../../../prd/PRD-020-admin-control-center.md#L111-L112), [ACC-071](../../../plan/admin-control-center-foundation-decisions.md#L71), [ACC-074](../../../plan/admin-control-center-foundation-decisions.md#L74)).
- **Recommended default carried to synthesis #246 (not an owner-lock):** adopt three-way split already implied by source behavior: entitlement/quota blocking for Development Readiness, actionable budget threshold breaches for Needs Your Attention, spend totals for drill-down/recent context only. ([PRD-012 lines 281-289](../../../prd/PRD-012-admin-observability.md#L281-L289); [PRD-018 ADR-014 suspension](../../adr/ADR-014-runtime-suspension.md)).
- **Owner to raise:** #246 with Finance/entitlement owner input.

### O3 — Incident actionability predicate for attention
- **Decision:** codify which Incident states become actionable attention rows for the current principal.
- **Decision + citation:** incident existence is not attention, and transition conditions are source-owned. ([PRD-020 lines 390-392, 393-398, 500-501](../../../prd/PRD-020-admin-control-center.md#L390-L398), [WF-247 lines 619-640](../../plan/research/wf247-admin-security-settings-notifications-account.md#L619-L640), [WF-247 lines 930-934](../../plan/research/wf247-admin-security-settings-notifications-account.md#L930-L934)).
- **Recommended default carried to synthesis #246 (not an owner-lock):** include in Needs Your Attention when owner states a human decision/action is currently required for the principal. Non-actionable Incidents remain in Incidents and may surface in Recent Activity only.
- **Owner to raise:** PRD-012/018.

### O4 — Destination registry split: health vs attention routes
- **Decision:** whether health and attention use separate destination registries and deep-link families.
- **Decision + citation:** cross-check notes surface this unresolved as a route tension, and primary binding requires separate controls. ([PRD-020 lines 385-403](../../../prd/PRD-020-admin-control-center.md#L385-L403); [ACC-007](../../../plan/admin-control-center-foundation-decisions.md#L26), [ACC-028](../../../plan/admin-control-center-foundation-decisions.md#L28); [WF-247 lines 589-601](../../plan/research/wf247-admin-security-settings-notifications-account.md#L589-L601)).
- **Recommended default carried to synthesis #246 (not an owner-lock):** keep separate destination families with owner-authenticated deep links and no path alias collapsing.
- **Owner to raise:** #246.

### O5 — Deprecated `/overview` / legacy compatibility routing and canonical map
- **Decision:** where legacy `/overview` and compatibility links route during migration.
- **Decision + citation:** wf242 identifies duplicate-authority and legacy overlap risk; wf249 table entries and ACC-026 defer explicit route selection. ([WF-242 lines 298-303, 436-439](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L298-L303), [WF-249 lines 754-768](../../plan/research/wf249-admin-composition-audit-notes.md#L754-L768), [ACC-026](../../../plan/admin-control-center-foundation-decisions.md#L26), [WF-242 lines 374, 392-397, 409-417](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L374-L377)).
- **Recommended default carried to synthesis #246 (not an owner-lock):** do not treat `/overview` as an authoritative source; route through #246 compatibility mapping after explicit route audit and keep feature-by-feature split.
- **Owner to raise:** #246.

### O6 — Health drill-down destination for top-bar and Operate cards
- **Decision:** finalize the canonical route for health detail and reconcile legacy fragments (`/connections` vs dedicated Health).
- **Decision + citation:** cross-check and primary both defer route ownership but require one destination; WF-242 and WF-249 track this prerequisite. ([PRD-020 lines 425-426](../../../prd/PRD-020-admin-control-center.md#L425-L426); [ACC-068](../../../plan/admin-control-center-foundation-decisions.md#L68), [WF-249 lines 167-170, 754-768](../../plan/research/wf249-admin-composition-audit-notes.md#L167-L170)); [WF-242 line 436](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L436-L439).
- **Recommended default carried to synthesis #246 (not an owner-lock):** route to a single owner-authenticated Health destination now, retain legacy route fragments as compatibility wrappers until #246 publishes final aliases.
- **Owner to raise:** #246.

### O7 — Composition implementation gating versus publication of contract
- **Decision:** confirm contract publication can proceed before implementation while dependencies for execution semantics remain open.
- **Decision + citation:** #250 is currently blocked for implementation by unresolved #229/#233/#244/#246, while composition graph can be published. ([#250 comment](https://github.com/anthonykewl20/opzava/issues/250#issuecomment-5010329515), [PRD-020 lines 430-448](../../../prd/PRD-020-admin-control-center.md#L430-L448)).
- **Recommended default carried to synthesis #246 (not an owner-lock):** publish this composition graph now; keep execution of Active Delivery/Development Readiness dependent on closed upstream contracts.
- **Owner to raise:** #241 map owner / human.

## Risks if unresolved

1. False control of operational readiness if health is folded into attention/count semantics or normalized to zero/empty. ([PRD-020 lines 14-16, 402-403, 481-483](../../../prd/PRD-020-admin-control-center.md#L14-L16), [ACC-074](../../../plan/admin-control-center-foundation-decisions.md#L74), [WF-247 lines 589-601](../../plan/research/wf247-admin-security-settings-notifications-account.md#L589-L601)).
2. Route-authority drift across `/tasks`, `/issues`, and `/workboard` or `workboard` legacy identities to wrong operational context and wrong lifecycle ownership. ([WF-242 lines 298-303, 457-463](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L298-L303), [ACC-026](../../../plan/admin-control-center-foundation-decisions.md#L26), [ACC-073](../../../plan/admin-control-center-foundation-decisions.md#L73)).
3. Migration dead-ends if legacy compatibility routes are not fully audited through #246, creating broken deep links. ([#250 comment dependencies](https://github.com/anthonykewl20/opzava/issues/250#issuecomment-5010329515), [WF-242 lines 374, 392-397, 409-417](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L374-L377), [ACC-001](../../../plan/admin-control-center-foundation-decisions.md#L1)).
4. Ask Admin continuity failure if #210 naming/session identity diverges from PRD-005 and tool policy controls. ([WF-242 lines 303-305](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L303-L305), [WF-243 lines 55-58, 603-605](../../plan/research/wf243-ask-admin-composition-and-policy.md#L55-L58)).
5. Staleness/freshness leaks if composition is still built from fragments or fixtures instead of contract-bound sources and pre-fan-out denial. ([PRD-020 lines 334-347, 352-360, 378-380, 481-486](../../../prd/PRD-020-admin-control-center.md#L334-L347), [ACC-039](../../../plan/admin-control-center-foundation-decisions.md#L39), [ACC-040](../../../plan/admin-control-center-foundation-decisions.md#L40), [WF-242 lines 316-320, 469](../../plan/research/wf242-admin-route-ownership-migration-audit.md#L316-L320), [WF-247 lines 691-694](../../plan/research/wf247-admin-security-settings-notifications-account.md#L691-L694)).

## What #250 hands to synthesis #246

1. Binding composition graph: Operate-leaf to Overview section map and owner provenance (D1).
2. Health/attention invariant + bridge model with explicit independent-state combinations (D2/D3).
3. Shared provenance/freshness envelope and partial-failure policy (D4).
4. DevBoard overlap precedence and governed-interruption boundary (D5).
5. Full open decision set O1-O7, each with recommended defaults routed to #246.
6. Explicit non-claims: no redefinition of lifecycle/remediation/authority ownership, no production URL ownership, and no command/lifecycle handling for Usage outside owned surfaces.

## Sources

- [PRD-020 — Admin Control Center](../../../prd/PRD-020-admin-control-center.md)
- [PRD-012 — Admin Observability](../../../prd/PRD-012-admin-observability.md)
- [PRD-018 — Admin Remediation](../../../prd/PRD-018-admin-remediation.md)
- [Admin Control Center foundation decisions](../../../plan/admin-control-center-foundation-decisions.md)
- [WF-247 — Security/Settings/Notifications/Account placement](../../plan/research/wf247-admin-security-settings-notifications-account.md)
- [WF-242 — Admin route ownership and migration audit](../../plan/research/wf242-admin-route-ownership-migration-audit.md)
- [WF-243 — Ask admin composition and policy](../../plan/research/wf243-ask-admin-composition-and-policy.md)
- [WF-249 — Composition and route-audit notes](../../plan/research/wf249-admin-composition-audit-notes.md)
- [WF-236 — Releases gate contract](../../plan/research/wf236-releases-gate-contract.md)
- Issues: [#250](https://github.com/anthonykewl20/opzava/issues/250), [#241](https://github.com/anthonykewl20/opzava/issues/241), [#233](https://github.com/anthonykewl20/opzava/issues/233), [#229](https://github.com/anthonykewl20/opzava/issues/229), [#244](https://github.com/anthonykewl20/opzava/issues/244), [#246](https://github.com/anthonykewl20/opzava/issues/246), [#210](https://github.com/anthonykewl20/opzava/issues/210)
