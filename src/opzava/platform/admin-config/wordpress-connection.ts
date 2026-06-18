import { z } from 'zod'
import { secretReferenceSchema, type SecretReference } from './contracts'

export const WORDPRESS_CONNECTION_SCHEMA_VERSION = 1 as const

export const wordpressConnectionConfigSchema = z
  .object({
    schemaVersion: z.literal(WORDPRESS_CONNECTION_SCHEMA_VERSION),
    siteUrl: z.string().url().max(500),
    defaultAuthor: z.string().min(1).max(120).optional(),
    defaultStatus: z.literal('draft'),
    credentialRef: secretReferenceSchema
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.credentialRef.scope !== 'provider-credential') {
      ctx.addIssue({
        code: 'custom',
        path: ['credentialRef', 'scope'],
        message: 'wordpress connection credential must use the provider-credential scope'
      })
    }
  })

export type WordpressConnectionConfig = Readonly<z.infer<typeof wordpressConnectionConfigSchema>>

export type AuditSafeWordpressConnectionConfig = Omit<WordpressConnectionConfig, 'credentialRef'> &
  Readonly<{ credentialRef: `[secret-reference:${SecretReference['scope']}]` }>

export function parseWordpressConnectionConfig(input: unknown): WordpressConnectionConfig {
  return Object.freeze(wordpressConnectionConfigSchema.parse(input))
}

export function redactWordpressConnectionConfigForAudit(
  config: WordpressConnectionConfig
): AuditSafeWordpressConnectionConfig {
  return Object.freeze({
    ...config,
    credentialRef: `[secret-reference:${config.credentialRef.scope}]` as const
  })
}
