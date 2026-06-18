import { z } from 'zod'

export const OUTLINE_SCHEMA_VERSION = 1 as const

// An outline section: one heading with at least one key point. Headings must be unique within an
// outline so the structure stays navigable before any prose is drafted.
const outlineSectionSchema = z.object({
  heading: z.string().min(1).max(200),
  keyPoints: z.array(z.string().min(1).max(500)).min(1),
}).strict()

// An outline artifact: structure before prose. Lineage references the originating idea and the SEO
// brief that recommended the headings; each section carries its own key points. Pure, versioned value
// object — no providers, runner, or side effects.
export const outlineSchema = z.object({
  schemaVersion: z.literal(OUTLINE_SCHEMA_VERSION),
  outlineId: z.string().min(1).max(120),
  briefId: z.string().min(1).max(120),
  ideaId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  sections: z.array(outlineSectionSchema).min(1),
  createdAt: z.string().min(1),
}).strict().superRefine((outline, ctx) => {
  const headings = outline.sections.map((s) => s.heading)
  if (new Set(headings).size !== headings.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['sections'],
      message: 'section headings must be unique within an outline',
    })
  }
})

export type OutlineSection = Readonly<z.infer<typeof outlineSectionSchema>>
export type Outline = Readonly<z.infer<typeof outlineSchema>>

export function parseOutline(input: unknown): Outline {
  return Object.freeze(outlineSchema.parse(input))
}
