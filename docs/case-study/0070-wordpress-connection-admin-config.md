# 0070: WordPress Connection Admin Config
Date: 2026-06-17
Status: Draft
Thread: This slice opens the admin-settings / operator-connection work (Layer 8). The user requirement: WordPress connection details must live in admin settings (editable) and be collected in the setup wizard; the LIVE WordPress publishing adapter (a later slice) resolves its credential from this config.

## Hook
A publishing adapter needs credentials. Where do they live? If they live in source code or environment variables, they are invisible to operators, unauditable, and uneditable without a deploy. If they live in a database column as cleartext, they leak into logs, backups, and audit trails. The hook: credentials must be *referenced*, never *held*; editable by operators; and redactable for audit — all before the publishing adapter even exists.

## Product Stakes
Operators configure their WordPress connection once (in admin settings or the setup wizard). The LIVE publishing adapter — built later — resolves its credential from that config at publish-time. If the config is wrong, publishing fails safely (draft-only default). If the credential leaks into logs or audit artifacts, trust collapses. The stakes: correctness, editability, and zero-cleartext-in-artifacts.

## Industry Counterfactual
Most WordPress integrations hardcode `WP_USER` and `WP_APP_PASSWORD` in `.env` or a config file checked into source. Audit logs routinely contain API tokens. Setup wizards ask for a password and store it in a `TEXT` column. The result: credentials are invisible to operators, unrotatable without a deploy, and one log dump away from exposure.

## What We Built
New file: `src/opzava/platform/admin-config/wordpress-connection.ts` (+ `.test.ts`). Builds on the existing `SecretReference` type (`createSecretReference` / `isSecretReference`, scope `'provider-credential'`).

`wordpressConnectionConfigSchema`: `{ schemaVersion: 1, siteUrl` (validated URL), `defaultAuthor?`, `defaultStatus: literal 'draft'`, `credentialRef: SecretReference }` — strict. A `superRefine` requires `credentialRef.scope === 'provider-credential'`. `parseWordpressConnectionConfig(input)` returns the frozen config. `redactWordpressConnectionConfigForAudit(config)` returns an audit-safe form replacing `credentialRef` with the string `[secret-reference:<scope>]` — the cleartext secret (and even the secret id/purpose) never appears in the audit-safe form.

The credential is a `SecretReference` (a reference to the WordPress application password/token), NEVER the cleartext secret — per Opzava's source-of-truth rule (`SecretReference`, never cleartext in logs/artifacts/source). `defaultStatus` is the literal `'draft'` so operator config itself cannot request publishing.

## What We Refused To Fake
- Never store the cleartext secret — only a `SecretReference`.
- Never let the secret reach the audit-safe form — redaction proven by a test asserting the secret id is absent.
- Operator config cannot request publish — `draft`-only literal.
- Did not hardcode connection in env/source — it is editable `AdminConfig`.
- Fleet-built (minimax) + reviewed + verified.

## Evidence
Targeted vitest `src/opzava/platform/admin-config/wordpress-connection.test.ts` = 5/5. Full repo vitest run = 1496/1496 across 186 files. `tsc` clean. `eslint` 0 errors. `node --test test/*.test.mjs` passed.

## Validation
Tests cover: parses a valid config (`siteUrl` / `draft` / `credentialRef.id`); rejects a non-url `siteUrl`; rejects a non-`draft` `defaultStatus`; rejects a credential with the wrong scope; redaction yields `[secret-reference:provider-credential]` and the JSON of the audit-safe form does NOT contain the secret id.

## The Automation Lesson
A `SecretReference` is a pointer, not a value. The audit-safe form redacts the pointer itself (replacing it with a scope-only label), so even the secret's *identity* is absent from logs. The `draft`-only literal in the schema means the config structurally cannot request publishing — the safety constraint is enforced at parse-time, not at runtime.

## Next Case Study Thread
Next should add the parallel Resend (email) connection `AdminConfig` — API key as a `SecretReference` + a verified default `from` address — same shape and same audit-redaction, so the admin settings + setup wizard can manage BOTH provider connections; then an admin settings UI and a setup-wizard step surface both.
