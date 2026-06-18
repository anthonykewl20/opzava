import { z } from 'zod'

import {
  isSecretReference,
  secretReferenceSchema,
  type SecretReference,
} from './contracts'

export const OPZAVA_ADMIN_SETTINGS_SCHEMA_VERSION = 1 as const

const MAX_ONE_HOUR_MS = 3_600_000
const MAX_ONE_DAY_MS = 86_400_000

const runnerSettingsSchema = z.object({
  idleDelayMs: z.number().int().min(1_000).max(MAX_ONE_DAY_MS),
  errorDelayMs: z.number().int().min(1_000).max(MAX_ONE_DAY_MS),
  shutdownGraceMs: z.number().int().min(100).max(30_000),
}).strict()

const retrySettingsSchema = z.object({
  initialDelayMs: z.number().int().min(1).max(MAX_ONE_HOUR_MS),
  multiplier: z.number().min(1.000_001).max(10).finite(),
  maxDelayMs: z.number().int().min(1).max(MAX_ONE_HOUR_MS),
  maxAttempts: z.number().int().min(1).max(20),
}).strict().superRefine((retry, ctx) => {
  if (retry.maxDelayMs < retry.initialDelayMs) {
    ctx.addIssue({ code: 'custom', path: ['maxDelayMs'], message: 'maxDelayMs must be greater than or equal to initialDelayMs' })
  }
})

const providerSettingsSchema = z.object({
  requestTimeoutMs: z.number().int().min(1).max(MAX_ONE_HOUR_MS),
  requestsPerMinute: z.number().int().min(1).max(100_000),
  burst: z.number().int().min(1).max(100_000),
  usdPerHourLimit: z.number().min(0).max(100_000).finite(),
  usdPerDayLimit: z.number().min(0).max(1_000_000).finite(),
}).strict().superRefine((providers, ctx) => {
  if (providers.burst < providers.requestsPerMinute) {
    ctx.addIssue({ code: 'custom', path: ['burst'], message: 'burst must be greater than or equal to requestsPerMinute' })
  }
})

const providerCredentialsSchema = z.record(z.string().min(1).max(120), z.unknown()).superRefine((credentials, ctx) => {
  for (const [providerId, credential] of Object.entries(credentials)) {
    if (!isSecretReference(credential)) {
      ctx.addIssue({
        code: 'custom',
        path: [providerId],
        message: 'provider credentials must be SecretReference values',
      })
    }
  }
}).transform((credentials) => Object.fromEntries(Object.entries(credentials).map(([providerId, credential]) => [
  providerId,
  secretReferenceSchema.parse(credential),
])))

const opzavaAdminSettingsSchema = z.object({
  schemaVersion: z.literal(OPZAVA_ADMIN_SETTINGS_SCHEMA_VERSION),
  runner: runnerSettingsSchema,
  retry: retrySettingsSchema,
  providers: providerSettingsSchema,
  providerSelection: z.record(z.string().min(1).max(120), z.string().min(1).max(120)),
  providerCredentials: providerCredentialsSchema,
}).strict()

export type OpzavaAdminSettings = Readonly<z.infer<typeof opzavaAdminSettingsSchema>>
export type AuditSafeOpzavaAdminSettings = Omit<OpzavaAdminSettings, 'providerCredentials'> & {
  providerCredentials: Record<string, `[secret-reference:${SecretReference['scope']}]`>
}
export type OpzavaAdminSettingsDiff = Readonly<{
  path: string
  kind: 'number' | 'string' | 'boolean' | 'null' | 'secret-reference' | 'object'
}>

export function defaultOpzavaAdminSettings(): OpzavaAdminSettings {
  return parseOpzavaAdminSettings({
    schemaVersion: OPZAVA_ADMIN_SETTINGS_SCHEMA_VERSION,
    runner: {
      idleDelayMs: 1_000,
      errorDelayMs: 5_000,
      shutdownGraceMs: 10_000,
    },
    retry: {
      initialDelayMs: 60_000,
      multiplier: 2,
      maxDelayMs: 10 * 60_000,
      maxAttempts: 3,
    },
    providers: {
      requestTimeoutMs: 30_000,
      requestsPerMinute: 60,
      burst: 60,
      usdPerHourLimit: 100,
      usdPerDayLimit: 1_000,
    },
    providerSelection: {},
    providerCredentials: {},
  })
}

export function parseOpzavaAdminSettings(input: unknown): OpzavaAdminSettings {
  return Object.freeze(opzavaAdminSettingsSchema.parse(input))
}

export function redactOpzavaAdminSettingsForAudit(settings: OpzavaAdminSettings): AuditSafeOpzavaAdminSettings {
  return {
    ...settings,
    providerCredentials: Object.fromEntries(Object.entries(settings.providerCredentials).map(([providerId, reference]) => [
      providerId,
      `[secret-reference:${reference.scope}]`,
    ])),
  }
}

export function diffOpzavaAdminSettings(
  before: OpzavaAdminSettings,
  after: OpzavaAdminSettings,
): OpzavaAdminSettingsDiff[] {
  const beforeLeaves = flattenSettings(before)
  const afterLeaves = flattenSettings(after)
  const paths = new Set([...beforeLeaves.keys(), ...afterLeaves.keys()])

  return [...paths]
    .filter((path) => beforeLeaves.get(path)?.serialized !== afterLeaves.get(path)?.serialized)
    .sort()
    .map((path) => Object.freeze({
      path,
      kind: afterLeaves.get(path)?.kind ?? beforeLeaves.get(path)?.kind ?? 'object',
    }))
}

function flattenSettings(settings: OpzavaAdminSettings): Map<string, { serialized: string, kind: OpzavaAdminSettingsDiff['kind'] }> {
  const leaves = new Map<string, { serialized: string, kind: OpzavaAdminSettingsDiff['kind'] }>()
  addLeaves('', settings, leaves)
  return leaves
}

function addLeaves(
  path: string,
  value: unknown,
  leaves: Map<string, { serialized: string, kind: OpzavaAdminSettingsDiff['kind'] }>,
): void {
  if (isSecretReference(value)) {
    leaves.set(path, { serialized: JSON.stringify(value), kind: 'secret-reference' })
    return
  }

  if (value === null || typeof value !== 'object') {
    leaves.set(path, { serialized: JSON.stringify(value), kind: primitiveKind(value) })
    return
  }

  for (const key of Object.keys(value).sort()) {
    addLeaves(path ? `${path}.${key}` : key, (value as Record<string, unknown>)[key], leaves)
  }
}

function primitiveKind(value: unknown): OpzavaAdminSettingsDiff['kind'] {
  if (value === null) return 'null'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'boolean'
  return 'object'
}
