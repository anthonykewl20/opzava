# 0071: Resend Connection Admin Config
Date: 2026-06-17
Status: Draft
Thread: Sibling of slice 0070 (WordPress-connection `AdminConfig`), this slice applies the identical operator-connection pattern to Resend (`resend.com`), the email API powering Opzava's outreach and campaign side. The user requirement: Resend connection config must live in admin settings (editable) and the setup wizard, alongside WordPress.

## Hook
If the WordPress config proves operators can own their publishing stack, the Resend config proves they can own their sending stack—without ever touching a cleartext API key.

## Product Stakes
Opzava's campaign engine needs a real email provider. The config must be editable in admin settings, captured during onboarding, and audit-safe. A leak of a Resend API key in logs or audit trails is a breach. The pattern from 0070 had to hold under a second, independent provider.

## Industry Counterfactual
The alternative was self-hosting Plunk for campaign automation. A fleet deep-research and consensus cycle (Minimax-M3 + MiMo, 5 iterations) rejected it: Plunk's automation engine duplicates Opzava's own orchestration thesis and still requires AWS SES underneath. The right path is a managed email sending adapter with Opzava owning the campaign workflow.

## What We Built
New file: `src/opzava/platform/admin-config/resend-connection.ts` (+ `.test.ts`). Builds on the existing `platform/admin-config/SecretReference` (`createSecretReference`, scope `'provider-credential'`).

`resendConnectionConfigSchema`: `{ schemaVersion: 1, defaultFromAddress` (validated email), `defaultFromName?`, `apiKeyRef: SecretReference }` — strict. `superRefine` requires `apiKeyRef.scope === 'provider-credential'`. `parseResendConnectionConfig` returns a frozen config. `redactResendConnectionConfigForAudit` replaces `apiKeyRef` with `[secret-reference:<scope>]` — the cleartext API key and secret id never appear in the audit-safe form.

Resend is an `'email'`-kind provider (the platform `ProviderProfile.kind` enum already includes `'email'`), parallel to WordPress's `'publishing'` kind.

## What We Refused To Fake
Never store the cleartext API key — only a `SecretReference`. Never leak the secret into the audit-safe form (proven by a test asserting absence of the secret id). Same redaction discipline as WordPress (0070). Did not adopt a second orchestration engine (Plunk rejected by consensus). Fleet-built (Minimax) + reviewed + verified.

## Evidence
Targeted vitest `src/opzava/platform/admin-config/resend-connection.test.ts` = 4/4. Full repo vitest run = 1501/1501 across 187 files. `tsc` clean. `eslint` 0 errors. `node --test test/*.test.mjs` passed.

## Validation
Tests cover: parses a valid config (`defaultFromAddress`/`apiKeyRef.id`); rejects a non-email from-address; rejects an API key with wrong scope; redaction yields `[secret-reference:provider-credential]` and the audit-safe JSON does NOT contain the secret id.

## The Automation Lesson
The fleet consensus cycle that rejected Plunk was the real decision. Opzava's orchestration thesis means it owns the campaign workflow; it needs a sending adapter, not a second automation engine. Resend is that adapter. The config slice is small; the architectural clarity is not.

## Next Case Study Thread
Next is the admin settings UI to edit both provider connections (WordPress + Resend) with the secret write-only (never displayed), then a setup-wizard step that captures both during onboarding — so the wizard works end to end.
