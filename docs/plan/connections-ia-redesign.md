# Connections IA Redesign - implemented

Status: current and implemented (2026-07-14).

This document records the shipped information architecture for Connections. The live health contract
and Overview layout are governed by `docs/plan/connections-overview-health.md`; this document owns
the route and navigation model around those surfaces.

## Problem resolved

The original `/connections` page stacked gateway diagnostics, a large model-provider panel, and
GitHub management into one scroll. It mixed platform substrate with manageable connections and made
each domain compete for attention. The current master/detail structure keeps the global rail as the
master and gives each connection a focused, deep-linkable detail surface.

## Current rail

`Connections` is a normal title-case disclosure item under the `AUTOMATE` section. Expanding it
shows:

```text
Connections
  Overview                  -> /connections
  Model Providers N/M       -> /connections/providers
  [connected integrations]  -> /connections/<slug>
  Add integration           -> /connections/add
```

- `Overview` is the active rail item for both `/connections` and `/connections/system`.
- `Model Providers` is rendered in full and carries the live connected/total count.
- Connected integrations such as GitHub appear only while connected.
- `Add integration` lists only integrations that actually work; it contains no coming-soon
  placeholders.
- `System status` is deliberately absent from the rail. It is a diagnostic drill-down from the
  Overview, not a manageable connection.
- `Gateway` is absent from the rail.

The disclosure header never claims `aria-current`; exactly one visible destination does. Nested rows
remain compact on desktop and retain a 44px minimum touch target on narrow screens.

## Current routes and scopes

### Overview - `/connections`

The Overview has two panels: the OpenClaw system-health summary and a three-card inventory grid for
Opzava Gateway, Model Providers, and Third-Party Integrations. It shows the shape of a problem and
links to the focused surface that can answer it. It does not duplicate component cards, sessions, or
runtime diagnostics.

### System status - `/connections/system`

The diagnostic drill-down reached from Overview. It renders the same request-scoped
`ConnectionsSnapshot` as the Overview and shell health pill:

- OpenClaw components grouped as System Core, Channels, and Agents;
- warnings kept separate from failed components;
- sessions restricted to the browser-safe allowlist;
- gateway detail and runtime facts exposed by the DTO.

It has no provider/orchestrator management UI and is not represented in the rail.

### Model Providers - `/connections/providers`

The focused provider management surface: provider status, tier/search controls, connect/manage,
disconnect, model selection, and orchestrator/subagent role labels.

### Integration detail - `/connections/<slug>`

A focused management surface for a real integration, such as GitHub. A connected integration appears
in the rail; disconnecting returns it to the Add catalog.

### Add integration - `/connections/add`

The catalog of integrations that can actually be connected. GitHub is the only current entry.

### Removed Gateway route

`/connections/gateway` was removed and permanently redirects to `/connections`, preserving old
bookmarks without maintaining a duplicate diagnostic page. The Overview owns the gateway summary and
health-check action; `/connections/system` owns detailed health facts.

## Rationale

The Gateway is platform substrate, not a manageable connection: it cannot be connected,
disconnected, or configured from this UI. Giving it a peer route beside Model Providers and GitHub
falsely implied otherwise. It also created two health surfaces that could drift and report different
answers. One Overview summary plus one System drill-down keeps the health rollup and underlying
facts aligned.

## Non-functional contract

- Every route uses live `ConnectionsSnapshot` facts; no fabricated counts, hosts, paths, or
  configuration values.
- `not_checked` remains neutral and visually distinct from a probed failure.
- Loading, empty, error, and degraded states remain explicit and secret-redacted.
- Navigation is deep-linkable and refresh/back-forward stable.
- Focus-visible styling, semantic headings, keyboard-operable disclosures, and mobile touch targets
  meet the shared shell accessibility contract.
- The Overview, System page, and shell use the same OpenClaw health rollup.

## Verification

Unit and component tests cover the System status state matrix, warning separation, session privacy,
exact accordion labels, active rail mapping, and the permanent redirect. Real-login E2E coverage and
paired screenshots for the Overview scenarios and System detail are owned by #182. The release gate
remains two consecutive clean runs of `node tests/e2e/gate/real-world-validate.mjs` against the real
local stack.

### #181 pending-flow cancellation amendment

The approved provider-card mockup requires `Cancel authorisation` on a pending OAuth device flow.
That action cannot be honest UI-only chrome, so this is the narrow exception to #181's original “no
ports/worker/API changes” boundary: the card sends only its opaque `model:<uuid>` flow id through an
authenticated BFF and worker route. The worker derives tenant/provider ownership, makes foreign and
missing ids indistinguishable, invalidates the flow generation before awaiting, and removes the flow
only after Docker verifies the login stopped and its private log was securely deleted. A stop that
cannot be verified keeps the flow retryable and returns a redacted error; cancellation never
disconnects an already-completed credential.
