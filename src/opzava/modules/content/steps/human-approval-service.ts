import { z } from 'zod'
import { parseArticleDraft, type ArticleDraft } from '../contracts/article-draft'
import { parseApproval, type Approval } from '@/opzava/core/approvals/contracts'
import { parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'
import type { HumanApprovalProvider } from './human-approval-provider'

export type HumanApprovalStepInput = Readonly<{
  articleDraftArtifact: Artifact
  articleDraft: ArticleDraft
  requesterId: string
  sourceStepRunId: string
}>

const inputSchema = z
  .object({
    articleDraftArtifact: z.unknown(),
    requesterId: z.string().min(1).max(200),
    sourceStepRunId: z.string().min(1).max(120),
  })
  .strict()

export function parseHumanApprovalStepInput(payload: unknown): HumanApprovalStepInput {
  const parsed = inputSchema.parse(payload)
  const articleDraftArtifact = parseArtifact(parsed.articleDraftArtifact)
  if (articleDraftArtifact.artifactType !== 'article-draft') {
    throw new Error('expected an article-draft artifact')
  }
  return Object.freeze({
    articleDraftArtifact,
    articleDraft: parseArticleDraft(articleDraftArtifact.content),
    requesterId: parsed.requesterId,
    sourceStepRunId: parsed.sourceStepRunId,
  })
}

export function createHumanApprovalStepService(
  deps: Readonly<{
    provider: HumanApprovalProvider
    newId: () => string
    now: () => string
  }>
): ContentStepService<HumanApprovalStepInput, Approval> {
  return Object.freeze({
    stepId: 'human-approval',
    run: (input) => {
      const decision = deps.provider({ articleDraft: input.articleDraft })
      const approval = parseApproval({
        schemaVersion: 1,
        approvalId: deps.newId(),
        requestedAction: 'publish-wordpress-draft',
        target: { kind: 'artifact', id: input.articleDraftArtifact.artifactId },
        status: decision.status,
        requesterId: input.requesterId,
        approverId: decision.approverId,
        decisionReason: decision.decisionReason,
        requestedAt: deps.now(),
        decidedAt: deps.now(),
        expiresAt: null,
      })
      return Object.freeze({
        stepId: 'human-approval',
        output: getContentStepOutput('human-approval'),
        record: approval,
      })
    },
  })
}
