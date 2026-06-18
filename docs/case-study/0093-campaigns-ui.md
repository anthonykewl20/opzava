# 0093: Campaigns Compose And Approve UI

## Problem

Opzava operators needed a way to compose email campaign drafts, review existing campaigns, and approve drafts for sending — all from the control plane UI. The critical constraint: the UI must never own workflow logic. Sequence, validation, approval, and exactly-once guarantees belong entirely to the server-side Campaign aggregate. The browser is a thin client that requests transitions; it never decides them.

## Approach

A single React panel (`campaigns-panel.tsx`) was built following existing conventions (form idiom from `provider-connections-section.tsx`, approve-action idiom from `exec-approval-panel.tsx`). To stay within complexity budgets, the panel was split into three subcomponents:

- **StepEditor** — repeatable campaign step (subject, HTML body, offset-hours)
- **ComposeSection** — draft form (name, start time, recipients textarea with client-side de-duplication/parsing, steps list)
- **CampaignList** — table of campaigns with status pills (`draft`/`approved`/`sending`/`sent`/`failed`) and an Approve button visible only on drafts

The panel is registered as a nav item (`'campaigns'`, AUTOMATE group, new `CampaignsIcon`) in `nav-rail.tsx` and routed via `case 'campaigns'` in the ContentRouter switch. Styling uses existing tokens: `surface-1`, `void-cyan`, emerald/amber/red pills, `border/30`.

## Contract

All state-changing actions call admin-only API routes:

| Action | Route | Effect |
|---|---|---|
| Create draft | `POST /api/campaigns` | Persists a new campaign in `draft` state |
| Approve draft | `POST /api/campaigns/[id]/approve` | Transitions `draft → approved` server-side |

The browser holds **no** transition logic. The Approve button simply fires the request; the server's state machine decides whether the transition is valid. Loading, error, and feedback states are handled locally in the panel.

## Validation

- `tsc` — clean, zero type errors.
- `eslint` — zero errors on new files.
- Production build compiles the new route and panel without warnings.
- Check-plan assertion verifies: panel file exists, nav rail contains id `'campaigns'`, ContentRouter maps `case 'campaigns'` → `CampaignsPanel`.
- Component splits keep every function under the 250-line / 160-char complexity budgets.

## Security & Audit

No secret values, private credentials, tokens are handled in the browser — the panel sends only campaign names, recipients, subjects, HTML, and scheduling metadata to admin-gated routes. The email provider secret never reaches the client and stays behind the connection's `SecretReference`. The UI cannot skip approval or force-send: it only requests transitions the server's state machine permits, and the Approve button appears only on drafts.

## Next Case Study Thread

The natural next slice: a **campaign Run action/endpoint** that constructs a `createCampaignRunnerWorker` from saved Resend settings to actually send an approved campaign, paired with a "Run" / "Sending" UI affordance. Beyond that, richer artifact and run-state panels — Layer 9 content runs, an approval queue, failure and dead-letter views, and per-campaign cost tracking.
