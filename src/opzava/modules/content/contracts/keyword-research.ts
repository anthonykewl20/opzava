import { z } from 'zod'

export const KEYWORD_RESEARCH_SCHEMA_VERSION = 1 as const

// A single researched keyword candidate. Volume and difficulty are optional because a mock or
// early provider may not supply them; when present they must be finite numbers.
const keywordCandidateSchema = z.object({
  term: z.string().min(1).max(200),
  searchVolume: z.number().finite().nonnegative().optional(),
  difficulty: z.number().finite().min(0).max(100).optional(),
}).strict()

// Topic and keyword research for one idea. Pure, versioned value object — no providers or runner.
// `ideaId` is a lineage reference to the originating IdeaIntake.
export const keywordResearchSchema = z.object({
  schemaVersion: z.literal(KEYWORD_RESEARCH_SCHEMA_VERSION),
  researchId: z.string().min(1).max(120),
  ideaId: z.string().min(1).max(120),
  primaryKeyword: z.string().min(1).max(200),
  candidates: z.array(keywordCandidateSchema).min(1),
  createdAt: z.string().min(1),
}).strict().superRefine((research, ctx) => {
  if (!research.candidates.some((candidate) => candidate.term === research.primaryKeyword)) {
    ctx.addIssue({
      code: 'custom',
      path: ['primaryKeyword'],
      message: 'primaryKeyword must be one of the candidate terms',
    })
  }
})

export type KeywordCandidate = Readonly<z.infer<typeof keywordCandidateSchema>>
export type KeywordResearch = Readonly<z.infer<typeof keywordResearchSchema>>

export function parseKeywordResearch(input: unknown): KeywordResearch {
  return Object.freeze(keywordResearchSchema.parse(input))
}
