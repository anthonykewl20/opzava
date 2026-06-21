// Public API of the Opzava content workflow module. Consumers import from this index only.
export {
  IDEA_INTAKE_SCHEMA_VERSION,
  ideaIntakeSchema,
  parseIdeaIntake,
  type IdeaIntake,
} from './contracts/idea-intake'
export {
  KEYWORD_RESEARCH_SCHEMA_VERSION,
  keywordResearchSchema,
  parseKeywordResearch,
  type KeywordCandidate,
  type KeywordResearch,
} from './contracts/keyword-research'
export {
  SOURCE_CAPTURE_SCHEMA_VERSION,
  sourceCaptureSchema,
  parseSourceCapture,
  type CapturedSource,
  type SourceCapture,
} from './contracts/source-capture'
export {
  SEO_BRIEF_SCHEMA_VERSION,
  seoBriefSchema,
  parseSeoBrief,
  type SeoBrief,
} from './contracts/seo-brief'
export {
  OUTLINE_SCHEMA_VERSION,
  outlineSchema,
  parseOutline,
  type Outline,
  type OutlineSection,
} from './contracts/outline'
export {
  ARTICLE_DRAFT_SCHEMA_VERSION,
  articleDraftSchema,
  parseArticleDraft,
  type ArticleDraft,
  type ArticleSection,
} from './contracts/article-draft'
export {
  FACT_CHECK_REPORT_SCHEMA_VERSION,
  factCheckReportSchema,
  parseFactCheckReport,
  type FactCheck,
  type FactCheckReport,
} from './contracts/fact-check-report'
export {
  BRAND_REVIEW_SCHEMA_VERSION,
  brandReviewSchema,
  parseBrandReview,
  type BrandCheck,
  type BrandReview,
} from './contracts/brand-review'
export {
  ANTI_SLOP_REVIEW_SCHEMA_VERSION,
  antiSlopReviewSchema,
  parseAntiSlopReview,
  type SlopFinding,
  type AntiSlopReview,
} from './contracts/anti-slop-review'
export {
  WORDPRESS_DRAFT_REQUEST_SCHEMA_VERSION,
  wordpressDraftRequestSchema,
  parseWordpressDraftRequest,
  type WordpressDraftGateArtifacts,
  type WordpressDraftRequest,
} from './contracts/wordpress-draft-request'
export {
  CONTENT_WORKFLOW_ID,
  getContentWorkflowDefinition,
} from './workflow/content-workflow'
export {
  CONTENT_ARTIFACT_TYPES,
  createContentArtifact,
  type ContentArtifactType,
  type CreateContentArtifactInput,
} from './artifacts/content-artifact'
export {
  CONTENT_STEP_OUTPUTS,
  getContentStepOutput,
  type ContentStepOutput,
} from './workflow/content-step-outputs'
export {
  createContentStepExecutor,
  type ContentStepService,
  type ContentStepServiceResult,
} from './steps/step-service'
export { ideaIntakeStepService } from './steps/idea-intake-service'
export {
  createKeywordResearchStepService,
  parseKeywordResearchStepInput,
  type KeywordResearchStepInput,
} from './steps/keyword-research-service'
export {
  createMockKeywordResearchProvider,
  type KeywordResearchProvider,
  type KeywordResearchDraft,
} from './steps/keyword-research-provider'
export {
  createSourceCaptureStepService,
  parseSourceCaptureStepInput,
  type SourceCaptureStepInput,
} from './steps/source-capture-service'
export {
  createMockSourceCaptureProvider,
  type SourceCaptureProvider,
  type SourceCaptureDraft,
} from './steps/source-capture-provider'
export {
  createSeoBriefStepService,
  parseSeoBriefStepInput,
  type SeoBriefStepInput,
} from './steps/seo-brief-service'
export {
  createMockSeoBriefProvider,
  type SeoBriefProvider,
  type SeoBriefProviderInput,
  type SeoBriefDraft,
} from './steps/seo-brief-provider'
export {
  createOutlineStepService,
  parseOutlineStepInput,
  type OutlineStepInput,
} from './steps/outline-service'
export {
  createMockOutlineProvider,
  type OutlineProvider,
  type OutlineProviderInput,
  type OutlineDraft,
} from './steps/outline-provider'
export {
  createArticleDraftStepService,
  parseArticleDraftStepInput,
  type ArticleDraftStepInput,
} from './steps/article-draft-service'
export {
  createMockArticleDraftProvider,
  type ArticleDraftProvider,
  type ArticleDraftProviderInput,
  type ArticleDraftDraft,
} from './steps/article-draft-provider'
export {
  createFactCheckStepService,
  parseFactCheckStepInput,
  type FactCheckStepInput,
} from './steps/fact-check-service'
export {
  createMockFactCheckProvider,
  type FactCheckProvider,
  type FactCheckProviderInput,
  type FactCheckDraft,
} from './steps/fact-check-provider'
export {
  createBrandReviewStepService,
  parseBrandReviewStepInput,
  type BrandReviewStepInput,
} from './steps/brand-review-service'
export {
  createMockBrandReviewProvider,
  type BrandReviewProvider,
  type BrandReviewProviderInput,
  type BrandReviewDraft,
} from './steps/brand-review-provider'
export {
  createAntiSlopReviewStepService,
  parseAntiSlopReviewStepInput,
  type AntiSlopReviewStepInput,
} from './steps/anti-slop-review-service'
export {
  createMockAntiSlopReviewProvider,
  type AntiSlopReviewProvider,
  type AntiSlopReviewProviderInput,
  type AntiSlopReviewDraft,
} from './steps/anti-slop-review-provider'
export {
  createHumanApprovalStepService,
  parseHumanApprovalStepInput,
  type HumanApprovalStepInput,
} from './steps/human-approval-service'
export {
  createMockHumanApprovalProvider,
  type HumanApprovalProvider,
  type HumanApprovalProviderInput,
  type HumanApprovalDecision,
} from './steps/human-approval-provider'
export {
  createWordpressDraftStepService,
  parseWordpressDraftStepInput,
  type WordpressDraftStepInput,
} from './steps/wordpress-draft-service'
export {
  createMockWordpressDraftProvider,
  type WordpressDraftProvider,
  type WordpressDraftProviderInput,
  type WordpressDraftRender,
} from './steps/wordpress-draft-provider'
export {
  runContentWorkflow,
  createMockContentWorkflowProviders,
  type ContentWorkflowProviders,
  type ContentWorkflowRunResult,
  type ContentWorkflowDeps,
} from './workflow/content-workflow-executor'
export {
  runContentWorkflowWithRecording,
  createMockContentWorkflowProviderAdapters,
  type ContentWorkflowProviderAdapters,
  type ContentWorkflowRecordingDeps,
} from './workflow/content-workflow-recording-executor'
export {
  KEYWORD_RESEARCH_OPERATION,
  createMockKeywordResearchProviderProfile,
  createMockKeywordResearchProviderAdapter,
} from './providers/keyword-research-adapter'
export {
  runKeywordResearchProviderCall,
  type KeywordResearchProviderCallInput,
  type KeywordResearchProviderCallDeps,
} from './providers/keyword-research-execution'
export {
  SOURCE_CAPTURE_OPERATION,
  createMockSourceCaptureProviderProfile,
  createMockSourceCaptureProviderAdapter,
} from './providers/source-capture-adapter'
export {
  runSourceCaptureProviderCall,
  type SourceCaptureProviderCallInput,
  type SourceCaptureProviderCallDeps,
} from './providers/source-capture-execution'
export {
  ARTICLE_DRAFT_OPERATION,
  createMockArticleDraftProviderProfile,
  createMockArticleDraftProviderAdapter,
} from './providers/article-draft-adapter'
export {
  runArticleDraftProviderCall,
  type ArticleDraftProviderCallInput,
  type ArticleDraftProviderCallDeps,
} from './providers/article-draft-execution'
export {
  FACT_CHECK_OPERATION,
  createMockFactCheckProviderProfile,
  createMockFactCheckProviderAdapter,
} from './providers/fact-check-adapter'
export {
  runFactCheckProviderCall,
  type FactCheckProviderCallInput,
  type FactCheckProviderCallDeps,
} from './providers/fact-check-execution'
export {
  WORDPRESS_DRAFT_CREATE_OPERATION,
  createMockWordpressPublishingProviderProfile,
  createMockWordpressPublishingProviderAdapter,
} from './providers/wordpress-publishing-adapter'
export {
  runWordpressPublishingCall,
  type WordpressPublishingCallInput,
  type WordpressPublishingCallDeps,
} from './providers/wordpress-publishing-execution'
export {
  resolveWordpressLiveConnection,
  resolveResendLiveConnection,
  isWordpressConfigured,
  isResendConfigured,
  type SettingsReader,
  type WordpressLiveConnection,
  type ResendLiveConnection,
} from './providers/connection-settings-resolver'
export {
  resolveResendCampaignConnection,
  RESEND_API_KEY_SECRET_REFERENCE,
  type ResolveResendCampaignConnectionDeps,
  type ResolveResendCampaignConnectionResult,
} from './providers/resolve-resend-campaign-connection'
export {
  verifyWordpressConnection,
  verifyResendConnection,
  type FetchLike,
  type ConnectionVerifyResult,
} from './providers/connection-verifier'
export {
  createWordpressDraft,
  type HttpClient,
  type HttpResponseLike,
  type WordpressDraftCreateResult,
} from './providers/wordpress-live-publisher'
export {
  sendResendEmail,
  type ResendHttpClient,
  type ResendHttpResponseLike,
  type ResendEmailMessage,
  type ResendSendResult,
} from './providers/resend-live-sender'
export {
  WORDPRESS_LIVE_OPERATION,
  createLiveWordpressProviderProfile,
  createLiveWordpressProviderAdapter,
} from './providers/wordpress-live-adapter'
export {
  RESEND_LIVE_OPERATION,
  createLiveResendProviderProfile,
  createLiveResendProviderAdapter,
} from './providers/resend-live-adapter'
export {
  EMAIL_CAMPAIGN_SCHEMA_VERSION,
  emailCampaignSchema,
  parseEmailCampaign,
  runEmailCampaign,
  type EmailCampaign,
  type CampaignEmailSender,
  type CampaignSendRecord,
  type EmailCampaignRunResult,
  type EmailCampaignDeps,
} from './workflow/email-campaign'
export {
  createResendCampaignSender,
  type ResendCampaignSenderDeps,
} from './providers/resend-campaign-sender'
export {
  campaignScheduleStepSchema,
  campaignScheduleInputSchema,
  computeCampaignSchedule,
  type CampaignScheduleStep,
  type CampaignScheduleInput,
  type ScheduledCampaignStep,
} from './workflow/campaign-schedule'
export {
  CAMPAIGN_AUDIENCE_SCHEMA_VERSION,
  campaignAudienceSchema,
  parseCampaignAudience,
  dedupeRecipients,
  type CampaignAudience,
} from './workflow/campaign-audience'
export {
  planCampaignRun,
  type CampaignPlanStep,
  type PlannedCampaignSend,
  type CampaignRunPlan,
  type PlanCampaignRunInput,
} from './workflow/campaign-run-plan'

export {
  buildCampaignSendJobs,
  type CampaignSendJobsDeps,
} from './workflow/campaign-send-jobs'

export {
  enqueueCampaignSendJobs,
  type CampaignSendJobStore,
  type EnqueueCampaignSendJobsDeps,
  type EnqueueCampaignSendJobsResult,
} from './workflow/enqueue-campaign-send-jobs'

export {
  runCampaignSend,
  type RunCampaignSendDeps,
  type RunCampaignSendResult,
} from './workflow/run-campaign-send'

export {
  runCampaignSendWithRepository,
  type RunCampaignSendWithRepositoryDeps,
} from './workflow/run-campaign-send-with-repository'

export {
  createCampaignSendExecutor,
  type CampaignSendExecutorDeps,
} from './workflow/campaign-send-executor'

export {
  createJobKindExecutor,
  type JobKindExecutorDeps,
} from './workflow/job-kind-executor'

export {
  createCampaignRunnerWorker,
  CAMPAIGN_SEND_JOB_KIND,
  type CampaignRunnerWorkerDeps,
} from './workflow/campaign-runner-worker'

export {
  parseCampaign,
  transitionCampaign,
  canTransitionCampaign,
  campaignSchema,
  CAMPAIGN_SCHEMA_VERSION,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TRANSITIONS,
  type Campaign,
  type CampaignStatus,
} from './campaign/campaign'

export {
  createCampaignRepository,
  type CampaignRepository,
} from './campaign/campaign-repository'

export {
  runApprovedCampaign,
  type RunApprovedCampaignDeps,
  type RunApprovedCampaignResult,
} from './campaign/run-approved-campaign'

export {
  createCampaignWorkerDaemon,
  type CampaignWorkerDaemonDeps,
  type CampaignWorkerDaemonReport,
} from './workflow/campaign-worker-daemon'

export {
  createTimerSleep,
  createStopSignal,
  runCampaignDaemon,
  type StopSignal,
  type RunCampaignDaemonDeps,
} from './workflow/campaign-daemon-runtime'

export {
  createArtifactRepository,
  type ArtifactRepository,
  type StoredArtifactContext,
  type ArtifactListFilter,
} from './artifacts/artifact-repository'

export {
  recordContentWorkflowArtifacts,
  CONTENT_WORKFLOW_ARTIFACT_FIELDS,
  type ContentArtifactSink,
  type ArtifactRecordContext,
} from './workflow/record-workflow-artifacts'

export {
  runAndRecordContentWorkflow,
  type RunAndRecordContentWorkflowDeps,
  type RunAndRecordContentWorkflowResult,
} from './workflow/run-and-record-content-workflow'
