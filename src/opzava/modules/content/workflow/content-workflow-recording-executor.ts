import type { ProviderAdapter } from '@/opzava/platform/providers/contracts'
import type { ProviderExecutionClock, ProviderExecutionEventSink } from '@/opzava/platform/providers/execution'
import { isApprovalGranted } from '@/opzava/core/approvals/contracts'
import { ideaIntakeStepService } from '../steps/idea-intake-service'
import { createKeywordResearchStepService } from '../steps/keyword-research-service'
import type { KeywordResearchDraft } from '../steps/keyword-research-provider'
import { createSourceCaptureStepService } from '../steps/source-capture-service'
import type { SourceCaptureDraft } from '../steps/source-capture-provider'
import { createSeoBriefStepService } from '../steps/seo-brief-service'
import { createOutlineStepService } from '../steps/outline-service'
import { createArticleDraftStepService } from '../steps/article-draft-service'
import type { ArticleDraftDraft } from '../steps/article-draft-provider'
import { createFactCheckStepService } from '../steps/fact-check-service'
import type { FactCheckDraft } from '../steps/fact-check-provider'
import { createBrandReviewStepService } from '../steps/brand-review-service'
import { createAntiSlopReviewStepService } from '../steps/anti-slop-review-service'
import { createHumanApprovalStepService } from '../steps/human-approval-service'
import { createWordpressDraftStepService } from '../steps/wordpress-draft-service'
import { parseKeywordResearch } from '../contracts/keyword-research'
import { parseSourceCapture } from '../contracts/source-capture'
import { parseSeoBrief } from '../contracts/seo-brief'
import { parseOutline } from '../contracts/outline'
import { parseArticleDraft } from '../contracts/article-draft'
import { createMockKeywordResearchProviderAdapter } from '../providers/keyword-research-adapter'
import { createMockSourceCaptureProviderAdapter } from '../providers/source-capture-adapter'
import { createMockArticleDraftProviderAdapter } from '../providers/article-draft-adapter'
import { createMockFactCheckProviderAdapter } from '../providers/fact-check-adapter'
import { runKeywordResearchProviderCall } from '../providers/keyword-research-execution'
import { runSourceCaptureProviderCall } from '../providers/source-capture-execution'
import { runArticleDraftProviderCall } from '../providers/article-draft-execution'
import { runFactCheckProviderCall } from '../providers/fact-check-execution'
import type { ContentWorkflowProviders, ContentWorkflowRunResult } from './content-workflow-executor'

export type ContentWorkflowProviderAdapters = Readonly<{
  keywordResearch: ProviderAdapter
  sourceCapture: ProviderAdapter
  articleDraft: ProviderAdapter
  factCheck: ProviderAdapter
}>

export function createMockContentWorkflowProviderAdapters(deps: Readonly<{ now: () => string }>): ContentWorkflowProviderAdapters {
  return Object.freeze({
    keywordResearch: createMockKeywordResearchProviderAdapter(deps),
    sourceCapture: createMockSourceCaptureProviderAdapter(deps),
    articleDraft: createMockArticleDraftProviderAdapter(deps),
    factCheck: createMockFactCheckProviderAdapter(deps),
  })
}

export type ContentWorkflowRecordingDeps = Readonly<{
  adapters: ContentWorkflowProviderAdapters
  transformProviders: Pick<
    ContentWorkflowProviders,
    'seoBrief' | 'outline' | 'brandReview' | 'antiSlopReview' | 'humanApproval' | 'wordpressDraft'
  >
  eventSink: ProviderExecutionEventSink
  newId: () => string
  now: () => string
  actorId: string
  requesterId: string
  clock?: ProviderExecutionClock
}>

export async function runContentWorkflowWithRecording(
  deps: ContentWorkflowRecordingDeps,
  rawIdea: unknown
): Promise<ContentWorkflowRunResult> {
  const sr = (s: string) => `content-run:${s}`
  const intake = ideaIntakeStepService.run(rawIdea)
  const idea = intake.record
  const workflowRunId = `content-workflow:${idea.ideaId}`
  const providerCallDeps = (adapter: ProviderAdapter) => ({
    adapter,
    eventSink: deps.eventSink,
    newId: deps.newId,
    now: deps.now,
    actorId: deps.actorId,
    clock: deps.clock,
  })

  const keywordExecution = await runKeywordResearchProviderCall(providerCallDeps(deps.adapters.keywordResearch), {
    idea,
    workflowRunId,
    stepRunId: sr('keyword-research'),
  })
  const keywordDraft = keywordExecution.result.output as unknown as KeywordResearchDraft

  const keywordResearch = createKeywordResearchStepService({
    provider: () => keywordDraft,
    newId: deps.newId,
    now: deps.now,
  }).run({ idea, sourceStepRunId: sr('keyword-research') }).record

  const sourceExecution = await runSourceCaptureProviderCall(providerCallDeps(deps.adapters.sourceCapture), {
    idea,
    workflowRunId,
    stepRunId: sr('source-capture'),
  })
  const sourceDraft = sourceExecution.result.output as unknown as SourceCaptureDraft

  const sourceCapture = createSourceCaptureStepService({
    provider: () => sourceDraft,
    newId: deps.newId,
    now: deps.now,
  }).run({ idea, sourceStepRunId: sr('source-capture') }).record

  const seoBrief = createSeoBriefStepService({ provider: deps.transformProviders.seoBrief, newId: deps.newId, now: deps.now }).run({
    idea,
    keywordResearchArtifact: keywordResearch,
    keywordResearch: parseKeywordResearch(keywordResearch.content),
    sourceCaptureArtifact: sourceCapture,
    sourceCapture: parseSourceCapture(sourceCapture.content),
    sourceStepRunId: sr('seo-brief'),
  }).record
  const outline = createOutlineStepService({ provider: deps.transformProviders.outline, newId: deps.newId, now: deps.now }).run({
    idea,
    seoBriefArtifact: seoBrief,
    seoBrief: parseSeoBrief(seoBrief.content),
    sourceStepRunId: sr('outline'),
  }).record

  const articleDraftExecution = await runArticleDraftProviderCall(providerCallDeps(deps.adapters.articleDraft), {
    idea,
    outline: parseOutline(outline.content),
    sourceCapture: parseSourceCapture(sourceCapture.content),
    workflowRunId,
    stepRunId: sr('article-draft'),
  })
  const articleDraftDraft = articleDraftExecution.result.output as unknown as ArticleDraftDraft

  const articleDraft = createArticleDraftStepService({
    provider: () => articleDraftDraft,
    newId: deps.newId,
    now: deps.now,
  }).run({
    idea,
    outlineArtifact: outline,
    outline: parseOutline(outline.content),
    sourceCaptureArtifact: sourceCapture,
    sourceCapture: parseSourceCapture(sourceCapture.content),
    sourceStepRunId: sr('article-draft'),
  }).record

  const factCheckExecution = await runFactCheckProviderCall(providerCallDeps(deps.adapters.factCheck), {
    articleDraft: parseArticleDraft(articleDraft.content),
    sourceCapture: parseSourceCapture(sourceCapture.content),
    workflowRunId,
    stepRunId: sr('fact-check'),
  })
  const factCheckDraft = factCheckExecution.result.output as unknown as FactCheckDraft

  const factCheckReport = createFactCheckStepService({
    provider: () => factCheckDraft,
    newId: deps.newId,
    now: deps.now,
  }).run({
    articleDraftArtifact: articleDraft,
    articleDraft: parseArticleDraft(articleDraft.content),
    sourceCaptureArtifact: sourceCapture,
    sourceCapture: parseSourceCapture(sourceCapture.content),
    sourceStepRunId: sr('fact-check'),
  }).record

  const brandReview = createBrandReviewStepService({ provider: deps.transformProviders.brandReview, newId: deps.newId, now: deps.now }).run({
    articleDraftArtifact: articleDraft,
    articleDraft: parseArticleDraft(articleDraft.content),
    sourceStepRunId: sr('brand-review'),
  }).record
  const antiSlopReview = createAntiSlopReviewStepService({ provider: deps.transformProviders.antiSlopReview, newId: deps.newId, now: deps.now }).run({
    articleDraftArtifact: articleDraft,
    articleDraft: parseArticleDraft(articleDraft.content),
    sourceStepRunId: sr('anti-slop-review'),
  }).record
  const approval = createHumanApprovalStepService({ provider: deps.transformProviders.humanApproval, newId: deps.newId, now: deps.now }).run({
    articleDraftArtifact: articleDraft,
    articleDraft: parseArticleDraft(articleDraft.content),
    requesterId: deps.requesterId,
    sourceStepRunId: sr('human-approval'),
  }).record

  if (!isApprovalGranted(approval)) throw new Error('content workflow halted: human approval not granted, external action refused')

  const wordpressDraftRequest = createWordpressDraftStepService({ provider: deps.transformProviders.wordpressDraft, newId: deps.newId, now: deps.now }).run({
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
