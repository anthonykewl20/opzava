# Connections IA Redesign - locked design

Status: design locked (grilling, 2026-07-12). Not yet built.
Governs the UI/IA of the Connections surface specified functionally by `docs/prd/PRD-013-connections-tools.md`.
This is an information-architecture + navigation refactor of the existing page; it does not change PRD-013 behavior, ports, worker, or APIs.

## Problem

`/connections` stacks three unlike domains plus summary tiles on one scroll:
gateway health, a 27-provider model-providers panel (4 tier tabs), and GitHub - all competing for attention at once.
It violates Hick's Law and Nielsen H8 (minimalist design) and does not scale to the future 3rd-party integrations it must host.
Goal: one focus at a time, clear segregation of which connection is which, and a structure that scales as integrations grow.

Evidence: real logged-in screenshot of the current page captured 2026-07-12 (owner login, dark theme) confirms three domains + two stat tiles + footer on a single surface.

## Decisions (locked)

1. **Pattern** - rail-as-master + full-width detail. A master/detail model, with the master promoted into the global rail (no second sidebar).
2. **Navigation** - the global rail `Connections` entry (under Automate) is an expand/collapse toggle revealing sub-items:
   ```
   Connections            (toggle)
     Overview             -> /connections
     Gateway              -> /connections/gateway
     Model Providers 2/27 -> /connections/providers
     [connected integrations, e.g. GitHub once connected]
     + Add integration    -> /connections/add
   ```
   - Sub-items carry live status (dot / count), mirroring today's green connected dot.
   - `Overview` is an explicit sub-item (not the parent label).
3. **Routing** - one sub-route per connection under `/connections/*`. Deep-linkable, back/forward and refresh stable. Post-action `?notice=`/`provider=` redirects target the specific sub-route.
4. **Default landing** - bare `/connections` renders the **Overview** home in the full-width content area: a compact per-connection status summary (absorbs the two former top-of-page stat tiles) plus jump-in links. The standalone stat tiles are removed.
5. **List granularity** - one row per domain. Model Providers is a single row; its 27 providers and 4 tier tabs stay inside its detail pane, never in the list.
6. **Integrations model** - the list shows only connected connections. `+ Add integration` opens a catalog of available integrations to connect; a newly connected integration becomes its own rail sub-item + `/connections/<slug>` detail. Disconnecting returns it to the catalog. Keeps the list short as integrations multiply.
7. **Catalog scope** - the catalog lists only integrations that actually work (today: GitHub). No "coming soon" vaporware / non-functional cards.

## Detail routes (each shows ONE connection, full width)

- **Overview** (`/connections`) - compact status summary of every connection + jump-in links. No standalone stat tiles.
- **Gateway** (`/connections/gateway`) - read-only status/auth/catalog/heartbeat/hosts + Run health check. Platform infra: not disconnectable, no connect action.
- **Model Providers** (`/connections/providers`) - the existing `ModelProvidersPanel` unchanged (tier tabs, search, table, connect/manage/disconnect/set-main).
- **Integration detail** (e.g. `/connections/github`) - status/repo/account/scopes + connect/reconnect/disconnect. Appears in the rail only while connected.
- **Add** (`/connections/add`) - catalog of real integrations (GitHub today). Connect -> becomes a rail sub-item + its own route.

## Scope

- Pure frontend/routing refactor. Reuse `loadConnectionsPageData`, existing server actions (`refreshConnectionsAction`, `startGitHubDeviceFlowAction`, `disconnectGitHubAction`, `applyOrchestratorRolesAction`), the `/api/connections/*` routes, and existing components. No `packages/ports`, provisioning-worker, or API changes.
- Each sub-route renders only its slice of the one `ConnectionsSnapshot`.

## Out of scope (recorded, not building now)

- Further simplifying the Model Providers panel internals (4 tier tabs / 27 rows). It is now isolated to its own focused route; revisit only if it still feels dense in use. Separate follow-up.

## Non-functional

- Responsive: existing mobile rail (hamburger drawer) hosts the nesting; detail is full-width. On narrow screens, nav then detail.
- Every route designs its states: loading (skeleton), empty (e.g. no integrations connected), error (secret-redacted), offline/degraded (worker unavailable snapshot).
- A11y: `aria-current` on the active sub-item, focus moves to the detail heading on navigation, WCAG 2.2 contrast/target/focus. Light + dark parity.
- Mockup functional parity (EXECUTION.md directive): every visible element functions live with real data; no dead chrome.

## Verification bar

- Reuse/extend `tests/e2e/drives/connections.mjs` (real login, real interactions) for the providers route; add drivers for Overview, Gateway, GitHub connect/disconnect, and the Add catalog.
- Frontend reviewer loop (real browser) during build; mechanical gate for shippable.
- SeniorQA final gate: `node tests/e2e/gate/real-world-validate.mjs` against `http://web.opzava.localhost:18088`, 2 consecutive clean runs.
