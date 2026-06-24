import { z } from 'zod'

/**
 * SecretReference — the framework-independent model for a pointer to a stored secret.
 *
 * Lives in `core/` (not `platform/admin-config`) because it is a domain primitive every layer
 * validates against: artifacts, runner jobs, provider calls, audit events, and admin records all
 * reject embedded secrets by checking values against this contract. Keeping it in `core/` keeps the
 * dependency graph acyclic and pointing inward (domain has no infrastructure dependency). The
 * platform `admin-config` layer re-exports these and adds resolution/redaction — see
 * `docs/ard/0010-opzava-layering-realignment.md`.
 */
export const SECRET_REFERENCE_KIND = 'SecretReference' as const

export const secretReferenceSchema = z.object({
  kind: z.literal(SECRET_REFERENCE_KIND),
  id: z.string().min(1),
  scope: z.enum(['provider-credential', 'webhook-secret', 'gateway-credential', 'operator-secret']),
  purpose: z.string().min(1).max(200),
}).strict()

export type SecretReference = Readonly<z.infer<typeof secretReferenceSchema>>

export function createSecretReference(input: Omit<SecretReference, 'kind'>): SecretReference {
  return Object.freeze(secretReferenceSchema.parse({
    kind: SECRET_REFERENCE_KIND,
    ...input,
  }))
}

export function isSecretReference(value: unknown): value is SecretReference {
  return secretReferenceSchema.safeParse(value).success
}
