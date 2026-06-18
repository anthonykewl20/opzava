import { ideaIntakeStepService } from '../steps/idea-intake-service'
import { createKeywordResearchStepService } from '../steps/keyword-research-service'
import { createMockKeywordResearchProvider } from '../steps/keyword-research-provider'
import type { KeywordResearchProvider } from '../steps/keyword-research-provider'
import { createSourceCaptureStepService } from '../steps/source-capture-service'
import { createMockSourceCaptureProvider } from '../steps/source-capture-provider'
import type { SourceCaptureProvider } from '../steps/source-capture-provider'
import { createSeoBriefStepService } from '../steps/seo-brief-service'
import { createMockSeoBriefProvider } from '../steps/seo-brief-provider'
import type { SeoBriefProvider } from '../steps/seo-brief-provider'
import { createOutlineStepService } from '../steps/outline-service'
import { createMockOutlineProvider } from '../steps/outline-provider'
import type { OutlineProvider } from '../steps/outline-provider'
import { createArticleDraftStepService } from '../steps/article-draft-service'
import { createMockArticleDraftProvider } from '../steps/article-draft-provider'
import type { ArticleDraftProvider } from '../steps/article-draft-provider'
import { createFactCheckStepService } from '../steps/fact-check-service'
import { createMockFactCheckProvider } from '../steps/fact-check-provider'
import type { FactCheckProvider } from '../steps/fact-check-provider'
import { createBrandReviewStepService } from '../steps/brand-review-service'
import { createMockBrandReviewProvider } from '../steps/brand-review-provider'
import type { BrandReviewProvider } from '../steps/brand-review-provider'
import { createAntiSlopReviewStepService } from '../steps/anti-slop-review-service'
import { createMockAntiSlopReviewProvider } from '../steps/anti-slop-review-provider'
import type { AntiSlopReviewProvider } from '../steps/anti-slop-review-provider'
import { createHumanApprovalStepService } from '../steps/human-approval-service'
import { createMockHumanApprovalProvider } from '../steps/human-approval-provider'
import type { HumanApprovalProvider } from '../steps/human-approval-provider'
import { createWordpressDraftStepService } from '../steps/wordpress-draft-service'
import { createMockWordpressDraftProvider } from '../steps/wordpress-draft-provider'
import type { WordpressDraftProvider } from '../steps/wordpress-draft-provider'
import type { IdeaIntake } from '../contracts/idea-intake'
import { parseKeywordResearch } from '../contracts/keyword-research'
import { parseSourceCapture } from '../contracts/source-capture'
import { parseSeoBrief } from '../contracts/seo-brief'
import { parseOutline } from '../contracts/outline'
import { parseArticleDraft } from '../contracts/article-draft'
import type { WordpressDraftRequest } from '../contracts/wordpress-draft-request'
import { isApprovalGranted } from '@/opzava/core/approvals/contracts'
import type { Approval } from '@/opzava/core/approvals/contracts'
import type { Artifact } from '@/opzava/core/artifacts/contracts'

export type ContentWorkflowProviders = Readonly<{
  keywordResearch: KeywordResearchProvider
  sourceCapture: SourceCaptureProvider
  seoBrief: SeoBriefProvider
  outline: OutlineProvider
  articleDraft: ArticleDraftProvider
  factCheck: FactCheckProvider
  brandReview: BrandReviewProvider
  antiSlopReview: AntiSlopReviewProvider
  humanApproval: HumanApprovalProvider
  wordpressDraft: WordpressDraftProvider
}>

export function createMockContentWorkflowProviders(): ContentWorkflowProviders {
  return Object.freeze({
    keywordResearch: createMockKeywordResearchProvider(),
    sourceCapture: createMockSourceCaptureProvider(),
    seoBrief: createMockSeoBriefProvider(),
    outline: createMockOutlineProvider(),
    articleDraft: createMockArticleDraftProvider(),
    factCheck: createMockFactCheckProvider(),
    brandReview: createMockBrandReviewProvider(),
    antiSlopReview: createMockAntiSlopReviewProvider(),
    humanApproval: createMockHumanApprovalProvider(),
    wordpressDraft: createMockWordpressDraftProvider(),
  })
}

export type ContentWorkflowRunResult = Readonly<{
  ideaIntake: IdeaIntake
  keywordResearch: Artifact
  sourceCapture: Artifact
  seoBrief: Artifact
  outline: Artifact
  articleDraft: Artifact
  factCheckReport: Artifact
  brandReview: Artifact
  antiSlopReview: Artifact
  approval: Approval
  wordpressDraftRequest: WordpressDraftRequest
}>

export type ContentWorkflowDeps = Readonly<{
  providers: ContentWorkflowProviders
  newId: () => string
  now: () => string
  requesterId: string
}>

export function runContentWorkflow(
  deps: ContentWorkflowDeps,
  rawIdea: unknown
): ContentWorkflowRunResult {
  const { providers, newId, now, requesterId } = deps
  const sr = (s: string) => `content-run:${s}`

  const intake = ideaIntakeStepService.run(rawIdea)
  const idea = intake.record

  const keywordResearch = createKeywordResearchStepService({
    provider: providers.keywordResearch,
    newId,
    now,
  }).run({ idea, sourceStepRunId: sr('keyword-research') }).record

  const sourceCapture = createSourceCaptureStepService({
    provider: providers.sourceCapture,
    newId,
    now,
  }).run({ idea, sourceStepRunId: sr('source-capture') }).record

  const seoBrief = createSeoBriefStepService({
    provider: providers.seoBrief,
    newId,
    now,
  }).run({
    idea,
    keywordResearchArtifact: keywordResearch,
    keywordResearch: parseKeywordResearch(keywordResearch.content),
    sourceCaptureArtifact: sourceCapture,
    sourceCapture: parseSourceCapture(sourceCapture.content),
    sourceStepRunId: sr('seo-brief'),
  }).record

  const outline = createOutlineStepService({
    provider: providers.outline,
    newId,
    now,
  }).run({
    idea,
    seoBriefArtifact: seoBrief,
    seoBrief: parseSeoBrief(seoBrief.content),
    sourceStepRunId: sr('outline'),
  }).record

  const articleDraft = createArticleDraftStepService({
    provider: providers.articleDraft,
    newId,
    now,
  }).run({
    idea,
    outlineArtifact: outline,
    outline: parseOutline(outline.content),
    sourceCaptureArtifact: sourceCapture,
    sourceCapture: parseSourceCapture(sourceCapture.content),
    sourceStepRunId: sr('article-draft'),
  }).record

  const factCheckReport = createFactCheckStepService({
    provider: providers.factCheck,
    newId,
    now,
  }).run({
    articleDraftArtifact: articleDraft,
    articleDraft: parseArticleDraft(articleDraft.content),
    sourceCaptureArtifact: sourceCapture,
    sourceCapture: parseSourceCapture(sourceCapture.content),
    sourceStepRunId: sr('fact-check'),
  }).record

  const brandReview = createBrandReviewStepService({
    provider: providers.brandReview,
    newId,
    now,
  }).run({
    articleDraftArtifact: articleDraft,
    articleDraft: parseArticleDraft(articleDraft.content),
    sourceStepRunId: sr('brand-review'),
  }).record

  const antiSlopReview = createAntiSlopReviewStepService({
    provider: providers.antiSlopReview,
    newId,
    now,
  }).run({
    articleDraftArtifact: articleDraft,
    articleDraft: parseArticleDraft(articleDraft.content),
    sourceStepRunId: sr('anti-slop-review'),
  }).record

  const approval = createHumanApprovalStepService({
    provider: providers.humanApproval,
    newId,
    now,
  }).run({
    articleDraftArtifact: articleDraft,
    articleDraft: parseArticleDraft(articleDraft.content),
    requesterId,
    sourceStepRunId: sr('human-approval'),
  }).record

  if (!isApprovalGranted(approval)) {
    throw new Error('content workflow halted: human approval not granted, external action refused')
  }

  const wordpressDraftRequest = createWordpressDraftStepService({
    provider: providers.wordpressDraft,
    newId,
    now,
  }).run({
    articleDraftArtifact: articleDraft,
    articleDraft: parseArticleDraft(articleDraft.content),
    sourceCaptureArtifact: sourceCapture,
    factCheckArtifact: factCheckReport,
    brandReviewArtifact: brandReview,
    antiSlopArtifact: antiSlopReview,
    approval,
    sourceStepRunId: sr('wordpress-draft'),
  }).record

  return Object.freeze({
    ideaIntake: idea,
    keywordResearch,
    sourceCapture,
    seoBrief,
    outline,
    articleDraft,
    factCheckReport,
    brandReview,
    antiSlopReview,
    approval,
    wordpressDraftRequest,
  })
}
