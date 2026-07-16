# PRD-020: Admin Control Center — shell, navigation, and overview composition

## Problem Statement

The Opzava administrator needs one dependable place to understand what requires attention, what
development work is active, whether the platform is ready to support that work, and what changed
recently. Today, the admin surface has accumulated navigation and dashboard concepts from several
different product eras. Development work, runtime operation, integration setup, observability, and
configuration are not organized under one canonical hierarchy, and the first page does not yet have
a stable contract for how it composes facts owned by those different contexts.

This ambiguity creates several risks. The shell could present CRM, Marketing, or Finance as admin
destinations even though the admin dashboard is now solely for developing and operating Opzava. A
single health indicator could incorrectly mix platform readiness with an action count. A partially
unavailable source could be rendered as healthy or as zero work. Cross-context summaries could
become a new, conflicting store of truth. Navigation admission could leak a route or search result
that the current user cannot access. The shell could also become unusable whenever a runtime source
is unhealthy, preventing the administrator from reaching the very controls needed to diagnose it.

The Admin Control Center therefore needs a narrow, durable product contract. It must own the Admin
chrome, admission and presentation of Admin routes, the exact two-level information architecture,
the first-page composition order, and accessible responsive behavior. It must not become a new
bounded context, workflow authority, command bus, or durable truth store for the capabilities it
links to and summarizes.

## Solution

Provide an Opzava-branded Admin Control Center with a stable shell and a request-scoped,
authorization-aware Overview composition.

The shell uses the shadcn Radix Sidebar contract with one pinned **Ask Admin Opzava** entry and four
exactly named groups: **Develop**, **AI Runtime**, **Operate**, and **Configure**. It exposes no
CRM, Marketing, or Finance destinations. The sidebar is flush, icon-collapsible on desktop, rendered
as an accessible Sheet/dialog on mobile, and never presents more than two visible hierarchy levels.
Its top bar contains the sidebar trigger, global search, capability/platform health, an adjacent
attention inbox, appearance controls, and the account entry point.

The landing Overview uses the approved **Variant A — Priority Command Center** reading order:

1. **Needs Your Attention**
2. **Active Delivery**
3. **Development Readiness**
4. **Recent Activity**

The Overview is distinct from Dev Board Summary. It assembles rebuildable, request-scoped view
models from the bounded contexts that own the underlying facts. Every composed result retains its
source, provenance, version/checkpoint, source timestamp, observation time, freshness boundary,
availability state, and last-known-good status. Verified sections may render even when another
source is stale, unavailable, forbidden, or not configured. Unknown or stale data is never silently
converted to healthy state or a zero count.

Access is gated by an explicit capability, initially `admin_control_center:view`. The current
single-owner product grants that capability to the Owner while preserving existing Admin-role
compatibility during migration. The capability is designed for later modular RBAC without making
this PRD the owner of identity, grants, or account security.

This PRD is a UI composition contract only. DevTicket workflow, Runner behavior, Review, GitHub,
integrations, runtime, incidents, secrets, skills, identity, usage accounting, and command semantics
remain governed by their owning PRDs, ADRs, and bounded contexts.

## User Stories

1. As an Owner, I want the Admin Control Center to be the first admin page I see, so that the most
   important development and platform information is available immediately.
2. As an Owner, I want the first section to show items that require my action, so that approvals,
   blockers, and repairs are not buried beneath passive metrics.
3. As an Owner, I want active delivery shown after my action queue, so that I can understand what
   agents and humans are currently advancing.
4. As an Owner, I want development readiness shown after active delivery, so that I can see whether
   the platform can safely continue the displayed work.
5. As an Owner, I want recent activity last in the reading flow, so that historical context supports
   rather than displaces current decisions.
6. As an Owner, I want Admin Overview and Dev Board Summary to remain separate views, so that
   platform-wide priorities are not confused with DevTicket workflow detail.
7. As an Owner, I want the shell to render even when runtime sources are unhealthy, so that I can
   still navigate to diagnosis and repair surfaces.
8. As an Owner, I want each Overview section to fail independently, so that one unavailable source
   does not erase verified information from other sources.
9. As an Owner, I want stale information labeled as stale, so that I do not mistake an old snapshot
   for current reality.
10. As an Owner, I want unknown information labeled as unknown rather than zero, so that missing
    evidence cannot create false confidence.
11. As an Owner, I want unavailable information to retain its last-known-good marker when one
    exists, so that I can distinguish historical evidence from a live reading.
12. As an Owner, I want not-configured capabilities distinguished from unhealthy capabilities, so
    that setup work is not presented as an outage.
13. As an Owner, I want forbidden information distinguished from empty information, so that access
    denial cannot masquerade as absence of work.
14. As an Owner, I want visible summary facts to identify their owning source and observation time,
    so that I can judge their authority and freshness.
15. As an Owner, I want a direct path from a summary item to its owning detail surface, so that I
    can inspect it without hunting through the application.
16. As an Owner, I want summary actions to execute through the owning context, so that the Overview
    cannot bypass the policy or workflow of the source feature.
17. As an Owner, I want a stable sidebar while section data loads, so that navigation never jumps or
    disappears during cross-context requests.
18. As an Owner, I want Ask Admin Opzava pinned above grouped navigation, so that assistance is
    always reachable without redefining its separately governed behavior.
19. As an Owner, I want **Overview**, **Dev Board**, **Runners**, and **Environments** grouped under
    **Develop**, so that product development and its execution locations are easy to find.
20. As an Owner, I want **Gateway**, **Models & Providers**, **Agents**, **Runtime Skills**,
    **Sessions & Runs**, and **Automations** grouped under **AI Runtime**, so that runtime
    capability is organized separately from development workflow.
21. As an Owner, I want **Health**, **Incidents**, **Logs**, and **Usage & Costs** grouped under
    **Operate**, so that live operational posture and consumption are visible together.
22. As an Owner, I want **Integrations**, **Engineering Skills**, **MCP Servers**, **Secrets**,
    **Security & Audit**, and **Settings** grouped under **Configure**, so that administrative setup
    has a predictable home.
23. As an Owner, I want no CRM, Marketing, or Finance destinations in the Admin Control Center, so
    that the admin dashboard stays focused on developing and operating Opzava.
24. As an Owner, I want **Usage & Costs** treated as operational visibility, so that its placement
    does not imply that this shell owns billing or plan semantics.
25. As an Owner, I want the product-facing runtime name to remain **Opzava**, so that internal fork
    terminology does not leak into navigation.
26. As an Owner, I want a maximum of two visible sidebar levels, so that the hierarchy remains
    scannable as more leaf pages are specified.
27. As an Owner, I want only destinations needing action to carry badges, so that navigation counts
    remain meaningful rather than decorative.
28. As an Owner, I want the active destination clearly marked, so that I always know where I am.
29. As an Owner, I want deep links to restore the correct active destination and content, so that
    bookmarked and Slack-linked admin work opens in context.
30. As an Owner, I want revoked or unauthorized deep links to return a real 403, so that access loss
    never looks like an empty page.
31. As an Owner, I want search and command-palette results filtered to my current grants, so that
    hidden destinations and records cannot leak through discovery.
32. As an Owner, I want global search reachable from the top bar and by keyboard, so that I can move
    quickly between admitted Admin destinations.
33. As a keyboard user, I want the sidebar, global search, command results, menus, and cards
    operable without a mouse, so that the whole Admin shell is usable from the keyboard.
34. As a screen-reader user, I want every icon-only destination and control to have an accessible
    name, so that compact mode does not remove meaning.
35. As a screen-reader user, I want the current route, expanded groups, badge meanings, freshness,
    and status text announced semantically, so that the shell does not depend on color or position.
36. As a low-vision user, I want light and dark themes to meet WCAG AA contrast, so that status and
    navigation remain readable.
37. As a user with motion sensitivity, I want reduced-motion preferences honored, so that sidebar,
    Sheet, and state transitions do not cause discomfort.
38. As an Owner, I want light, dark, and system appearance choices, so that the Admin Control Center
    follows my working environment.
39. As an Owner, I want system appearance to react when the operating-system theme changes, so that
    the shell remains consistent without manual switching.
40. As an Owner, I want desktop compact state persisted on this device, so that my preferred density
    survives navigation and refresh.
41. As an Owner, I want sidebar group expansion state persisted on this device, so that the shell
    reopens in the organization I chose.
42. As a keyboard user, I want compact sidebar destinations to expose correctly positioned tooltips,
    so that icon navigation remains understandable without pointer-only behavior.
43. As a mobile Owner, I want the sidebar to open as a modal Sheet, so that the main content retains
    the full narrow viewport.
44. As a mobile Owner, I want the background inert while the navigation Sheet is open, so that focus
    and assistive technology cannot escape behind the dialog.
45. As a mobile Owner, I want focus trapped inside the open Sheet and restored to its trigger when
    it closes, so that navigation remains predictable.
46. As a mobile Owner, I want Escape and the scrim to close the Sheet, so that dismissal uses
    familiar dialog behavior.
47. As a mobile Owner, I want primary controls to meet touch-target guidance, so that the shell is
    practical on a phone.
48. As a mobile Owner, I want the Admin shell to avoid horizontal overflow at 320 CSS pixels, so
    that cards and navigation never require unintended side-scrolling.
49. As an Owner, I want the top bar to contain the sidebar trigger, global search, health,
    attention, appearance, and account controls in a stable order, so that common controls are
    predictable.
50. As an Owner, I want the health pill to report capability and platform readiness only, so that
    its meaning is not diluted by action counts.
51. As an Owner, I want an adjacent attention inbox and count, so that actionable work is visible
    without changing the meaning of health.
52. As an Owner, I want health to remain unknown when required evidence is unknown, so that missing
    checks cannot produce a green status.
53. As an Owner, I want degraded health to explain which capability is affected, so that I can open
    the correct owning surface.
54. As an Owner, I want the attention count to include only authorized, currently actionable items,
    so that it does not become a generic activity counter.
55. As an Owner, I want attention entries to retain source-specific labels and actions, so that the
    shell does not flatten unlike approvals, incidents, and setup needs into one fake workflow.
56. As an Owner, I want loading, clear, active, and error states for the Overview, so that each
    normal condition has deliberate copy and structure.
57. As an Owner, I want an empty attention state that confirms there is nothing requiring me, so
    that silence is distinguishable from a failed request.
58. As an Owner, I want partial errors to show retry or owning-surface actions without raw stack
    traces, so that recovery is useful and safe.
59. As an Owner, I want **Active Delivery** to summarize current Sprint and ordinary Board work
    without becoming the authority for either, so that I can observe parallel activity in one place.
60. As an Owner, I want Runner capacity presented using the rules governed by the Dev Board
    contract, so that the Overview cannot invent a competing concurrency policy.
61. As an Owner, I want the current Active Sprint goal visible when authorized and available, so
    that autonomous work remains tied to its declared outcome.
62. As an Owner, I want a separately claimed non-Sprint ticket visible when it runs alongside the
    Sprint, so that ordinary work is not hidden by autonomous delivery.
63. As an Owner, I want Docker Review exclusivity visible as capacity/readiness evidence, so that a
    queued review is not mistaken for an idle Runner.
64. As an Owner, I want **Development Readiness** to compose GitHub, Runner, local Docker Review,
    reviewer, Gateway, and notification-channel readiness only when supplied by their owners, so
    that the section reflects verified capability rather than shell guesses.
65. As an Owner, I want a capability that has never been configured shown as not configured, so that
    onboarding and outage states remain distinct.
66. As an Owner, I want recent activity assembled from authorized source events, so that I can
    follow important changes without creating a second audit ledger.
67. As an Owner, I want each recent-activity row to retain actor, source, event time, and
    destination, so that its meaning remains traceable.
68. As an Owner, I want activity ordering to be deterministic across sources, so that refreshes do
    not randomly reorder events with equal timestamps.
69. As a security reviewer, I want every composed source query to apply its own ACL, RLS, and
    redaction rules, so that the Overview cannot broaden access by aggregation.
70. As a security reviewer, I want summary caches separated by tenant, user, grant version, and
    schema version, so that one principal cannot receive another principal's composition.
71. As a security reviewer, I want authorization changes to invalidate affected cached compositions,
    so that revoked access does not persist until a normal freshness timeout.
72. As a security reviewer, I want the Overview to exclude secrets, raw provider DTOs, unredacted
    errors, hidden reasoning, and raw tool output, so that convenience does not create a leakage
    seam.
73. As a security reviewer, I want every mutation launched from the shell to reauthorize in its
    owning context, so that rendering an action never becomes proof of permission to execute it.
74. As an authorization maintainer, I want Admin Control Center access represented by an explicit
    capability, so that future modular RBAC does not depend on hard-coded navigation assumptions.
75. As the current single Owner, I want existing Admin access to remain compatible during migration,
    so that adopting the new capability does not lock me out.
76. As a later organization administrator, I want modular grants to admit only authorized Admin
    destinations, so that the shell can evolve beyond the current single-owner product.
77. As a developer, I want the Overview to be a rebuildable request-scoped query rather than durable
    truth, so that source contexts remain authoritative.
78. As a developer, I want every composed item to carry a source version or checkpoint, so that data
    from unlike sources can be reasoned about explicitly.
79. As a developer, I want every composed item to carry source and observation timestamps, so that
    transport delay is distinguishable from old source data.
80. As a developer, I want every composed item to declare its freshness boundary, so that live and
    stale states are derived consistently.
81. As a developer, I want verified subsections to render during partial failure, so that resilience
    does not require manufacturing a global status.
82. As a developer, I want the shell and composition behavior proven at an authenticated product
    seam, so that tests protect user-visible authorization, provenance, and state behavior.
83. As a developer, I want real local Docker browser verification for the Admin shell, so that
    responsive behavior, focus, theme, and cross-source display are observed in the closest local
    development environment.

## Implementation Decisions

### Product and authority boundary

- PRD-020 owns only the Admin shell, Admin route admission and presentation, the exact sidebar
  placement of admitted leaf destinations, the Admin Overview composition contract, top-bar
  composition, responsive behavior, theme behavior, and shell-owned accessibility semantics.
- PRD-020 does not introduce a bounded context, aggregate, durable workflow, event ledger, or source
  of truth. The Admin Overview is a read-only composition over facts supplied by existing owners.
- A Card, metric, activity row, badge, or readiness result shown by the shell remains a projection
  of its owning context. Presentation in Admin Overview transfers no authority to PRD-020.
- Ask Admin Opzava is pinned by this shell, but its conversation, orchestration, broker, tool, and
  approval behavior remains separately governed. This PRD owns only its placement and admission.
- The visible product name is **Opzava**. Internal source/fork names are not sidebar destinations or
  product-facing runtime labels.

### Leaf-owner matrix

The shell owns placement and links. The following owners define leaf data, commands, setup flows,
health semantics, workflow, and acceptance criteria.

| Shell placement | Leaf destination or composed fact                             | Owning contract/context                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pinned          | Ask Admin Opzava                                              | PRD-005 and its current Wayfinder work                                                                                                                                                                       |
| Develop         | Overview                                                      | PRD-020 for composition only; every source row retains its owner below                                                                                                                                       |
| Develop         | Dev Board                                                     | PRD-019 and ADR-017                                                                                                                                                                                          |
| Develop         | Runners                                                       | PRD-019 and ADR-017 for DevTicket execution; Runtime Control/Platform Ops for machine/platform lifecycle outside DevTicket semantics                                                                         |
| Develop         | Environments                                                  | Runtime Control/Platform Ops; PRD-019 and ADR-017 only where local Docker Review evidence is consumed by Dev Board                                                                                           |
| AI Runtime      | Gateway                                                       | PRD-013 and Runtime Control/Platform Ops                                                                                                                                                                     |
| AI Runtime      | Models & Providers                                            | PRD-013 and Runtime Control/Platform Ops                                                                                                                                                                     |
| AI Runtime      | Agents                                                        | PRD-006; PRD-007 where knowledge or skill projections are shown                                                                                                                                              |
| AI Runtime      | Runtime Skills                                                | PRD-007; Runtime Control/Platform Ops for runtime admission and provisioning                                                                                                                                 |
| AI Runtime      | Sessions & Runs                                               | PRD-006 and Runtime Control/Platform Ops                                                                                                                                                                     |
| AI Runtime      | Automations                                                   | PRD-006 and Runtime Control/Platform Ops; v1 is limited to Opzava runtime automation visibility and the reserved destination, not business workflow design                                                   |
| Operate         | Health                                                        | PRD-012, PRD-018, and Runtime Control/Platform Ops                                                                                                                                                           |
| Operate         | Incidents                                                     | PRD-012 and PRD-018                                                                                                                                                                                          |
| Operate         | Logs                                                          | PRD-012 and PRD-018                                                                                                                                                                                          |
| Operate         | Usage & Costs                                                 | Runtime Control/Platform Ops and the relevant usage/entitlement owner; this placement does not transfer billing authority to PRD-020                                                                         |
| Configure       | Integrations                                                  | PRD-013, limited in this Admin shell to Opzava development/platform integrations such as GitHub and Slack Personal Assistant delivery; future customer/business connections do not become Admin destinations |
| Configure       | Engineering Skills                                            | PRD-007                                                                                                                                                                                                      |
| Configure       | MCP Servers                                                   | PRD-013; PRD-007 where a managed skill contributes callable capability                                                                                                                                       |
| Configure       | Secrets                                                       | PRD-013 and Runtime Control/Platform Ops; PRD-001 for identity step-up and account-security prerequisites                                                                                                    |
| Configure       | Security & Audit                                              | PRD-001 for identity/account security; PRD-012/PRD-018 and Platform Ops for operational audit projections                                                                                                    |
| Configure       | Settings                                                      | PRD-001 for account/profile settings; the owning leaf PRD or Runtime Control/Platform Ops for all other settings                                                                                             |
| Top bar         | Account/profile menu                                          | PRD-001; PRD-020 owns placement only                                                                                                                                                                         |
| Overview        | DevTicket, Sprint, Runner, Review, GitHub, and delivery facts | PRD-019 and ADR-017                                                                                                                                                                                          |
| Overview        | Integration and MCP readiness                                 | PRD-013                                                                                                                                                                                                      |
| Overview        | Agent, session, automation, and runtime-skill facts           | PRD-006, PRD-007, and Runtime Control/Platform Ops as applicable                                                                                                                                             |
| Overview        | Health, incident, log, and remediation facts                  | PRD-012 and PRD-018                                                                                                                                                                                          |

No leaf-page design may infer missing semantics from its sidebar label. Where two owners are listed,
the leaf's Wayfinder work must resolve the exact boundary before it becomes implementation-ready.

### Information architecture

- The Admin sidebar has one pinned entry followed by four groups with these exact labels and order:
  - **Ask Admin Opzava** (pinned)
  - **Develop:** Overview; Dev Board; Runners; Environments
  - **AI Runtime:** Gateway; Models & Providers; Agents; Runtime Skills; Sessions & Runs;
    Automations
  - **Operate:** Health; Incidents; Logs; Usage & Costs
  - **Configure:** Integrations; Engineering Skills; MCP Servers; Secrets; Security & Audit;
    Settings
- The visible hierarchy is limited to group and leaf destination. A leaf may own tabs, filters, or
  drill-down navigation inside its page, but those do not become a third sidebar level.
- CRM, Marketing, Finance, and other user-dashboard/business destinations are absent from the Admin
  shell. This absence is intentional, not a temporary empty state.
- **Usage & Costs** is located under **Operate** as operational visibility. The label and placement
  do not define billing, plan, quota, or entitlement semantics.
- Only destinations with current actionable items receive badges. Static inventory counts,
  informational totals, and decorative badges are not shown in navigation.
- Active route, expanded groups, compact state, and admitted leaf set are derived independently. A
  remembered UI state cannot admit a revoked route.

### Authorization and route admission

- Root access to the Admin Control Center requires `admin_control_center:view` or its eventual
  canonical authorization equivalent.
- In the current single-owner product, Owner receives the capability. Existing Admin-role behavior
  remains compatible during migration so the shell change cannot strand a valid administrator.
- The capability is an admission gate, not blanket access to every leaf or composed source. Each
  leaf route and every source query applies its own current authorization, tenant scope, ACL/RLS,
  and redaction policy.
- A denied Admin root or deep link returns 403. It never returns a misleading empty shell, empty
  section, zero count, or not-configured state.
- Global search and command-palette results include only admitted routes, records, and actions. A
  result is not authorization to act; the owning context reauthorizes every command.
- Route and command caches are invalidated when membership, grant, role, tenant, or relevant policy
  versions change.

### Overview composition contract

- Variant A is the canonical Overview structure, in this exact order:
  1. **Needs Your Attention**
  2. **Active Delivery**
  3. **Development Readiness**
  4. **Recent Activity**
- Admin Overview is not Dev Board Summary. Dev Board Summary remains the workflow-focused view owned
  by PRD-019; Admin Overview composes the administrator's cross-context priorities.
- Overview data is produced by a request-scoped, rebuildable composition query. It is not persisted
  as a competing truth store or treated as an audit/event ledger.
- The stable shell context and route admission render independently from runtime source health.
  Unavailable runtime composition cannot remove navigation needed to inspect or repair it.
- Every admitted section result and every independently actionable/result row carries, directly or
  through a shared envelope:
  - source owner and source identifier;
  - provenance sufficient to deep-link or diagnose the projection;
  - source version, revision, sequence, or checkpoint appropriate to that owner;
  - source timestamp;
  - `observedAt` timestamp;
  - `staleAfter` boundary;
  - state: `live`, `stale`, `unknown`, `unavailable`, or `not-configured`;
  - whether the visible value is last-known-good rather than live.
- `stale` means a previously verified value crossed its declared freshness boundary. `unknown` means
  the system lacks sufficient evidence to determine the value. `unavailable` means a required source
  could not answer. `not-configured` means an admitted capability has no configuration. None of
  these states becomes `live`, `healthy`, or numeric zero by fallback.
- Expected authorization denial is decided before source fan-out. The denied source is not queried,
  and any generic restricted placeholder reveals no source existence, identity, count, timestamp,
  last-known-good value, or deep link. An unexpected downstream 403 is a security/contract failure,
  not a displayable source result.
- A section may render verified rows while sibling sources are stale, unknown, unavailable, not
  configured, or forbidden. The section must expose partial status rather than invent a single
  verified aggregate.
- Cross-source ordering uses source event time and a deterministic tie-breaker such as source owner
  plus stable source identity. Receipt/observation time may be shown separately and never silently
  replaces source event time.
- Any composition cache is keyed at minimum by tenant, user, grant version, and composition schema
  version. It is invalidated by authorization changes and may not extend a source fact beyond its
  declared freshness without labeling it stale/last-known-good.
- Admission uses `AuthorizationPort` and tenant scope before fan-out. Source adapters then apply
  their own ACL, Postgres RLS where applicable, broker ACL for OpenClaw reads, field redaction, and
  tenant boundaries before data enters the composition. The composer performs defense-in-depth
  filtering but is not allowed to weaken an owner's policy.
- The query and UI exclude raw secrets, secret values, raw provider/Gateway DTOs, unredacted errors,
  hidden reasoning, raw prompts, raw tool output, and raw Gateway/OpenClaw references. Only
  owner-classified browser-safe Opzava projection identifiers, redacted diagnostics, and admitted
  owning-surface deep links are allowed.
- Every mutation invoked from an Overview action routes to the owning application command and
  reauthorizes there. The composition query never mutates its source contexts.

### Health and attention semantics

- The top-bar health pill reports capability/platform readiness only. It may summarize verified
  readiness supplied by Health, Platform Ops, GitHub/Dev Board, Runner, environment, Gateway, or
  other owners, but it does not count approvals or other human work.
- The adjacent attention inbox/count reports authorized items that currently require the human's
  action. It may compose source-owned approval, conflict, incident, setup, or repair pointers, but
  it does not define their workflow.
- Health and attention are separate controls, accessible names, state calculations, and deep-link
  destinations. A non-zero attention count does not make the platform unhealthy, and healthy
  infrastructure does not imply an empty attention inbox.
- Unknown, stale, unavailable, or forbidden required health evidence prevents a verified healthy
  assertion at the affected scope. The UI names the uncertainty instead of showing healthy.

### Sidebar, top bar, appearance, and responsive contract

- Use the shadcn Radix Sidebar composition with `variant="sidebar"` and `collapsible="icon"` for the
  desktop Admin shell.
- Desktop compact state and group expansion state are per-device presentation preferences. They
  persist across route changes and reloads but confer no authorization and are discarded or repaired
  when they reference a removed group or destination.
- Every icon-only item has an accessible name. Compact items provide keyboard- and pointer-triggered
  tooltips that render outside clipped containers and do not replace the accessible name.
- On mobile, navigation is a modal Sheet/dialog. While open it provides a focus trap, inert/hidden
  background, Escape and scrim dismissal, and focus restoration to the trigger. Closing after route
  selection moves focus to the destination's main heading or other deliberate route target.
- The shell supports light, dark, and system appearance. System mode follows operating-system
  preference changes. Preferences do not create flashes that expose unstyled or unauthorized
  content.
- All shell states support 320 CSS pixels and wider without unintended horizontal overflow. Touch
  controls follow accessible target sizing, content reflows rather than truncating required status,
  and desktop compact mode is not reused as the mobile navigation model.
- Components meet WCAG AA contrast, expose text/glyph status beyond color, provide visible focus,
  preserve semantic heading/landmark order, and honor `prefers-reduced-motion`.
- The top bar has this composition: sidebar trigger; global search/command entry; health;
  attention/notifications; appearance; account.
- PRD-020 owns only placement of appearance and account controls. PRD-001 owns account, session,
  profile-security, and identity behavior.

### Display of Runner capacity

- Admin Overview may display Runner capacity, but capacity and concurrency rules are defined only by
  the amended PRD-019 and ADR-017 contracts.
- The shell reflects, without redefining, that capacity is per enrolled Runner; at most one Sprint
  is Active; and Balanced provides two total implementation leases. While a Sprint is Active, one
  lease serves its serial Sprint item and at most one serves an explicitly claimed Ready non-Sprint
  ordinary DevTicket in a separate branch/worktree. With no Active Sprint, up to two eligible
  ordinary tickets may run. Sprint activation waits rather than terminating running ordinary work,
  and the shared local Docker Review environment remains exclusive through its separate lease.
- The shell must label Sprint implementation, ordinary claimed work, and Docker Review occupancy as
  distinct capacity facts. It may not infer that a free implementation slot makes the exclusive
  Review environment available.

### Prototype status and leaf-page planning

- The approved Variant A prototype is structural evidence for hierarchy, reading order, density,
  responsive intent, shell controls, and normal UI states. Its fake people, tasks, counts, health,
  timestamps, and activity are non-normative fixtures.
- Unresolved leaf-page layouts, setup journeys, configuration forms, and command workflows remain
  Wayfinder work owned by their respective product contracts. A sidebar label is not an approved
  leaf-page specification.
- This PRD stays in planning/backlog status until the Admin Wayfinder map resolves the leaf
  boundaries and publishes explicitly approved implementation tickets. It makes no ready-for-agent
  claim.

## Testing Decisions

- The highest stable automated seam is an authenticated Admin composition snapshot: admitted shell
  navigation plus the Overview response/render contract for a real tenant/user/grant context. Tests
  assert external authorization, provenance, freshness, partial-state, ordering, redaction, and
  presentation behavior rather than private adapter or component implementation.
- The highest user-visible seam is a real browser drive against the local Docker stack with ordinary
  authentication and real seeded tenant/workspace data. It must verify the exact shell and Overview
  behavior at desktop and mobile breakpoints; a static prototype alone is not acceptance evidence.
- Authorization tests cover Owner admission, preserved Admin compatibility during migration, missing
  root capability, per-leaf denial, per-source denial, grant revocation, stale cached grants, tenant
  separation, authorized search results, unauthorized deep links, and 403 rather than empty or zero
  results. They prove denied sources are not queried and generic restricted presentation discloses
  no existence, identifier, count, timestamp, last-known-good value, or deep link.
- Composition contract tests cover source owner, provenance, source version/checkpoint, source
  timestamp, `observedAt`, `staleAfter`, availability state, and last-known-good marker for every
  independently rendered admitted result shape. Unexpected downstream 403 responses are tested as
  security/contract failures rather than source-state envelopes.
- Freshness tests prove that crossing `staleAfter` changes a live value to stale without changing
  its underlying value, that unknown is not zero, and that unavailable/not-configured/forbidden
  remain distinct states.
- Partial-failure tests make each source fail independently and in combinations. Verified sections
  and rows continue to render, the shell remains navigable, and no synthetic global healthy/empty
  state is produced.
- Cache tests prove tenant/user/grant-version/schema-version key isolation, authorization-change
  invalidation, and rejection of cached values that would be mislabeled as live after their
  freshness boundary.
- Security tests inspect rendered HTML, serialized page data, logs visible to the browser, error
  disclosures, search results, and network responses for secret values, raw provider/Gateway DTOs,
  unredacted errors, hidden reasoning, raw prompts, and raw tool output.
- Mutation-link tests prove that every Overview action reaches the owning command seam and that the
  owner reauthorizes it. No test treats visible action state as sufficient command authorization.
- Health/attention tests prove that a healthy platform may have non-zero attention, that an empty
  attention inbox may coexist with degraded health, that unknown health evidence cannot render as
  healthy, and that the two controls have separate accessible names and destinations.
- Navigation tests cover the exact pinned item, group labels, group order, leaf labels, leaf order,
  active state, attention-only badges, maximum two visible levels, deep links, browser back/forward,
  reload restoration, and deliberate absence of CRM, Marketing, and Finance.
- Search/command tests cover keyboard invocation, authorized result filtering, type/source labels,
  route activation, forbidden-result non-disclosure, and reauthorization of any resulting command.
- Overview content tests assert the exact Variant A order and prove that Admin Overview does not
  duplicate or relabel Dev Board Summary as its own source.
- Delivery/readiness tests use source-owned fixtures to show one Active Sprint, its serial Sprint
  lease, one explicitly claimed Ready ordinary ticket in separate branch/worktree under Balanced
  capacity, and the exclusive Docker Review lease without redefining those policies in shell code.
- State tests cover active, clear, loading, error, live, stale, unknown, unavailable,
  not-configured, forbidden, and last-known-good presentations. Clear state is verified as real
  successful emptiness, not a failed or forbidden request.
- Responsive browser tests cover at least 320, 390, 768, 1024, and 1440 CSS pixels, including no
  unintended horizontal overflow, readable required status, adequate touch targets, and stable
  heading/landmark order.
- Mobile Sheet tests cover dialog semantics, inert background, focus trap, Escape, scrim dismissal,
  route selection, focus restoration, and no off-canvas navigation exposed to the accessibility tree
  while closed.
- Desktop sidebar tests cover expanded and compact modes, persisted group state, icon accessible
  names, portal tooltips by keyboard and pointer, current-route state, and recovery from obsolete
  stored preferences.
- Theme tests cover explicit light, explicit dark, initial system preference, live operating-system
  theme change, persisted preference, contrast, status meaning without color, visible focus, and
  reduced motion.
- Cross-source consistency tests use known checkpoints and timestamps to prove deterministic Recent
  Activity ordering, correct last-known-good labeling, and no merging of unlike source events into a
  fabricated workflow fact.
- Browser verification captures high-signal screenshots for approved desktop expanded/compact,
  mobile Sheet, light/dark, partial-failure, and clear states and compares structure against the
  approved Variant A evidence. Pixel parity is not used to make fake prototype fixture values
  normative.
- These tests define the future acceptance bar. They do not claim the target behavior is currently
  implemented.

## Out of Scope

- Creating a new Admin bounded context, Admin aggregate, durable Admin truth store, workflow engine,
  event ledger, command authority, or replacement authorization system.
- Defining or changing DevTicket, Proposal, Ready Contract, Sprint, dependency, assignment, Review,
  release, GitHub synchronization, merge, or evidence-package semantics owned by PRD-019/ADR-017.
- Defining Runner enrollment, fencing, execution, checkpoint, reconnect, trust, cloud/local routing,
  branch/worktree, or local Docker Review semantics beyond displaying owner-supplied facts.
- Designing the Dev Board Summary, Board, List, Sprints, Docs, Development, Releases, or Card-detail
  surfaces.
- Defining GitHub App enrollment, webhook processing, reconciliation, integration health, PR, check,
  commit, merge, approval, or conflict behavior.
- Defining Gateway, provider/model, channel, integration, local-agent enrollment, MCP-server,
  automation, environment, Runtime Skill, Engineering Skill, or Opzava runtime setup flows.
- Defining agent identities, model selection, session/run lifecycle, tool policy, skill execution,
  personal-assistant behavior, research, prototyping, planning, implementation, Deepening Module, or
  code-review workflow.
- Defining incident lifecycle, remediation commands, log retention, alert policy, health-check
  implementation, usage accounting, cost policy, billing, quota, plan, or entitlement semantics.
- Defining secrets storage, reveal, rotation, injection, credential-request, or approval semantics.
- Defining account, profile, MFA, passkey, invitation, session, role, grant, security-policy, or
  audit semantics beyond shell admission and placement of their owning pages.
- Redesigning Ask Admin Opzava or changing the existing GitHub issue and PRD/Wayfinder authority for
  its chat, orchestration, and assistant behavior. PRD-020 alone owns its Admin-shell placement.
- Adding CRM, Marketing, Finance, customer-support, or other future user-dashboard/business
  destinations to the Admin Control Center.
- Finalizing any leaf-page layout, setup form, wizard, configuration defaults, or mutation UX before
  its Wayfinder work resolves the owning contract and receives human approval.
- Treating the approved static prototype as evidence that production data, authorization, routes,
  commands, or runtime integration already exist.

## Further Notes

- Approved structural evidence: commit `0dd1bff305e4049d506b997330c5039485107798` on branch
  `prototype/admin-shell-v1`, file `apps/web/public/prototypes/admin-shell-v1.html`, query
  `?variant=A`.
- The prototype's fake data, actor names, DevTicket numbers, Sprint progress, counts, health values,
  timestamps, and recent events are demonstration fixtures only. The normative decisions are the
  shell structure, exact navigation hierarchy, top-bar composition, Overview order, responsive
  interaction intent, and state vocabulary restated in this PRD.
- Variant B and Variant C remain discarded exploration, not alternate production layouts.
- PRD-020 narrows and supersedes older full/admin-shell navigation assumptions only for the Admin
  Control Center. It does not alter the Essential/user-dashboard shell or move business surfaces
  into Admin.
- The Admin Wayfinder must resolve leaf-page ownership overlaps, setup/configuration journeys,
  admission capabilities beyond the root, route inventory, source adapters, freshness budgets, and
  implementation slices before any leaf is marked ready.
- This PRD is canonical planning input and remains in Backlog/planning. It is intentionally not
  labeled or described as ready for autonomous implementation.
