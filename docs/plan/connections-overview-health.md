# Connections Overview: OpenClaw health - locked design

Status: design locked; implementation, user override, and follow-up Mainframe fixes landed
(2026-07-14 through 2026-07-15). The currently realizable live health states are
`partial-unknown`, `degraded`, and `unreachable`. A fully `healthy` renderer/classifier remains
covered automatically, but cannot be claimed from the current Mainframe contract because it does
not expose authoritative per-agent liveness.
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
| Agent (one per agent) | `HealthSummary.agents[]` schedule metadata | Mainframe reports schedule configuration, not an authoritative live probe. Until it exposes per-agent liveness, each configured agent renders `not_checked`, never failed or healthy. |

`modelPricing` is a **warning chip only** and can NEVER mark the system unhealthy. OpenClaw's own docs are explicit (`docs/openclaw/cli/status.md`): *"Model pricing refresh failures are shown as optional pricing warnings. They do not mean the Gateway or channels are unhealthy."* Crying wolf over a pricing fetch is how a status page loses its credibility.

### Three states, not two

The single most important thing a status page can get right is the difference between **broken** and **unknown**.

| Status | Meaning | Rendering |
| --- | --- | --- |
| `healthy` | Probed, and fine. | Green. Counts toward healthy. |
| `attention` | Probed, and broken. | Amber. Counts toward attention. |
| `not_checked` | **Could not probe.** | Grey. Counts toward NEITHER. |

The Overview does **not** render a percentage or progress metaphor. It always renders an
explicit three-state breakdown: **Healthy**, **Needs attention**, and **Not checked**, each
with a visible count, icon, label, and short definition. An unreachable Gateway must never
render as "0 of 8 healthy" - we do not know that 8 subsystems are broken; we know we could
not ask. This mirrors OpenClaw, which marks memory `not checked` rather than "unavailable"
when it skips a probe.

### User override: direct status, not progress (2026-07-15)

The segmented progress bar is removed. Its visual language implied completion and forced the
user to reverse-engineer the grey remainder. The replacement is an always-visible semantic
three-state breakdown, one column on mobile and three columns from the small breakpoint up.
It uses icon + text + count (never colour alone), semantic tokens, and no percentage. A mixed
state says exactly what is healthy, what reported a problem, and what produced no live result.

When any component is `not_checked`, the Overview names every affected group and links directly
to that group's stable anchor on `/connections/system`. Missing guidance renders even when an
`attention` component exists: attention has headline precedence, but it must not hide unknown
coverage. Refresh is the recovery action. A last-known snapshot is labelled separately and can
only be described as fully healthy when every component in that snapshot was checked and healthy.

## Gateway authority and minimal tracked fork fixes

Every data RPC required already existed, and **the worker already called `health` and threw the payload away** - `connections-provisioning-service.ts:2110` fetched the full `HealthSummary`, and `gatewayConnectionState` (line 1864) collapsed it to a boolean via `healthPayloadIsUnavailable` (line 1835). The initial implementation therefore projected data already crossing the wire instead of inventing a parallel health system.

| RPC | Returns | Scope |
| --- | --- | --- |
| `health` | `HealthSummary`: `eventLoop`, `plugins{loaded,errors}`, `contextEngines{quarantined}`, `modelPricing`, `channels{}`/`channelOrder`/`channelLabels`, agent schedule metadata, `sessions{count,recent}` | `operator.admin` |
| `status` | `StatusSummary`: `runtimeVersion`, `heartbeat.agents`, `channelSummary`, `queuedSystemEvents`, `tasks`, `sessions.byAgent` (`includeSensitive` gated on admin) | `operator.admin` |
| `update.status` | Update-available hint | - |

The provisioning worker already holds `operator.admin` (durable device-store bootstrap). Live QA then exposed two defects in behavior owned by the Gateway, requiring minimal tracked Mainframe fork fixes:

1. **Mainframe patch #4 (rung 3):** safe and admin-sensitive health caches are scoped separately, and probe-strength-aware coalescing prevents a weak background refresh from absorbing a requested live probe or replacing its sensitive result with an older safe snapshot.
2. **Mainframe patch #5 (rung 3):** a successful explicit provider login re-enables a matching configured empty auth order and promotes the exact profile just written, so disconnect/reconnect cannot leave a valid credential present but ineligible for runtime selection.

This preserves the ownership boundary in `docs/openclaw/concepts/architecture.md`: the Gateway is the authority for live provider connections, credential selection, and health snapshots; the worker projects those typed results and orchestrates Opzava workflows. Neither defect can be reliably repaired in the worker without duplicating or racing Gateway state.

## Layout

**The Overview is TWO panels. It is an overview, not a console.**

An earlier revision put a full System Status panel on the Overview. The result: the hero said "8 of 8 healthy", and directly beneath it a second panel said "All 8 components healthy" over eight cards and three tables of sessions, auth, catalog, hosts, uptime and git SHA. The same fact twice, then a console dump, on a page called Overview. That is a Hick's Law / Nielsen-H8 failure and it is corrected here.

1. **System health** (full width) - status headline, explicit Healthy / Needs attention / Not
   checked breakdown, `Checked Ns ago` + Refresh, an **attention row** (only when something is
   wrong), missing-probe guidance whenever coverage is incomplete, and three **group pills**
   (System Core / Channels / Agents) plus one link: `System status →`.
2. **Three-column grid**, equal heights - Opzava Gateway | Model Providers | Third-Party Integrations.

That is all. No component grid, no tables, no accordions on the Overview.

### Progressive disclosure

The Overview shows the **shape** of the problem; `/connections/system` shows **the problem**.

| Question | Answered on |
| --- | --- |
| Is anything wrong? | Overview - headline + explicit three-state breakdown |
| What is wrong, and how do I fix it? | Overview - the attention row, with its action |
| Which *kind* of thing is unwell? | Overview - the three group pills |
| Which exact probe returned what, when? | **`/connections/system`** |
| Sessions, auth, catalog, hosts, uptime, version, git SHA | **`/connections/system`** |

The **attention row renders only when something is actually wrong.** When everything is healthy it is *absent* - not an empty container. A page that stays calm when things are fine is a page you believe when it finally raises its voice.

### `/connections/system` (System status)

The detail surface. Breadcrumb `Connections / System status`. Holds the state-aware check emblem, the component **grid** grouped into **System Core / Channels / Agents**, and the low-priority accordions (Sessions / Gateway detail / Runtime).

It is a **drill-down of the Overview, not a peer connection**, so it is deliberately NOT a rail sub-item - the rail lists *connections*, and OpenClaw's internals are not one. It is reached from the health panel.

**Component card states** carry status in icon + colour + border together, so they survive being read at a glance, in greyscale, or by someone colour-blind:

| State | Card |
| --- | --- |
| `healthy` | default border, green check icon |
| `attention` | **amber border + amber wash**, warning icon |
| `not_checked` | **dashed border, no fill**, grey - visually *absent*, not *failed*. An amber or red card here would claim we observed a failure we never observed. |

The check emblem is state-aware for the same reason: green shield + check / **amber** shield + `!` / **grey dashed** shield + `?`. It is the fastest read on the panel, so it must never show a green tick while something is broken or unknown.

### Cards

**Opzava Gateway** - `Active` pill, `Healthy` sub-label, heartbeat. Footer action is **`Run health check`** (migrated from the deleted gateway route). The fabricated `Active connections handled: 125` is gone; so is the `Open` button, which would have pointed at a route that no longer exists.

**Model Providers** - `N of 29 connected`, then an **attention-first** list: `needs_attention` / `pending` / expiring first, then connected, then backfilled with suggested providers to 3-4 rows. Every row carries a live status and a real action (`Setup` when not connected, `Manage` when connected). A card that can never show you a problem is just a link with extra steps.

Provider identity uses the reusable app resolver, not a generic glyph. The locked local asset set
contains 13 unchanged Simple Icons 16.26.0 CC0 paths plus the separately vendored OpenAI sponsor
mark; their geometry and trademarks are retained for nominative identification. Groq, xAI,
Cerebras, Together, and Fireworks use deterministic monograms because no licensed local mark is
available. Unknown providers also fall back deterministically. Logos are local, server-safe,
monochrome `currentColor` marks on subdued brand-tinted tiles; no remote fetch is allowed.

- **GitHub is NOT in this card.** It is an integration, not a model provider. The proposed mockup double-counted it.
- The `(0)` counters in the proposed mockup have no backing field and are dropped.

**Third-Party Integrations** - state-driven, not fixed. Connected -> rows + `Open`. Nothing connected -> illustrative icon + copy + `Add Integration`.

- The faint logo row is **catalog-driven** and suppressed below 2 real integrations. Today only GitHub is real, so it does not render. It appears automatically the day a second integration ships.
- This honors locked IA decision #7 (*"only integrations that actually work... no coming-soon vaporware"*). Painting Slack and Google logos promises something `Add Integration` cannot deliver.

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

**No migration to shadcn's `Sidebar` primitive** - that is a whole-rail refactor touching Operate, the future user-side CRM rebuild, Automate, and every nav consumer, for zero visual gain, since the tokens already match. CRM has no current admin surface (GitHub issue #200, 2026-07-15).

## Design system

shadcn and the mockup system are **already reconciled by token aliasing**, so "use shadcn" and "match the mockup" are the same instruction:

- `apps/web/app/globals.css:40` maps `--card: var(--surface)`, `--primary: var(--accent)`, `--muted-foreground: var(--fg-muted)`.
- `ux-redesign/mockups/shadcn.css` carries `sb-*` classes on the same tokens.

The Overview uses the existing card, alert, badge, button, and separator primitives. A progress
primitive is deliberately not used for health because these states describe observations, not
completion.

## Amendments to `connections-ia-redesign.md`

- **Decision #2 (rail sub-items)** - `Gateway` is REMOVED as a rail sub-item. `System status` is NOT added as one: it is a drill-down of the Overview, not a connection.
- **Decision #4 (detail routes)** - `/connections/gateway` is REMOVED. `/connections/system` is ADDED as the system-detail surface.

Rationale: the Gateway is **platform substrate, not a manageable connection**. The IA spec itself describes it as *"Platform infra: not disconnectable, no connect action"* - it never belonged as a peer of Model Providers and GitHub. Once the System Status panel lands on the Overview, the gateway route is pure duplication, and two surfaces showing gateway health is how they drift out of sync.

`/connections/gateway` **redirects** to `/connections` so existing links and bookmarks do not 404. The orchestrator role labels move to `/connections/providers`, which already renders `ProviderConnectionView.roleLabel` per row.

## Mockups

| File | State |
| --- | --- |
| `ux-redesign/mockups/connections.html` | Healthy - all components green. |
| `ux-redesign/mockups/connections-partial-unknown.html` | Reachable Gateway - 4 healthy System Core components and 3 agents without a live probe result. |
| `ux-redesign/mockups/connections-degraded.html` | Degraded - 1 attention (dead channel), 1 `not checked`, expiring provider key. |
| `ux-redesign/mockups/connections-unreachable.html` | Gateway unreachable - last-known-good, all groups `not checked`. |
| `ux-redesign/mockups/connections-system.html` | **`/connections/system`** - the detail surface the Overview links to. Component grid + Sessions / Gateway detail / Runtime. |
| `ux-redesign/mockups/connections-legacy-pre-ia.html` | **Preserved, stale.** The pre-IA monolith. Still the only design for `/connections/providers` (shipped) and for the unbuilt Agent-tools/MCP/Channels port-program slices. Extract sub-route mockups from it; do not delete it. |

### Known gap (pre-existing, not introduced here)

The three Overview mockups link to `connections-providers.html`, `connections-github.html`, and `connections-add.html`. **None exist.** Those routes are SHIPPED (#137-#144) but were never given mockups, so the sub-tree has been un-designed since the IA redesign landed. The links are left pointing at the intended filenames so the gap is visible rather than papered over.

Extract them from `connections-legacy-pre-ia.html` (which still holds the Model Providers panel design) as a follow-up. Do not silently retarget the links to the legacy file - that would hide the gap.

## Verification bar

Verified locally against the Docker stack (2026-07-15):

- The `partial-unknown` real E2E drive completed with zero findings.
- The `degraded` real E2E drive completed with the required exact attention count of `1`. The
  fixture was a deliberately invalid Telegram bot channel; the temporary channel was removed and
  the normal stack was restarted afterward.
- Manual health refresh advanced `checkedAt`, proving that the requested live probe was not swallowed by cached background work.
- The OpenAI OAuth `gpt-5.5` probe succeeded, and a real Ask Admin run reached `READY`.

The `unreachable` contract treats the provider catalog as unavailable, not as an empty catalog: the
provider route must show the explicit Gateway outage/retry state and expose zero provider rows or
provider actions. Its final real rerun is still pending at this point, so this document does not
claim that result. The normal stack was restored after the outage preparation.

The health and integration axes are separate. `REAL_CONNECTIONS_INTEGRATIONS=empty` was exercised
live. A real connected integration was not exercised and remains pending; no health-state result
above implies connected-integration coverage.

The current real health matrix is therefore `partial-unknown`, `degraded`, and `unreachable`.
`healthy` stays in classifier, component, and E2E self-test coverage so the UI remains
future-compatible. It is not currently a realizable live rollup: Mainframe always reports at least
the implicit default agent and exposes schedule configuration rather than a liveness result. The
healthy-live clause in #182 is blocked on an authoritative Mainframe per-agent liveness contract
unless the issue owner accepts this evidence-based amendment.

- Side-by-side screenshots (mockup vs live), light + dark, for all three states.
- Every element functions live with real data - no dead chrome, no placeholder numbers. Any metric on the page maps to a real field in the RPC table above.
- Anti-regression: hero and `HealthPill` can never disagree.
- SeniorQA final gate: `node tests/e2e/gate/real-world-validate.mjs` against `http://web.opzava.localhost:18088`, real form login, real seeded data, **2 consecutive clean runs**, exit 0. The exit code is the verdict, not the narrative.
