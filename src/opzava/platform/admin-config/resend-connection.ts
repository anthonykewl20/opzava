import { z } from 'zod'
import { secretReferenceSchema, type SecretReference } from './contracts'

export const RESEND_CONNECTION_SCHEMA_VERSION = 1 as const

export const resendConnectionConfigSchema = z.object({
  schemaVersion: z.literal(RESEND_CONNECTION_SCHEMA_VERSION),
  defaultFromAddress: z.string().email().max(320),
  defaultFromName: z.string().min(1).max(120).optional(),
  apiKeyRef: secretReferenceSchema
}).strict().superRefine((config, ctx) => {
  if (config.apiKeyRef.scope !== 'provider-credential') {
    ctx.addIssue({
      code: 'custom',
      path: ['apiKeyRef', 'scope'],
      message: 'resend api key must use the provider-credential scope'
    })
  }
})

export type ResendConnectionConfig = Readonly<z.infer<typeof resendConnectionConfigSchema>>

export type AuditSafeResendConnectionConfig = Omit<ResendConnectionConfig, 'apiKeyRef'> & Readonly<{
  apiKeyRef: `[secret-reference:${SecretReference['scope']}]`
}>

export function parseResendConnectionConfig(input: unknown): ResendConnectionConfig {
  return Object.freeze(resendConnectionConfigSchema.parse(input))
}

export function redactResendConnectionConfigForAudit(config: ResendConnectionConfig): AuditSafeResendConnectionConfig {
  return Object.freeze({
    ...config,
    apiKeyRef: `[secret-reference:${config.apiKeyRef.scope}]` as const
  })
}
