# ARD 0018 — Two-Factor Authentication (TOTP, Engine-A)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (parity; `essential-profile.html` Security), [ARD 0016](0016-active-sessions.md) (Engine-A session lifecycle + module convention), [ARD 0015](0015-team-execution-and-surfaces-architecture.md) (single-operator trust model), [ARD 0008](0008-secret-storage-and-resolution.md) (secret storage — provider creds), [CONTEXT.md](../../CONTEXT.md) Identity & sessions, [wiring/25-personal-account.md](../architecture/ux-redesign/wiring/25-personal-account.md) rows 167–168.

## Context

`essential-profile.html`'s Security card shows "Two-factor authentication · Authenticator app · ● On · Manage". 2FA is **entirely net-new** (verified: no TOTP/OTP code, no TOTP library in `package.json`). The Engine-B `SecretReference` is a *pointer contract only* — `contracts.ts` has no vault, encryption, or persistence behind it — so it cannot protect a per-user secret. The single-operator trust model (ARD 0015) means the operator owns the host, but 2FA still guards the credential-theft path into a control plane that can trigger external actions (sends, deploys). Grilled to shared understanding; the operator chose full TOTP **with recovery codes**.

## Decision

Full TOTP 2FA, Engine-A, security-reviewed. Ten provisions:

1. **Scope:** enroll (QR + confirm-a-code), two-step login challenge, disable (re-auth), and single-use **recovery codes**. `/security-review` before merge.
2. **Secret at rest:** the TOTP secret is **reversibly encrypted** (AES-256-GCM) by a new tiny Engine-A `src/lib/crypto.ts`; the key is **HKDF-derived from `AUTH_SECRET`** (domain-separated `'2fa'` info label). NOT hashed (RFC-6238 verification needs the cleartext); NOT a `SecretReference` (that is for provider creds and has no vault behind it). Consequence: `AUTH_SECRET` loss/rotation invalidates stored secrets → re-enroll (recovery codes + host access per ARD 0015 cover it).
3. **Recovery codes:** N single-use codes, **scrypt-hashed** via `src/lib/password.ts`, shown once at enrollment, stored in `user_recovery_codes`, marked `used_at` on redemption.
4. **Storage:** dedicated **Engine-A** tables — `user_totp` (`user_id` PK, `secret_enc`, `enabled`, `confirmed_at`, `last_step`) + `user_recovery_codes` (`id`, `user_id`, `code_hash`, `used_at`). The `user_sessions` precedent; the core `users` table stays untouched. No `opzava_*` table (auth is Engine A).
5. **Library:** `otplib` (maintained) for secret generation + RFC-6238 verification — never hand-rolled crypto. **QR:** the route returns the `otpauth://` URI + base32 secret; the **client** renders the QR (no server `qrcode` dependency).
6. **Login challenge (stateless):** `POST /api/auth/login`, on password-success for a 2FA-enabled user, returns `{twoFactorRequired, challenge}` — a short-lived (~5 min) HMAC token signed with an `AUTH_SECRET`-derived key, binding `userId`+`exp`. `POST /api/auth/login/2fa {challenge, code}` verifies the signature + the `TOTP` (or a `RecoveryCode`) → `createSession`. No pending-auth table, no cleanup.
7. **Replay protection:** `user_totp.last_step` records the last accepted TOTP time-step; a code from a step ≤ `last_step` is rejected (a code can't be reused inside its window).
8. **Routes (Engine-A, self):** `GET /api/me/2fa` (status: `enabled`, `confirmedAt`, `recoveryRemaining`), `POST /api/me/2fa/enroll` (→ `otpauth://` URI + secret; pending, `enabled=0`), `POST /api/me/2fa/confirm {code}` (verify against pending → `enabled=1`, return recovery codes **once**), `DELETE /api/me/2fa` (disable; requires current password or a valid TOTP). Plus `POST /api/auth/login/2fa` (challenge redemption).
9. **Module shape (reuses the ARD-0016 design-it-twice convention):** `src/lib/crypto.ts` (AES-256-GCM encrypt/decrypt + HKDF key — pure), `src/lib/totp.ts` (otplib wrapper: `generateSecret`/`otpauthUri`/`verify` — pure), `src/lib/two-factor.ts` (bare convention-fit repository — `enroll`/`confirm`/`verifyCode`/`consumeRecoveryCode`/`disable`/`status`, `getDatabase()` internal; also signs/verifies the challenge token). Thin routes.
10. **Honest status:** the mockup's "On" renders from real `user_totp.enabled`, never fabricated; until enrolled, the surface shows "Not configured" (per the no-fabricated-status directive).

## Consequences

- **Positive:** a complete, self-sufficient 2FA with recovery; the secret-at-rest tension is resolved cleanly (a per-user auth secret ≠ a provider `SecretReference`); reuses scrypt (recovery codes) + the Engine-A bare-function convention (ARD 0016) + the stateless-token idiom (no pending-auth table/cleanup); replay-guarded.
- **Negative:** a net-new dependency (`otplib`) and a **new Engine-A encryption primitive** (`crypto.ts`) — security-sensitive, hence the `/security-review` gate; `AUTH_SECRET` durability now also gates 2FA-secret recoverability (mitigated by recovery codes + host access); the login flow gains a second round-trip for 2FA users.
- **Neutral:** two net-new Engine-A tables; `users` untouched; CONTEXT.md gains `TwoFactorEnrollment` / `TOTP` / `RecoveryCode` / `TwoFactorChallenge` + a Forbidden-Ambiguity entry separating per-user auth secrets from provider `SecretReference`.

## Alternatives considered

- **TOTP secret via Engine-B `SecretReference`.** Rejected: it is a pointer contract with no vault/encryption behind it, and it crosses the Engine-A auth boundary; a per-user auth secret is Engine-A, like `password_hash`.
- **Hash the TOTP secret.** Impossible: RFC-6238 verification needs the cleartext secret; reversible encryption is mandatory.
- **Dedicated `MC_2FA_ENCRYPTION_KEY` (vs `AUTH_SECRET`-derived).** Rejected (grilling): a second key to manage/back-up; one master secret + HKDF domain separation is simpler, and recovery codes + host access cover rotation.
- **DB pending-auth row / re-send-credentials for the login step.** Rejected (grilling): the stateless signed challenge avoids a net-new table + cleanup and avoids transmitting the password twice.
- **Columns on `users` for 2FA.** Rejected: 2FA carries multi-field + 1:N (recovery) state; dedicated Engine-A tables (the `user_sessions` precedent) keep the core `users` table clean.
- **No recovery codes (host/admin reset only).** Rejected (grilling): recovery codes are the standard self-service lockout escape, lower friction than an SSH reset.
- **Hand-rolled TOTP/crypto.** Rejected: never hand-roll auth crypto; `otplib` + Node `crypto` AES-GCM.

## References

- Parity: `wiring/25-personal-account.md` rows 167–168 (2FA 🔴 MISSING; `/security-review` flagged); open-question #8.
- Code: `src/app/api/auth/login/route.ts` (`authenticateUser`:22 → `createSession`:41 — the challenge insertion point); `src/lib/password.ts` (scrypt — the recovery-code hashing idiom); `src/lib/auto-credentials.ts` (`AUTH_SECRET` provenance); `src/opzava/core/secrets/contracts.ts` (`SecretReference` is a pointer model only — no vault).
- Domain: CONTEXT.md Identity & sessions (`TwoFactorEnrollment`, `TOTP`, `RecoveryCode`, `TwoFactorChallenge`).
- Gate: `/security-review` required before merge (net-new auth surface + a new encryption primitive).
- Relates: ARD 0008 (secret storage — provider creds), ARD 0015 (single-operator), ARD 0016 (Engine-A module convention + session rotation).

## Deep-module design (codebase-design — design-it-twice winner)

A deeper grilling (edge cases) + 4-way design-it-twice produced this build-ready shape. **Files:** `src/lib/crypto.ts` (pure), `src/lib/totp.ts` (pure), `src/lib/two-factor.ts` (DB, bare-function), migration `059_two_factor`, `twoFactorVerifyLimiter` in `rate-limit.ts`, routes `api/me/2fa/{route,confirm,recovery/regenerate}` + `api/auth/login/2fa`.

**Resolved edge cases:** TOTP window ±1 with a monotonic `last_step` (store highest accepted, reject ≤); enroll-abandon → UPSERT pending (latest wins); recovery exhaustion → warn ≤2 + regenerate (re-auth, invalidates old set); challenge replay neutralised by the `last_step` burn (not a nonce table); decrypt-failure (AUTH_SECRET rotation) → fail **closed**, recovery code (scrypt, AUTH_SECRET-independent) is the escape; disable re-auth = password OR TOTP OR recovery, last resort host/admin reset.

**Lockout reconciliation:** a stateless challenge can't hold a mutable counter, so the "per-challenge cap" = a **per-user critical verify limiter (~5/5min) whose window ≈ challenge exp**; malformed-challenge attempts key the limiter by IP (still bounded).

**`crypto.ts` (pure, generic — reusable for any Engine-A secret-at-rest):** `deriveKey(purpose): Buffer` = HKDF-SHA256(`AUTH_SECRET`, info=`opzava:${purpose}`), throws on missing/placeholder; `encrypt(plain, key): string` = AES-256-GCM, random 12B IV, versioned envelope `v1.<iv>.<tag>.<ct>`; `decrypt(env, key): string | null` (null on any failure → fail-closed). Key-as-param keeps it referentially transparent + unit-testable with a literal key.

**`totp.ts` (pure, the only `otplib` importer):** `generateSecret()`, `otpauthUri(username, secret)`, `verify(code, secret): boolean`, `acceptedStep(code, secret): number | null` (window:1 — returns the matched 30s counter that drives the replay CAS).

**`two-factor.ts` (DB, `getDatabase()` internal, no DI) — public surface (login seam + enrollment):**
- `loginStep(user): {kind:'session'} | {kind:'2fa_required', challenge}` — called post-`authenticateUser`; **eligibility-gated** (`id>0 && provider==='local'` → else `'session'`, so API/agent/device principals are excluded). The login-route diff is a 5-line guard clause; the 2FA-off path is byte-identical.
- `completeChallenge(challenge, code, ip): {ok:true, userId} | {ok:false, status:401|423, error}` — the **only** public verify; runs lockout(user, IP-fallback)→challenge-HMAC→decrypt(fail-closed)→TOTP-replay-CAS-or-recovery-consume, in order. There is **no public bare `verify`** (non-bypassable by construction).
- `getStatus(user): {enabled, confirmedAt, recoveryCodesRemaining}` (no secret/codes); `beginEnrollment(user): {otpauthUri, recoveryCodes}` (UPSERT pending enabled=0; throws `TwoFactorError('not_eligible'|'already_enabled')`); `confirmEnrollment(user, code): boolean` (the **only** `enabled` 0→1 transition); `disable(user): boolean` / `regenerateRecoveryCodes(user): string[]` (re-auth gated **in the route**); `TwoFactorError` + `TWO_FACTOR_HTTP_STATUS`.
- **Private (behind the seam):** `mintChallenge`/`readChallenge` (HMAC, `deriveKey('2fa-challenge')`, binds {userId,exp,purpose}); the guarded verify (`UPDATE user_totp SET last_step=? WHERE user_id=? AND last_step<?`, success ⟺ `changes===1`); `consumeRecoveryCode` (`UPDATE … WHERE used_at IS NULL`, `changes===1`); the critical limiter; `eligible`.

**Structural invariants:** secret never crosses the seam (only egress = `otpauthUri`, once); `enabled=1` in ≤1 SQL statement (`confirmEnrollment`); replay + recovery single-use are atomic conditional-UPDATEs (no read-then-write race); lockout runs before any crypto; constant-time HMAC + scrypt compares; the route owns session-minting (policy stays in `auth.ts`).

**Schema (059):** `user_totp(user_id PK, secret_enc, enabled, confirmed_at, last_step, …, FK users ON DELETE CASCADE)` + `user_recovery_codes(id, user_id, code_hash, used_at, …, FK users ON DELETE CASCADE)`.

**Test seam:** `crypto.ts`/`totp.ts`/challenge-codec tested **directly** (pure, no DB); `two-factor.ts` against in-memory SQLite + `runMigrations` (the `migrations.test` idiom); routes via `vi.mock`; a module-private `__setClock` for expiry/replay determinism. **Plus a governance contract test** (`test/two-factor.test.mjs`): static-assert no secret-returning export, `enabled=1` localised to `confirmEnrollment`, no public bare `verify` — guards the security *shape* against regression. **Deletion test:** removing 2FA touches only its own files + a 5-line login-route revert.
