# 0072: Provider Connection Settings And Wizard Step

Date: 2026-06-17
Status: Draft
Thread: The WordPress and Resend connection configs from slices 0070/0071 needed to be editable in admin settings and captured during initial setup. This slice makes provider credentials first-class, write-only settings — surfaced in both the settings panel and an optional wizard step — without building parallel infrastructure.

## Hook

A provider connection is only as good as the operator's ability to change it. Hardcoded or hidden configs rot. Users need to see what's connected, update it, and onboard without friction — or skip and stay in mock mode.

## Product Stakes

If connection settings aren't editable, any credential rotation or provider swap requires a deploy. If the wizard doesn't capture them, new users land in a broken state with no guidance. Both paths kill adoption velocity.

## Industry Counterfactual

Most WordPress-adjacent SaaS tools bake credentials into `wp-config.php` or a `.env` file and call it done. Editing requires SSH. Onboarding is a README. There's no write-only secret handling — a GET endpoint happily returns your API key in plaintext.

## What We Built

Extended the existing Opzava `settingDefinitions` in `src/app/api/settings/route.ts` with a `sensitive?: boolean` flag and five new keys under a "Provider Connections" group: `wordpress_site_url`, `wordpress_app_password` (sensitive), `resend_from_address`, `resend_from_name`, `resend_api_key` (sensitive). Backend built by a fleet gpt build-agent; UI/UX hand-designed by Opus 4.8 per directive.

GET never returns a secret value — it returns a `[redacted]` marker plus a `configured` boolean. PUT validates `wordpress_site_url` and `resend_from_address` against `wordpressConnectionConfigSchema` and `resendConnectionConfigSchema`. A blank submit for a sensitive key does not overwrite an already-stored secret.

UI: a "Provider Connections" section in `src/components/settings/provider-connections-section.tsx` — WordPress card (site URL + write-only application-password field) and Resend card (from address, from name, write-only API key). Secret fields are never prefilled; they show a "saved — leave blank to keep" hint and a "saved" marker when configured. Connected/Not-configured status pills. Wired into `src/components/panels/settings-panel.tsx`.

Wizard: `src/components/settings/setup-connections-step.tsx` rendered in `src/app/setup/page.tsx` after admin account creation. Optional "Connect your providers" step with "Skip for now" / "Continue to dashboard". Reuses `ProviderConnectionsSection` — DRY. Skippable; workflow stays draft-only/mock until configured.

## What We Refused To Fake

Secrets are write-only — never returned by GET, never prefilled in the UI, a blank submit never wipes a saved secret. Did not build parallel settings infra; extended the existing one. Did not let Opus's UI be fleet-generated — the fleet did only the backend. The wizard step is skippable, not a forced gate.

## Evidence

Full repo vitest run: 1506/1506 across 188 files. `tsc --noEmit` clean. eslint passes (only non-blocking `apiFetch`-preference warnings, consistent with existing `AgentRuntimesSection`). `corepack pnpm build` = "Compiled successfully"; `/setup` route present in the route table.

## Validation

Three route tests cover redaction-on-GET, store + ignore-empty-sensitive, and reject-malformed. The `configured` boolean lets the UI show accurate status without ever exposing a secret. The wizard reuses the same component — one source of truth for connection form behavior.

## The Automation Lesson

DRY isn't just about code reuse — it's about trust reuse. The existing settings system already had validation, storage, and test coverage. Extending it with a `sensitive` flag cost less than building a parallel "secrets manager" and carried none of the integration risk. The fleet agent built the backend; Opus owned the UI. The boundary held.

## Next Case Study Thread

Next is the live provider adapters — wire the WordPress publishing and Resend email adapters to resolve credentials from these stored connection settings via a `SecretReference` resolver over saved secrets. Enabled only after admin-config, secret-redaction, and idempotency tests pass. Plus a `CampaignWorkflow` (Opzava-owned email automation) per ARD 0004.
