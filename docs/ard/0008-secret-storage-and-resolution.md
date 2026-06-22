# ARD 0008: Secret Storage And Resolution

Status: Accepted
Date: 2026-06-21

## Context

Finding **F4** (`docs/architecture/system-map/90-parity-findings.md`) established that there is **no
production `SecretResolver`** — only the interface (`platform/providers/credentials-runtime.ts:16`) and
test doubles. The one shipping live external action (the campaign Resend send) reads its API key
**cleartext** from the inherited `settings` table (`connection-settings-resolver.ts:54`,
`campaigns/[id]/run/route.ts:34`), and the provider profile's `credentialRef` is a dead literal that is
never resolved.

The golden principle (`docs/golden-principles.md:31`) requires: *"credentials belong in admin settings
backed by safe secret storage or **environment-provided secret references**."* The `SecretReference`
contract already exists (`admin-config/contracts.ts`: `{kind, id, scope, purpose}`), as does the
resolution boundary (`createProviderExecutionPreflight` → `resolveProviderCredentialForRequest` →
`SecretResolver`). Only the production resolver and the wiring are missing.

Phase 1 of the remediation plan (`91-remediation-plan.md`) is decision-gated on **how secrets are stored
at rest** before that resolver is written. The deployment context: self-hosted, single-instance first,
SQLite, Docker-first (`docker-compose`, hardened overlay), with `AUTH_SECRET`/`API_KEY` already
auto-provisioned from the environment.

## Decision

**Secrets are resolved from the environment, never persisted in the database.**

1. A `SecretReference.id` names an **environment-provided secret** (an env var; optionally a mounted
   secret file via the Docker `<VAR>_FILE` convention). The reference carries no secret value.

2. The production `SecretResolver` (`createEnvSecretResolver`) resolves `reference.id` to a value through
   an **injected environment reader** (pure and testable). It never reads the DB. A missing/empty value
   returns a typed `SecretResolutionFailure{ code: 'not-found' }` so the live path **fails closed**.

3. **The database stores only references**, never cleartext secret values. Admin settings manage the
   reference (scope + id + purpose); non-secret connection fields (e.g. `resend_from_address`,
   `wordpress_site_url`) may remain plain settings.

4. The resolver is an **interface seam**: an encrypted-at-rest-column resolver or an external-KMS
   resolver can be added later by swapping the resolver passed into preflight — **no call site changes**.

## Rationale

- **Matches the golden principle verbatim** ("environment-provided secret references").
- **No cleartext at rest, no DB crypto, no key-loss risk.** Nothing secret lands in SQLite, backups,
  artifacts, or logs; there is no encryption key to manage or lose.
- **Docker-native.** Mirrors how `AUTH_SECRET`/`API_KEY` already arrive; works with Docker/Compose secrets.
- **Postgres-migration-safe** (ARD 0006): no DB-stored secret schema to port.
- **Simplest correct option** (`docs/architecture/code-simplicity.md`): env read + typed failure, no new
  subsystem. KMS/encrypted-column carry ops burden disproportionate to a single-instance self-hosted MVP.

## Consequences

- **Operator UX change:** provider secrets are supplied via environment / secret files, not pasted into a
  dashboard text field. The admin UI manages the **reference**; the secret value is deployment-provided.
  This is a deliberate trade documented here (it is the cost of "no cleartext at rest").
- **F4 wiring:** the campaign live path stops reading `resend_api_key` cleartext; the API key resolves
  through `createProviderExecutionPreflight({ resolver })`. The Resend adapter takes its credential from
  the **resolved** secret, not a cleartext connection built at the route.
- **Fail-closed:** if the env secret is absent, preflight returns `secret-resolution-failed` and the send
  never reaches the provider transport.
- **`_FILE` / Docker-secret file support** is a planned extension of the environment **reader** (the
  resolver core is unchanged); the first implementation ships env-var reading.

## Alternatives considered

- **Encrypted-at-rest column** (AES-256-GCM, key from env). Preserves the paste-in-UI flow, but adds
  crypto + key-lifecycle code and a catastrophic-key-loss failure mode. Deferred; reachable via the
  resolver seam if a future deployment needs DB-stored secrets.
- **External KMS / secrets manager.** Best for multi-instance/cloud; disproportionate for single-instance
  self-hosted now. Deferred; reachable via the resolver seam.

## References

- F4: `docs/architecture/system-map/90-parity-findings.md`; remediation Phase 1: `…/91-remediation-plan.md`.
- Contracts: `src/opzava/platform/admin-config/contracts.ts`,
  `src/opzava/platform/providers/credentials-runtime.ts`, `…/preflight-runtime.ts`.
- Golden principle: `docs/golden-principles.md`. Postgres compatibility: `docs/ard/0006-postgres-compatibility.md`.
