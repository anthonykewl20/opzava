import { z } from 'zod'

export const FACT_CHECK_REPORT_SCHEMA_VERSION = 1 as const

// A fact-check: one draft claim checked against cited sources. A 'supported' verdict must cite at
// least one source — a supported claim with empty sourceIds is an unsupported assertion, not a check.
const factCheckSchema = z.object({
  claim: z.string().min(1).max(2000),
  verdict: z.enum(['supported', 'unsupported', 'contradicted', 'needs-review']),
  sourceIds: z.array(z.string().min(1).max(120)),
  note: z.string().min(1).max(1000).optional(),
}).strict()

// A fact-check report artifact: a draft's claims verified against sources. Lineage references the
// originating draft and the idea behind it. A 'passed' status structurally requires every claim to be
// supported, and every supported claim must cite at least one source — the schema makes the verdict
// mean something. Pure, versioned value object — no providers, runner, or side effects.
export const factCheckReportSchema = z.object({
  schemaVersion: z.literal(FACT_CHECK_REPORT_SCHEMA_VERSION),
  reportId: z.string().min(1).max(120),
  draftId: z.string().min(1).max(120),
  ideaId: z.string().min(1).max(120),
  status: z.enum(['passed', 'failed']),
  checks: z.array(factCheckSchema).min(1),
  checkedAt: z.string().min(1),
}).strict().superRefine((report, ctx) => {
  report.checks.forEach((check, i) => {
    if (check.verdict === 'supported' && check.sourceIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['checks', i, 'sourceIds'],
        message: 'a supported claim must cite at least one source',
      })
    }
  })
  if (report.status === 'passed' && report.checks.some((c) => c.verdict !== 'supported')) {
    ctx.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'a passed report requires every claim to be supported',
    })
  }
})

export type FactCheck = Readonly<z.infer<typeof factCheckSchema>>
export type FactCheckReport = Readonly<z.infer<typeof factCheckReportSchema>>

export function parseFactCheckReport(input: unknown): FactCheckReport {
  return Object.freeze(factCheckReportSchema.parse(input))
}
