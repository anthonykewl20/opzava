# 03 — Information Architecture & Navigation Redesign

**Status**: Proposal — not yet implemented  
**Depends on**: 01-design-tokens.md, 02-shell-chrome.md  
**Governs**: `src/components/layout/nav-rail.tsx`, `src/app/[[...panel]]/page.tsx`, header section label

---

## Current IA Problems

The nav as shipped has four structural defects that compound each other.

### Redundancy and Ambiguity Table

| Conflict | Nav entries | Panel components | Problem | Law |
|---|---|---|---|---|
| Cost duplicate | `cost-tracker` "Cost Tracker" + `costs` "Costs" | `CostTrackerPanel` / `OpsCostsPanel` | Near-identical labels; users cannot choose correctly without trial-and-error | Hick's Law — parallel choices with no differentiation add ~150 ms decision time per doubling |
| Approval duplicate | `exec-approvals` "Approvals" + `approval-queue` "Approval Queue" | `ExecApprovalPanel` (gateway-only, live) / `ApprovalQueuePanel` (general queue) | Both labels signal the same intent; functional difference is invisible at scan time | Jakob's Law — labels must match the mental model, not the implementation detail |
| Activity/monitor overlap | `activity`, `logs`, `monitor`, `office` all in OBSERVE | `ActivityFeedPanel`, `LogViewerPanel`, `SystemMonitorPanel`, `OfficePanel` | Four items answering overlapping "what is happening?" questions with no distinction between real-time stream vs. historical log vs. spatial view | Miller's Law — four undifferentiated concepts collapse into one mental bucket, forcing serial elimination |
| Cost sub-paths | Route aliases `tokens` and `agent-costs` both redirect to `CostTrackerPanel` | One panel, three routes | Alias routes signal that past renaming left dead paths; increases URL space confusion if linked externally | Jakob's Law (consistency and standards) |

### OBSERVE Group Exceeds Miller's Law (P0)

`navGroups[observe].items` contains **12 entries** — nearly double the 7±2 cognitive budget. The label "OBSERVE" is accurate for `activity / logs / monitor / failures` but actively misleading for `costs / cost-tracker / approval-queue / exec-approvals / content-runs / artifacts / office`. Users must scan all 12 to find their target, compounding decision time logarithmically (Hick's Law: RT = a + b·log₂(13)).

### CORE Group Sheds Latent Items (P1)

`navGroups[core]` has 8 items. `channels`, `skills`, and `memory` are resource-configuration concerns, not operational destinations. Mixing them with `agents / tasks / chat` (action-oriented) forces users to apply different mental models within one unlabeled group (Gestalt similarity — items that look alike must be alike).

### Hidden and Orphaned Panels (P1)

Three routable panels have no nav entry:

| Panel ID | Component | Current path to reach it |
|---|---|---|
| `notifications` | `NotificationsPanel` | Bell icon in header (absent when count = 0) |
| `standup` | `StandupPanel` | Direct URL only — no documented UI path |
| `super-admin` | `SuperAdminPanel` | Click an unlinked OS user row in the context-switcher popover |

Zero-state access (no unread notifications, no unlinked users) makes two of these panels completely unreachable from the UI (Jakob's Law — users expect reachable destinations from standard navigation).

### Essential/Full Toggle Buried (P1)

The Essential/Full mode switch — the primary complexity-reduction tool — is 3 interactions deep inside the context-switcher popover, rendered at `text-[11px]`. Tesler's Law: the control that absorbs complexity for the user must not itself be complex to locate.

### Collapsed Icon Ambiguity (P2)

`TasksIcon`, `LogsIcon`, and `SkillsIcon` share identical outer rect + inner `M5 5h6M5 8h6M5 11h3` path. At the collapsed 20×20 px icon slot they are perceptually indistinguishable (Gestalt similarity — distinct items must look distinct). Collapsed button hit targets are 40×40 px — 4 px below the Fitts's Law / WCAG 2.5.5 44 px minimum.

### Cmd-K Hint Hidden Below XL (P3)

The `⌘K` and `/` shortcut hints are wrapped in `hidden xl:flex` — invisible on every screen narrower than 1280 px. The shortcut that enables the fastest navigation path is unknown to users on 13-inch laptops (Doherty Threshold — sub-400 ms navigation requires users to know the path exists).

---

## Redesigned Navigation

### Governing Constraints

- **Miller's Law**: ≤7 visible items per nav group; ≤5 for complex decision contexts.
- **Hick's Law**: every added choice multiplies decision time; prune mercilessly; use progressive disclosure for the rest.
- **Jakob's Law**: sidebar-left primary nav, top bar for global context — match Linear/Vercel conventions.
- **Gestalt proximity + common region**: group by the question the user is asking, not by the implementation domain.

### Five Top-Level Groups (down from 4 overcrowded groups)

| Group ID | Label | Item count | Rationale |
|---|---|---|---|
| `core` | _(no label)_ | 5 | Pure action destinations: Overview, Agents, Tasks, Chat, Team |
| `observe` | OBSERVE | 5 | Streams and logs: Activity, Logs, Monitor, Failures, Notifications |
| `ops` | OPS | 5 | Outcomes and queues: Approvals, Usage & Costs, Content Runs, Artifacts, Office |
| `automate` | AUTOMATE | 5 | Scheduled work: Campaigns, Cron, Webhooks, Alerts, GitHub |
| `admin` | ADMIN | 6 | Platform config: Settings, Security, Users, Audit, Gateway, Integrations |

Each group stays at or below 7 items (Miller). The old OBSERVE group splits into OBSERVE (streams) + OPS (outcomes), eliminating the misleading label for cost and approval items. CORE sheds channels/skills/memory into a RESOURCES sub-section exposed via progressive disclosure (see below).

### Resources Sub-Section (Progressive Disclosure)

`channels`, `skills`, `memory`, and `debug` are configuration resources, not operational destinations. They move under a collapsible "Resources" disclosure at the bottom of the CORE section — collapsed by default in Essential mode, expanded in Full mode. This matches the LogRocket Conditional Disclosure pattern: show only when the user has a configuration intent, not on every navigation scan.

### Essential / Full Mode

Essential mode is kept and improved. Changes from current implementation:

1. The toggle moves to a **persistent pill in the sidebar footer** — always visible at the bottom of the nav rail, one click to switch. No popover required. (Tesler's Law: absorb the complexity of mode-switching into the system.)
2. Minimum text size on the toggle: `text-sm` (14 px). Current 11 px is illegible.
3. On first login, an inline banner auto-suggests Essential mode: "New here? Essential mode shows only what you need to get started." with a single Accept CTA.
4. Essential set (revised): Overview, Agents, Tasks, Chat, Activity, Approvals, Settings — 7 items exactly at Miller's upper boundary.

### Cmd-K Command Palette

The command palette already works (`useEffect` Cmd+K handler). Three changes make it discoverable:

1. Show the `⌘K` hint at `md` breakpoint (1024 px), not `xl` (1280 px). This covers the common 13-inch laptop at 1280 px CSS width.
2. Add placeholder text `Search or jump… ⌘K` on all breakpoints where the search bar is visible.
3. Add a persistent `[` sidebar-toggle hint as a `title` attribute + visible tooltip on the toggle button.

### Section Headers and Breadcrumbs

The header's left slot currently shows workspace/project context but never the active panel name. This leaves users without location confirmation after navigation (Jakob's Law — match real-world conventions: every app shows where you are).

**Required addition**: derive a human-readable panel name from `activeTab` and render it as `<h1>` in the header left slot at `text-base` (16 px) weight 600. This replaces the need for each of the 44 panels to implement their own heading (currently only 6 do).

**Breadcrumb pattern** for nested states (agent detail, gateway config):

```
Overview > Agents > agent-name
```

Rendered as a single-line `<nav aria-label="Breadcrumb">` below the header — not a separate page section. Depth capped at 3 levels (LogRocket: 3 disclosure levels max).

---

## Panel → New-Nav Mapping

All 44 routable panels (from `page.tsx` switch cases) mapped to their new home. Merge and retire candidates flagged.

| Panel ID | Component | Current group | New group | New label | Action |
|---|---|---|---|---|---|
| `overview` | Dashboard | CORE | CORE | Overview | Keep, essential |
| `agents` | AgentSquadPanelPhase3 | CORE | CORE | Agents | Keep, essential |
| `tasks` | TaskBoardPanel | CORE | CORE | Tasks | Keep, essential |
| `chat` / `sessions` | ChatPagePanel | CORE | CORE | Chat | Keep, essential; alias `sessions` → `chat` |
| `team` | TeamDashboardPanel | CORE | CORE | Team | Keep |
| `channels` | ChannelsPanel | CORE | CORE → Resources | Channels | Move to Resources sub-section |
| `skills` | SkillsPanel | CORE | CORE → Resources | Skills | Move to Resources sub-section |
| `memory` | MemoryBrowserPanel | CORE | CORE → Resources | Memory | Move to Resources sub-section |
| `activity` / `history` | ActivityFeedPanel | OBSERVE | OBSERVE | Activity | Keep; alias `history` → `activity` |
| `logs` | LogViewerPanel | OBSERVE | OBSERVE | Logs | Keep, essential |
| `monitor` | SystemMonitorPanel | OBSERVE | OBSERVE | Monitor | Keep |
| `failures` | OpsFailuresPanel | OBSERVE | OBSERVE | Failures | Keep |
| `notifications` | NotificationsPanel | _(orphan)_ | OBSERVE | Notifications | **Promote to nav** (was header-only) |
| `exec-approvals` | ExecApprovalPanel | OBSERVE | OPS | Live Approvals | Rename; gateway-only badge |
| `approval-queue` | ApprovalQueuePanel | OBSERVE | OPS | Approval Queue | Rename for clarity |
| `cost-tracker` / `tokens` / `agent-costs` | CostTrackerPanel | OBSERVE | OPS | Usage & Costs | Rename; **retire** `tokens` and `agent-costs` aliases |
| `costs` | OpsCostsPanel | OBSERVE | OPS | _(merge candidate)_ | **Evaluate merge** with `cost-tracker` into a tabbed Usage & Costs panel; if distinct, label "Cost Breakdown" |
| `content-runs` | ContentRunsPanel | OBSERVE | OPS | Content Runs | Keep |
| `artifacts` | ArtifactsPanel | OBSERVE | OPS | Artifacts | Keep |
| `office` | OfficePanel | OBSERVE | OPS | Office | Keep; label is distinct enough |
| `campaigns` | CampaignsPanel | AUTOMATE | AUTOMATE | Campaigns | Keep |
| `cron` | CronManagementPanel | AUTOMATE | AUTOMATE | Cron | Keep |
| `webhooks` | WebhookPanel | AUTOMATE | AUTOMATE | Webhooks | Keep |
| `alerts` | AlertRulesPanel | AUTOMATE | AUTOMATE | Alerts | Keep |
| `github` | GitHubSyncPanel | AUTOMATE | AUTOMATE | GitHub | Keep |
| `settings` | SettingsPanel | ADMIN | ADMIN | Settings | Keep, essential |
| `security` | SecurityAuditPanel | ADMIN | ADMIN | Security | Keep |
| `users` | UserManagementPanel | ADMIN | ADMIN | Users | Keep |
| `audit` | AuditTrailPanel | ADMIN | ADMIN | Audit | Keep |
| `gateways` | MultiGatewayPanel / GatewayControlPanel | ADMIN → Gateway child | ADMIN | Gateway | Collapse `gateways` + `gateway-config` into one nav item with internal tabs |
| `gateway-config` | GatewayConfigPanel | ADMIN → Gateway child | ADMIN | _(tab inside Gateway)_ | **Merge into Gateway panel as tab** |
| `integrations` | IntegrationsPanel | ADMIN | ADMIN | Integrations | Keep |
| `super-admin` | SuperAdminPanel | _(orphan)_ | ADMIN | Super Admin | **Promote to nav** with admin-only guard |
| `debug` | DebugPanel | ADMIN | CORE → Resources | Debug | Move to Resources sub-section; admin-guard |
| `maintenance` | MaintenancePanel | ADMIN | ADMIN | _(merge candidate)_ | **Evaluate merge** into Settings → System tab; or keep as nav item if accessed frequently |
| `nodes` | NodesPanel | OBSERVE | ADMIN | Nodes | Reclassify — infrastructure topology is an admin concern, not an observation stream |
| `standup` | StandupPanel | _(orphan)_ | _(retire or promote)_ | Standup | **Decision required**: if actively used, add to CORE or OPS; if unused, remove from ContentRouter entirely |

### Merge / Retire Summary

| Decision | Items | Rationale |
|---|---|---|
| **Merge** | `cost-tracker` + `costs` → "Usage & Costs" with tabs | Two panels answering the same user question; Hick's Law — never show two items whose names differ only by suffix |
| **Merge** | `gateways` + `gateway-config` → "Gateway" with tabs | One destination, two panels; internal tabs are the correct disclosure level |
| **Retire aliases** | `tokens`, `agent-costs`, `history` | Dead URL aliases create parallel routes; consolidate to canonical IDs |
| **Promote** | `notifications`, `super-admin` | Orphaned panels must be reachable from standard navigation |
| **Evaluate** | `standup`, `maintenance` | Determine usage frequency before deciding to promote or retire |
| **Reclassify** | `nodes` | Infrastructure topology belongs under ADMIN, not OBSERVE |

---

## Defaults and Wayfinding

### Default Landing

The default panel is `overview`. This is correct and must be preserved. Overview satisfies the 3-second rule: users can answer "is everything okay?" from the KPI summary row before scrolling. Do not change the default.

### Active State

The active nav item requires three visible signals (Gestalt figure-ground):

1. A left border accent (3 px, `--color-primary`) on the nav item row.
2. Background fill: `bg-surface-1` (one step above the nav rail's `bg-surface-0`).
3. Text weight: `font-medium` on the label.

The current implementation uses only background color, which fails at low-contrast themes and provides no non-color cue (WCAG 1.4.1 — never color-only meaning).

### Recents

Add a "Recent" section above the nav groups showing the last 3 visited panels as ghost items. This:

- Reduces backtrack navigation cost by 1 click for repeat panel visits (Fitts's Law — shortest path wins).
- Emerges naturally from the existing `activeTab` history in the Zustand store.
- Collapses/hides when the sidebar is in icon-only mode (no label space).

Recents are session-only — do not persist to localStorage (avoids state entropy across multiple admin users sharing a browser).

### Breadcrumb and Section Title

As specified in the redesigned-navigation section: an `<h1>` in the header left slot, derived from a `panelLabels` map keyed on `activeTab`. Every panel gets a title without each panel implementing its own. The breadcrumb `<nav>` appears only when depth > 1 (e.g., inside an agent detail drawer or gateway config sub-view).

### Empty and Zero States

Each nav group heading must be visible even when all its panels are unavailable (e.g., local mode hides gateway-dependent panels). Unavailable items render as disabled with a `title="Requires gateway"` tooltip — not hidden. Hidden items violate Jakob's Law: if a user navigates to a panel via URL and sees a blank, the nav item being absent gives no explanation.

---

## Implementation Priority

| Priority | Change | Effort |
|---|---|---|
| P0 | Split OBSERVE into OBSERVE + OPS; enforce ≤7 per group | Low — nav array edit |
| P0 | Rename "Cost Tracker"/"Costs" and "Approvals"/"Approval Queue" to unambiguous labels | Low |
| P1 | Promote `notifications` and `super-admin` to nav | Low — add nav entries + admin guard |
| P1 | Move Essential/Full toggle to sidebar footer pill | Medium — layout change |
| P1 | Add `<h1>` section label to header left slot | Low |
| P1 | Show `⌘K` hint at `md` breakpoint | Low — Tailwind class change |
| P1 | Move `channels`, `skills`, `memory`, `debug` to Resources sub-section | Medium |
| P2 | Merge `gateways` + `gateway-config` into tabbed Gateway panel | Medium |
| P2 | Merge `cost-tracker` + `costs` into tabbed Usage & Costs panel | Medium |
| P2 | Differentiate Tasks/Logs/Skills icons | Low — SVG edit |
| P2 | Increase collapsed icon buttons to 44×44 px (`icon-lg` = `h-11 w-11`) | Low |
| P3 | Add Recents section (last 3 panels) | Medium |
| P3 | Resolve `standup` and `maintenance` fate | Requires product decision |
