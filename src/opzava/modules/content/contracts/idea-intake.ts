import { z } from 'zod'

export const IDEA_INTAKE_SCHEMA_VERSION = 1 as const

// The content workflow's input artifact: a structured idea before any research or generation.
// It is a pure, versioned value object — no providers, runner, or side effects.
export const ideaIntakeSchema = z.object({
  schemaVersion: z.literal(IDEA_INTAKE_SCHEMA_VERSION),
  ideaId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  topic: z.string().min(1).max(200),
  targetKeyword: z.string().min(1).max(200).optional(),
  targetAudience: z.string().min(1).max(500).optional(),
  requestedBy: z.string().min(1).max(120),
  createdAt: z.string().min(1),
}).strict()

export type IdeaIntake = Readonly<z.infer<typeof ideaIntakeSchema>>

export function parseIdeaIntake(input: unknown): IdeaIntake {
  return Object.freeze(ideaIntakeSchema.parse(input))
}
