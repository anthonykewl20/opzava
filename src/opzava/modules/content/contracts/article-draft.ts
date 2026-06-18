import { z } from 'zod'

export const ARTICLE_DRAFT_SCHEMA_VERSION = 1 as const

// A draft section: a heading with real prose and at least one cited supporting source. Every section
// must cite >=1 captured source so provenance is baked into the schema — a section with no supporting
// source ids is not a draft, it is an unsupported claim.
const articleSectionSchema = z.object({
  heading: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  supportingSourceIds: z.array(z.string().min(1).max(120)).min(1),
}).strict()

// An article draft artifact: drafted prose with provenance. Lineage references the originating idea,
// the SEO brief that recommended the headings, and the outline that fixed the structure; each section
// cites the captured sources it relies on. Pure, versioned value object — no providers, runner, or
// side effects.
export const articleDraftSchema = z.object({
  schemaVersion: z.literal(ARTICLE_DRAFT_SCHEMA_VERSION),
  draftId: z.string().min(1).max(120),
  outlineId: z.string().min(1).max(120),
  briefId: z.string().min(1).max(120),
  ideaId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  sections: z.array(articleSectionSchema).min(1),
  wordCount: z.number().int().positive(),
  createdAt: z.string().min(1),
}).strict().superRefine((draft, ctx) => {
  const headings = draft.sections.map((s) => s.heading)
  if (new Set(headings).size !== headings.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['sections'],
      message: 'section headings must be unique',
    })
  }
})

export type ArticleSection = Readonly<z.infer<typeof articleSectionSchema>>
export type ArticleDraft = Readonly<z.infer<typeof articleDraftSchema>>

export function parseArticleDraft(input: unknown): ArticleDraft {
  return Object.freeze(articleDraftSchema.parse(input))
}
