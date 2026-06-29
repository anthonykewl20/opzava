// Public API of the Opzava content workflow module. Consumers import from this index only.
//
// Narrowed (issue #65): this barrel now advertises ONLY the true public surface — the
// campaign domain, the artifact repository, the recorded-workflow entry point, and the
// Resend/WordPress live-send connection + provider bits the API routes compose. Every
// internal (contracts, step-service factories, provider adapters/execution, campaign-send
// runtime internals, Mock providers) is reachable from its concrete file but is no longer
// re-exported here, so internal refactors no longer ripple through the barrel.
//
// Mock providers + the mock-mode workflow entry live in ./mocks (used by the ops/runs
// dev endpoint + tests); import them from '@/opzava/modules/content/mocks'.

// --- Campaign domain (status machine, repository, approval, run) ---
export { parseCampaign, transitionCampaign } from './campaign/campaign'
export { createCampaignRepository } from './campaign/campaign-repository'
export {
  CAMPAIGN_SEND_REQUESTED_ACTION,
  campaignSendApprovalId,
  createCampaignSendApproval,
} from './campaign/campaign-send-approval'
export { runApprovedCampaign } from './campaign/run-approved-campaign'
export { createGuardedCampaignSendExecutorForCampaign } from './campaign/guarded-campaign-send-runtime'

// --- Artifacts ---
export { createArtifactRepository } from './artifacts/artifact-repository'

// --- Content workflow (recorded run) ---
export { runAndRecordContentWorkflow } from './workflow/run-and-record-content-workflow'

// --- Live send: Resend + WordPress connection resolution + provider adapters ---
export {
  resolveResendCampaignConnection,
  RESEND_API_KEY_SECRET_REFERENCE,
} from './providers/resolve-resend-campaign-connection'
export { resolveWordpressDraftConnection } from './providers/resolve-wordpress-draft-connection'
export {
  createLiveResendProviderAdapter,
  createLiveResendProviderProfile,
} from './providers/resend-live-adapter'
