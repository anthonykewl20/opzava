# Connections Overview: OpenClaw health - locked design

Status: design locked (grilling, 2026-07-13). Mockup authored; not yet built.
Tracks: #175 (parent), #176-#182 (children).
Governs the Connections **Overview** route (`/connections`). Supersedes parts of `docs/plan/connections-ia-redesign.md` (see "Amendments" below).

## Problem

The Overview reports a health number that is **semantically wrong**, and the redesign proposed to replace it contained **fabricated data**.

1. **The health denominator is meaningless.** `connectionHealthSummary` (`apps/web/lib/connections-state.ts:155`) builds its status list from every grouped model provider (29) + GitHub + Gateway = 31, and counts only `connected` as healthy. Today that renders **"1 of 31 healthy"**, because only the Gateway is connected. A provider you never connected is not *unhealthy* - it is *available*. The number also degrades every time a provider is added to the catalog: growing the catalog makes the system look sicker.

2. **The proposed mockup hallucinated reassuring numbers.** It showed `1 of 31 healthy (97%)` above a bar reading `30 Healthy | 1 Attention` - 1/31 is 3%, not 97% - and an `Active connections handled: 125` metric that does not exist. `GatewayConnectionState` (`packages/ports/src/connections-provisioning.ts:92`) carries exactly `status`, `region`, `authLabel`, `lastHeartbeatAt`, `message`.

3. **The rail painted two selection backgrounds.** `admin-nav.tsx` applied `rail-item active` to the parent `Connections` toggle for any `/connections/*` path while the active sub-item *also* took a pill. Root cause: `.rail-disclosure` and `.nav-section-gap` had **zero CSS rules**, so the sub-tree borrowed `.rail-item` and collided with it.

4. **The top-bar `HealthPill` cannot see what the page sees.** `shell-state.ts:160` derives "All systems healthy" from `databaseReachable && gatewayReachable` alone - blind to channels, agents, plugins, and the event loop.

## The core decision

**Health is OVERALL OpenClaw health, not a provider-catalog ratio.**

Model providers and integrations are *inventory*, not *health*. They keep their own counts on their own cards. The hero answers exactly one question: **is the thing I depend on working right now?**

### Health components (subsystem-level, one each)

| Component | Source | Notes |
| --- | --- | --- |
| Gateway | `health` reachability | Substrate. |
| Event loop | `HealthSummary.eventLoop` | Lag. |
| Plugins | `HealthSummary.plugins{loaded,errors}` | Any error -> attention. |
| Context engines | `HealthSummary.contextEngines.quarantined[]` | Any quarantine -> attention. |
| Channel account (one per configured account) | `HealthSummary.channels{}` + `channelOrder` + `channelLabels` | `configured`, `linked`, `probe`, `lastProbeAt`. |
| Agent (one per agent) | `HealthSummary.agents[].heartbeat` | Stale heartbeat -> attention. |

`modelPricing` is a **warning chip only** and can NEVER mark the system unhealthy. OpenClaw's own docs are explicit (`docs/openclaw/cli/status.md`): *"Model pricing refresh failures are shown as optional pricing warnings. They do not mean the Gateway or channels are unhealthy."* Crying wolf over a pricing fetch is how a status page loses its credibility.

### Three states, not two

The single most important thing a status page can get right is the difference between **broken** and **unknown**.

| Status | Meaning | Rendering |
| --- | --- | --- |
| `healthy` | Probed, and fine. | Green. Counts toward healthy. |
| `attention` | Probed, and broken. | Amber. Counts toward attention. |
| `not_checked` | **Could not probe.** | Grey. Counts toward NEITHER. |

`percent` is computed over **probed components only**. An unreachable Gateway must never render as "0 of 8 healthy" - we do not know that 8 subsystems are broken; we know we could not ask. This mirrors OpenClaw, which marks memory `not checked` rather than "unavailable" when it skips a probe.

## Key finding: no fork changes needed

Every RPC required already exists, and **the worker already calls `health` and throws the payload away** - `connections-provisioning-service.ts:2110` fetches the full `HealthSummary`, and `gatewayConnectionState` (line 1864) collapses it to a boolean via `healthPayloadIsUnavailable` (line 1835). The data is already crossing the wire; we simply stop discarding it.

| RPC | Returns | Scope |
| --- | --- | --- |
| `health` | `HealthSummary`: `eventLoop`, `plugins{loaded,errors}`, `contextEngines{quarantined}`, `modelPricing`, `channels{}`/`channelOrder`/`channelLabels`, `agents[].heartbeat`, `sessions{count,recent}` | `operator.admin` |
| `status` | `StatusSummary`: `runtimeVersion`, `heartbeat.agents`, `channelSummary`, `queuedSystemEvents`, `tasks`, `sessions.byAgent` (`includeSensitive` gated on admin) | `operator.admin` |
| `update.status` | Update-available hint | - |

The provisioning worker already holds `operator.admin` (durable device-store bootstrap). **`mainframe/` is NOT modified** - this honors the OpenClaw-parity non-negotiable: harness real capabilities, do not reinvent them.

## Layout

Four panels:

1. **Hero** (full width) - rollup headline, dual-segment bar (green healthy / amber attention / grey not-checked), `Checked Ns ago`.
2. **Three-column grid**, equal heights - Opzava Gateway | Model Providers | Third-Party Integrations.
3. **System Components Overview** (full width, NEW) - warning banners, a state-aware check emblem, a component status **grid** (System Core / Channels / Agents), and low-priority accordions (Sessions / Gateway detail / Runtime).

### Cards

**Opzava Gateway** - `Active` pill, `Healthy` sub-label, heartbeat. Footer action is **`Run health check`** (migrated from the deleted gateway route). The fabricated `Active connections handled: 125` is gone; so is the `Open` button, which would have pointed at a route that no longer exists.

**Model Providers** - `N of 29 connected`, then an **attention-first** list: `needs_attention` / `pending` / expiring first, then connected, then backfilled with suggested providers to 3-4 rows. Every row carries a live status and a real action (`Setup` when not connected, `Manage` when connected). A card that can never show you a problem is just a link with extra steps.

- **GitHub is NOT in this card.** It is an integration, not a model provider. The proposed mockup double-counted it.
- The `(0)` counters in the proposed mockup have no backing field and are dropped.

**Third-Party Integrations** - state-driven, not fixed. Connected -> rows + `Open`. Nothing connected -> illustrative icon + copy + `Add Integration`.

- The faint logo row is **catalog-driven** and suppressed below 2 real integrations. Today only GitHub is real, so it does not render. It appears automatically the day a second integration ships.
- This honors locked IA decision #7 (*"only integrations that actually work... no coming-soon vaporware"*). Painting Slack and Google logos promises something `Add Integration` cannot deliver.

### System Components Overview panel

Not a table. Components render as a **status grid** grouped into micro-categories - **System Core**, **Channels**, **Agents** - because the first question in an outage is *which kind of thing is unwell*, and a flat 4-column table makes you read every row to find out. Each category owns its own label and its own grid, so the groups cannot blur into a single band.

Order inside the panel:

1. **Warning banners** (e.g. `modelPricing`), width-aligned with the grid below.
2. **Check emblem** - centred, between the warnings and the grid. State-aware.
3. **Component grid** - `1 / 2 / 4` columns responsive.
4. **Accordions** - `Sessions`, `Gateway detail`, `Runtime`: low-priority, full-width, counts and muted actions right-aligned.

**The emblem is state-aware, and that is the whole point of it.** It is the fastest read on the panel, so it must never show a green tick while a component is broken or unknown:

| State | Emblem | Headline |
| --- | --- | --- |
| all healthy | green shield + check | "All 8 components healthy" |
| any attention | **amber** shield + `!` | "1 component needs attention" |
| unreachable | **grey dashed** shield + `?` | "Component health unknown" |

**Component card states** carry status in icon + colour + border, so they survive being read at a glance, in greyscale, or by someone colour-blind:

| State | Card |
| --- | --- |
| `healthy` | default border, green check icon + green "Healthy" |
| `attention` | **amber border + amber wash**, warning icon |
| `not_checked` | **dashed border, no fill**, grey - visually *absent*, not *failed*. An amber or red card here would claim we observed a failure we never observed. |

Telemetry (`Lag 3 ms`, `Loaded 12 / Errors 0`, `Heartbeat 5s ago`) sits at the bottom of each card in `text-xs` muted, pinned by `margin-top: auto` so the cards align. Values never wrap - "20s ago" breaking into "20s / ago" reads as damage - the label yields instead.

`modelPricing` renders as a warning banner, never as an attention component.

## Freshness

30s auto-revalidate + refresh-on-window-focus + a manual button, with `Checked Ns ago` on the hero. A health dashboard whose entire value is "the number is true right now" cannot be allowed to freeze on a green hero while OpenClaw is on fire.

Polling triggers a server re-fetch of the RPC snapshot - **snapshots stay truth**; we do not push WS events as authority (architecture invariant: *RPC snapshots are truth, WS events are hints*).

## Single source of truth

The top-bar `HealthPill` is re-pointed at the **same rollup**. Otherwise a dead channel account renders as `7 of 8 healthy - 1 needs attention` in the hero while the pill, six inches above it on the same screen, reads `All systems healthy`. A global health indicator that cannot see the thing that is broken is worse than none: it actively suppresses the alarm.

Risk (recorded, not hidden): the shell renders on every page, so the pill now needs the rollup everywhere. The Gateway serves a **cached** health snapshot without a live probe, so this should be a cheap read - but that is an assumption the gate must prove. Fallback if it bites: narrow the pill's claim to reachability ("Gateway reachable") rather than reintroduce the contradiction.

## Rail

Surgical fix. Keep the structural work from `37d2d40a` (real `.rail-group` / `.rail-subitems` CSS, header no longer claims the active pill, sub-items aligned to one grid with a guide rail, chevron affordance, disclosure toggle preserved per IA decision #2).

Restore two things that commit changed:

1. **`Connections` is a title-case nav item with an icon**, not an uppercase muted category label.
2. **`AUTOMATE` returns as the section label above it.**

That commit dropped `Automate` on the premise that it "appears nowhere in the roadmap". The premise is false: `docs/plan/roadmap.md:194` ships an **Automation page**, `docs/plan/capability-parity.md:81` lists `automation.html` as an owned screen, and the canonical mockup itself already draws `Automation` as a **sibling of `Connections` under `Automate`**. `Connections` cannot be both the category and a peer inside it.

**No migration to shadcn's `Sidebar` primitive** - that is a whole-rail refactor touching Operate/CRM/Automate and every nav consumer, for zero visual gain, since the tokens already match.

## Design system

shadcn and the mockup system are **already reconciled by token aliasing**, so "use shadcn" and "match the mockup" are the same instruction:

- `apps/web/app/globals.css:40` maps `--card: var(--surface)`, `--primary: var(--accent)`, `--muted-foreground: var(--fg-muted)`.
- `ux-redesign/mockups/shadcn.css` carries `sb-*` classes on the same tokens.

Two primitives are missing and must be added in both places: **`progress`** (dual-segment) and **`separator`**. `card`, `badge`, `button`, `tabs` already exist in `apps/web/components/ui/`.

## Amendments to `connections-ia-redesign.md`

- **Decision #2 (rail sub-items)** - `Gateway` is REMOVED as a rail sub-item.
- **Decision #4 (detail routes)** - `/connections/gateway` is REMOVED as a route.

Rationale: the Gateway is **platform substrate, not a manageable connection**. The IA spec itself describes it as *"Platform infra: not disconnectable, no connect action"* - it never belonged as a peer of Model Providers and GitHub. Once the System Status panel lands on the Overview, the gateway route is pure duplication, and two surfaces showing gateway health is how they drift out of sync.

`/connections/gateway` **redirects** to `/connections` so existing links and bookmarks do not 404. The orchestrator role labels move to `/connections/providers`, which already renders `ProviderConnectionView.roleLabel` per row.

## Mockups

| File | State |
| --- | --- |
| `ux-redesign/mockups/connections.html` | Healthy - all components green. |
| `ux-redesign/mockups/connections-degraded.html` | Degraded - 1 attention (dead channel), 1 `not checked`, expiring provider key. |
| `ux-redesign/mockups/connections-unreachable.html` | Gateway unreachable - last-known-good, all components `not checked`. |
| `ux-redesign/mockups/connections-legacy-pre-ia.html` | **Preserved, stale.** The pre-IA monolith. Still the only design for `/connections/providers` (shipped) and for the unbuilt Agent-tools/MCP/Channels port-program slices. Extract sub-route mockups from it; do not delete it. |

### Known gap (pre-existing, not introduced here)

The three Overview mockups link to `connections-providers.html`, `connections-github.html`, and `connections-add.html`. **None exist.** Those routes are SHIPPED (#137-#144) but were never given mockups, so the sub-tree has been un-designed since the IA redesign landed. The links are left pointing at the intended filenames so the gap is visible rather than papered over.

Extract them from `connections-legacy-pre-ia.html` (which still holds the Model Providers panel design) as a follow-up. Do not silently retarget the links to the legacy file - that would hide the gap.

## Verification bar

- Side-by-side screenshots (mockup vs live), light + dark, for all three states.
- Every element functions live with real data - no dead chrome, no placeholder numbers. Any metric on the page maps to a real field in the RPC table above.
- Anti-regression: hero and `HealthPill` can never disagree.
- SeniorQA final gate: `node real-world-validate.local.mjs` against `http://web.opzava.localhost:18088`, real form login, real seeded data, **2 consecutive clean runs**, exit 0. The exit code is the verdict, not the narrative.
