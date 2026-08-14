# Runbook — Better Auth security upgrades

ADR-006 makes Better Auth a security-maintained dependency, not an unattended framework. This
runbook covers every Better Auth advisory, including cookie-cache, MFA/2FA, session revocation,
password reset, organizations, and invitations.

## Pinned version policy

Use exact versions only — no ranges, tags, or `latest`. The current pins are declared in:

- `apps/web/package.json` (`better-auth`)
- `packages/identity-access/package.json` (`better-auth` and `@better-auth/drizzle-adapter`)

`pnpm-lock.yaml` records the resolved dependency graph. Keep the three pins across these two
manifest files compatible with the same vetted release line; do not rely on transitive resolution.

## Advisory monitoring

Check the [Better Auth GitHub Security Advisories](https://github.com/better-auth/better-auth/security/advisories)
and release notes weekly, and immediately when GitHub, Dependabot, or an operator reports an
advisory. Record the reviewed version, advisory identifiers, decision, and owner in the security
maintenance issue. A critical advisory affecting a used path is an incident: disable the affected
surface where possible, move to a fixed pin, and use the Auth.js fallback plan in ADR-006 if no
safe Better Auth release exists.

## Upgrade procedure

1. Read the GHSA feed and version-matched release notes. Identify affected Opzava paths and the
   first fixed release; do not upgrade on release notes alone.
2. Update the three exact pins in the two manifest files above. Regenerate the lockfile with `pnpm install`.
3. Review `pnpm-lock.yaml` for unexpected transitive changes and confirm no package is floating.
4. Run the full gates: `pnpm turbo run lint typecheck build`, identity-access integration suites
   with both no environment and Compose database environment, and web unit tests.
5. Apply migrations to an isolated PostgreSQL database, verify manifest SHA-256 entries, and run
   the auth integration suite. Exercise sign-in, MFA/recovery, session revocation, password reset,
   account password change, organization membership, and invitation regression cases.
6. Rebuild the web image from the worktree and drive the real local stack with a real login and
   seeded data. Capture screenshots and inspect web, broker, worker, and gateway logs.
7. Record GHSA/release-note links, the old and new exact pins, commands/results, and rollback
   readiness in the upgrade PR.

## Rollback

If release validation or production monitoring fails, revert the three pins across the two manifest files and the
matching lockfile in one change, rebuild the web image, and re-run the auth smoke drive. Do not
roll back a migration by editing history. Prefer a forward corrective migration; if a security
advisory has no safe rollback target, contain the affected capability and begin the ADR-006 Auth.js
fallback incident plan.
