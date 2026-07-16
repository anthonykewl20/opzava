# WF-242 — Admin route ownership and migration audit

Status: **Wayfinder research evidence for
[#242](https://github.com/anthonykewl20/opzava/issues/242)**

Date: 2026-07-16

Scope: the exact as-built Admin routes, their semantic owners and target placements, the
compatibility seams needed to migrate them, and the relationship between Opzava routes and the
internal Mainframe/OpenClaw Control UI.

## Executive finding

The current Admin surface is not an earlier version of the locked PRD-020 information architecture.
It is a smaller, live shell whose public page family is `/`, `/ask-opzava`, legacy `/tasks` and
`/issues`, and a monolithic `/connections` family. The Connections overview currently combines
system health, Gateway status, model/provider setup, and third-party integration status; PRD-020
deliberately assigns those capabilities to **Health**, **Gateway**, **Models & Providers**, and
**Integrations** respectively. The migration therefore must extract projections and setup flows by
owner, not rename the Connections page.

PRD-020 owns Admin chrome, route admission, placement, and cross-context composition; it explicitly
does not acquire workflow, runtime, integration, security, or durable-data authority
([PRD-020 lines 20–24](../../prd/PRD-020-admin-control-center.md#L20-L24),
[lines 239–247](../../prd/PRD-020-admin-control-center.md#L239-L247)). The locked owner map fixes
destination names and owners but states that route paths are implementation details
([foundation decisions lines 79–107](../admin-control-center-foundation-decisions.md#L79-L107));
ACC-D09 also defers production URL paths, query contracts, APIs, and migration sequence
([line 197](../admin-control-center-foundation-decisions.md#L197)). This audit consequently does
**not** invent canonical target URLs. It names exact current paths and locked target destinations.
The only target path already fixed by a semantic-owner migration contract is `/dev-board`.

The Mainframe/OpenClaw Control UI is a separate, active upstream/internal operator surface. It is
not a set of public Opzava aliases and cannot become the Admin shell: its browser connects directly
to the Gateway WebSocket, whereas Opzava requires browser traffic to traverse product ports/BFFs and
the broker. Production exposes the Gateway only inside the Docker network; direct Control UI access
is SSH-only break-glass ([Control UI docs lines 10–16](../../openclaw/web/control-ui.md#L10-L16),
[Architecture lines 211–215](../../../ARCHITECTURE.md#L211-L215),
[compose lines 286–319](../../../docker-compose.yml#L286-L319)). Its views remain capability/parity
evidence, not route-placement authority.

## Authority and terminology

The following precedence governs every disposition below:

1. Semantic-owner PRDs and ADRs define the data, commands, authorization, and state semantics.
2. PRD-020 and the locked foundation ledger define Admin admission, visible destination names,
   placement, shell behavior, and Overview composition.
3. Current route code proves what is live and supplies migration evidence.
4. The frozen Control-UI port program, mockups, and historical ledgers supply parity evidence only;
   they cannot override current contracts
   ([capability parity lines 3–16](../capability-parity.md#L3-L16),
   [foundation decisions lines 20–27](../admin-control-center-foundation-decisions.md#L20-L27)).

PRD-013 explicitly treats Connections as the current legacy setup surface, says PRD-020 supersedes
its monolithic placement, and preserves PRD-013's underlying execution-setup semantics
([PRD-013 lines 3–19](../../prd/PRD-013-connections-tools.md#L3-L19)). That is why this audit moves
placement and compatibility consumers without reallocating setup/runtime authority.

“Mainframe” is the Opzava-owned OpenClaw fork; “OpenClaw” is the upstream runtime lineage. Neither
is a competing product/sidebar brand. The **Platform Gateway** is one static per-tenant OpenClaw
container, and the **gateway-broker** is the only browser hot-path ACL into it
([CONTEXT lines 9–17](../../../CONTEXT.md#L9-L17)). A **DevTicket** is not the current Project
Management Task or standalone GitHub Issue; a **Runner** is not an OpenClaw Node or Device;
**Engineering Skills**, **Runtime Skills**, and **MCP Servers** are three separate concepts
([CONTEXT lines 19–45](../../../CONTEXT.md#L19-L45)).

Disposition labels used below:

- **Active** — a live current Opzava or internal operator surface.
- **Legacy** — live only as migration input for an approved replacement.
- **Compatibility** — retained temporarily as a redirect, alias, or API facade after its new
  consumer exists.
- **Frozen evidence** — useful parity/history, but not executable placement authority.
- **Target not built** — the PRD-020 destination is locked, but no production leaf is implied by
  this audit.

## Exact as-built Opzava page-route inventory

All paths in this table are exact current paths. “Target path” is intentionally absent: except for
`/dev-board`, the approved contracts have not selected one.

| Current path             | As-built behavior and status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Semantic owner                                                                                                                                              | PRD-020 target placement                                                                                                                      | Migration / compatibility disposition                                                                                                                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                      | Active Admin landing route, but currently only the placeholder heading “Admin home”; shell data and chrome do more work than the page ([page lines 3–29](../../../apps/web/app/%28app%29/page.tsx#L3-L29)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | PRD-020 composition only; every future projected fact retains its source owner.                                                                             | **Develop → Overview**.                                                                                                                       | Replace in place or select a new canonical route in #246/implementation work. Never map the native OpenClaw `/overview` here as an authority. Preserve the authenticated landing behavior during shell rollout.                                                                                                                                  |
| `/ask-opzava`            | Active Admin-assistant UI despite the user-facing and history semantics being Ask Admin: it calls `getOrCreateAskAdminHistory`, whose assistant key is `ask-admin-opzava` ([page lines 31–58](../../../apps/web/app/%28app%29/ask-opzava/page.tsx#L31-L58), [history lines 7–10](../../../apps/web/lib/ask-admin-history.ts#L7-L10)). The palette still labels it “Ask Opzava” ([shell-state lines 70–88](../../../apps/web/lib/shell-state.ts#L70-L88)).                                                                                                                                                                                                                   | PRD-005 and Ask Admin Wayfinder [#210](https://github.com/anthonykewl20/opzava/issues/210); PRD-018/019 only for bounded remediation and Dev Board actions. | Pinned **Ask Admin Opzava**.                                                                                                                  | Preserve `/ask-opzava` as a temporary alias or intentional redirect if #210 chooses a correctly named canonical path. The assistant/session identity must survive the rename. Native Control UI `/chat` is behavior evidence, not a product alias.                                                                                               |
| `/tasks`                 | Active Project Management Task list; legacy for Dev Board. The page loads project-management cards and currently converts forbidden access into a redirect to `/` ([page lines 40–81](../../../apps/web/app/%28app%29/tasks/page.tsx#L40-L81)).                                                                                                                                                                                                                                                                                                                                                                                                                             | Current Project Management context until migration; target DevTicket authority is PRD-019/ADR-017.                                                          | **Develop → Dev Board**.                                                                                                                      | Do not blanket-redirect until record identity, authority, and status are reconciled. After verified cutover, redirect to the appropriate Dev Board view; `/dev-board` is the approved canonical target family.                                                                                                                                   |
| `/tasks/[cardId]`        | Active legacy task detail with a stable card identifier; `notFound()` and forbidden-to-root behavior are route-visible contracts today ([page lines 20–52](../../../apps/web/app/%28app%29/tasks/%5BcardId%5D/page.tsx#L20-L52)).                                                                                                                                                                                                                                                                                                                                                                                                                                           | Same as `/tasks`; individual records may be migrated, quarantined, or remain Project Management records.                                                    | **Develop → Dev Board**, only for migrated DevTickets.                                                                                        | Requires a record-aware resolver, not a static redirect. Map a migrated ID to its DevTicket detail, route quarantined/non-DevTicket records to an explicit retained/read-only result, and return a real not-found/retired result when no safe mapping exists.                                                                                    |
| `/issues`                | Active standalone GitHub-synced issue projection with sync/create controls and direct GitHub links ([page lines 548–570](../../../apps/web/app/%28app%29/issues/page.tsx#L548-L570), [lines 599–684](../../../apps/web/app/%28app%29/issues/page.tsx#L599-L684), [lines 724–840](../../../apps/web/app/%28app%29/issues/page.tsx#L724-L840)); legacy for Dev Board.                                                                                                                                                                                                                                                                                                         | GitHub owns native issue/PR facts; PRD-019/ADR-017 own the DevTicket projection and sync policy.                                                            | **Develop → Dev Board** (List/Board and record detail); direct GitHub URLs remain GitHub facts.                                               | Redirect only after DevTicket backfill/reconciliation and parity. Preserve external GitHub URLs and distinguish synced DevTickets from GitHub records that are not eligible product work.                                                                                                                                                        |
| `/connections`           | Active monolithic overview titled “Connections” and described as “Opzava health, model providers, third-party integrations” ([page lines 17–40](../../../apps/web/app/%28app%29/connections/page.tsx#L17-L40)). Its component renders System Health, Gateway, Providers, and Third-Party Integrations in one page ([overview lines 130–294](../../../apps/web/components/connections/connections-overview.tsx#L130-L294), [lines 306–555](../../../apps/web/components/connections/connections-overview.tsx#L306-L555)). Legacy placement; active functionality.                                                                                                            | The contributing owner remains PRD-013/Runtime Control for setup/runtime, PRD-012 for health projections, and PRD-019/ADR-017 for GitHub sync semantics.    | Split to **Operate → Health**, **AI Runtime → Gateway**, **AI Runtime → Models & Providers**, and **Configure → Integrations**.               | Keep live until every current section has a verified owner destination. Then make `/connections` an intentional compatibility redirect to **Integrations**, because ACC-053 defines Integrations as the replacement inventory/setup entry, while section/deep links go directly to their matching owner destination. Avoid a relabeled monolith. |
| `/connections/system`    | Active but hidden system-status drilldown; not present as a nav child. The route renders `ConnectionsSystemStatus` ([page lines 14–24](../../../apps/web/app/%28app%29/connections/system/page.tsx#L14-L24)), whose sections cover System Core, Channels, Agents, Sessions, Gateway detail, and Runtime ([component lines 40–57](../../../apps/web/components/connections/connections-system-status.tsx#L40-L57), [lines 217–415](../../../apps/web/components/connections/connections-system-status.tsx#L217-L415)). The current nav treats it as `/connections` for active state ([admin-nav lines 370–387](../../../apps/web/components/shell/admin-nav.tsx#L370-L387)). | Each row retains its owner: PRD-012 health, PRD-013/Runtime Control Gateway, PRD-013 Integrations, PRD-006 Agents/Sessions.                                 | Local evidence/drilldowns under **Health**, **Gateway**, **Integrations**, **Agents**, and **Sessions & Runs**; never a fifth sidebar family. | Preserve existing anchor/deep-link intent while each row moves. Its bare final destination and anchor-by-anchor redirect map remain unresolved for #249/#250/#246; unknown anchors must not silently land on an unrelated destination.                                                                                                           |
| `/connections/providers` | Active model-provider setup/health page ([page lines 16–44](../../../apps/web/app/%28app%29/connections/providers/page.tsx#L16-L44)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | PRD-013 and Runtime Control/Platform Ops; PRD-006 consumes model selection for agents/runs.                                                                 | **AI Runtime → Models & Providers**.                                                                                                          | Direct compatibility redirect after the target leaf reaches parity. Preserve provider/model query and setup-return state without placing raw credentials in a URL.                                                                                                                                                                               |
| `/connections/github`    | Active GitHub OAuth App device-flow connection/repair/disconnect page: the page starts a GitHub device flow and renders its poller ([page lines 23–31](../../../apps/web/app/%28app%29/connections/github/page.tsx#L23-L31), [lines 96–118](../../../apps/web/app/%28app%29/connections/github/page.tsx#L96-L118)); its error copy explicitly identifies the current OAuth App dependency ([notice lines 80–84](../../../apps/web/app/%28app%29/connections/_components/page-notice.tsx#L80-L84)).                                                                                                                                                                          | PRD-013 owns enrollment/setup; PRD-019/ADR-017 own GitHub synchronization, work identity, and unbypassable trust behavior.                                  | **Configure → Integrations**; the target contract requires GitHub App setup, and health also projects to **Health** and Overview readiness.   | Migrate from the current OAuth App device flow to the target GitHub App enrollment/repair/history contract in Integrations without cloning sync state. Redirect the old route only after target parity. The exact local tab/section remains [#245](https://github.com/anthonykewl20/opzava/issues/245) work.                                     |
| `/connections/add`       | Active integration catalog/setup entry, currently exposing GitHub rather than a general platform setup router ([page lines 21–120](../../../apps/web/app/%28app%29/connections/add/page.tsx#L21-L120)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | PRD-013; each selected setup flow retains its owner.                                                                                                        | GitHub/Slack to **Integrations**. Gateway, MCP, Runner, Environment, and Secret setup belong only to their corresponding destination.         | Replace with Integrations-local enrollment once parity exists. Do not grow this legacy route into a generic setup bucket. Existing post-disconnect flow currently returns here and must be updated atomically with its destination ([actions lines 86–126](../../../apps/web/app/%28app%29/connections/actions.ts#L86-L126)).                    |
| `/login`                 | Active unauthenticated login page; it redirects incomplete setup to `/setup`, redirects an authenticated session to `/`, and otherwise renders the login form ([page lines 93–103](../../../apps/web/app/%28auth%29/login/page.tsx#L93-L103), [lines 228–236](../../../apps/web/app/%28auth%29/login/page.tsx#L228-L236)).                                                                                                                                                                                                                                                                                                                                                  | PRD-001 Identity & Access.                                                                                                                                  | Outside the admitted Admin sidebar.                                                                                                           | Retain. It is an admission prerequisite, not a PRD-020 leaf.                                                                                                                                                                                                                                                                                     |
| `/setup`                 | Active first-owner/workspace setup route; its page creates the owner account/workspace ([page lines 10–40](../../../apps/web/app/%28auth%29/setup/page.tsx#L10-L40)), and the request proxy sends an incomplete authenticated tenant here ([proxy lines 5–41](../../../apps/web/proxy.ts#L5-L41)).                                                                                                                                                                                                                                                                                                                                                                          | PRD-001 plus Tenant Provisioning/Platform Ops.                                                                                                              | Outside the admitted Admin sidebar; owner setup can later deep-link to owner leaves.                                                          | Retain its bootstrap role. Do not confuse first-owner provisioning with Configure → Settings.                                                                                                                                                                                                                                                    |
| `/signout`               | Active signed-out landing route with links back to `/login` and `/` ([page lines 1–25](../../../apps/web/app/%28auth%29/signout/page.tsx#L1-L25)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | PRD-001.                                                                                                                                                    | Top-bar account entry invokes it; no sidebar destination.                                                                                     | Retain; migration must preserve session teardown and return behavior.                                                                                                                                                                                                                                                                            |

### Current shell-owned links that are also migration inputs

The existing shell is hard-coded rather than derived from the PRD-020 admission graph:

- Admin navigation currently pins **Ask Admin Opzava**, then shows **Operate → Overview, Tasks,
  Issues** and **Automate → Connections**, whose local children are Overview, Model Providers,
  optional GitHub, and Add
  ([admin-nav lines 200–240](../../../apps/web/components/shell/admin-nav.tsx#L200-L240),
  [lines 291–367](../../../apps/web/components/shell/admin-nav.tsx#L291-L367)). These labels and
  groups are active code but legacy placement.
- The command palette route set is hard-coded to Ask Opzava, Overview, Tasks, Issues, and
  Connections ([shell-state lines 70–88](../../../apps/web/lib/shell-state.ts#L70-L88)); it must
  migrate with the admission graph rather than become a second authority.
- The top-bar health pill links to `/connections` and combines health and attention attributes
  ([layout lines 20–33](../../../apps/web/app/%28app%29/layout.tsx#L20-L33)). The current health
  builder can render “N need attention” as health detail
  ([shell-state lines 143–185](../../../apps/web/lib/shell-state.ts#L143-L185)). PRD-020 requires
  separate health/readiness and attention controls
  ([foundation decisions lines 50–60](../admin-control-center-foundation-decisions.md#L50-L60)).
- The notification bell is a zero-count stub whose only meaningful destination says “See tasks”;
  there is no `/notifications` page
  ([notification-bell lines 85–139](../../../apps/web/components/shell/notification-bell.tsx#L85-L139)).
  Its future attention feed must use owner deep links, not preserve `/tasks` as a generic sink.
- The account menu currently exposes only identity, Appearance, and Sign out
  ([account-menu lines 197–222](../../../apps/web/components/shell/account-menu.tsx#L197-L222)).
  That is compatible with the locked placement; security-sensitive account/session management still
  belongs to PRD-001.

### Current legacy Tasks/Issues consumer migration register

All consumers below are live compatibility edges, not merely visual links. #246 must move them in
the same Dev Board cutover as the matching list/detail route and its record mapping. A retained
Project Management record continues to use its retained surface; a migrated DevTicket uses the
selected Dev Board destination. No consumer may guess a mapping from the displayed card number.

| Current consumer                      | Exact live contract                                                                                                                                                                                                                                                                                                                                                                      | Atomic migration rule                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic task command-palette result   | `taskCommandItems` emits `/tasks/<encoded-card-route-segment>` for every task ([shell-state lines 235–248](../../../apps/web/lib/shell-state.ts#L235-L248)).                                                                                                                                                                                                                             | Generate the mapped DevTicket detail destination from the same admitted record registry used by the route resolver; omit quarantined/unauthorized records rather than emitting a broken target. |
| Board task-detail navigation          | Card pointer, keyboard, and title-link navigation all use the same `/tasks/<encoded-card-route-segment>` value ([board lines 438–475](../../../apps/web/components/tasks/tasks-board.tsx#L438-L475)).                                                                                                                                                                                    | Switch all three interaction paths together; a clickable card and its anchor must never resolve to different authorities.                                                                       |
| Copied task-detail URL                | “Copy link” uses the browser's current URL and falls back to `/tasks/<encoded-card-route-segment>` outside the browser ([detail lines 698–713](../../../apps/web/components/tasks/task-card-detail.tsx#L698-L713)).                                                                                                                                                                      | After cutover, copy the canonical mapped DevTicket URL. During compatibility, a copied legacy URL must remain resolvable through the record-aware redirect/retained result.                     |
| Task breadcrumb                       | Both workspace and “Board” crumbs link to `/tasks` ([detail lines 1038–1057](../../../apps/web/components/tasks/task-card-detail.tsx#L1038-L1057)).                                                                                                                                                                                                                                      | Point migrated details back to the selected Dev Board view while retained details keep a valid retained-list destination. Preserve breadcrumb hierarchy and back/forward behavior.              |
| Ask Admin “View tasks” link           | The Ask Admin empty/ready card links directly to `/tasks` ([Ask Admin lines 542–559](../../../apps/web/components/ask-opzava/ask-opzava-chat.tsx#L542-L559)).                                                                                                                                                                                                                            | Move with the list cutover to the selected admitted Dev Board destination; Ask Admin does not gain authority to select or bypass a record mapping.                                              |
| Task-detail action cache invalidation | Detail actions revalidate `/tasks` and, when a card number is present, `/tasks/<card-number>` ([detail actions lines 58–64](../../../apps/web/app/%28app%29/tasks/%5BcardId%5D/actions.ts#L58-L64)).                                                                                                                                                                                     | Invalidate the DevTicket list/detail projections by mapped identity in the same release; retain legacy invalidation only while the old record is served.                                        |
| Legacy task mutation return           | Legacy task mutations revalidate and redirect to `/tasks` ([task actions lines 81–84](../../../apps/web/app/%28app%29/tasks/actions.ts#L81-L84)).                                                                                                                                                                                                                                        | Return to the mapped DevTicket record or selected Dev Board view only after that target accepts the same mutation outcome; retained records return to their retained surface.                   |
| Ask Admin task mutation invalidation  | The Ask Admin turn route injects `revalidatePath("/tasks")` and invokes it after successful tool/finalized outcomes ([turn route lines 80–86](../../../apps/web/app/api/tasks/ask-admin/turn/route.ts#L80-L86), [lines 398–420](../../../apps/web/app/api/tasks/ask-admin/turn/route.ts#L398-L420), [lines 462–470](../../../apps/web/app/api/tasks/ask-admin/turn/route.ts#L462-L470)). | Replace it with DevTicket projection/cache invalidation in the same release as the page cutover; renaming the endpoint alone is insufficient.                                                   |
| GitHub Issue sync invalidation        | A successful `syncIssuesAction` revalidates `/issues` ([issue actions lines 89–97](../../../apps/web/app/%28app%29/issues/actions.ts#L89-L97)).                                                                                                                                                                                                                                          | After Dev Board cutover, invalidate the authoritative DevTicket/Dev Board projection; retain `/issues` invalidation only while the legacy projection coexists.                                  |
| GitHub Issue create invalidation      | A successful `createIssueAction` revalidates `/issues` before returning its success state ([issue actions lines 99–121](../../../apps/web/app/%28app%29/issues/actions.ts#L99-L121)).                                                                                                                                                                                                    | After Dev Board cutover, invalidate the authoritative DevTicket/Dev Board projection; retain `/issues` invalidation only while the legacy projection coexists.                                  |

## Exact as-built Opzava HTTP/API route inventory

These routes are not sidebar destinations, but page migration can break them if URL work is treated
as visual-only.

| Current route                               | Method / live purpose                                                                                                                                                                    | Owner and migration rule                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/[...all]`                        | `GET`/`POST`; Better Auth catch-all ([route lines 1–6](../../../apps/web/app/api/auth/%5B...all%5D/route.ts#L1-L6)).                                                                     | PRD-001. Retain independent of Admin page paths. Route admission and leaf authorization must continue to rely on server-side identity, not navigation visibility.                                                                                                                                                                                 |
| `/api/connections/device-flow`              | `POST`; polls the current connection device flow ([route lines 13–38](../../../apps/web/app/api/connections/device-flow/route.ts#L13-L38)).                                              | PRD-013/provisioning. Keep as a compatibility facade while Integrations adopts the flow; rename only with an atomic consumer migration and idempotency/audit preservation.                                                                                                                                                                        |
| `/api/connections/model/api-key`            | `POST`; begins model-provider API-key setup ([route lines 15–46](../../../apps/web/app/api/connections/model/api-key/route.ts#L15-L46)).                                                 | PRD-013/Runtime Control. The Models & Providers leaf may consume it temporarily; never expose the secret back to the browser.                                                                                                                                                                                                                     |
| `/api/connections/model/api-key/poll`       | `POST`; polls API-key setup ([route lines 13–35](../../../apps/web/app/api/connections/model/api-key/poll/route.ts#L13-L35)).                                                            | Same owner; preserve bounded polling, expiry, authorization, and safe error semantics.                                                                                                                                                                                                                                                            |
| `/api/connections/model/device-flow`        | `POST`; begins provider device flow ([route lines 14–43](../../../apps/web/app/api/connections/model/device-flow/route.ts#L14-L43)).                                                     | Same owner; page relocation does not justify a duplicate setup command.                                                                                                                                                                                                                                                                           |
| `/api/connections/model/device-flow/cancel` | `POST`; cancels provider device flow ([route lines 16–45](../../../apps/web/app/api/connections/model/device-flow/cancel/route.ts#L16-L45)).                                             | Same owner; the new leaf must preserve cancellation and idempotency.                                                                                                                                                                                                                                                                              |
| `/api/connections/model/disconnect`         | `POST`; begins provider disconnect ([route lines 13–38](../../../apps/web/app/api/connections/model/disconnect/route.ts#L13-L38)).                                                       | Same owner. The exact current authorization is Owner/Admin role admission ([connections lines 82–92](../../../apps/web/lib/connections.ts#L82-L92), [lines 767–779](../../../apps/web/lib/connections.ts#L767-L779)); preserve that during compatibility. Step-up/approval is future policy owned and resolved by #247, not an as-built contract. |
| `/api/connections/model/disconnect/poll`    | `POST`; polls provider disconnect ([route lines 13–38](../../../apps/web/app/api/connections/model/disconnect/poll/route.ts#L13-L38)).                                                   | Same owner; preserve Owner/Admin role authorization and terminal/retry states through compatibility ([connections lines 782–794](../../../apps/web/lib/connections.ts#L782-L794)). Future step-up/approval policy remains #247 work.                                                                                                              |
| `/api/connections/model/models`             | `POST`; sets one provider model's enabled state ([route lines 15–52](../../../apps/web/app/api/connections/model/models/route.ts#L15-L52)).                                              | Same owner; eventually expose through the Models & Providers command/BFF contract, not direct Gateway DTOs.                                                                                                                                                                                                                                       |
| `/api/connections/model/setup-token`        | `POST`; starts a model setup-token flow ([route lines 13–38](../../../apps/web/app/api/connections/model/setup-token/route.ts#L13-L38)).                                                 | Same owner; token values and provider credentials must not enter logs, URLs, browser-persisted shell state, or audit payloads.                                                                                                                                                                                                                    |
| `/api/connections/model/setup-token/code`   | `POST`; submits an authorization code for a setup-token flow ([route lines 14–47](../../../apps/web/app/api/connections/model/setup-token/code/route.ts#L14-L47)).                       | Same owner and constraints.                                                                                                                                                                                                                                                                                                                       |
| `/api/connections/model/setup-token/poll`   | `POST`; polls setup-token completion ([route lines 13–38](../../../apps/web/app/api/connections/model/setup-token/poll/route.ts#L13-L38)).                                               | Same owner and constraints.                                                                                                                                                                                                                                                                                                                       |
| `/api/connections/orchestrator/set-main`    | `POST`; changes the main orchestrator through the Connections/provisioning boundary ([route lines 16–37](../../../apps/web/app/api/connections/orchestrator/set-main/route.ts#L16-L37)). | PRD-006/PRD-013/Runtime Control. Its future owner destination must be resolved by the agent/runtime work, not left under generic Integrations merely because of the current prefix.                                                                                                                                                               |
| `/api/tasks/[cardId]/activity`              | `GET`; streams server-sent activity for a legacy task detail ([route lines 39–91](../../../apps/web/app/api/tasks/%5BcardId%5D/activity/route.ts#L39-L91)).                              | Legacy Project Management contract. A Dev Board stream must use DevTicket identity and execution-ledger semantics; retain this only for records still served by the legacy detail during expand/contract.                                                                                                                                         |
| `/api/tasks/ask-admin/turn`                 | `POST`; validates and streams the current Ask Admin turn despite the `/api/tasks` prefix ([route lines 611–656](../../../apps/web/app/api/tasks/ask-admin/turn/route.ts#L611-L656)).     | PRD-005/Ask Admin. Decouple naming only after the Ask Admin client/session path migrates; do not route assistant commands through Dev Board simply to preserve the prefix.                                                                                                                                                                        |
| `/healthz`                                  | `GET`; returns the deployment/liveness probe response with no-store caching ([route lines 1–14](../../../apps/web/app/healthz/route.ts#L1-L14)).                                         | Platform Ops. Not an Admin **Health** page and not subject to sidebar admission; keep its probe contract stable.                                                                                                                                                                                                                                  |

The current connection page loader centralizes authenticated session/snapshot acquisition, but
converts `ForbiddenError` into a redirect to `/`
([page-data lines 6–24](../../../apps/web/app/%28app%29/connections/_lib/page-data.ts#L6-L24)).
Current connection mutations perform a role check and use a shared provisioning action seam
([actions lines 15–21](../../../apps/web/app/%28app%29/connections/actions.ts#L15-L21),
[lines 76–126](../../../apps/web/app/%28app%29/connections/actions.ts#L76-L126)). Target pages
should reuse/deepen those server boundaries rather than replicate calls per leaf.

## Redirects and aliases that exist today

| Source                     | Current behavior                                                                                                                                                                                                                                                                                                        | Audit disposition                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/connections/gateway`     | Permanent Next.js redirect to `/connections` ([next config lines 8–15](../../../apps/web/next.config.ts#L8-L15)); a test locks that behavior ([test lines 5–15](../../../apps/web/test/next-config.test.ts#L5-L15)). This was selected by [Connections issue #175](https://github.com/anthonykewl20/opzava/issues/175). | A permanent redirect can be cached by browsers/intermediaries, so this path cannot safely become a live Gateway page or silently change targets without an explicit cache/transition plan. #249/#246 must choose a distinct canonical target or a bounded cache-aware migration; avoid a `/connections/gateway` → `/connections` → new-target chain. |
| `/connections/system`      | No HTTP redirect. It is a real hidden drilldown, while nav-active logic aliases it to `/connections` ([admin-nav lines 370–387](../../../apps/web/components/shell/admin-nav.tsx#L370-L387)).                                                                                                                           | Treat as a live route with data/deep-link compatibility, not as an already deprecated alias. Migrate anchor semantics before redirecting.                                                                                                                                                                                                            |
| `/` ↔ `/login` or `/setup` | Request-proxy admission redirects based on session/setup state ([proxy lines 5–47](../../../apps/web/proxy.ts#L5-L47)).                                                                                                                                                                                                 | Authentication/setup control flow, not route migration aliases. Preserve it around the new shell.                                                                                                                                                                                                                                                    |
| Mainframe `/dreams`        | Internal Control UI alias to its `dreaming` view ([navigation lines 83–90](../../../mainframe/ui/src/ui/navigation.ts#L83-L90)).                                                                                                                                                                                        | Internal upstream compatibility only. It creates no Opzava Admin route obligation.                                                                                                                                                                                                                                                                   |
| Mainframe `/`              | Internal Control UI canonicalizes root to `/chat` ([navigation lines 140–158](../../../mainframe/ui/src/ui/navigation.ts#L140-L158)).                                                                                                                                                                                   | Must not influence Opzava `/`, which is the Admin Overview placement.                                                                                                                                                                                                                                                                                |

No other current Opzava Admin page alias or redirect was found. In particular, `/connections/system`
is not a redirect, `/ask-opzava` has no correctly named alias yet, and `/tasks/[cardId]` has no
record-aware Dev Board redirect.

## Live query and fragment-state migration register

These URL states are current deep-link contracts. Their owner tickets must select semantic
equivalents before #246 chooses any canonical target encoding or compatibility redirect; the current
parameter/fragment spelling does not reserve the target URL.

| Current URL state                                  | Exact live contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Owner-safe migration disposition                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/issues?filter=<filter>&page=<page>`              | The page accepts `filter` and `page` ([issues page lines 24–28](../../../apps/web/app/%28app%29/issues/page.tsx#L24-L28)); generated links omit `filter=all` and `page=1` ([lines 375–385](../../../apps/web/app/%28app%29/issues/page.tsx#L375-L385)). Accepted filters are `all`, `needs-triage`, `ready-for-agent`, `ready-for-human`, `in-progress`, and `closed`; an unknown filter becomes `all` ([issues-state lines 42–51](../../../apps/web/lib/issues-state.ts#L42-L51), [lines 78–80](../../../apps/web/lib/issues-state.ts#L78-L80)). Page input is numeric and normalized into the available page window ([lines 202–208](../../../apps/web/lib/issues-state.ts#L202-L208)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | PRD-019 owns the equivalent DevTicket view/filter semantics. #246 must map both states atomically with `/issues`, preserve a valid selected view/page where an equivalent exists, and explicitly normalize unsupported legacy state; it must not assume the target uses `filter` or `page`.                                                                                                                                          |
| Connections `notice` and optional `provider` query | `/connections`, `/connections/providers`, `/connections/add`, and `/connections/github` parse `notice` plus optional `provider` ([overview lines 10–20](../../../apps/web/app/%28app%29/connections/page.tsx#L10-L20), [providers lines 9–20](../../../apps/web/app/%28app%29/connections/providers/page.tsx#L9-L20), [catalog lines 14–24](../../../apps/web/app/%28app%29/connections/add/page.tsx#L14-L24), [GitHub lines 16–27](../../../apps/web/app/%28app%29/connections/github/page.tsx#L16-L27)); `/connections/system` accepts `notice` only ([system lines 10–17](../../../apps/web/app/%28app%29/connections/system/page.tsx#L10-L17)). The recognized notices are `health-check-complete`, `health-check-error`, `connection-action-error`, `github-not-configured`, and `operator-admin-required`; `provider` affects only the provider-capable action-error/admin-required messages and unknown notices render nothing ([notice lines 3–44](../../../apps/web/app/%28app%29/connections/_components/page-notice.tsx#L3-L44)). Server actions build return URLs from a bounded base path and these parameters; refresh emits the two health values ([actions lines 39–70](../../../apps/web/app/%28app%29/connections/actions.ts#L39-L70), [lines 118–126](../../../apps/web/app/%28app%29/connections/actions.ts#L118-L126)). | #250 owns health-check outcome semantics; #245 owns GitHub-not-configured and GitHub enrollment return state; #249 owns provider-scoped runtime/setup outcomes. #246 owns the final compatibility encoding and must dispatch by source owner rather than forwarding every notice to one page. Preserve only a validated provider identifier, never credentials/setup codes; #247 separately resolves future step-up/approval policy. |
| `/connections/system#system-group-system-core`     | Generated from the live “System Core” group, which contains `gateway`, `event-loop`, `plugins`, and `context-engines` ([component lines 39–61](../../../apps/web/components/connections/connections-system-status.tsx#L39-L61), [lines 180–188](../../../apps/web/components/connections/connections-system-status.tsx#L180-L188)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | This anchor is mixed-owner: #249 classifies Gateway/runtime evidence and #250 classifies health evidence. #246 must retain it until those audits define an explicit split/compatibility result; a single guessed destination would lose part of its meaning.                                                                                                                                                                         |
| `/connections/system#system-group-channels`        | Generated from the live “Channels” group containing `channel` components ([component lines 45–61](../../../apps/web/components/connections/connections-system-status.tsx#L45-L61), [lines 180–188](../../../apps/web/components/connections/connections-system-status.tsx#L180-L188)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | #245 maps platform-integration channel evidence into the Integrations-owned local section. #246 then preserves this fragment intent through the selected compatibility mapping without publishing native channel routes.                                                                                                                                                                                                             |
| `/connections/system#system-group-agents`          | Generated from the live “Agents” group containing `agent` components ([component lines 45–61](../../../apps/web/components/connections/connections-system-status.tsx#L45-L61), [lines 180–188](../../../apps/web/components/connections/connections-system-status.tsx#L180-L188)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | #249 maps it to the owner-governed Agents evidence/section. #246 preserves the deep-link intent after that destination is selected; it must not infer Runner identity from an agent component.                                                                                                                                                                                                                                       |

There are exactly three current `system-group-*` fragments because the component derives IDs only
for those three declared groups. Sessions, Gateway detail, and Runtime are visible sections but do
not currently expose `system-group-*` fragment IDs; #246 must not fabricate legacy anchors for them.

## Mainframe/OpenClaw route and capability parity inventory

The Mainframe Control UI is active fork code and operational evidence, but the old “Control-UI port”
planning program is frozen. The native UI is a Vite/Lit SPA served by the Gateway and
authenticates/pairs directly with it
([Control UI docs lines 10–32](../../openclaw/web/control-ui.md#L10-L32)). Opzava product pages must
instead use Opzava ports/BFFs and the broker, preserving tenant ACLs, redaction, and product-owned
semantics. “Upstream capability exists” therefore does not mean “the Opzava adapter, projection, or
page is built” ([capability parity lines 43–62](../capability-parity.md#L43-L62)).

The exact internal view registry is defined in `mainframe/ui/src/ui/navigation.ts`
([lines 6–81](../../../mainframe/ui/src/ui/navigation.ts#L6-L81)):

| Internal Mainframe path        | Native purpose / state                                                                                                                                                                     | PRD-020 relationship and duplicate-authority guard                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/chat`                        | Active native chat.                                                                                                                                                                        | Behavioral parity input for pinned **Ask Admin Opzava** only. PRD-005 owns conversation/orchestration; do not expose or alias the raw Control UI chat.                                         |
| `/overview`                    | Active native runtime overview.                                                                                                                                                            | Contributes owner-governed runtime facts to **Develop → Overview** and **Health**. It is not the Admin Overview and must not define its composition/order.                                     |
| `/activity`                    | Active native browser-local activity view; activity is ephemeral and browser-local ([Control UI docs lines 173–177](../../openclaw/web/control-ui.md#L173-L177)).                          | Possible redacted evidence for **Recent Activity** or **Security & Audit** only through durable owner sources. It cannot become the Opzava audit/event ledger.                                 |
| `/workboard`                   | Active fork-native workboard view.                                                                                                                                                         | Explicitly not **Dev Board**. PRD-019/ADR-017 own DevTicket workflow; the native view is runtime evidence at most.                                                                             |
| `/channels`, `/communications` | Active native channel/communication views.                                                                                                                                                 | Platform GitHub/Slack enrollment belongs to **Integrations**; future customer/business channels belong outside the Admin shell. Do not copy the native channel taxonomy into Admin.            |
| `/instances`, `/nodes`         | Active native instance/node views.                                                                                                                                                         | Runtime evidence can contribute to **Gateway** and **Health**. An OpenClaw Node/Device is not a Dev Board **Runner**, and Workflows/Nodes are explicitly not v1 sidebar destinations.          |
| `/sessions`                    | Active native sessions view.                                                                                                                                                               | Capability input for **Sessions & Runs**. PRD-006 owns agent/run semantics and PRD-019 retains any DevTicket association.                                                                      |
| `/usage`                       | Active native usage view.                                                                                                                                                                  | Capability input for **Usage & Costs**. Operational placement transfers no Finance/billing authority.                                                                                          |
| `/cron`, `/automation`         | Active native scheduling/automation views.                                                                                                                                                 | Capability inputs for reserved **Automations**. No v1 Workflow editor or new workflow authority follows from them.                                                                             |
| `/agents`, `/ai-agents`        | Active native agent views.                                                                                                                                                                 | Capability inputs for **Agents**. PRD-006 defines identities, roles, and actions.                                                                                                              |
| `/skills`, `/skills/workshop`  | Active native skill inventory/workshop.                                                                                                                                                    | Capability input for **Runtime Skills** only. **Engineering Skills** remains an Opzava-governed catalog, and selecting either never grants tools.                                              |
| `/mcp`                         | Active native MCP operator page; upstream supports server inventory, tools, schemas, and bounded invocation ([Control UI docs lines 157–171](../../openclaw/web/control-ui.md#L157-L171)). | Capability input for **MCP Servers** through a dedicated Opzava policy projection. Browser/operator tokens and raw tool invocation do not cross into the product UI.                           |
| `/config`, `/infrastructure`   | Active native configuration/infrastructure views.                                                                                                                                          | Facts and bounded actions distribute among **Gateway**, **Models & Providers**, **Secrets**, **Security & Audit**, and owner-specific **Settings**. They are not a generic Settings authority. |
| `/debug`                       | Active native diagnostic view.                                                                                                                                                             | Redacted diagnostics may contribute to **Health**, **Logs**, and **Security & Audit**. Raw config/provider DTOs and hidden reasoning are prohibited.                                           |
| `/logs`                        | Active native live logs view.                                                                                                                                                              | Capability input for **Operate → Logs**, through PRD-012/018 redaction, authorization, retention, and correlation.                                                                             |
| `/appearance`                  | Active native UI preference view.                                                                                                                                                          | Does not own the Opzava theme preference. PRD-020's top-bar theme and profile Appearance shortcut edit one Opzava preference.                                                                  |
| `/dreaming` (`/dreams` alias)  | Active fork-native dreaming view.                                                                                                                                                          | No PRD-020 v1 destination. Keep internal; a new approved contract is required before product placement.                                                                                        |

There is no dedicated native `/models` Control UI route in the registry. **Models & Providers**
therefore needs an Opzava adapter/projection built from governed runtime/provider APIs; a sidebar
link cannot be justified by an assumed native page. Conversely, the presence of native views does
not authorize embedding or publishing them. The upstream feature list includes chat, activity,
channels, instances, sessions, cron, skills, nodes, approvals, config, MCP, debug, and logs, but
those capabilities still pass through Opzava ownership and security boundaries
([Control UI docs lines 98–171](../../openclaw/web/control-ui.md#L98-L171)).

## Target placement decomposition

The locked Admin hierarchy is exactly the pinned Ask Admin entry followed by **Develop**, **AI
Runtime**, **Operate**, and **Configure**, with no more than two sidebar levels
([PRD-020 lines 288–307](../../prd/PRD-020-admin-control-center.md#L288-L307)). The following
decomposition is the bounded migration map; it does not claim the target leaves exist.

| Target destination | Current Opzava inputs                                                                                           | Internal/upstream parity inputs                                             | Authority retained by                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Ask Admin Opzava   | `/ask-opzava`, `/api/tasks/ask-admin/turn`                                                                      | `/chat`                                                                     | PRD-005/#210; bounded actions reauthorize in their owners.       |
| Overview           | `/` placeholder; shell task/issue/connection counts                                                             | `/overview`, selected owner facts only                                      | PRD-020 composition; source owners for every row.                |
| Dev Board          | `/tasks`, `/tasks/[cardId]`, `/issues`                                                                          | Runtime execution evidence, never `/workboard` authority                    | PRD-019/ADR-017 and GitHub for native facts.                     |
| Runners            | No dedicated current route                                                                                      | Runtime endpoint/node facts only after explicit enrollment mapping          | PRD-013 setup; PRD-019/ADR-017 leases/execution.                 |
| Environments       | No dedicated current route                                                                                      | Infrastructure evidence only                                                | Runtime Control/Platform Ops; PRD-019 Review evidence.           |
| Gateway            | `/connections` Gateway card; `/connections/system` Gateway/runtime rows; legacy `/connections/gateway` redirect | `/overview`, `/instances`, `/nodes`, `/config`, `/infrastructure`, `/debug` | PRD-013/Runtime Control; PRD-018 remediation.                    |
| Models & Providers | `/connections/providers`; provider portions of `/connections` and API family                                    | Runtime provider/model APIs; no native page alias                           | PRD-013/Runtime Control; PRD-006 consumes selections.            |
| Agents             | `/connections/system` agent evidence; orchestrator setup command                                                | `/agents`, `/ai-agents`                                                     | PRD-006; PRD-007 only for knowledge/skill projections.           |
| Runtime Skills     | No dedicated product route                                                                                      | `/skills`, `/skills/workshop`                                               | PRD-007/013 and Runtime Control admission.                       |
| Sessions & Runs    | `/connections/system` session evidence; Ask Admin runtime history is not the whole destination                  | `/sessions`                                                                 | PRD-006; PRD-019 for DevTicket association.                      |
| Automations        | No dedicated product route                                                                                      | `/cron`, `/automation`                                                      | PRD-006/Runtime Control, reserved v1 scope only.                 |
| Health             | System Health and system drilldown portions of `/connections`; current top-bar health                           | `/overview`, `/debug`, `/logs`, `/nodes` owner projections                  | PRD-012/018; contributing contexts retain state semantics.       |
| Incidents          | Legacy `/issues` is migration evidence only, not the incident lifecycle                                         | Diagnostics/log inputs                                                      | PRD-012/018; lasting fixes link to PRD-019 DevTickets.           |
| Logs               | No dedicated product route                                                                                      | `/logs`, bounded `/debug` evidence                                          | PRD-012/018.                                                     |
| Usage & Costs      | No dedicated product route                                                                                      | `/usage`                                                                    | Runtime/usage entitlement owner; no Finance authority.           |
| Integrations       | `/connections/github`, `/connections/add`, third-party portion of `/connections`; GitHub readiness              | `/channels`, `/communications` only for platform integrations               | PRD-013 setup; PRD-019/ADR-017 GitHub sync.                      |
| Engineering Skills | No dedicated product route                                                                                      | None; native skills are Runtime Skills                                      | PRD-007/013 governed engineering catalog.                        |
| MCP Servers        | No dedicated product route                                                                                      | `/mcp`                                                                      | PRD-013; policy/secret owners.                                   |
| Secrets            | Provider/GitHub named-secret setup hidden behind current flows                                                  | Config evidence only; never raw values                                      | PRD-013/Runtime Control and PRD-001 step-up.                     |
| Security & Audit   | No dedicated product route; existing action/audit evidence remains distributed                                  | Approvals, `/activity`, `/debug`, `/logs` as inputs only                    | PRD-001/012/018 and Platform Ops.                                |
| Settings           | No dedicated product route; appearance is in shell                                                              | `/appearance`, `/config` are evidence only                                  | PRD-001 for account/profile; each domain owner for its settings. |

## Duplicate-authority and semantic-drift risks

1. **Connections as a second control plane.** Keeping the current composite page while building
   Gateway, Providers, Health, and Integrations independently would create competing status and
   setup commands. Each new leaf must consume the existing owner port/projection; the old page
   becomes a compatibility consumer until removal.
2. **Overview name collision.** Opzava Admin Overview composes Needs Your Attention, Active
   Delivery, Development Readiness, and Recent Activity in that order; native OpenClaw `/overview`
   is only one runtime source. Persisting an “Admin overview snapshot” or cloning native state would
   violate the read-only, rebuildable composition contract
   ([PRD-020 lines 325–335](../../prd/PRD-020-admin-control-center.md#L325-L335)).
3. **Health/attention collapse.** The current health pill can display task/issue attention and links
   to Connections. The target requires separate destinations and proves that healthy can coexist
   with attention and degraded can coexist with zero attention
   ([PRD-020 lines 497–501](../../prd/PRD-020-admin-control-center.md#L497-L501)).
4. **Dev Board identity collapse.** `/tasks`, `/issues`, and native `/workboard` describe three
   different authorities. A label-only change would confuse Project Management card IDs, GitHub
   issue numbers, and DevTicket IDs. ADR-017 requires expand/contract and redirects only after
   verified cutover
   ([ADR-017 lines 265–269](../../adr/ADR-017-dev-board-authority-sync-execution.md#L265-L269)).
5. **Ask Admin naming collision.** `/ask-opzava`, palette text “Ask Opzava,” assistant key
   `ask-admin-opzava`, and native `/chat` can look interchangeable but are not. #210 owns the
   product URL/name migration; session and tool-policy identity must remain Ask Admin.
6. **GitHub setup versus sync authority.** Integrations owns App enrollment, permissions, webhook
   health, and repair; Dev Board owns mirrored content and workflow synchronization. Either page may
   project health, but neither may implement a second sync ledger
   ([foundation decisions lines 127–131](../admin-control-center-foundation-decisions.md#L127-L131)).
7. **Runner/Node/Device collapse.** Native instance/node data can support readiness, but only
   explicitly enrolled endpoints with the PRD-019/ADR-017 lease contract are Runners. Node trust
   cannot grant work authority.
8. **Skill/tool collapse.** Native `/skills` maps to Runtime Skills, not Engineering Skills; `/mcp`
   maps to endpoints/tools, not a skill type. Policy is deny-wins and neither UI selection nor
   installation grants a Gateway token
   ([foundation decisions lines 113–121](../admin-control-center-foundation-decisions.md#L113-L121)).
9. **Settings junk drawer.** Moving all legacy setup/config into Settings would erase semantic
   owners. Gateway, providers, integrations, MCP, secrets, runner, environment, and security actions
   stay in their focused leaves.
10. **Hard-coded shell as authorization.** Current nav/palette items and counts are built from a
    fixed set. PRD-020 requires admitted routes and records only, per-leaf/source authorization,
    cache invalidation on grants, and 403 on denied deep links
    ([PRD-020 lines 309–323](../../prd/PRD-020-admin-control-center.md#L309-L323)). Navigation
    visibility cannot become the gate.
11. **Empty-success masking.** Current shell loading converts failed task/issue/connection inputs to
    empty/null values ([shell-state lines 274–337](../../../apps/web/lib/shell-state.ts#L274-L337));
    several current pages redirect forbidden users to `/`. The target contract distinguishes
    forbidden, unavailable, not configured, stale, unknown, and real zero.
12. **Direct Control UI escape hatch.** Publishing/embedding the native UI would bypass the broker
    ACL and expose direct Gateway authentication, raw DTOs, config, logs, and tools. Internal SSH
    break-glass can remain operationally available, but it is not product navigation.

## Bounded migration seams

### Seam 1 — route/admission registry before pages move

Create one server-owned Admin destination registry keyed by stable destination identifiers, not
yet-assumed URLs. It supplies exact label/order/icon, current selected destination, capability
admission, and compatibility metadata to sidebar, palette, top bar, and route guards. Each route
still performs its owner authorization. Existing Owner/Admin-role compatibility remains during
migration, while denied root/deep links become hard 403 rather than redirect/empty results
([PRD-020 lines 52–59](../../prd/PRD-020-admin-control-center.md#L52-L59),
[lines 311–323](../../prd/PRD-020-admin-control-center.md#L311-L323)).

### Seam 2 — shell parallel adoption

Introduce the shared PRD-020 shell around existing pages without changing their semantic behavior.
Replace the hard-coded nav/palette/health destination lists with the registry, but keep legacy
routes admitted while their target leaves are not at parity. The shell must not turn legacy counts
into PRD-020 attention badges or unknown state into healthy state.

### Seam 3 — extract read projections before commands

For each Connections section, build/reuse an owner application query and browser-safe projection.
Have both the legacy page and the new destination read that same projection during the overlap. Do
not create a destination-specific database/store, fetch the Gateway directly, or persist the
Overview composition. The current connection snapshot already has a safe unavailable fallback when
the provisioning worker is unavailable
([connections lib lines 525–562](../../../apps/web/lib/connections.ts#L525-L562)); retain explicit
unavailable/stale semantics rather than zeroing.

### Seam 4 — move setup/commands through owner ports

Move GitHub, provider, Gateway, MCP, Runner, Environment, and Secret actions one owner leaf at a
time. The UI route can change while the server application command remains stable. Every command
reauthorizes, validates, audits, is idempotent where required, and preserves secret-reference rules.
Only after all consumers move should an `/api/connections/*` compatibility route be renamed or
retired.

### Seam 5 — record-aware Dev Board expand/contract

Follow the approved sequence: introduce DevTickets and mappings; dual-read/reconcile; cut
list/detail consumers; verify execution/review/GitHub parity; then install record-aware legacy
redirects. The migration manifest explicitly delays `/tasks`, `/tasks/<card>`, and `/issues`
redirects until after reconciliation and preserves GitHub links
([migration manifest lines 311–334](../dev-board-migration-manifest.md#L311-L334)). `/dev-board` is
the target family; this audit does not choose its local view/query schema.

### Seam 6 — compatibility cutover

For a current route, compatibility begins only when the destination has verified real-stack parity
for:

- authorized success and all owner-defined commands;
- forbidden as hard 403, not a root redirect or empty state;
- loading, clear, not-configured, stale, unavailable, unknown, degraded, and recovery states;
- deep links, dynamic record identity, query parameters, fragments/anchors, and back/forward
  behavior;
- mobile/desktop navigation, palette/search, top-bar owner links, and active destination;
- source provenance/freshness and no secret/raw Gateway DTO disclosure.

Redirect old static detail routes directly to the selected target path, preserving safe
query/fragment intent. Use a server-side mapping for dynamic IDs. Avoid chains and loops by updating
every shell/palette link in the same cutover. Because the existing `/connections/gateway` redirect
is permanent and may already be cached, do not rely on rewriting it for cached clients or reuse that
path as a live page; #249/#246 must provide a distinct target or an explicit cache-aware transition.
Keep rollback possible until route-use telemetry and owner reconciliation show no unsupported
consumer.

### Seam 7 — retirement

Remove a legacy page/API only after its compatibility window, telemetry, and rollback criteria are
approved and all target consumers are verified. Delete duplicate presentation code, not the owner
ports or audit/history. Frozen historical files remain untouched. PRD-020's acceptance gate requires
real local-stack authentication/seeded data and side-by-side visual evidence, not fixture-only
screenshots
([foundation decisions lines 174–183](../admin-control-center-foundation-decisions.md#L174-L183)).

## Sad-path contract for route migration

| Failure                                                | Required behavior                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root Admin capability denied                           | Hard 403. Do not render an empty shell, redirect to `/`, or query leaf sources.                                                                                                                                                            |
| Leaf/source permission denied                          | Filter navigation/search without disclosing existence; a directly requested denied leaf returns 403. Expected composition admission may omit a source, but an unexpected downstream 403 is a security/contract failure, not “unavailable.” |
| Grant revoked while shell/cache is warm                | Invalidate on authorization version; old navigation state cannot admit the route or leak cached facts.                                                                                                                                     |
| One projection unavailable/stale/unknown               | Keep the shell and verified sections usable; label source, last-confirmed evidence and freshness. Never convert to healthy or zero ([PRD-020 lines 470–491](../../prd/PRD-020-admin-control-center.md#L470-L491)).                         |
| Provisioning worker unavailable                        | Preserve the explicit unavailable snapshot and retry/owner route; do not make browser code call the Gateway.                                                                                                                               |
| Legacy task ID has no DevTicket mapping                | Return an explicit not-migrated/quarantined/not-found outcome according to the migration record. Never send it to an unrelated Dev Board record.                                                                                           |
| GitHub record is not a DevTicket                       | Preserve the native GitHub URL/fact and explain the product disposition; do not fabricate DevTicket authority.                                                                                                                             |
| Redirect query or fragment is unknown                  | Preserve known safe state; reject or land at an explicit destination root for unknown state without redirect loops. Never forward secrets/setup codes in URLs.                                                                             |
| Old and new pages disagree during overlap              | Owner port/projection wins; surface freshness/version mismatch and stop command duplication. Do not resolve by copying whichever UI value looks newer.                                                                                     |
| Target leaf is absent or incomplete                    | Keep the current route active. A sidebar placeholder is not parity and is not grounds for a redirect.                                                                                                                                      |
| Direct Gateway/Control UI is unavailable               | Product surfaces remain independently navigable and show bounded unavailable state. SSH break-glass remains an operator procedure, not an alternate customer link.                                                                         |
| Compatibility redirect target becomes forbidden        | Authorization runs at the target; the redirect does not confer access. Return 403 without leaking the record/destination.                                                                                                                  |
| Redirect loop/chain or permanent-cache trap introduced | Fail deployment tests; each legacy route must resolve once to the current canonical destination. Explicitly test cached `/connections/gateway` behavior and do not assume changing its permanent redirect reaches prior clients.           |

## Resolved decisions

1. PRD-020 is placement/composition authority only; it does not acquire any leaf's data or command
   semantics.
2. The exact pinned item, four groups, destination names/order, and two-level limit are locked.
3. Production target URL paths are **not** resolved by the foundation and must not be invented here.
   `/dev-board` is the one already contracted target family.
4. Current Tasks, Issues, and Connections routes are live migration evidence. They stay available
   until owner destinations have verified parity.
5. Connections decomposes by semantics: health → Health, Gateway runtime → Gateway, provider/model
   setup → Models & Providers, external platform setup → Integrations.
6. Integrations replaces the generic Connections overview in the final hierarchy, but does not
   absorb Gateway, MCP, Runner, Environment, Secret, audit, or future customer/business connections
   ([foundation decisions lines 123–134](../admin-control-center-foundation-decisions.md#L123-L134)).
7. GitHub setup lives in Integrations; GitHub work/sync authority remains Dev Board/GitHub.
8. OpenClaw/Mainframe native views remain internal capability evidence and SSH break-glass, never
   public Opzava route aliases.
9. Overview and Health may project runtime facts without taking runtime authority. Health and human
   attention remain separate.
10. Engineering Skills, Runtime Skills, MCP Servers, Runners, and OpenClaw Nodes/Devices remain
    distinct.
11. Deep links are preserved or intentionally redirected only after verified parity. Dynamic task
    details require record-aware mapping.
12. Authorization must migrate from current redirect/empty behavior to admission plus hard 403
    without treating the shell as the authority.

## Rejected alternatives

- Rename `/connections` to Integrations while keeping its current System/Gateway/Provider monolith.
- Publish, iframe, or reverse-proxy the native Control UI as the Admin Control Center.
- Treat native `/overview`, `/workboard`, `/chat`, or `/nodes` as aliases for Overview, Dev Board,
  Ask Admin, or Runners.
- Preserve current Operate/Automate/Connections group names merely because they are live.
- Redirect `/tasks`, `/tasks/[cardId]`, or `/issues` before identity/backfill/reconciliation is
  verified.
- Use one blanket legacy redirect for every `/connections/*` route, losing their distinct owners and
  deep links.
- Put all setup/configuration in Settings or keep `/connections/add` as a universal setup wizard.
- Add `/connections/system`, Nodes, Workflows, or internal Control UI paths as third-level/sidebar
  destinations.
- Make navigation visibility, palette membership, or a visible action sufficient authorization.
- Convert forbidden, unavailable, stale, or unknown to an empty list, zero badge, healthy state, or
  root redirect.
- Create Admin-owned copies of Gateway state, GitHub sync state, DevTickets, Incidents, runtime
  sessions, skills, approvals, or audit events.
- Copy prototype fixtures or frozen Control-UI port artifacts into production as semantic truth.
  Variants B/C are also rejected as Overview layouts
  ([foundation decisions lines 160–168](../admin-control-center-foundation-decisions.md#L160-L168)).

## Remaining decisions / fog

These are real downstream decisions, not permission to infer answers:

1. Canonical production URLs for every PRD-020 destination except `/dev-board`, including whether
   Overview remains `/`, are unresolved by ACC-D09 and belong to final synthesis/approved
   implementation issues.
2. The canonical Ask Admin URL, `/ask-opzava` deprecation duration, and session/deep-link
   preservation belong to #210 and final route synthesis.
3. `/connections/system` anchor-by-anchor mappings, its bare-route final destination, and which
   evidence is a Health-local drilldown versus an owner-leaf link require the AI Runtime and Operate
   audits.
4. The exact compatibility duration, route-use telemetry, rollback threshold, and removal release
   are not specified.
5. Whether `/api/connections/*` remains a durable private compatibility namespace or is renamed
   after consumer migration is unresolved; page placement alone cannot decide it.
6. The GitHub Integrations leaf's local view, setup/history presentation, and return URLs remain
   #245 work; its semantic ownership is resolved.
7. Capability-backed Admin admission, per-leaf gates, authorization-version cache behavior, and
   hard-403 presentation are target requirements but not present in the as-built fixed nav/pages.
8. The current Mainframe fork/native feature audit still has open evidence gaps tracked by
   [#192](https://github.com/anthonykewl20/opzava/issues/192) and
   [#193](https://github.com/anthonykewl20/opzava/issues/193); this can constrain parity claims but
   cannot change the locked placement.

## Downstream constraints

| Downstream ticket                                                                                     | Constraint supplied by this audit                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#243 — Skills/MCP placement](https://github.com/anthonykewl20/opzava/issues/243)                     | Must keep Engineering Skills, Runtime Skills, Ask Admin subset, and MCP Servers separate; native `/skills` and `/mcp` are capability inputs only.                                                                                             |
| [#244 — Runner/Environment/Docker/reviewer setup](https://github.com/anthonykewl20/opzava/issues/244) | Must not infer Runner identity from `/nodes`/`/instances`; setup mutations leave generic Connections and land with their semantic owner.                                                                                                      |
| [#245 — GitHub/Integrations migration](https://github.com/anthonykewl20/opzava/issues/245)            | Must migrate `/connections/github` and `/connections/add` to Integrations while leaving GitHub sync/work authority with PRD-019/ADR-017.                                                                                                      |
| [#247 — Security/Settings/account](https://github.com/anthonykewl20/opzava/issues/247)                | Must not make Settings a configuration junk drawer; account/session security remains PRD-001 and secrets/audit remain focused destinations.                                                                                                   |
| [#249 — AI Runtime route family](https://github.com/anthonykewl20/opzava/issues/249)                  | Must decompose `/connections`, `/connections/system`, `/connections/providers`, and internal native views without publishing Control UI routes or inventing target URLs.                                                                      |
| [#250 — Operate/attention](https://github.com/anthonykewl20/opzava/issues/250)                        | Must separate Health from attention, preserve explicit unavailable/stale/unknown states, and classify system drilldown evidence by owner.                                                                                                     |
| [#246 — final route/ownership synthesis](https://github.com/anthonykewl20/opzava/issues/246)          | May select canonical production URLs and order the migration only after consuming the child audits. It must include the redirect/alias register, record-aware Dev Board rules, API consumer seams, and compatibility/rollback criteria above. |
| [#248 — prototypes](https://github.com/anthonykewl20/opzava/issues/248)                               | May validate layout and interaction only. It cannot make a fixture route, count, action, identity, or native Control UI view authoritative.                                                                                                   |

## Acceptance implications for implementation tickets

Any ticket that moves one of these routes should state, before implementation:

- the exact current source path and selected target path;
- the destination identifier and semantic owner;
- every read projection and command/API consumer involved;
- authorization for root, leaf, source, action, and redirected deep links;
- record/query/fragment mapping and missing-record behavior;
- coexistence, telemetry, rollback, and removal gates;
- tests for direct deep links, palette/sidebar/top-bar links, back/forward, forbidden, stale,
  unavailable, unknown, and recovery;
- real-stack parity evidence proving the old capability exists on the target page before
  redirect/removal.

That is the minimum boundary needed for #246 to turn placement decisions into an executable route
graph without silently changing domain semantics.
